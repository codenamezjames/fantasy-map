import { CONFIG } from '../config.js';

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
    }

    /**
     * Update loaded tiles based on viewport and zoom
     * Called every frame from render loop
     * @param {Object} viewport - Current viewport bounds
     * @param {number} zoom - Current zoom percentage (-50 to 100)
     */
    update(viewport, zoom) {
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
            maxLoadedParents: this.maxLoadedParents
        };
    }
}
