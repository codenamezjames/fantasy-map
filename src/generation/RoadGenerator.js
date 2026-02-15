import { CONFIG } from '../config.js';

/**
 * RoadGenerator - creates road networks between POIs using A* pathfinding
 * Roads respect terrain costs and have visual hierarchy based on POI importance
 */
export class RoadGenerator {
    constructor(rng) {
        this.rng = rng;
        this.costs = CONFIG.roads?.costs || {
            base: 1,
            forest: 2,
            hills: 3,
            mountains: 8,
            peaks: 20,
            riverCrossing: 3,
            existingRoadBonus: -0.5
        };
        this.connections = CONFIG.roads?.connections || {
            capitalToCapitals: true,
            capitalToCities: 2,
            cityToCities: 2,
            cityToTowns: 2,
            townToTowns: 2,
            townToVillages: 3,
            villageToTown: 1,
            specialToSettlement: 1
        };
    }

    /**
     * Generate roads for the world
     * @param {World} world - World to populate with roads
     */
    generate(world) {
        // Clear existing road data
        for (const tile of world.getAllTiles()) {
            tile.roadEdges = [];
        }
        world.roads.clear();

        const pois = world.getAllPOIs();
        if (pois.length === 0) {
            console.warn('No POIs found - skipping road generation');
            return;
        }

        // Build connection pairs by POI importance
        const connections = this.buildConnectionPairs(world);

        // For each connection, run A* pathfinding
        let roadId = 0;
        for (const { from, to, type } of connections) {
            const path = this.findPath(world, from, to);
            if (path.length > 0) {
                // Mark roadEdges on tiles
                this.markRoadEdges(path);

                // Store road metadata
                world.addRoad({
                    id: roadId++,
                    type,
                    fromPoiId: from.id,
                    toPoiId: to.id,
                    tileIds: path.map(t => t.id)
                });
            }
        }

        this.logStats(world);
    }

    /**
     * Build list of POI pairs to connect with roads
     */
    buildConnectionPairs(world) {
        const pois = world.getAllPOIs();
        const capitals = pois.filter(p => p.isCapital);
        const cities = pois.filter(p => p.type === 'city' && !p.isCapital);
        const towns = pois.filter(p => p.type === 'town');
        const villages = pois.filter(p => p.type === 'village');
        const special = pois.filter(p => ['dungeon', 'temple', 'ruins'].includes(p.type));

        const connections = [];
        const added = new Set();  // Avoid duplicate connections

        const addConnection = (from, to, type) => {
            if (!from || !to || from.id === to.id) return;
            const key = from.id < to.id ? `${from.id}-${to.id}` : `${to.id}-${from.id}`;
            if (!added.has(key)) {
                added.add(key);
                connections.push({ from, to, type });
            }
        };

        // Capital connections - major roads
        for (const cap of capitals) {
            // Connect to all other capitals
            if (this.connections.capitalToCapitals) {
                for (const other of capitals) {
                    if (other.id !== cap.id) {
                        addConnection(cap, other, 'major');
                    }
                }
            }
            // Connect to nearest cities
            const nearestCities = this.findNearest(cap, cities, this.connections.capitalToCities);
            for (const city of nearestCities) {
                addConnection(cap, city, 'major');
            }
        }

        // City connections - minor roads
        for (const city of cities) {
            // Connect to nearest other cities
            const nearestCities = this.findNearest(city, cities.filter(c => c.id !== city.id), this.connections.cityToCities);
            for (const other of nearestCities) {
                addConnection(city, other, 'minor');
            }
            // Connect to nearest towns
            const nearestTowns = this.findNearest(city, towns, this.connections.cityToTowns);
            for (const town of nearestTowns) {
                addConnection(city, town, 'minor');
            }
        }

        // Town connections - paths
        for (const town of towns) {
            // Connect to nearest other towns
            const nearestTowns = this.findNearest(town, towns.filter(t => t.id !== town.id), this.connections.townToTowns);
            for (const other of nearestTowns) {
                addConnection(town, other, 'path');
            }
            // Connect to nearest villages
            const nearestVillages = this.findNearest(town, villages, this.connections.townToVillages);
            for (const village of nearestVillages) {
                addConnection(town, village, 'path');
            }
        }

        // Village connections - connect to nearest town
        for (const village of villages) {
            const nearestTown = this.findNearest(village, towns, this.connections.villageToTown);
            for (const town of nearestTown) {
                addConnection(village, town, 'path');
            }
        }

        // Special POIs (dungeon, temple, ruins) connect to nearest settlement
        const settlements = [...capitals, ...cities, ...towns, ...villages];
        for (const poi of special) {
            const nearest = this.findNearest(poi, settlements, this.connections.specialToSettlement);
            for (const settlement of nearest) {
                addConnection(poi, settlement, 'path');
            }
        }

        return connections;
    }

