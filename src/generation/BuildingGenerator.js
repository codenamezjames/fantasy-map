import { Building } from '../data/Building.js';

/**
 * BuildingGenerator - places buildings in city blocks
 * Uses street network faces as city blocks and fills them with buildings
 */
export class BuildingGenerator {
    constructor() {
        this.buildingSpacing = 2;   // Min gap between buildings
        this.streetMargin = 3;      // Distance from street edge
        this.minBuildingArea = 40;  // Minimum building area
    }

    /**
     * Generate buildings for a city
     * @param {City} city - City to add buildings to
     * @param {StreetNetwork} streets - Street network with blocks
     * @param {SeededRandom} rng - Random number generator
     * @returns {Building[]} Generated buildings
     */
    generate(city, streets, rng) {
        const buildings = [];
        let nextId = 1;

        // Find city blocks (faces in street network)
        const faceNodeIds = streets.findFaces();

        for (const faceNodes of faceNodeIds) {
            // Convert node IDs to polygon coordinates
            const block = streets.getFacePolygon(faceNodes);
            if (block.length < 3) continue;

            // Skip blocks that are too small or too large
            const area = this.calculatePolygonArea(block);
            if (area < 100) continue;
            if (area > 3000) continue; // Oversized face — likely outer boundary artifact

            // Get block bounds and inset by street margin
            const insetBlock = this.insetPolygon(block, this.streetMargin);
            if (insetBlock.length < 3) continue;

            // Verify inset polygon is still valid
            const insetArea = this.calculatePolygonArea(insetBlock);
            if (insetArea < this.minBuildingArea) continue;

            // Calculate how many buildings can fit
            const buildingCount = this.calculateBuildingCount(insetArea, city.params);

            // Place buildings in the block
            const blockBuildings = this.placeBuildings(
                insetBlock, buildingCount, rng, nextId
            );

            for (const building of blockBuildings) {
                building.blockId = faceNodeIds.indexOf(faceNodes);
                buildings.push(building);
                nextId++;
            }
        }

        return buildings;
    }

    /**
     * Place buildings within a block polygon
     * @param {number[][]} blockPolygon - Polygon vertices [[x,y],...]
     * @param {number} count - Target number of buildings
     * @param {SeededRandom} rng - Random number generator
     * @param {number} startId - Starting building ID
     * @returns {Building[]} Placed buildings
     */
    placeBuildings(blockPolygon, count, rng, startId) {
        const buildings = [];
        const bounds = this.getPolygonBounds(blockPolygon);
        const placedRects = []; // Track placed building bounding boxes

        const maxAttempts = count * 10;
        let attempts = 0;

        while (buildings.length < count && attempts < maxAttempts) {
            attempts++;

            // Random position within bounds
            const x = bounds.minX + rng.random() * (bounds.maxX - bounds.minX);
            const y = bounds.minY + rng.random() * (bounds.maxY - bounds.minY);

            // Random building type weighted by city type
            const type = this.randomBuildingType(rng);
            const defaults = Building.getTypeDefaults(type);

            // Random size variation (80% to 120% of default)
            const width = defaults.width * (0.8 + rng.random() * 0.4);
            const depth = defaults.depth * (0.8 + rng.random() * 0.4);

            // Random rotation (mostly axis-aligned, sometimes 45deg)
            const rotation = rng.random() < 0.8
                ? Math.floor(rng.random() * 4) * (Math.PI / 2)
                : Math.floor(rng.random() * 8) * (Math.PI / 4);

            // Create building
            const building = new Building({
                id: startId + buildings.length,
                position: [x, y],
                type,
                width,
                depth,
                height: defaults.height,
                rotation,
                roofType: defaults.roofType
            });
            building.generateRectVertices();

            // Check if building fits in block and doesn't overlap
            if (this.buildingFitsInBlock(building, blockPolygon) &&
                !this.overlapsExisting(building, placedRects)) {
                buildings.push(building);
                placedRects.push(this.getBuildingBoundsWithSpacing(building));
            }
        }

        return buildings;
    }

    /**
     * Calculate polygon area using Shoelace formula
     * @param {number[][]} polygon - Polygon vertices [[x,y],...]
     * @returns {number} Area (always positive)
     */
    calculatePolygonArea(polygon) {
        if (polygon.length < 3) return 0;

        let area = 0;
        const n = polygon.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }

