import { CONFIG } from '../config.js';

/**
 * RegionGenerator - grows political regions from capital POIs
 * Uses weighted multi-source BFS with terrain costs
 */
export class RegionGenerator {
    constructor(rng) {
        this.rng = rng;
        this.costs = CONFIG.regions?.costs || {
            base: 1,
            riverCrossing: 5,
            mountainBase: 8,
            mountainSteep: 15,
            elevationPenalty: 10
        };
    }

    /**
     * Generate regions for the world
     * @param {World} world - World to populate with regions
     */
    generate(world) {
        // Clear existing region data
        for (const tile of world.getAllTiles()) {
            tile.regionId = null;
        }
        world.regions.clear();

        // Find capitals
        const capitals = world.getAllPOIs().filter(poi => poi.isCapital);
        if (capitals.length === 0) {
            console.warn('No capitals found - skipping region generation');
            return;
        }

        // Initialize queue and region metadata
        const queue = this.initializeQueue(world, capitals);

        // Weighted BFS expansion
        this.expandRegions(world, queue);

        // Claim any orphaned land tiles
        this.claimUnassignedTiles(world);

        // Update POI regionIds to match their tile
        this.updatePOIRegions(world);

        // Calculate statistics
        this.calculateStats(world);

        this.logStats(world);
    }

    /**
     * Initialize the priority queue with capital tiles as seeds
     */
    initializeQueue(world, capitals) {
        const queue = [];
        const colors = CONFIG.regions?.colors || this.generateColors(capitals.length);

        capitals.forEach((capital, index) => {
            const tile = world.getTile(capital.tileId);
            if (!tile) {
                console.warn(`Capital ${capital.name} has invalid tileId: ${capital.tileId}`);
                return;
            }

            const regionId = index;
            tile.regionId = regionId;

            // Create region metadata
            world.addRegion({
                id: regionId,
                capitalId: capital.id,
                name: capital.name,
                color: colors[index % colors.length],
                tileCount: 1
            });

            // Seed queue with capital's neighbors
            for (const neighborId of tile.neighbors) {
                const neighbor = world.getTile(neighborId);
                if (!neighbor || neighbor.isWater) continue;

                queue.push({
                    cost: this.costs.base,
                    tileId: neighborId,
                    regionId: regionId
                });
            }
        });

        // Sort by cost (ascending), then regionId for determinism
        queue.sort((a, b) => a.cost - b.cost || a.regionId - b.regionId);
        return queue;
    }

    /**
     * Expand regions using weighted BFS
     */
    expandRegions(world, queue) {
        while (queue.length > 0) {
            // Pop lowest cost entry
            const { cost, tileId, regionId } = queue.shift();

            const tile = world.getTile(tileId);
            if (!tile) continue;
            if (tile.regionId !== null) continue; // Already claimed
            if (tile.isWater) continue;

            // Claim tile for this region
            tile.regionId = regionId;

            // Add neighbors to queue
            for (const neighborId of tile.neighbors) {
                const neighbor = world.getTile(neighborId);
                if (!neighbor || neighbor.regionId !== null || neighbor.isWater) continue;

                const edgeCost = this.calculateEdgeCost(tile, neighbor);
                queue.push({
                    cost: cost + edgeCost,
                    tileId: neighborId,
                    regionId: regionId
                });
            }

            // Re-sort queue (simple approach - could use proper heap for perf)
            queue.sort((a, b) => a.cost - b.cost || a.regionId - b.regionId);
        }
    }

    /**
     * Calculate the cost to traverse from one tile to another
     */
    calculateEdgeCost(fromTile, toTile) {
        let cost = this.costs.base;

        // River crossing penalty
        if (fromTile.riverEdges?.includes(toTile.id)) {
            cost += this.costs.riverCrossing;
        }

        // Mountain penalties based on elevation
        const elev = toTile.elevation;
        const seaLevel = CONFIG.elevation?.seaLevel || 0.53;

        if (elev > 0.70) {
            cost += this.costs.mountainBase;
            if (elev > 0.85) {
                cost += this.costs.mountainSteep;
            }
        } else if (elev > seaLevel) {
            // Gradual hill penalty
            cost += this.costs.elevationPenalty * (elev - seaLevel);
        }

        return cost;
    }

    /**
     * Claim any land tiles that weren't reached by BFS
     * (islands or disconnected areas)
     */
    claimUnassignedTiles(world) {
        // Multiple passes to handle chains of unassigned tiles
        let changed = true;
        while (changed) {
            changed = false;
            for (const tile of world.getAllTiles()) {
                if (tile.isWater || tile.regionId !== null) continue;

                // Find first assigned neighbor
                const assignedNeighbor = tile.neighbors
                    .map(id => world.getTile(id))
                    .find(n => n && n.regionId !== null);

                if (assignedNeighbor) {
                    tile.regionId = assignedNeighbor.regionId;
                    changed = true;
                }
            }
        }
    }

    /**
     * Update all POI regionIds to match their tile's region
     */
    updatePOIRegions(world) {
        for (const poi of world.getAllPOIs()) {
            const tile = world.getTile(poi.tileId);
            if (tile) {
                poi.regionId = tile.regionId;
            }
        }
    }

    /**
     * Calculate region tile counts
     */
    calculateStats(world) {
        // Reset counts
        for (const region of world.getAllRegions()) {
            region.tileCount = 0;
        }

        // Count tiles per region
        for (const tile of world.getAllTiles()) {
            if (tile.regionId !== null) {
                const region = world.getRegion(tile.regionId);
                if (region) {
                    region.tileCount++;
                }
            }
        }
    }

    /**
     * Generate evenly distributed hue colors
     */
    generateColors(count) {
        return Array.from({ length: count }, (_, i) => ({
            h: (i * (360 / count)) % 360,
            s: 35,
            l: 45
        }));
    }

    /**
     * Log region statistics
     */
    logStats(world) {
        const regions = world.getAllRegions();
        console.log(`Regions: ${regions.length} kingdoms created`);
        for (const region of regions) {
            console.log(`  ${region.name}: ${region.tileCount} tiles`);
        }
    }
}
