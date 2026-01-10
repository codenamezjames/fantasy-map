/**
 * MoistureGenerator - generates moisture values using noise and coastal proximity
 */
export class MoistureGenerator {
    constructor(noise) {
        this.noise = noise;
        this.coastalBonus = 0.2;     // Extra moisture near water
        this.coastalFalloff = 3;     // How quickly coastal bonus fades
    }

    /**
     * Generate moisture for all tiles in the world
     */
    generate(world) {
        for (const tile of world.getAllTiles()) {
            tile.moisture = this.calculateMoisture(
                tile.center[0],
                tile.center[1],
                tile,
                world
            );
        }
        this.logStats(world);
    }

    /**
     * Calculate moisture at a given point
     * Based on Perlin noise and proximity to water
     */
    calculateMoisture(x, y, tile, world) {
        // Base moisture from Perlin noise
        const baseMoisture = this.noise.getOctave(x, y, 4, 0.5, 0.003);

        // Water tiles are fully moist
        if (tile.isWater) {
            return 1.0;
        }

        // Coastal bonus - tiles near water get more moisture
        let coastalBonus = 0;
        if (tile.isCoastal) {
            coastalBonus = this.coastalBonus;
        } else {
            // Check neighbors of neighbors for nearby water
            const distanceToWater = this.getDistanceToWater(tile, world, 3);
            if (distanceToWater < 3) {
                coastalBonus = this.coastalBonus * (1 - distanceToWater / this.coastalFalloff);
            }
        }

        let moisture = baseMoisture + coastalBonus;

        return Math.max(0, Math.min(1, moisture));
    }

    /**
     * BFS to find distance to nearest water tile
     */
    getDistanceToWater(tile, world, maxDepth) {
        const visited = new Set([tile.id]);
        let current = [tile];

        for (let depth = 1; depth <= maxDepth; depth++) {
            const next = [];
            for (const t of current) {
                for (const neighborId of t.neighbors) {
                    if (visited.has(neighborId)) continue;
                    visited.add(neighborId);
                    const neighbor = world.getTile(neighborId);
                    if (!neighbor) continue;
                    if (neighbor.isWater) return depth;
                    next.push(neighbor);
                }
            }
            current = next;
            if (current.length === 0) break;
        }
        return maxDepth + 1; // No water found within range
    }

    /**
     * Log moisture statistics
     */
    logStats(world) {
        const tiles = world.getAllTiles().filter(t => !t.isWater);
        const moisture = tiles.map(t => t.moisture);
        const avg = moisture.reduce((a, b) => a + b, 0) / moisture.length;
        console.log(`Moisture generated: avg=${avg.toFixed(2)}, min=${Math.min(...moisture).toFixed(2)}, max=${Math.max(...moisture).toFixed(2)}`);
    }
}
