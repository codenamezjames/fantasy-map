import { Delaunay } from 'd3-delaunay';
import { Tile } from '../data/Tile.js';
import { World } from '../data/World.js';

/**
 * VoronoiGenerator - generates Voronoi-based world tiles
 */
export class VoronoiGenerator {
    constructor(rng) {
        this.rng = rng;
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
     * Generate seeded random points
     */
    generatePoints(count, width, height) {
        const points = [];
        for (let i = 0; i < count; i++) {
            points.push([
                this.rng.random() * width,
                this.rng.random() * height
            ]);
        }
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
