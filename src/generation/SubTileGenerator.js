import { Delaunay } from 'd3-delaunay';
import { Tile } from '../data/Tile.js';
import { SeededRandom } from '../utils/random.js';
import { CONFIG } from '../config.js';
import {
    pointInPolygon,
    getPolygonBounds,
    getPolygonArea,
    clipPolygon,
    edgeOnPolygonBoundary
} from '../utils/polygon.js';

/**
 * Valid biome transitions for child tiles
 * Children can only become biomes in parent's allowed list
 */
const BIOME_TRANSITIONS = {
    ocean: ['ocean'],
    lake: ['lake'],
    snow: ['snow', 'tundra'],
    tundra: ['tundra', 'taiga', 'snow'],
    taiga: ['taiga', 'tundra', 'temperate_forest'],
    temperate_forest: ['temperate_forest', 'temperate_grassland', 'marsh', 'shrubland'],
    temperate_grassland: ['temperate_grassland', 'temperate_forest', 'shrubland'],
    shrubland: ['shrubland', 'temperate_grassland', 'desert', 'savanna'],
    desert: ['desert', 'savanna', 'shrubland'],
    savanna: ['savanna', 'desert', 'shrubland', 'tropical_forest'],
    tropical_forest: ['tropical_forest', 'rainforest', 'savanna', 'marsh'],
    rainforest: ['rainforest', 'tropical_forest', 'marsh'],
    beach: ['beach', 'temperate_grassland', 'savanna'],
    marsh: ['marsh', 'temperate_forest', 'tropical_forest']
};

/**
 * Transitional biomes between two different biomes
 * Key format: "biomeA|biomeB" (alphabetically sorted)
 * Value: array of transitional biomes (ordered from biomeA toward biomeB)
 */
const BIOME_BLEND_MAP = {
    // Forest to desert transitions
    'desert|temperate_forest': ['shrubland', 'temperate_grassland'],
    'desert|tropical_forest': ['savanna', 'shrubland'],
    'desert|rainforest': ['savanna', 'tropical_forest'],

    // Forest to grassland
    'temperate_forest|temperate_grassland': ['shrubland'],
    'savanna|tropical_forest': ['shrubland'],

    // Cold transitions
    'snow|tundra': ['tundra'],
    'taiga|tundra': ['tundra'],
    'snow|taiga': ['tundra', 'taiga'],
    'taiga|temperate_forest': ['taiga'],

    // Hot/wet transitions
    'rainforest|savanna': ['tropical_forest'],
    'rainforest|tropical_forest': ['tropical_forest'],
    'desert|savanna': ['savanna'],

    // Grassland transitions
    'desert|temperate_grassland': ['shrubland', 'savanna'],
    'shrubland|temperate_grassland': ['shrubland'],
    'savanna|temperate_grassland': ['shrubland'],

    // Beach transitions
    'beach|desert': ['savanna'],
    'beach|temperate_forest': ['temperate_grassland'],
    'beach|temperate_grassland': ['temperate_grassland'],

    // Marsh transitions
    'marsh|temperate_grassland': ['marsh'],
    'marsh|desert': ['shrubland', 'savanna']
};

/**
 * Get the blend key for two biomes (alphabetically sorted)
 */
function getBlendKey(biome1, biome2) {
    return [biome1, biome2].sort((a, b) => a.localeCompare(b)).join('|');
}

/**
 * Get transitional biomes between two biomes
 */
function getTransitionalBiomes(fromBiome, toBiome) {
    const key = getBlendKey(fromBiome, toBiome);
    const transitions = BIOME_BLEND_MAP[key];

    if (!transitions) {
        // No specific transition defined, try to find common valid transitions
        const fromValid = BIOME_TRANSITIONS[fromBiome] || [fromBiome];
        const toValid = BIOME_TRANSITIONS[toBiome] || [toBiome];
        const common = fromValid.filter(b => toValid.includes(b) && b !== fromBiome && b !== toBiome);
        return common.length > 0 ? common : null;
    }

    // Return in correct order based on which biome is first alphabetically
    if (fromBiome < toBiome) {
        return transitions;
    } else {
        return [...transitions].reverse();
    }
}

