import { Tile } from './Tile.js';
import { POI } from './POI.js';

/**
 * World - container for all tiles and world data
 */
export class World {
    constructor(config = {}) {
        this.seed = config.seed ?? 'default';
        this.width = config.width ?? 2000;
        this.height = config.height ?? 2000;
        this.tileCount = config.tileCount ?? 500;

        this.tiles = new Map();
        this.nextId = 0;

        // Parent-to-children index for hierarchical tiles
        this.childrenIndex = new Map();

        // POI storage
        this.pois = new Map();              // id -> POI
        this.poiSpatialIndex = new Map();   // tileId -> poiId[]
        this.nextPoiId = 0;

        // Region storage
        this.regions = new Map();           // regionId -> region metadata

        // Road storage
        this.roads = new Map();             // roadId -> road metadata
    }

    /**
     * Add a tile to the world
     */
    addTile(tile) {
        this.tiles.set(tile.id, tile);
        if (tile.id >= this.nextId) {
            this.nextId = tile.id + 1;
        }
    }

    /**
     * Get a tile by ID
     */
    getTile(id) {
        return this.tiles.get(id);
    }

    /**
     * Get all tiles
     */
    getAllTiles() {
        return [...this.tiles.values()];
    }

    /**
     * Get tiles visible in viewport at current zoom
     */
    getTilesInViewport(viewport, zoom) {
        const visible = [];
        for (const tile of this.tiles.values()) {
            // Check zoom visibility
            if (zoom < tile.minZoom || zoom > tile.maxZoom) continue;

            // Check viewport intersection
            if (tile.intersectsViewport(viewport)) {
                visible.push(tile);
            }
        }
        return visible;
    }

    /**
     * Get neighboring tiles for a tile
     */
    getNeighbors(tileId) {
        const tile = this.tiles.get(tileId);
        if (!tile) return [];
        return tile.neighbors.map(id => this.tiles.get(id)).filter(Boolean);
    }

    /**
     * Add a child tile and link to parent
     * @param {Tile} tile - Child tile to add
     * @param {number} parentId - Parent tile ID
     */
    addChildTile(tile, parentId) {
        tile.parentId = parentId;
        this.addTile(tile);

        // Update children index
        if (!this.childrenIndex.has(parentId)) {
            this.childrenIndex.set(parentId, []);
        }
        this.childrenIndex.get(parentId).push(tile.id);

        // Update parent's childrenIds
        const parent = this.tiles.get(parentId);
        if (parent) {
            parent.childrenIds.push(tile.id);
            parent.detailGenerated = true;
        }
    }

    /**
     * Get children tiles of a parent
     * @param {number} parentId - Parent tile ID
     * @returns {Tile[]} Array of child tiles
     */
    getChildren(parentId) {
        const ids = this.childrenIndex.get(parentId) || [];
        return ids.map(id => this.tiles.get(id)).filter(Boolean);
    }

    /**
     * Unload children of a parent tile (for memory management)
     * @param {number} parentId - Parent tile ID
     */
    unloadChildren(parentId) {
        const childIds = this.childrenIndex.get(parentId) || [];

        // Recursively unload grandchildren first
        for (const childId of childIds) {
            this.unloadChildren(childId);
            this.tiles.delete(childId);
        }

        // Clear index
        this.childrenIndex.delete(parentId);

        // Reset parent state
        const parent = this.tiles.get(parentId);
        if (parent) {
            parent.childrenIds = [];
            parent.detailGenerated = false;
        }
    }

    /**
     * Get all tiles at a specific zoom level
     * @param {number} zoomLevel - Zoom level (0-3)
     * @returns {Tile[]} Tiles at that level
     */
    getTilesAtLevel(zoomLevel) {
        const tiles = [];
        for (const tile of this.tiles.values()) {
            if (tile.zoomLevel === zoomLevel) {
                tiles.push(tile);
            }
        }
        return tiles;
    }

    /**
     * Convert zoom percentage to zoom level index
     * Uses configurable thresholds from CONFIG.subtiles.zoomThresholds
     * @param {number} zoom - Zoom percentage (-50 to 100)
     * @returns {number} Zoom level (0-3)
     */
    getZoomLevelFromPercent(zoom) {
        // Default thresholds if not configured: [0, 40, 60, 80]
        const thresholds = this.zoomThresholds || [0, 40, 60, 80];
        if (zoom < thresholds[1]) return 0;  // World
        if (zoom < thresholds[2]) return 1;  // Area
        if (zoom < thresholds[3]) return 2;  // City
        return 3;                             // Building
    }

    /**
     * Set zoom thresholds (called after CONFIG is available)
     */
    setZoomThresholds(thresholds) {
        this.zoomThresholds = thresholds;
    }

    // ========== POI Methods ==========

