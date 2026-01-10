/**
 * Tile - represents a single Voronoi cell in the world
 */
export class Tile {
    constructor(config = {}) {
        // Identity
        this.id = config.id ?? 0;
        this.parentId = config.parentId ?? null;
        this.zoomLevel = config.zoomLevel ?? 0;

        // Geometry
        this.center = config.center ?? [0, 0];
        this.vertices = config.vertices ?? [];

        // Neighbors (adjacent tile IDs)
        this.neighbors = config.neighbors ?? [];

        // Terrain properties (set by generation passes)
        this.elevation = config.elevation ?? 0;
        this.moisture = config.moisture ?? 0;
        this.temperature = config.temperature ?? 0;
        this.biome = config.biome ?? null;
        this.terrain = config.terrain ?? null;

        // Water
        this.isWater = config.isWater ?? false;
        this.waterDepth = config.waterDepth ?? 0;
        this.isCoastal = config.isCoastal ?? false;
        this.riverEdges = config.riverEdges ?? [];

        // Political/navigation
        this.regionId = config.regionId ?? null;
        this.roadEdges = config.roadEdges ?? [];
        this.traversability = config.traversability ?? 1;

        // Visibility (zoom percentage range)
        this.minZoom = config.minZoom ?? -50;
        this.maxZoom = config.maxZoom ?? 40;

        // Hierarchical detail
        this.detailGenerated = config.detailGenerated ?? false;
        this.childrenIds = config.childrenIds ?? [];
        this.boundaryEdges = config.boundaryEdges ?? []; // [{v1, v2, neighborParentId}]

        // Biome blending (for sub-tiles near biome boundaries)
        this.blendBiome = config.blendBiome ?? null;    // Biome to blend toward
        this.blendFactor = config.blendFactor ?? 0;      // 0-1 blend amount
    }

    /**
     * Get deterministic seed for generating children of this tile
     * @param {string} worldSeed - The world's base seed
     * @returns {string} Seed for child generation
     */
    getLocalSeed(worldSeed) {
        return `${worldSeed}-${this.id}-z${this.zoomLevel + 1}`;
    }

    /**
     * Check if this tile has generated children
     */
    hasChildren() {
        return this.childrenIds.length > 0;
    }

    /**
     * Check if this tile is at maximum detail level
     */
    isAtMaxDetail() {
        return this.zoomLevel >= 3; // Building level
    }

    /**
     * Factory method to create a tile
     */
    static create(id, center, vertices, neighbors) {
        return new Tile({
            id,
            center,
            vertices,
            neighbors
        });
    }

    /**
     * Get bounding box of tile vertices
     */
    getBounds() {
        if (this.vertices.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const [x, y] of this.vertices) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Check if tile intersects with a viewport
     */
    intersectsViewport(vp) {
        const bounds = this.getBounds();
        return !(bounds.maxX < vp.minX ||
                 bounds.minX > vp.maxX ||
                 bounds.maxY < vp.minY ||
                 bounds.minY > vp.maxY);
    }

    /**
     * Get a placeholder color based on tile ID
     */
    getPlaceholderColor() {
        // Generate deterministic color from ID
        const hue = (this.id * 137.508) % 360; // Golden angle for good distribution
        return `hsl(${hue}, 40%, 35%)`;
    }

    /**
     * Serialize tile to plain object
     */
    toJSON() {
        return {
            id: this.id,
            parentId: this.parentId,
            zoomLevel: this.zoomLevel,
            center: this.center,
            vertices: this.vertices,
            neighbors: this.neighbors,
            elevation: this.elevation,
            moisture: this.moisture,
            temperature: this.temperature,
            biome: this.biome,
            terrain: this.terrain,
            isWater: this.isWater,
            waterDepth: this.waterDepth,
            isCoastal: this.isCoastal,
            riverEdges: this.riverEdges,
            regionId: this.regionId,
            roadEdges: this.roadEdges,
            traversability: this.traversability,
            minZoom: this.minZoom,
            maxZoom: this.maxZoom,
            detailGenerated: this.detailGenerated,
            childrenIds: this.childrenIds,
            boundaryEdges: this.boundaryEdges,
            blendBiome: this.blendBiome,
            blendFactor: this.blendFactor
        };
    }

    /**
     * Create tile from plain object
     */
    static fromJSON(data) {
        return new Tile(data);
    }
}
