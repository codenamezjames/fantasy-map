import { CONFIG } from '../config.js';

/**
 * Settlement types that can trigger city mode
 */
const SETTLEMENT_TYPES = ['village', 'town', 'city', 'capital', 'port'];

/**
 * Zoom thresholds (percentage) for entering city mode per POI type
 * Lower value = enter city mode earlier (at lower zoom)
 */
const CITY_MODE_THRESHOLDS = {
    capital: 75,
    city: 75,
    town: 78,
    village: 80,
    port: 75
};

/**
 * Distance threshold (in world units) for detecting if viewport center is "near" a settlement
 * This should be proportional to settlement size
 */
const SETTLEMENT_DETECTION_RADIUS = {
    capital: 100,
    city: 80,
    town: 60,
    village: 40,
    port: 70
};

/**
 * TileLoadManager - manages on-demand loading and unloading of sub-tiles
 * Uses LRU eviction to manage memory when zooming around the map
 */
export class TileLoadManager {
    constructor(world, subTileGenerator, config = {}) {
        this.world = world;
        this.generator = subTileGenerator;
        this.worldSeed = config.seed || 'default';

        // Track loaded parents with timestamps for LRU eviction
        this.loadedParents = new Map(); // parentId -> { timestamp, level }
        this.maxLoadedParents = CONFIG.subtiles?.maxLoadedParents ?? 50;

        // Track current zoom level for change detection
        this.currentZoomLevel = 0;

        // City mode state tracking
        this.cityMode = {
            active: false,
            poi: null,      // The settlement POI that triggered city mode
            city: null      // Alias for poi (for semantic clarity when it's a city/town)
        };

        // Callback for city mode changes
        this.onCityModeChange = config.onCityModeChange || null;

        // Cache of settlement POIs for faster lookups
        this._settlementCache = null;
        this._settlementCacheValid = false;
    }

    /**
     * Update loaded tiles based on viewport and zoom
     * Called every frame from render loop
     * @param {Object} viewport - Current viewport bounds
     * @param {number} zoom - Current zoom percentage (-50 to 100)
     */
    update(viewport, zoom) {
        // Check for city mode transitions
        this.checkCityMode(viewport, zoom);

        const targetLevel = this.world.getZoomLevelFromPercent(zoom);

        // At world level (0), show base tiles only
        if (targetLevel === 0) {
            // Optionally unload all children when zoomed out
            if (this.currentZoomLevel > 0) {
                this.unloadAllChildren();
            }
            this.currentZoomLevel = targetLevel;
            return;
        }

        this.currentZoomLevel = targetLevel;

        // Get visible tiles at the parent level (one level up from target)
        const parentLevel = targetLevel - 1;
        const visibleParents = this.getVisibleTilesAtLevel(viewport, parentLevel);

        // Generate children for visible parents that don't have them
        for (const parent of visibleParents) {
            if (!parent.detailGenerated && !parent.isAtMaxDetail()) {
                this.loadChildren(parent);
            }
            // Update LRU timestamp
            this.loadedParents.set(parent.id, {
                timestamp: Date.now(),
                level: parentLevel
            });
        }

        // Evict distant tiles if over memory limit
        this.evictDistant(visibleParents);
    }