    /**
     * Add a POI to the world
     * @param {POI} poi - POI to add
     */
    addPOI(poi) {
        this.pois.set(poi.id, poi);
        if (poi.id >= this.nextPoiId) {
            this.nextPoiId = poi.id + 1;
        }

        // Update spatial index
        if (poi.tileId !== null) {
            if (!this.poiSpatialIndex.has(poi.tileId)) {
                this.poiSpatialIndex.set(poi.tileId, []);
            }
            this.poiSpatialIndex.get(poi.tileId).push(poi.id);
        }
    }

    /**
     * Get a POI by ID
     */
    getPOI(id) {
        return this.pois.get(id);
    }

    /**
     * Get all POIs
     */
    getAllPOIs() {
        return [...this.pois.values()];
    }

    /**
     * Get POIs in a specific tile
     * @param {number} tileId - Tile ID
     * @returns {POI[]} POIs in that tile
     */
    getPOIsInTile(tileId) {
        const poiIds = this.poiSpatialIndex.get(tileId) || [];
        return poiIds.map(id => this.pois.get(id)).filter(Boolean);
    }

    /**
     * Get POIs visible in viewport at current zoom
     * @param {Object} viewport - Viewport bounds {minX, minY, maxX, maxY}
     * @param {number} zoom - Current zoom percentage
     * @returns {POI[]} Visible POIs
     */
    getPOIsInViewport(viewport, zoom) {
        const visible = [];
        for (const poi of this.pois.values()) {
            if (poi.isVisibleAtZoom(zoom) && poi.isInViewport(viewport)) {
                visible.push(poi);
            }
        }
        return visible;
    }

    /**
     * Get all POIs of a specific type
     * @param {string} type - POI type (village, town, city, etc.)
     * @returns {POI[]} POIs of that type
     */
    getPOIsByType(type) {
        const result = [];
        for (const poi of this.pois.values()) {
            if (poi.type === type) {
                result.push(poi);
            }
        }
        return result;
    }

    // ========== Region Methods ==========

    /**
     * Add a region to the world
     * @param {Object} region - Region metadata {id, capitalId, name, color, tileCount}
     */
    addRegion(region) {
        this.regions.set(region.id, region);
    }

    /**
     * Get a region by ID
     * @param {number} id - Region ID
     * @returns {Object|undefined} Region metadata
     */
    getRegion(id) {
        return this.regions.get(id);
    }

    /**
     * Get all regions
     * @returns {Object[]} Array of region metadata objects
     */
    getAllRegions() {
        return [...this.regions.values()];
    }

    // ========== Road Methods ==========

    /**
     * Add a road to the world
     * @param {Object} road - Road metadata {id, type, fromPoiId, toPoiId, tileIds}
     */
    addRoad(road) {
        this.roads.set(road.id, road);
    }

    /**
     * Get a road by ID
     * @param {number} id - Road ID
     * @returns {Object|undefined} Road metadata
     */
    getRoad(id) {
        return this.roads.get(id);
    }

    /**
     * Get all roads
     * @returns {Object[]} Array of road metadata objects
     */
    getAllRoads() {
        return [...this.roads.values()];
    }

    /**
     * Find tile containing a world position
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @returns {Tile|null} Tile at that position
     */
    getTileAtPosition(x, y) {
        // Check level 0 tiles (base tiles)
        for (const tile of this.tiles.values()) {
            if (tile.zoomLevel !== 0) continue;
            if (this.pointInTile(x, y, tile)) {
                return tile;
            }
        }
        return null;
    }

    /**
     * Check if a point is inside a tile's polygon
     */
    pointInTile(x, y, tile) {
        const vertices = tile.vertices;
        if (vertices.length < 3) return false;

        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i][0], yi = vertices[i][1];
            const xj = vertices[j][0], yj = vertices[j][1];

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Clear all tiles
     */
    clear() {
        this.tiles.clear();
        this.childrenIndex.clear();
        this.nextId = 0;
        this.pois.clear();
        this.poiSpatialIndex.clear();
        this.nextPoiId = 0;
        this.regions.clear();
        this.roads.clear();
    }

    /**
     * Serialize world to JSON
     */
    toJSON() {
        return {
            seed: this.seed,
            width: this.width,
            height: this.height,
            tileCount: this.tileCount,
            tiles: this.getAllTiles().map(t => t.toJSON()),
            pois: this.getAllPOIs().map(p => p.toJSON()),
            regions: this.getAllRegions(),
            roads: this.getAllRoads()
        };
    }

    /**
     * Load world from JSON
     */
    static fromJSON(data) {
        const world = new World({
            seed: data.seed,
            width: data.width,
            height: data.height,
            tileCount: data.tileCount
        });

        for (const tileData of data.tiles) {
            world.addTile(Tile.fromJSON(tileData));
        }

        // Load POIs if present
        if (data.pois) {
            for (const poiData of data.pois) {
                world.addPOI(POI.fromJSON(poiData));
            }
        }

        // Load regions if present
        if (data.regions) {
            for (const region of data.regions) {
                world.addRegion(region);
            }
        }

        // Load roads if present
        if (data.roads) {
            for (const road of data.roads) {
                world.addRoad(road);
            }
        }

        return world;
    }
}
