import { SeededRandom } from '../utils/random.js';
import { CONFIG } from '../config.js';
import { StreetGenerator } from './StreetGenerator.js';
import { BuildingGenerator } from './BuildingGenerator.js';

/**
 * City - represents a generated city for a settlement POI
 */
export class City {
    constructor(config = {}) {
        this.id = config.id ?? 0;
        this.poiId = config.poiId ?? null;
        this.name = config.name ?? 'Unknown';
        this.type = config.type ?? 'village';
        this.seed = config.seed ?? '';

        // Geometry
        this.center = config.center ?? [0, 0];
        this.boundary = config.boundary ?? []; // Array of [x,y] forming city polygon
        this.occupiedTileIds = config.occupiedTileIds ?? [];

        // Bounds (calculated lazily)
        this.bounds = null;

        // Generated content (populated by generation methods)
        this.streets = null;      // StreetNetwork (Phase 1)
        this.buildings = [];       // Building[] (Phase 2)
        this.districts = [];       // District[] (Phase 3)
        this.walls = null;         // WallSystem (Phase 3)

        // Generation state tracking
        this.generationState = {};
    }

    /**
     * Calculate and cache the axis-aligned bounding box of the city boundary
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}} Bounds
     */
    calculateBounds() {
        if (this.boundary.length === 0) {
            this.bounds = {
                minX: this.center[0] - 50,
                minY: this.center[1] - 50,
                maxX: this.center[0] + 50,
                maxY: this.center[1] + 50
            };
            return this.bounds;
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const [x, y] of this.boundary) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        this.bounds = { minX, minY, maxX, maxY };
        return this.bounds;
    }

    /**
     * Check if a point is inside the city boundary using ray casting algorithm
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if point is inside the boundary
     */
    containsPoint(x, y) {
        if (this.boundary.length < 3) {
            // No valid boundary, use simple distance check from center
            const dx = x - this.center[0];
            const dy = y - this.center[1];
            return Math.sqrt(dx * dx + dy * dy) <= 50;
        }

        // Ray casting algorithm
        let inside = false;
        const n = this.boundary.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = this.boundary[i][0];
            const yi = this.boundary[i][1];
            const xj = this.boundary[j][0];
            const yj = this.boundary[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) {
                inside = !inside;
            }
        }

        return inside;
    }
}

/**
 * CityGenerator - generates detailed city content for settlement POIs
 */
export class CityGenerator {
    constructor() {
        // Cache generated cities by POI ID
        this.cityCache = new Map();

        // Sub-generators for city components
        this.streetGenerator = new StreetGenerator();
        this.buildingGenerator = new BuildingGenerator();
    }

    /**
     * Generate or retrieve cached city for a POI
     * @param {POI} poi - The POI to generate a city for
     * @param {World} world - The world containing tiles
     * @param {string} worldSeed - The world's base seed
     * @returns {City} Generated city
     */
    generate(poi, world, worldSeed) {
        // Check cache first
        if (this.cityCache.has(poi.id)) {
            return this.cityCache.get(poi.id);
        }

        // Calculate deterministic city seed
        const citySeed = this.calculateSeed(poi.id, worldSeed);
        const rng = new SeededRandom(citySeed);

        // Get boundary polygon from occupied tiles
        const { boundary, tileIds } = this.calculateBoundary(poi, world);

        // Create city
        const city = new City({
            id: poi.id,
            poiId: poi.id,
            name: poi.name,
            type: poi.type,
            seed: citySeed,
            center: poi.position,
            boundary,
            occupiedTileIds: tileIds
        });

        // Generate city content (stub methods for now)
        this.generateStreets(city, rng, world);
        this.generateBuildings(city, rng);

        // Cache and return
        this.cityCache.set(poi.id, city);
        return city;
    }

    /**
     * Calculate deterministic seed for city generation
     * @param {number} poiId - POI identifier
     * @param {string} worldSeed - World's base seed
     * @returns {string} Deterministic city seed
     */
    calculateSeed(poiId, worldSeed) {
        // Simple hash combining poi ID and world seed
        return `city-${worldSeed}-poi${poiId}`;
    }

