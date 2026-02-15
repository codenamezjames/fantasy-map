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

        // Spatial grid index for fast viewport queries
        this._gridCellSize = 40;
        this._gridCols = Math.ceil(this.width / this._gridCellSize);
        this._gridRows = Math.ceil(this.height / this._gridCellSize);
        this._grid = new Array(this._gridCols * this._gridRows).fill(null);

        // Lazy cache: shared edges between neighboring tiles
        this._sharedEdges = new Map();
    }

    /**
     * Insert tile into spatial grid based on its bounds
     */
    _gridInsert(tile) {
        const bounds = tile.getBounds();
        const colMin = Math.max(0, Math.floor(bounds.minX / this._gridCellSize));
        const colMax = Math.min(this._gridCols - 1, Math.floor(bounds.maxX / this._gridCellSize));
        const rowMin = Math.max(0, Math.floor(bounds.minY / this._gridCellSize));
        const rowMax = Math.min(this._gridRows - 1, Math.floor(bounds.maxY / this._gridCellSize));

        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                const idx = r * this._gridCols + c;
                if (!this._grid[idx]) {
                    this._grid[idx] = [tile.id];
                } else {
                    this._grid[idx].push(tile.id);
                }
            }
        }
    }

    /**
     * Remove tile from spatial grid
     */
    _gridRemove(tileId) {
        const tile = this.tiles.get(tileId);
        if (!tile) return;
        const bounds = tile.getBounds();
        const colMin = Math.max(0, Math.floor(bounds.minX / this._gridCellSize));
        const colMax = Math.min(this._gridCols - 1, Math.floor(bounds.maxX / this._gridCellSize));
        const rowMin = Math.max(0, Math.floor(bounds.minY / this._gridCellSize));
        const rowMax = Math.min(this._gridRows - 1, Math.floor(bounds.maxY / this._gridCellSize));

        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                const idx = r * this._gridCols + c;
                const cell = this._grid[idx];
                if (cell) {
                    const pos = cell.indexOf(tileId);
                    if (pos !== -1) cell.splice(pos, 1);
                }
            }
        }
    }

    /**
     * Add a tile to the world
     */
    addTile(tile) {
        this.tiles.set(tile.id, tile);
        if (tile.id >= this.nextId) {
            this.nextId = tile.id + 1;
        }
        this._gridInsert(tile);
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
     * Get tiles visible in viewport at current zoom (uses spatial grid)
     */
    getTilesInViewport(viewport, zoom) {
        const colMin = Math.max(0, Math.floor(viewport.minX / this._gridCellSize));
        const colMax = Math.min(this._gridCols - 1, Math.floor(viewport.maxX / this._gridCellSize));
        const rowMin = Math.max(0, Math.floor(viewport.minY / this._gridCellSize));
        const rowMax = Math.min(this._gridRows - 1, Math.floor(viewport.maxY / this._gridCellSize));

        const seen = new Set();
        const visible = [];

        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                const cell = this._grid[r * this._gridCols + c];
                if (!cell) continue;
                for (const tileId of cell) {
                    if (seen.has(tileId)) continue;
                    seen.add(tileId);
                    const tile = this.tiles.get(tileId);
                    if (!tile) continue;
                    if (zoom < tile.minZoom || zoom > tile.maxZoom) continue;
                    if (tile.intersectsViewport(viewport)) {
                        visible.push(tile);
                    }
                }
            }
        }
        return visible;
    }

    /**
     * Get level-0 tiles visible in viewport (for rivers/roads)
     */
    getLevel0TilesInViewport(viewport) {
        const colMin = Math.max(0, Math.floor(viewport.minX / this._gridCellSize));
        const colMax = Math.min(this._gridCols - 1, Math.floor(viewport.maxX / this._gridCellSize));
        const rowMin = Math.max(0, Math.floor(viewport.minY / this._gridCellSize));
        const rowMax = Math.min(this._gridRows - 1, Math.floor(viewport.maxY / this._gridCellSize));

        const seen = new Set();
        const visible = [];

        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                const cell = this._grid[r * this._gridCols + c];
                if (!cell) continue;
                for (const tileId of cell) {
                    if (seen.has(tileId)) continue;
                    seen.add(tileId);
                    const tile = this.tiles.get(tileId);
                    if (!tile || tile.zoomLevel !== 0) continue;
                    if (tile.intersectsViewport(viewport)) {
                        visible.push(tile);
                    }
                }
            }
        }
        return visible;
    }

    /**
     * Get the shared edge between two neighboring tiles (lazy cached)
     */
    getSharedEdge(tileId1, tileId2) {
        const key = tileId1 < tileId2 ? `${tileId1}-${tileId2}` : `${tileId2}-${tileId1}`;
        const cached = this._sharedEdges.get(key);
        if (cached !== undefined) return cached;

        const tile1 = this.tiles.get(tileId1);
        const tile2 = this.tiles.get(tileId2);
        if (!tile1 || !tile2) {
            this._sharedEdges.set(key, null);
            return null;
        }

        const shared = [];
        const epsilon = 0.001;
        for (const vA of tile1.vertices) {
            for (const vB of tile2.vertices) {
                if (Math.abs(vA[0] - vB[0]) < epsilon && Math.abs(vA[1] - vB[1]) < epsilon) {
                    shared.push(vA);
                    break;
                }
            }
            if (shared.length === 2) break;
        }

        const edge = shared.length >= 2 ? [shared[0], shared[1]] : null;
        this._sharedEdges.set(key, edge);
        return edge;
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
            this._gridRemove(childId);
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
        // Use spatial grid for fast lookup
        const col = Math.floor(x / this._gridCellSize);
        const row = Math.floor(y / this._gridCellSize);
        if (col < 0 || col >= this._gridCols || row < 0 || row >= this._gridRows) {
            return null;
        }
        const cell = this._grid[row * this._gridCols + col];
        if (cell) {
            for (const tileId of cell) {
                const tile = this.tiles.get(tileId);
                if (!tile || tile.zoomLevel !== 0) continue;
                if (this.pointInTile(x, y, tile)) {
                    return tile;
                }
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
        this._grid = new Array(this._gridCols * this._gridRows).fill(null);
        this._sharedEdges.clear();
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
