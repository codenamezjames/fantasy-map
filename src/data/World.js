import { Tile } from './Tile.js';

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

    /**
     * Clear all tiles
     */
    clear() {
        this.tiles.clear();
        this.childrenIndex.clear();
        this.nextId = 0;
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
            tiles: this.getAllTiles().map(t => t.toJSON())
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

        return world;
    }
}
