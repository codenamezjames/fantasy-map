import { Delaunay } from 'd3-delaunay';
import { Tile } from '../data/Tile.js';
import { World } from '../data/World.js';
import { CONFIG } from '../config.js';

/**
 * VoronoiGenerator - generates Voronoi-based world tiles
 * Supports variable density - more points on land, fewer in ocean
 */
export class VoronoiGenerator {
    constructor(rng, noise = null) {
        this.rng = rng;
        this.noise = noise; // Optional - enables density-based generation
    }

    /**
     * Predict biome density multiplier for a point based on moisture/temperature
     * Uses same noise calculations as MoistureGenerator and TemperatureGenerator
     */
    predictBiomeDensity(x, y, height, elevation) {
        const biomeDensity = CONFIG.world.biomeDensity;

        // Calculate moisture (same as MoistureGenerator)
        const moisture = this.noise.getOctave(x, y, 4, 0.5, 0.003);

        // Calculate temperature (same as TemperatureGenerator)
        const normalizedY = y / height;
        const distFromEquator = Math.abs(normalizedY - 0.5) * 2;
        const latitudeTemp = 1 - distFromEquator;
        const elevationPenalty = elevation * 0.4;
        const tempNoise = this.noise.getOctave(x, y, 3, 0.5, 0.005);
        const temperature = Math.max(0, Math.min(1,
            latitudeTemp * (1 - elevationPenalty) + (tempNoise - 0.5) * 0.15
        ));

        // Predict density based on biome-like conditions
        if (moisture > 0.5) {
            return biomeDensity.forest;      // Forest-like (dense)
        } else if (moisture < 0.25 && temperature > 0.5) {
            return biomeDensity.desert;      // Desert-like (sparse)
        } else if (temperature < 0.25) {
            return biomeDensity.tundra;      // Tundra-like (sparse)
        }
        return biomeDensity.grassland;       // Default (normal)
    }

    /**
     * Generate a world with Voronoi tiles
     */
    generate(config = {}) {
        const {
            seed = 'default',
            width = 2000,
            height = 2000,
            tileCount = 500
        } = config;

        // Create world
        const world = new World({ seed, width, height, tileCount });

        // Generate random points
        const points = this.generatePoints(tileCount, width, height);

        // Create Voronoi diagram
        const { delaunay, voronoi } = this.createVoronoi(points, width, height);

        // Extract tiles
        this.extractTiles(world, points, delaunay, voronoi);

        console.log(`Generated ${world.tiles.size} tiles`);
        return world;
    }

    /**
     * Generate seeded random points with optional density variation
     * When noise is available, generates more points in high-elevation (land) areas
     */
    generatePoints(count, width, height) {
        // If no noise generator, use uniform distribution
        if (!this.noise) {
            const points = [];
            for (let i = 0; i < count; i++) {
                points.push([
                    this.rng.random() * width,
                    this.rng.random() * height
                ]);
            }
            return points;
        }

        // Density-based generation using rejection sampling
        const points = [];
        const seaLevel = CONFIG.elevation.seaLevel;
        const densityContrast = CONFIG.world.densityContrast || 3;

        // Generate more candidates than needed, then filter by density
        // Increased from 5x to 8x due to biome-based rejection
        const maxAttempts = count * 8;
        let attempts = 0;

        while (points.length < count && attempts < maxAttempts) {
            attempts++;

            const x = this.rng.random() * width;
            const y = this.rng.random() * height;

            // Sample noise to estimate elevation (same formula as ElevationGenerator)
            const continental = this.noise.getOctave(x, y, 4, 0.5, 0.001);
            const mountain = this.noise.getOctave(x, y, 6, 0.6, 0.003);
            const detail = this.noise.getOctave(x, y, 3, 0.5, 0.01);
            let elevation = continental * 0.6 + mountain * 0.3 + detail * 0.1;

            // Apply edge falloff
            const edgeMargin = CONFIG.elevation.edgeMargin;
            const dx = Math.min(x / width, 1 - x / width) / edgeMargin;
            const dy = Math.min(y / height, 1 - y / height) / edgeMargin;
            const fx = Math.min(1, Math.max(0, dx));
            const fy = Math.min(1, Math.max(0, dy));
            elevation *= (fx * fx * (3 - 2 * fx)) * (fy * fy * (3 - 2 * fy));

            // Calculate acceptance probability based on elevation and biome
            let acceptProbability;
            if (elevation >= seaLevel) {
                // Land - use biome-based density (forests dense, deserts sparse)
                acceptProbability = this.predictBiomeDensity(x, y, height, elevation);
            } else {
                // Ocean - sparse tiles
                acceptProbability = 1 / densityContrast;
            }

            // Accept or reject this point
            if (this.rng.random() < acceptProbability) {
                points.push([x, y]);
            }
        }

        console.log(`Density sampling: ${points.length} points from ${attempts} attempts`);
        return points;
    }

    /**
     * Create Voronoi diagram from points
     */
    createVoronoi(points, width, height) {
        const delaunay = Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, width, height]);
        return { delaunay, voronoi };
    }

    /**
     * Extract tiles from Voronoi diagram
     */
    extractTiles(world, points, delaunay, voronoi) {
        for (let i = 0; i < points.length; i++) {
            const cell = voronoi.cellPolygon(i);
            if (!cell) continue;

            // Get neighbor indices
            const neighbors = [...delaunay.neighbors(i)];

            // Create tile
            const tile = Tile.create(i, points[i], cell, neighbors);

            // Add to world
            world.addTile(tile);
        }
    }

    /**
     * Lloyd relaxation - makes cells more uniform
     * Can be called multiple times for smoother results
     */
    relax(world, iterations = 1) {
        let points = world.getAllTiles().map(t => t.center);

        for (let iter = 0; iter < iterations; iter++) {
            const { voronoi } = this.createVoronoi(points, world.width, world.height);

            // Move each point to its cell's centroid
            const newPoints = [];
            for (let i = 0; i < points.length; i++) {
                const cell = voronoi.cellPolygon(i);
                if (cell) {
                    const centroid = this.getCentroid(cell);
                    newPoints.push(centroid);
                } else {
                    newPoints.push(points[i]);
                }
            }
            points = newPoints;
        }

        // Rebuild world with relaxed points
        world.clear();
        const { delaunay, voronoi } = this.createVoronoi(points, world.width, world.height);
        this.extractTiles(world, points, delaunay, voronoi);
    }

    /**
     * Calculate centroid of a polygon
     */
    getCentroid(vertices) {
        let cx = 0, cy = 0;
        for (const [x, y] of vertices) {
            cx += x;
            cy += y;
        }
        return [cx / vertices.length, cy / vertices.length];
    }
}