        return Math.abs(area / 2);
    }

    /**
     * Shrink polygon inward by a given amount
     * Uses simple vertex offset toward centroid
     * @param {number[][]} polygon - Polygon vertices [[x,y],...]
     * @param {number} amount - Distance to inset
     * @returns {number[][]} Inset polygon vertices
     */
    insetPolygon(polygon, amount) {
        if (polygon.length < 3) return [];

        // Calculate centroid
        let cx = 0, cy = 0;
        for (const [x, y] of polygon) {
            cx += x;
            cy += y;
        }
        cx /= polygon.length;
        cy /= polygon.length;

        // Inset each vertex toward centroid
        const result = [];
        for (const [x, y] of polygon) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy);

            if (dist < amount) {
                // Vertex too close to center, skip
                continue;
            }

            // Move vertex toward centroid by 'amount' distance
            const scale = (dist - amount) / dist;
            result.push([cx + dx * scale, cy + dy * scale]);
        }

        // Need at least 3 vertices for a valid polygon
        return result.length >= 3 ? result : [];
    }

    /**
     * Get bounding box of polygon
     * @param {number[][]} polygon - Polygon vertices [[x,y],...]
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    getPolygonBounds(polygon) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const [x, y] of polygon) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        return { minX, minY, maxX, maxY };
    }

    /**
     * Check if all building vertices are inside the block polygon
     * @param {Building} building - Building to check
     * @param {number[][]} blockPolygon - Block boundary polygon
     * @returns {boolean} True if building fits entirely inside block
     */
    buildingFitsInBlock(building, blockPolygon) {
        // Check each vertex of the building
        for (const vertex of building.vertices) {
            if (!this.pointInPolygon(vertex, blockPolygon)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Check if a building overlaps any existing placed rectangles (AABB check)
     * @param {Building} building - Building to check
     * @param {Array<{minX, minY, maxX, maxY}>} placedRects - Already placed building bounds
     * @returns {boolean} True if overlaps any existing building
     */
    overlapsExisting(building, placedRects) {
        const bounds = building.getBounds();

        // Add spacing to bounds
        const testRect = {
            minX: bounds.minX - this.buildingSpacing,
            minY: bounds.minY - this.buildingSpacing,
            maxX: bounds.maxX + this.buildingSpacing,
            maxY: bounds.maxY + this.buildingSpacing
        };

        for (const rect of placedRects) {
            // AABB overlap check
            if (testRect.minX < rect.maxX &&
                testRect.maxX > rect.minX &&
                testRect.minY < rect.maxY &&
                testRect.maxY > rect.minY) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get building bounds with spacing included
     * @param {Building} building - Building
     * @returns {{minX, minY, maxX, maxY}} Bounds with spacing
     */
    getBuildingBoundsWithSpacing(building) {
        const bounds = building.getBounds();
        return {
            minX: bounds.minX - this.buildingSpacing,
            minY: bounds.minY - this.buildingSpacing,
            maxX: bounds.maxX + this.buildingSpacing,
            maxY: bounds.maxY + this.buildingSpacing
        };
    }

    /**
     * Select random building type with weighted probabilities
     * @param {SeededRandom} rng - Random number generator
     * @returns {string} Building type
     */
    randomBuildingType(rng) {
        // Weighted selection favoring common building types
        const weights = {
            house: 50,
            shop: 20,
            warehouse: 10,
            tavern: 8,
            temple: 5,
            market: 5,
            castle: 2
        };

        const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
        let random = rng.random() * totalWeight;

        for (const [type, weight] of Object.entries(weights)) {
            random -= weight;
            if (random <= 0) {
                return type;
            }
        }

        return 'house'; // Default fallback
    }

    /**
     * Calculate target building count based on area and city params
     * @param {number} area - Block area
     * @param {Object} params - City parameters (minBuildings, maxBuildings, buildingDensity)
     * @returns {number} Target building count
     */
    calculateBuildingCount(area, params) {
        // Base building count on area and density
        // Average building footprint ~100-150 sq units
        const avgBuildingSize = 120;
        const density = params?.buildingDensity ?? 0.5;

        // Calculate max buildings that could fit
        const maxFit = Math.floor((area * density) / avgBuildingSize);

        // Clamp to city params
        const min = params?.minBuildings ?? 1;
        const max = params?.maxBuildings ?? 10;

        // Per-block count is a fraction of the city total
        // Assume ~5-15 blocks per city on average
        const perBlockMin = Math.max(1, Math.floor(min / 10));
        const perBlockMax = Math.ceil(max / 5);

        return Math.min(maxFit, Math.max(perBlockMin, Math.min(perBlockMax, maxFit)));
    }

    /**
     * Point-in-polygon test using ray casting
     * @param {number[]} point - [x, y] point to test
     * @param {number[][]} polygon - Polygon vertices [[x,y],...]
     * @returns {boolean} True if point is inside polygon
     */
    pointInPolygon(point, polygon) {
        if (polygon.length < 3) return false;

        const [px, py] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Calculate polygon centroid
     * @param {number[][]} polygon - Polygon vertices [[x,y],...]
     * @returns {number[]} [cx, cy] centroid coordinates
     */
    getPolygonCentroid(polygon) {
        if (polygon.length === 0) return [0, 0];

        let cx = 0, cy = 0;
        for (const [x, y] of polygon) {
            cx += x;
            cy += y;
        }

        return [cx / polygon.length, cy / polygon.length];
    }
}