    /**
     * Check if camera should enter or exit city mode based on zoom and position
     * @param {Object} viewport - Current viewport bounds {minX, minY, maxX, maxY}
     * @param {number} zoom - Current zoom percentage
     */
    checkCityMode(viewport, zoom) {
        // Find nearest settlement to viewport center
        const nearestSettlement = this.findNearestSettlement(viewport);

        if (nearestSettlement) {
            const threshold = this.getCityModeThreshold(nearestSettlement.type);
            const detectionRadius = this.getSettlementDetectionRadius(nearestSettlement.type);

            // Calculate viewport center
            const centerX = (viewport.minX + viewport.maxX) / 2;
            const centerY = (viewport.minY + viewport.maxY) / 2;

            // Check if we're close enough to the settlement
            const distance = nearestSettlement.distanceTo(centerX, centerY);
            const isNearSettlement = distance <= detectionRadius;

            // Check if zoom is past threshold for this settlement type
            const isPastThreshold = zoom >= threshold;

            const shouldBeInCityMode = isNearSettlement && isPastThreshold;

            if (shouldBeInCityMode && !this.cityMode.active) {
                // Enter city mode
                this._enterCityMode(nearestSettlement);
            } else if (!shouldBeInCityMode && this.cityMode.active) {
                // Check if we've moved away from current city or zoomed out
                if (this.cityMode.poi) {
                    const currentThreshold = this.getCityModeThreshold(this.cityMode.poi.type);
                    const currentRadius = this.getSettlementDetectionRadius(this.cityMode.poi.type);
                    const distToCurrentCity = this.cityMode.poi.distanceTo(centerX, centerY);

                    // Exit if zoomed out below threshold OR moved too far from current city
                    if (zoom < currentThreshold || distToCurrentCity > currentRadius * 1.2) {
                        this._exitCityMode();
                    }
                }
            } else if (shouldBeInCityMode && this.cityMode.active) {
                // Check if we've switched to a different settlement
                if (this.cityMode.poi && nearestSettlement.id !== this.cityMode.poi.id) {
                    // Switch to new settlement
                    this._exitCityMode();
                    this._enterCityMode(nearestSettlement);
                }
            }
        } else if (this.cityMode.active) {
            // No settlement nearby, exit city mode
            this._exitCityMode();
        }
    }

    /**
     * Enter city mode for a settlement
     * @param {POI} settlement - The settlement POI
     * @private
     */
    _enterCityMode(settlement) {
        this.cityMode = {
            active: true,
            poi: settlement,
            city: settlement
        };

        console.log(`Entering city mode: ${settlement.name} (${settlement.type})`);

        if (this.onCityModeChange) {
            this.onCityModeChange({
                active: true,
                entering: true,
                exiting: false,
                poi: settlement,
                city: settlement,
                type: settlement.type,
                name: settlement.name
            });
        }
    }

    /**
     * Exit city mode
     * @private
     */
    _exitCityMode() {
        const previousPoi = this.cityMode.poi;

        this.cityMode = {
            active: false,
            poi: null,
            city: null
        };

        console.log(`Exiting city mode${previousPoi ? `: ${previousPoi.name}` : ''}`);

        if (this.onCityModeChange) {
            this.onCityModeChange({
                active: false,
                entering: false,
                exiting: true,
                poi: null,
                city: null,
                previousPoi: previousPoi,
                previousCity: previousPoi
            });
        }
    }

    /**
     * Get the zoom threshold for entering city mode for a POI type
     * @param {string} poiType - POI type (capital, city, town, village, port)
     * @returns {number} Zoom percentage threshold
     */
    getCityModeThreshold(poiType) {
        return CITY_MODE_THRESHOLDS[poiType] ?? CITY_MODE_THRESHOLDS.town;
    }

    /**
     * Get the detection radius for a settlement type
     * @param {string} poiType - POI type
     * @returns {number} Detection radius in world units
     */
    getSettlementDetectionRadius(poiType) {
        return SETTLEMENT_DETECTION_RADIUS[poiType] ?? SETTLEMENT_DETECTION_RADIUS.town;
    }

    /**
     * Find the nearest settlement POI to the viewport center
     * @param {Object} viewport - Current viewport bounds
     * @returns {POI|null} Nearest settlement POI or null if none nearby
     */
    findNearestSettlement(viewport) {
        // Get all settlement POIs (cached for performance)
        const settlements = this._getSettlements();

        if (settlements.length === 0) {
            return null;
        }

        // Calculate viewport center
        const centerX = (viewport.minX + viewport.maxX) / 2;
        const centerY = (viewport.minY + viewport.maxY) / 2;

        // Calculate a search radius based on viewport size
        const viewportWidth = viewport.maxX - viewport.minX;
        const viewportHeight = viewport.maxY - viewport.minY;
        const maxSearchRadius = Math.max(viewportWidth, viewportHeight) / 2;

        let nearestSettlement = null;
        let nearestDistance = Infinity;

        for (const settlement of settlements) {
            const distance = settlement.distanceTo(centerX, centerY);

            // Only consider settlements within reasonable range
            if (distance <= maxSearchRadius && distance < nearestDistance) {
                nearestDistance = distance;
                nearestSettlement = settlement;
            }
        }

        return nearestSettlement;
    }