    /**
     * Calculate city boundary from POI's occupied tiles
     * Uses BFS to find all tiles within occupation radius, then extracts outer boundary
     * @param {POI} poi - The POI
     * @param {World} world - The world containing tiles
     * @returns {{boundary: number[][], tileIds: number[]}} Boundary polygon and occupied tile IDs
     */
    calculateBoundary(poi, world) {
        // Get the center tile
        const centerTile = world.getTile(poi.tileId);
        if (!centerTile) {
            return { boundary: [], tileIds: [] };
        }

        // Get occupation radius from CONFIG
        const occupationRadius = CONFIG.pois.tileOccupation[poi.type] ?? 0;

        // BFS to find all tiles within occupation radius
        const occupiedTileIds = this.findOccupiedTiles(centerTile, world, occupationRadius);

        // Build outer boundary polygon from occupied tiles
        const boundary = this.extractBoundaryPolygon(occupiedTileIds, world);

        return { boundary, tileIds: occupiedTileIds };
    }

    /**
     * Use BFS to find all tiles within a certain ring distance from center
     * @param {Tile} centerTile - Starting tile
     * @param {World} world - World containing tiles
     * @param {number} maxRings - Maximum ring distance (0 = just center tile)
     * @returns {number[]} Array of occupied tile IDs
     */
    findOccupiedTiles(centerTile, world, maxRings) {
        const visited = new Set();
        const result = [];

        // Queue entries: [tileId, ringDistance]
        const queue = [[centerTile.id, 0]];
        visited.add(centerTile.id);

        while (queue.length > 0) {
            const [tileId, ring] = queue.shift();
            result.push(tileId);

            // If we haven't reached max rings, add neighbors
            if (ring < maxRings) {
                const tile = world.getTile(tileId);
                if (tile) {
                    for (const neighborId of tile.neighbors) {
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            const neighborTile = world.getTile(neighborId);
                            // Only include land tiles (not water)
                            if (neighborTile && !neighborTile.isWater) {
                                queue.push([neighborId, ring + 1]);
                            }
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Extract the outer boundary polygon from a set of tiles
     * Finds edges that are only used by one tile (outer edges)
     * @param {number[]} tileIds - Array of tile IDs
     * @param {World} world - World containing tiles
     * @returns {number[][]} Array of [x, y] vertices forming the boundary polygon
     */
    extractBoundaryPolygon(tileIds, world) {
        if (tileIds.length === 0) {
            return [];
        }

        const tileIdSet = new Set(tileIds);

        // Collect all edges that are on the boundary (not shared with another occupied tile)
        // Edge format: { v1: [x,y], v2: [x,y] }
        const boundaryEdges = [];

        for (const tileId of tileIds) {
            const tile = world.getTile(tileId);
            if (!tile || tile.vertices.length < 3) continue;

            const vertices = tile.vertices;
            for (let i = 0; i < vertices.length; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % vertices.length];

                // Check if this edge is shared with an occupied neighbor
                const isShared = this.isEdgeSharedWithOccupiedTile(
                    v1, v2, tile, tileIdSet, world
                );

                if (!isShared) {
                    boundaryEdges.push({ v1, v2 });
                }
            }
        }

        if (boundaryEdges.length === 0) {
            // Fallback: return center tile vertices if no boundary edges found
            const centerTile = world.getTile(tileIds[0]);
            return centerTile ? [...centerTile.vertices] : [];
        }

        // Chain edges into a continuous polygon
        return this.chainEdgesToPolygon(boundaryEdges);
    }

    /**
     * Check if an edge is shared with another occupied tile
     * @param {number[]} v1 - First vertex of edge
     * @param {number[]} v2 - Second vertex of edge
     * @param {Tile} tile - Current tile
     * @param {Set<number>} occupiedIds - Set of occupied tile IDs
     * @param {World} world - World containing tiles
     * @returns {boolean} True if edge is shared with another occupied tile
     */
    isEdgeSharedWithOccupiedTile(v1, v2, tile, occupiedIds, world) {
        const epsilon = 0.001;

        for (const neighborId of tile.neighbors) {
            // Skip if neighbor is not in occupied set
            if (!occupiedIds.has(neighborId)) continue;

            const neighbor = world.getTile(neighborId);
            if (!neighbor) continue;

            // Check if neighbor has matching edge (reversed direction)
            const neighborVerts = neighbor.vertices;
            for (let i = 0; i < neighborVerts.length; i++) {
                const nv1 = neighborVerts[i];
                const nv2 = neighborVerts[(i + 1) % neighborVerts.length];

                // Edges match if vertices are the same (in reverse order for shared edge)
                if (this.verticesMatch(v1, nv2, epsilon) &&
                    this.verticesMatch(v2, nv1, epsilon)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if two vertices match within epsilon tolerance
     * @param {number[]} v1 - First vertex
     * @param {number[]} v2 - Second vertex
     * @param {number} epsilon - Tolerance
     * @returns {boolean} True if vertices match
     */
    verticesMatch(v1, v2, epsilon = 0.001) {
        return Math.abs(v1[0] - v2[0]) < epsilon &&
               Math.abs(v1[1] - v2[1]) < epsilon;
    }

    /**
     * Chain disconnected edges into a continuous polygon
     * @param {Array<{v1: number[], v2: number[]}>} edges - Array of edges
     * @returns {number[][]} Ordered polygon vertices
     */
    chainEdgesToPolygon(edges) {
        if (edges.length === 0) return [];

        const epsilon = 0.001;
        const result = [];
        const used = new Set();

        // Start with first edge
        let current = edges[0];
        used.add(0);
        result.push(current.v1);
        result.push(current.v2);

        // Chain remaining edges
        while (used.size < edges.length) {
            const lastVertex = result[result.length - 1];
            let foundNext = false;

            for (let i = 0; i < edges.length; i++) {
                if (used.has(i)) continue;

                const edge = edges[i];

                // Check if edge.v1 connects to last vertex
                if (this.verticesMatch(edge.v1, lastVertex, epsilon)) {
                    result.push(edge.v2);
                    used.add(i);
                    foundNext = true;
                    break;
                }

                // Check if edge.v2 connects to last vertex (reverse edge)
                if (this.verticesMatch(edge.v2, lastVertex, epsilon)) {
                    result.push(edge.v1);
                    used.add(i);
                    foundNext = true;
                    break;
                }
            }

            // If no connecting edge found, we might have multiple loops
            // or disconnected components - break to avoid infinite loop
            if (!foundNext) {
                break;
            }
        }

        // Remove duplicate closing vertex if present
        if (result.length > 1 &&
            this.verticesMatch(result[0], result[result.length - 1], epsilon)) {
            result.pop();
        }

        return result;
    }

    /**
     * Generate street network (Phase 1)
     * @param {City} city - City to generate streets for
     * @param {SeededRandom} rng - Random number generator
     * @param {World} world - World containing tiles
     */
    generateStreets(city, rng, world) {
        city.streets = this.streetGenerator.generate(city, world, rng);
        city.generationState = city.generationState || {};
        city.generationState.streets = true;
    }

    /**
     * Generate buildings (Phase 2)
     * @param {City} city - City to generate buildings for
     * @param {SeededRandom} rng - Random number generator
     */
    generateBuildings(city, rng) {
        // Skip if streets haven't been generated
        if (!city.streets) return;

        city.buildings = this.buildingGenerator.generate(city, city.streets, rng);
        city.generationState = city.generationState || {};
        city.generationState.buildings = true;
    }

    /**
     * Clear cached city for a specific POI or all cities
     * @param {number|null} poiId - POI ID to clear, or null to clear all
     */
    clearCache(poiId = null) {
        if (poiId !== null) {
            this.cityCache.delete(poiId);
        } else {
            this.cityCache.clear();
        }
    }

    /**
     * Check if a city is cached for a POI
     * @param {number} poiId - POI ID to check
     * @returns {boolean} True if city is cached
     */
    hasCity(poiId) {
        return this.cityCache.has(poiId);
    }

    /**
     * Get cached city without generating
     * @param {number} poiId - POI ID
     * @returns {City|undefined} Cached city or undefined
     */
    getCity(poiId) {
        return this.cityCache.get(poiId);
    }
}
