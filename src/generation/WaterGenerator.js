/**
 * WaterGenerator - generates rivers and lakes
 * Rivers flow downhill from high elevation sources to ocean
 * Lakes form in terrain depressions (sinks)
 */
export class WaterGenerator {
    constructor() {
        this.minSourceElevation = 0.5;
        this.minSourceMoisture = 0.4;
    }

    /**
     * Generate water features for the world
     */
    generate(world) {
        // Find river sources and trace downhill
        const sources = this.findRiverSources(world);
        for (const source of sources) {
            this.traceRiver(source, world);
        }

        // Find and fill lakes
        this.generateLakes(world);

        this.logStats(world);
    }

    /**
     * Find tiles that can be river sources
     * High elevation, good moisture, local high points
     */
    findRiverSources(world) {
        const sources = [];
        for (const tile of world.getAllTiles()) {
            if (tile.isWater) continue;
            if (tile.elevation < this.minSourceElevation) continue;
            if (tile.moisture < this.minSourceMoisture) continue;

            // Check if local high point (higher than most neighbors)
            const higherNeighbors = tile.neighbors.filter(id => {
                const n = world.getTile(id);
                return n && n.elevation > tile.elevation;
            });

            // Source if at most 1 neighbor is higher (near peak)
            if (higherNeighbors.length <= 1) {
                sources.push(tile);
            }
        }
        return sources;
    }

    /**
     * Trace a river from source downhill to ocean or sink
     */
    traceRiver(source, world) {
        let current = source;
        const visited = new Set();
        let flowAccumulation = 1;

        while (current && !current.isWater && !visited.has(current.id)) {
            visited.add(current.id);

            // Find lowest neighbor
            let lowestNeighbor = null;
            let lowestElevation = current.elevation;

            for (const neighborId of current.neighbors) {
                const neighbor = world.getTile(neighborId);
                if (!neighbor) continue;
                if (neighbor.elevation < lowestElevation) {
                    lowestElevation = neighbor.elevation;
                    lowestNeighbor = neighbor;
                }
            }

            // No downhill path - this is a sink
            if (!lowestNeighbor) break;

            // Stop at water - don't draw river into ocean
            if (lowestNeighbor.isWater) break;

            // Mark river edge on both tiles
            if (!current.riverEdges.includes(lowestNeighbor.id)) {
                current.riverEdges.push(lowestNeighbor.id);
            }
            if (!lowestNeighbor.riverEdges.includes(current.id)) {
                lowestNeighbor.riverEdges.push(current.id);
            }

            // Track flow for river width
            current.riverFlow = (current.riverFlow || 0) + flowAccumulation;
            flowAccumulation++;

            current = lowestNeighbor;
        }
    }

    /**
     * Generate lakes in terrain depressions
     */
    generateLakes(world) {
        for (const tile of world.getAllTiles()) {
            if (tile.isWater) continue;
            if (tile.elevation > 0.4) continue; // Only low areas

            // Check if this tile is lower than all neighbors (sink)
            const isLowestPoint = tile.neighbors.every(id => {
                const n = world.getTile(id);
                return !n || n.elevation >= tile.elevation || n.isWater;
            });

            // Create lake if sink with high moisture
            if (isLowestPoint && tile.moisture > 0.6) {
                tile.isWater = true;
                tile.biome = 'lake';
                tile.waterDepth = 0.1;
            }
        }
    }

    /**
     * Log water feature statistics
     */
    logStats(world) {
        const tiles = world.getAllTiles();
        const riverTiles = tiles.filter(t => t.riverEdges.length > 0);
        const lakes = tiles.filter(t => t.biome === 'lake');
        console.log(`Water features: ${riverTiles.length} river tiles, ${lakes.length} lake tiles`);
    }
}