    /**
     * Find nearest POIs by Euclidean distance
     */
    findNearest(poi, candidates, count) {
        if (candidates.length === 0) return [];
        return candidates
            .map(c => ({ poi: c, dist: this.distance(poi.position, c.position) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, count)
            .map(x => x.poi);
    }

    /**
     * Calculate Euclidean distance between two points
     */
    distance(a, b) {
        return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
    }

    /**
     * A* pathfinding from one POI to another
     */
    findPath(world, fromPoi, toPoi) {
        const startTile = world.getTile(fromPoi.tileId);
        const endTile = world.getTile(toPoi.tileId);
        if (!startTile || !endTile) return [];

        // A* implementation
        const openSet = [{ tile: startTile, g: 0, f: this.heuristic(startTile, endTile) }];
        const cameFrom = new Map();
        const gScore = new Map([[startTile.id, 0]]);

        while (openSet.length > 0) {
            // Get node with lowest f score
            openSet.sort((a, b) => a.f - b.f);
            const { tile: current } = openSet.shift();

            // Reached destination
            if (current.id === endTile.id) {
                return this.reconstructPath(cameFrom, current);
            }

            // Explore neighbors
            for (const neighborId of current.neighbors) {
                const neighbor = world.getTile(neighborId);
                if (!neighbor || neighbor.isWater) continue;

                const tentativeG = gScore.get(current.id) + this.moveCost(current, neighbor);

                if (!gScore.has(neighbor.id) || tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeG);
                    const f = tentativeG + this.heuristic(neighbor, endTile);

                    // Add to open set if not already there
                    if (!openSet.find(x => x.tile.id === neighbor.id)) {
                        openSet.push({ tile: neighbor, g: tentativeG, f });
                    }
                }
            }
        }

        return [];  // No path found
    }

    /**
     * Heuristic for A* (Euclidean distance with slight underestimate)
     */
    heuristic(tile, target) {
        return this.distance(tile.center, target.center) * 0.9;
    }

    /**
     * Calculate movement cost between adjacent tiles
     */
    moveCost(from, to) {
        let cost = this.costs.base;

        // Biome-based costs
        const biome = to.biome || '';
        if (biome.includes('forest') || biome.includes('jungle') || biome.includes('rainforest')) {
            cost = this.costs.forest;
        }

        // Elevation costs (override biome cost if higher)
        const elev = to.elevation;
        if (elev > 0.85) {
            cost = Math.max(cost, this.costs.peaks);
        } else if (elev > 0.70) {
            cost = Math.max(cost, this.costs.mountains);
        } else if (elev > 0.55) {
            cost = Math.max(cost, this.costs.hills);
        }

        // River crossing penalty
        if (from.riverEdges?.includes(to.id)) {
            cost += this.costs.riverCrossing;
        }

        // Coastal avoidance — discourage routes that hug water boundaries
        if (to.isCoastal) {
            cost += 2;
        }

        // Bonus for existing roads (encourages road merging)
        if (to.roadEdges?.length > 0) {
            cost += this.costs.existingRoadBonus;
        }

        return Math.max(0.1, cost);
    }

    /**
     * Reconstruct path from A* result
     */
    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current.id)) {
            current = cameFrom.get(current.id);
            path.unshift(current);
        }
        return path;
    }

    /**
     * Mark road edges on tiles along the path
     */
    markRoadEdges(path) {
        for (let i = 0; i < path.length - 1; i++) {
            const tile = path[i];
            const next = path[i + 1];

            if (!tile.roadEdges.includes(next.id)) {
                tile.roadEdges.push(next.id);
            }
            if (!next.roadEdges.includes(tile.id)) {
                next.roadEdges.push(tile.id);
            }
        }
    }

    /**
     * Log road generation statistics
     */
    logStats(world) {
        const roads = world.getAllRoads();
        const major = roads.filter(r => r.type === 'major').length;
        const minor = roads.filter(r => r.type === 'minor').length;
        const paths = roads.filter(r => r.type === 'path').length;
        console.log(`Roads: ${major} major, ${minor} minor, ${paths} paths`);
    }
}