    /**
     * Get cached list of settlement POIs
     * @returns {POI[]} Array of settlement POIs
     * @private
     */
    _getSettlements() {
        if (!this._settlementCacheValid) {
            this._settlementCache = [];
            for (const type of SETTLEMENT_TYPES) {
                const pois = this.world.getPOIsByType(type);
                this._settlementCache.push(...pois);
            }
            this._settlementCacheValid = true;
        }
        return this._settlementCache;
    }

    /**
     * Invalidate the settlement cache (call when POIs change)
     */
    invalidateSettlementCache() {
        this._settlementCacheValid = false;
        this._settlementCache = null;
    }

    /**
     * Check if currently in city mode
     * @returns {boolean} True if in city mode
     */
    isInCityMode() {
        return this.cityMode.active;
    }

    /**
     * Get the current city mode state
     * @returns {Object} City mode state {active, poi, city}
     */
    getCityModeState() {
        return { ...this.cityMode };
    }

    /**
     * Load children for a parent tile
     * @param {Tile} parent - Parent tile to load children for
     */
    loadChildren(parent) {
        const children = this.generator.generate(parent, this.world, this.worldSeed);

        for (const child of children) {
            this.world.addChildTile(child, parent.id);
        }

        if (children.length > 0) {
            console.log(`Generated ${children.length} sub-tiles for tile ${parent.id} (zoom level ${parent.zoomLevel + 1})`);
        }
    }

    /**
     * Get visible tiles at a specific zoom level
     * @param {Object} viewport - Current viewport bounds
     * @param {number} level - Zoom level to query
     * @returns {Tile[]} Visible tiles at that level
     */
    getVisibleTilesAtLevel(viewport, level) {
        const visible = [];

        for (const tile of this.world.tiles.values()) {
            if (tile.zoomLevel !== level) continue;

            if (tile.intersectsViewport(viewport)) {
                visible.push(tile);
            }
        }

        return visible;
    }

    /**
     * Evict children of parents far from viewport (LRU eviction)
     * @param {Tile[]} visibleParents - Currently visible parent tiles
     */
    evictDistant(visibleParents) {
        if (this.loadedParents.size <= this.maxLoadedParents) {
            return;
        }

        const visibleIds = new Set(visibleParents.map(p => p.id));

        // Sort by timestamp (oldest first)
        const entries = [...this.loadedParents.entries()]
            .filter(([id]) => !visibleIds.has(id))
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Evict oldest until under limit
        const toEvict = entries.slice(0, this.loadedParents.size - this.maxLoadedParents);

        for (const [parentId] of toEvict) {
            this.world.unloadChildren(parentId);
            this.loadedParents.delete(parentId);
        }

        if (toEvict.length > 0) {
            console.log(`Evicted children of ${toEvict.length} tiles (LRU)`);
        }
    }

    /**
     * Unload all children tiles (when zooming out to world level)
     */
    unloadAllChildren() {
        const level0Tiles = this.world.getTilesAtLevel(0);

        for (const tile of level0Tiles) {
            if (tile.detailGenerated) {
                this.world.unloadChildren(tile.id);
            }
        }

        this.loadedParents.clear();
        console.log('Unloaded all sub-tiles (zoomed to world level)');
    }

    /**
     * Force load children for a specific tile (for debugging/testing)
     * @param {number} tileId - ID of tile to load children for
     */
    forceLoad(tileId) {
        const tile = this.world.getTile(tileId);
        if (!tile) {
            console.warn(`Tile ${tileId} not found`);
            return;
        }

        if (tile.detailGenerated) {
            console.log(`Tile ${tileId} already has children`);
            return;
        }

        this.loadChildren(tile);
    }

    /**
     * Get statistics about loaded tiles
     * @returns {Object} Stats object
     */
    getStats() {
        const tilesByLevel = {};
        for (const tile of this.world.tiles.values()) {
            tilesByLevel[tile.zoomLevel] = (tilesByLevel[tile.zoomLevel] || 0) + 1;
        }

        return {
            totalTiles: this.world.tiles.size,
            tilesByLevel,
            loadedParents: this.loadedParents.size,
            maxLoadedParents: this.maxLoadedParents,
            cityMode: {
                active: this.cityMode.active,
                settlement: this.cityMode.poi ? {
                    id: this.cityMode.poi.id,
                    name: this.cityMode.poi.name,
                    type: this.cityMode.poi.type
                } : null
            }
        };
    }
}