/**
 * SubTileGenerator - generates Voronoi sub-tiles within a parent tile's polygon
 */
export class SubTileGenerator {
    constructor(noise) {
        this.noise = noise;
    }

    /**
     * Generate sub-tiles for a parent tile
     * @param {Tile} parent - Parent tile to subdivide
     * @param {World} world - World container
     * @param {string} worldSeed - Base world seed for determinism
     * @returns {Tile[]} Array of generated child tiles
     */
    generate(parent, world, worldSeed) {
        // Don't generate beyond max zoom level
        if (parent.isAtMaxDetail()) {
            return [];
        }

        // Skip very small tiles
        const area = getPolygonArea(parent.vertices);
        const minArea = CONFIG.subtiles?.minParentArea ?? 10;
        if (area < minArea) {
            return [];
        }

        // Create deterministic RNG from parent seed
        const localSeed = parent.getLocalSeed(worldSeed);
        const localRng = new SeededRandom(localSeed);

        // Calculate point count based on biome density
        const pointCount = this.getPointCount(parent);

        // Generate points within parent polygon
        const points = this.generatePointsInPolygon(parent.vertices, pointCount, localRng);

        if (points.length < 3) {
            return [];
        }

        // Get padded bounds for Voronoi generation
        const bounds = getPolygonBounds(parent.vertices);
        const padding = Math.max(bounds.width, bounds.height) * 0.2;
        const paddedBounds = [
            bounds.minX - padding,
            bounds.minY - padding,
            bounds.maxX + padding,
            bounds.maxY + padding
        ];

        // Create Voronoi diagram
        const delaunay = Delaunay.from(points);
        const voronoi = delaunay.voronoi(paddedBounds);

        // Extract tiles, clipping to parent polygon
        const children = this.extractClippedTiles(parent, points, delaunay, voronoi, world);

        // Inherit properties from parent with variation
        this.inheritProperties(children, parent, localRng, world);

        // Mark boundary edges for cross-parent neighbor resolution
        this.markBoundaryEdges(children, parent);

        return children;
    }

    /**
     * Calculate how many sub-tiles to generate based on biome density
     */
    getPointCount(parent) {
        const baseCount = CONFIG.subtiles?.baseCount ?? 12;
        const biomeDensity = CONFIG.world.biomeDensity[parent.biome] ?? 1;
        return Math.max(4, Math.floor(baseCount * biomeDensity));
    }

    /**
     * Generate random points inside a polygon using rejection sampling
     */
    generatePointsInPolygon(vertices, count, rng) {
        const bounds = getPolygonBounds(vertices);
        const points = [];
        const maxAttempts = count * 30;
        let attempts = 0;

        while (points.length < count && attempts < maxAttempts) {
            attempts++;
            const x = bounds.minX + rng.random() * bounds.width;
            const y = bounds.minY + rng.random() * bounds.height;

            if (pointInPolygon([x, y], vertices)) {
                points.push([x, y]);
            }
        }

        return points;
    }

    /**
     * Extract tiles from Voronoi diagram, clipping to parent polygon
     */
    extractClippedTiles(parent, points, delaunay, voronoi, world) {
        const children = [];
        const childZoomLevel = parent.zoomLevel + 1;

        // Zoom visibility ranges from config thresholds
        const thresholds = CONFIG.subtiles?.zoomThresholds || [0, 40, 60, 80];
        const minZooms = [-50, thresholds[1], thresholds[2], thresholds[3]];
        const maxZooms = [thresholds[1] - 1, thresholds[2] - 1, thresholds[3] - 1, 100];

        for (let i = 0; i < points.length; i++) {
            const cell = voronoi.cellPolygon(i);
            if (!cell) continue;

            // Clip cell to parent polygon
            const clipped = clipPolygon(cell, parent.vertices);
            if (!clipped || clipped.length < 3) continue;

            // Verify center is inside parent
            const center = points[i];
            if (!pointInPolygon(center, parent.vertices)) continue;

            // Create child tile
            const tile = new Tile({
                id: world.nextId++,
                parentId: parent.id,
                zoomLevel: childZoomLevel,
                center: center,
                vertices: clipped,
                neighbors: [], // Set below
                minZoom: minZooms[childZoomLevel] ?? 75,
                maxZoom: maxZooms[childZoomLevel] ?? 100
            });

            children.push({ tile, delaunayIndex: i });
        }

        // Set neighbor relationships from Delaunay
        const idMap = new Map(); // delaunayIndex -> tile.id
        for (const { tile, delaunayIndex } of children) {
            idMap.set(delaunayIndex, tile.id);
        }

        for (const { tile, delaunayIndex } of children) {
            const neighborIndices = [...delaunay.neighbors(delaunayIndex)];
            tile.neighbors = neighborIndices
                .map(idx => idMap.get(idx))
                .filter(id => id !== undefined);
        }

        return children.map(c => c.tile);
    }

