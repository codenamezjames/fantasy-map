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
     * Clear all tiles
     */
    clear() {
        this.tiles.clear();
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