    /**
     * Inherit properties from parent with controlled variation
     */
    inheritProperties(children, parent, rng, world) {
        const elevVar = CONFIG.subtiles?.elevationVariation ?? 0.1;
        const moistVar = CONFIG.subtiles?.moistureVariation ?? 0.1;

        // Get neighboring biomes for boundary blending
        const neighborBiomes = this.getNeighborBiomeInfo(parent, world);

        for (const child of children) {
            // Elevation with local variation
            const elevNoise = (rng.random() - 0.5) * 2 * elevVar;
            child.elevation = Math.max(0, Math.min(1, parent.elevation + elevNoise));

            // Moisture with local variation
            const moistNoise = (rng.random() - 0.5) * 2 * moistVar;
            child.moisture = Math.max(0, Math.min(1, parent.moisture + moistNoise));

            // Temperature is stable at local scale
            child.temperature = parent.temperature;

            // Water inherits directly
            if (parent.isWater) {
                child.isWater = true;
                child.waterDepth = parent.waterDepth;
                child.biome = parent.biome;
            } else {
                // Determine biome with transition constraints and boundary blending
                child.biome = this.determineChildBiomeWithBlending(
                    child, parent, neighborBiomes, rng
                );

                // Check if child became water (unlikely but handle edge case)
                child.isWater = false;
            }

            // Inherit coastal status
            child.isCoastal = parent.isCoastal;

            // Political features inherit directly
            child.regionId = parent.regionId;

            // Traversability inherits with slight variation
            child.traversability = parent.traversability;
        }

        // Mark coastal children that touch water neighbors
        this.updateCoastalStatus(children, parent);
    }

    /**
     * Get biome information for neighboring tiles
     * @returns {Array} Array of { biome, edgeMidpoint } for each different-biome neighbor
     */
    getNeighborBiomeInfo(parent, world) {
        const neighborInfo = [];

        for (const neighborId of parent.neighbors) {
            const neighbor = world.getTile(neighborId);
            if (!neighbor) continue;

            // Skip if same biome or water
            if (neighbor.biome === parent.biome || neighbor.isWater || parent.isWater) {
                continue;
            }

            // Find shared edge midpoint (approximation using centers)
            const edgeMidpoint = [
                (parent.center[0] + neighbor.center[0]) / 2,
                (parent.center[1] + neighbor.center[1]) / 2
            ];

            neighborInfo.push({
                biome: neighbor.biome,
                edgeMidpoint,
                neighborCenter: neighbor.center
            });
        }

        return neighborInfo;
    }

    /**
     * Determine child biome with boundary blending for smoother transitions
     */
    determineChildBiomeWithBlending(child, parent, neighborBiomes, rng) {
        // If no different-biome neighbors, use standard logic
        if (neighborBiomes.length === 0) {
            return this.determineChildBiome(child, parent);
        }

        // Calculate parent's approximate radius
        const parentBounds = getPolygonBounds(parent.vertices);
        const parentRadius = Math.max(parentBounds.width, parentBounds.height) / 2;

        // Blend zone is the outer portion of the tile
        const blendZoneRatio = 0.4; // 40% of tile radius is blend zone
        const blendDistance = parentRadius * blendZoneRatio;

        // Find closest different-biome neighbor edge
        let closestNeighbor = null;
        let closestDist = Infinity;

        for (const info of neighborBiomes) {
            const dist = Math.hypot(
                child.center[0] - info.edgeMidpoint[0],
                child.center[1] - info.edgeMidpoint[1]
            );
            if (dist < closestDist) {
                closestDist = dist;
                closestNeighbor = info;
            }
        }

        // If child is in blend zone, potentially use transitional biome
        if (closestNeighbor && closestDist < blendDistance) {
            const transitional = getTransitionalBiomes(parent.biome, closestNeighbor.biome);

            if (transitional && transitional.length > 0) {
                // Probability of transition increases closer to boundary
                const blendStrength = 1 - (closestDist / blendDistance);
                const transitionChance = blendStrength * 0.7; // Max 70% chance at boundary

                if (rng.random() < transitionChance) {
                    // Pick a transitional biome (weighted toward ones closer to parent)
                    const idx = Math.floor(rng.random() * transitional.length * (1 - blendStrength * 0.5));
                    return transitional[Math.min(idx, transitional.length - 1)];
                }
            }
        }

        // Default to standard logic
        return this.determineChildBiome(child, parent);
    }

    /**
     * Determine child's biome constrained to valid transitions
     */
    determineChildBiome(child, parent) {
        // Get valid transitions for parent biome
        const validBiomes = BIOME_TRANSITIONS[parent.biome] || [parent.biome];

        // Calculate what biome the child would naturally be
        const calculatedBiome = this.calculateBiome(child);

        // If calculated biome is valid transition, use it
        if (validBiomes.includes(calculatedBiome)) {
            return calculatedBiome;
        }

        // Otherwise use parent biome
        return parent.biome;
    }

    /**
     * Calculate biome from tile properties (same logic as BiomeGenerator)
     */
    calculateBiome(tile) {
        const { elevation, temperature, moisture, isCoastal } = tile;

        if (elevation > 0.8) return 'snow';

        if (isCoastal && elevation < 0.4 && temperature > 0.4) {
            return 'beach';
        }

        if (moisture > 0.8 && elevation < 0.4) {
            return 'marsh';
        }

        if (temperature < 0.25) {
            return moisture > 0.5 ? 'taiga' : 'tundra';
        }

        if (temperature < 0.5) {
            if (moisture < 0.3) return 'temperate_grassland';
            if (moisture < 0.6) return 'shrubland';
            return 'temperate_forest';
        }

        if (temperature < 0.75) {
            if (moisture < 0.25) return 'desert';
            if (moisture < 0.5) return 'savanna';
            return 'tropical_forest';
        }

        if (moisture < 0.3) return 'desert';
        if (moisture < 0.6) return 'savanna';
        return 'rainforest';
    }

    /**
     * Update coastal status for children at water boundary
     */
    updateCoastalStatus(children, parent) {
        // If parent isn't coastal, children aren't either
        if (!parent.isCoastal) return;

        // Children at parent boundary touching water become coastal
        for (const child of children) {
            // Check if any boundary edge faces a water neighbor
            for (const edge of child.boundaryEdges || []) {
                if (edge.neighborIsWater) {
                    child.isCoastal = true;
                    break;
                }
            }
        }
    }

    /**
     * Mark edges that lie on parent boundary for cross-parent neighbor resolution
     */
    markBoundaryEdges(children, parent) {
        for (const child of children) {
            child.boundaryEdges = [];

            for (let i = 0; i < child.vertices.length; i++) {
                const v1 = child.vertices[i];
                const v2 = child.vertices[(i + 1) % child.vertices.length];

                // Check if this edge lies on parent's boundary
                if (edgeOnPolygonBoundary(v1, v2, parent.vertices)) {
                    child.boundaryEdges.push({
                        v1: [...v1],
                        v2: [...v2],
                        neighborParentId: null // Resolved later when neighbor's children load
                    });
                }
            }
        }
    }
}
