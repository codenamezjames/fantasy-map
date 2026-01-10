import { CONFIG } from '../config.js';

/**
 * WaterGenerator - generates rivers using A* pathfinding
 * Rivers path from highland sources to nearest ocean, preferring downhill
 */
export class WaterGenerator {
    constructor(rng) {
        this.rng = rng;
        this.minSourceElevation = CONFIG.water.minSourceElevation;
        this.minSourceMoisture = CONFIG.water.minSourceMoisture;
        this.riverCount = CONFIG.water.riverCount;
        this.sourceSpacing = CONFIG.water.sourceSpacing;
    }

    generate(world) {
        // Initialize
        for (const tile of world.getAllTiles()) {
            tile.riverEdges = [];
            tile.riverFlow = 0;
            tile.isSpring = false;
        }

        // Find river sources and create rivers
        const sources = this.findSources(world);
        console.log(`Found ${sources.length} river sources (target: ${this.riverCount})`);

        let successCount = 0;
        for (const source of sources) {
            if (this.createRiver(source, world)) {
                successCount++;
            }
        }

        // Add springs and aquifer-fed streams
        const springs = this.generateSprings(world);
        console.log(`Created ${successCount} rivers, ${springs} springs`);

        // Lakes in sinks
        this.generateLakes(world);

        this.logStats(world);
    }

    /**
     * Generate springs - water sources at mid-elevations
     * These represent aquifers, underground water emerging
     */
    generateSprings(world) {
        const springCount = Math.floor(this.riverCount * 0.5); // Half as many springs as rivers
        const candidates = [];

        for (const tile of world.getAllTiles()) {
            if (tile.isWater) continue;
            if (tile.riverEdges.length > 0) continue; // Already has river

            // Springs at mid-elevation with high moisture
            if (tile.elevation > 0.2 && tile.elevation < 0.5 && tile.moisture > 0.5) {
                // Prefer tiles at base of slopes (neighbors are higher)
                const higherNeighbors = tile.neighbors.filter(id => {
                    const n = world.getTile(id);
                    return n && n.elevation > tile.elevation + 0.05;
                });

                if (higherNeighbors.length >= 2) {
                    candidates.push({
                        tile,
                        score: tile.moisture + (higherNeighbors.length * 0.2)
                    });
                }
            }
        }

        // Sort by score and pick best springs with spacing
        candidates.sort((a, b) => b.score - a.score);

        let created = 0;
        const usedAreas = new Set();

        for (const { tile } of candidates) {
            if (created >= springCount) break;
            if (usedAreas.has(tile.id)) continue;

            // Create spring stream
            if (this.createSpringStream(tile, world)) {
                tile.isSpring = true;
                created++;

                // Mark nearby area as used
                this.markNearby(tile, world, 8, usedAreas);
            }
        }

        return created;
    }

    /**
     * Create a stream from a spring, flowing to nearest river or ocean
     */
    createSpringStream(spring, world) {
        // Find nearest river tile or ocean
        const target = this.findNearestWaterOrRiver(spring, world);
        if (!target) return false;

        // Path to target
        const path = this.findPath(spring, target, world);
        if (!path || path.length < 2) return false;

        // Mark stream edges (smaller flow than main rivers)
        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i];
            const next = path[i + 1];

            if (!current.riverEdges.includes(next.id)) {
                current.riverEdges.push(next.id);
            }
            if (!next.riverEdges.includes(current.id)) {
                next.riverEdges.push(current.id);
            }

            // Springs have lower base flow
            current.riverFlow = (current.riverFlow || 0) + Math.max(1, (path.length - i) * 0.5);
        }

        return true;
    }

    /**
     * Find nearest river tile or ocean for spring to flow to
     */
    findNearestWaterOrRiver(start, world) {
        const visited = new Set([start.id]);
        const queue = [start];

        while (queue.length > 0) {
            const tile = queue.shift();

            for (const nid of tile.neighbors) {
                if (visited.has(nid)) continue;
                visited.add(nid);

                const neighbor = world.getTile(nid);
                if (!neighbor) continue;

                // Found river or ocean
                if (neighbor.riverEdges.length > 0 || neighbor.isWater) {
                    return neighbor;
                }

                queue.push(neighbor);
            }
        }

        return null;
    }

    /**
     * Find good river source locations - highland peaks with moisture
     */
    findSources(world) {
        const candidates = [];

        for (const tile of world.getAllTiles()) {
            if (tile.isWater) continue;
            if (tile.elevation < this.minSourceElevation) continue;
            if (tile.moisture < this.minSourceMoisture) continue;

            // Prefer local high points (but allow some flexibility)
            const higherNeighbors = tile.neighbors.filter(id => {
                const n = world.getTile(id);
                return n && n.elevation > tile.elevation;
            });

            const maxHigher = CONFIG.water.maxHigherNeighbors ?? 3;
            if (higherNeighbors.length <= maxHigher) {
                candidates.push({
                    tile,
                    score: tile.elevation + tile.moisture * 0.5
                });
            }
        }

        // Sort by score (best sources first)
        candidates.sort((a, b) => b.score - a.score);

        // Select sources with spacing
        const sources = [];
        const used = new Set();

        for (const { tile } of candidates) {
            if (sources.length >= this.riverCount) break;
            if (used.has(tile.id)) continue;

            sources.push(tile);

            // Mark nearby tiles as used
            this.markNearby(tile, world, this.sourceSpacing, used);
        }

        return sources;
    }

    /**
     * Mark tiles within distance as used
     */
    markNearby(start, world, dist, used) {
        const queue = [{ tile: start, d: 0 }];
        used.add(start.id);

        while (queue.length > 0) {
            const { tile, d } = queue.shift();
            if (d >= dist) continue;

            for (const nid of tile.neighbors) {
                if (used.has(nid)) continue;
                used.add(nid);
                const n = world.getTile(nid);
                if (n) queue.push({ tile: n, d: d + 1 });
            }
        }
    }

    /**
     * Create a river from source to nearest ocean using A*
     * @returns {boolean} true if river was created
     */
    createRiver(source, world) {
        // Find nearest ocean tile
        const target = this.findNearestOcean(source, world);
        if (!target) return false;

        // A* pathfind
        const path = this.findPath(source, target, world);
        if (!path || path.length < 2) return false;

        // Mark river edges along path
        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i];
            const next = path[i + 1];

            if (!current.riverEdges.includes(next.id)) {
                current.riverEdges.push(next.id);
            }
            if (!next.riverEdges.includes(current.id)) {
                next.riverEdges.push(current.id);
            }

            // Flow increases toward mouth
            current.riverFlow = (current.riverFlow || 0) + Math.max(1, path.length - i);
        }

        // Add tributaries that join this river
        this.addTributaries(path, world);

        // Add small feeder streams at headwaters
        this.addHeadwaterSplits(path, world);

        // Add delta branches near ocean
        this.addDeltaBranches(path, world);

        return true;
    }

    /**
     * Add small feeder streams splitting at the river source
     */
    addHeadwaterSplits(path, world) {
        if (path.length < 3) return;

        // Work with first few tiles of the river
        const headCount = Math.min(4, Math.floor(path.length * 0.3));

        for (let i = 0; i < headCount; i++) {
            const tile = path[i];
            if (this.rng.random() > 0.5) continue; // 50% chance per tile

            // Find higher neighbors not already in river
            for (const neighborId of tile.neighbors) {
                if (tile.riverEdges.includes(neighborId)) continue;

                const neighbor = world.getTile(neighborId);
                if (!neighbor || neighbor.isWater) continue;

                // Must be higher (feeder flowing down into main river)
                if (neighbor.elevation <= tile.elevation) continue;
                if (neighbor.riverEdges.length > 0) continue;

                // Add short feeder
                tile.riverEdges.push(neighborId);
                neighbor.riverEdges.push(tile.id);
                neighbor.riverFlow = Math.max(neighbor.riverFlow || 0, 1);

                // Maybe extend feeder one more tile
                if (this.rng.random() > 0.5) {
                    for (const nnid of neighbor.neighbors) {
                        if (neighbor.riverEdges.includes(nnid)) continue;
                        const nn = world.getTile(nnid);
                        if (!nn || nn.isWater || nn.riverEdges.length > 0) continue;
                        if (nn.elevation <= neighbor.elevation) continue;

                        neighbor.riverEdges.push(nnid);
                        nn.riverEdges.push(neighborId);
                        nn.riverFlow = 1;
                        break;
                    }
                }
                break; // One feeder per tile
            }
        }
    }

    /**
     * Add tributary branches that join the main river
     */
    addTributaries(mainPath, world) {
        if (mainPath.length < 5) return;

        // Pick 1-3 points along the river to add tributaries
        const tributaryCount = 1 + Math.floor(this.rng.random() * 3);
        const usedSources = new Set(mainPath.map(t => t.id));

        for (let t = 0; t < tributaryCount; t++) {
            // Pick a join point in the upper half of the river
            const joinIndex = Math.floor(this.rng.random() * (mainPath.length * 0.6));
            const joinTile = mainPath[joinIndex];

            // Find a nearby highland tile to be tributary source
            const tributarySource = this.findTributarySource(joinTile, world, usedSources);
            if (!tributarySource) continue;

            usedSources.add(tributarySource.id);

            // Path from tributary source to join point
            const tributaryPath = this.findPath(tributarySource, joinTile, world);
            if (!tributaryPath || tributaryPath.length < 2) continue;

            // Mark tributary edges
            for (let i = 0; i < tributaryPath.length - 1; i++) {
                const current = tributaryPath[i];
                const next = tributaryPath[i + 1];

                if (!current.riverEdges.includes(next.id)) {
                    current.riverEdges.push(next.id);
                }
                if (!next.riverEdges.includes(current.id)) {
                    next.riverEdges.push(current.id);
                }

                current.riverFlow = (current.riverFlow || 0) + Math.max(1, tributaryPath.length - i);
            }
        }
    }

    /**
     * Find a good tributary source near a river tile
     */
    findTributarySource(nearTile, world, usedSources) {
        const visited = new Set([nearTile.id]);
        const queue = [{ tile: nearTile, dist: 0 }];
        const candidates = [];

        // BFS to find nearby high points
        while (queue.length > 0 && candidates.length < 5) {
            const { tile, dist } = queue.shift();
            if (dist > 15) continue; // Search radius

            for (const nid of tile.neighbors) {
                if (visited.has(nid)) continue;
                visited.add(nid);

                const neighbor = world.getTile(nid);
                if (!neighbor || neighbor.isWater) continue;
                if (usedSources.has(nid)) continue;

                // Good tributary source: higher elevation, some moisture
                if (neighbor.elevation > nearTile.elevation + 0.1 &&
                    neighbor.elevation > 0.3 &&
                    neighbor.moisture > 0.2) {
                    candidates.push(neighbor);
                }

                queue.push({ tile: neighbor, dist: dist + 1 });
            }
        }

        // Return random candidate
        if (candidates.length === 0) return null;
        return candidates[Math.floor(this.rng.random() * candidates.length)];
    }

    /**
     * Add delta branches near river mouth - more aggressive splitting
     */
    addDeltaBranches(path, world) {
        if (path.length < 3) return;

        // Find tiles near the end for delta formation
        const deltaDepth = Math.min(6, Math.floor(path.length * 0.3));
        let branchesAdded = 0;

        for (let i = path.length - 1; i >= Math.max(0, path.length - deltaDepth); i--) {
            const tile = path[i];
            if (tile.isWater) continue;
            if (tile.elevation > 0.35) continue;

            // Find neighbors for branching
            const branchCandidates = [];
            for (const neighborId of tile.neighbors) {
                if (tile.riverEdges.includes(neighborId)) continue;

                const neighbor = world.getTile(neighborId);
                if (!neighbor) continue;

                // Must be lower or same level, or water
                if (!neighbor.isWater && neighbor.elevation > tile.elevation + 0.02) continue;

                // Prefer neighbors closer to water
                const nearWater = neighbor.isWater || neighbor.neighbors.some(nid => {
                    const n = world.getTile(nid);
                    return n && n.isWater;
                });

                if (nearWater || neighbor.elevation < tile.elevation) {
                    branchCandidates.push({ neighbor, neighborId, nearWater });
                }
            }

            // Add 1-2 branches from this tile
            for (const { neighbor, neighborId, nearWater } of branchCandidates) {
                if (branchesAdded >= 4) break; // Max total branches

                tile.riverEdges.push(neighborId);
                if (!neighbor.riverEdges.includes(tile.id)) {
                    neighbor.riverEdges.push(tile.id);
                }
                neighbor.riverFlow = Math.max(neighbor.riverFlow || 0, (tile.riverFlow || 1) * 0.4);
                branchesAdded++;

                // Extend branch toward water if not already there
                if (!nearWater && !neighbor.isWater) {
                    for (const nnid of neighbor.neighbors) {
                        if (neighbor.riverEdges.includes(nnid)) continue;
                        const nn = world.getTile(nnid);
                        if (!nn) continue;
                        if (nn.isWater || nn.elevation < neighbor.elevation) {
                            neighbor.riverEdges.push(nnid);
                            if (!nn.riverEdges.includes(neighborId)) {
                                nn.riverEdges.push(neighborId);
                            }
                            nn.riverFlow = Math.max(nn.riverFlow || 0, 1);
                            break;
                        }
                    }
                }

                if (branchCandidates.length > 1 && this.rng.random() > 0.5) break; // Sometimes only 1 branch
            }
        }
    }

    /**
     * BFS to find nearest ocean tile
     */
    findNearestOcean(start, world) {
        const visited = new Set([start.id]);
        const queue = [start];

        while (queue.length > 0) {
            const tile = queue.shift();

            for (const nid of tile.neighbors) {
                if (visited.has(nid)) continue;
                visited.add(nid);

                const neighbor = world.getTile(nid);
                if (!neighbor) continue;

                if (neighbor.isWater && neighbor.biome !== 'lake') {
                    return neighbor;
                }

                queue.push(neighbor);
            }
        }

        return null;
    }

    /**
     * A* pathfinding from source to target, preferring downhill
     */
    findPath(source, target, world) {
        const openSet = new Map(); // id -> {tile, g, f}
        const cameFrom = new Map(); // id -> parent id
        const closedSet = new Set();

        const heuristic = (tile) => {
            const dx = Math.abs(tile.center[0] - target.center[0]);
            const dy = Math.abs(tile.center[1] - target.center[1]);
            return (dx + dy) / 20;
        };

        const moveCost = (from, to) => {
            let cost = 1;

            // Heavily penalize uphill
            if (to.elevation > from.elevation) {
                cost += (to.elevation - from.elevation) * 50;
            } else {
                // Bonus for downhill
                cost -= (from.elevation - to.elevation) * 5;
            }

            // Avoid water (except target)
            if (to.isWater && to.id !== target.id) {
                cost += 100;
            }

            // Strongly prefer joining existing rivers (creates tributaries)
            if (to.riverEdges && to.riverEdges.length > 0) {
                cost -= 15;
            }

            return Math.max(0.1, cost);
        };

        openSet.set(source.id, { tile: source, g: 0, f: heuristic(source) });
        cameFrom.set(source.id, null);

        while (openSet.size > 0) {
            // Get lowest f score
            let best = null;
            let bestF = Infinity;
            for (const [, node] of openSet) {
                if (node.f < bestF) {
                    bestF = node.f;
                    best = node;
                }
            }

            if (!best) break;

            // Reached water?
            if (best.tile.id === target.id || best.tile.isWater) {
                // Reconstruct path
                const path = [];
                let currentId = best.tile.id;
                while (currentId !== null) {
                    const tile = world.getTile(currentId);
                    if (tile) path.unshift(tile);
                    currentId = cameFrom.get(currentId);
                }
                return path;
            }

            openSet.delete(best.tile.id);
            closedSet.add(best.tile.id);

            for (const nid of best.tile.neighbors) {
                if (closedSet.has(nid)) continue;

                const neighbor = world.getTile(nid);
                if (!neighbor) continue;

                const tentativeG = best.g + moveCost(best.tile, neighbor);

                const existing = openSet.get(nid);
                if (!existing || tentativeG < existing.g) {
                    openSet.set(nid, {
                        tile: neighbor,
                        g: tentativeG,
                        f: tentativeG + heuristic(neighbor)
                    });
                    cameFrom.set(nid, best.tile.id);
                }
            }
        }

        return null;
    }

    /**
     * Generate lakes
     */
    generateLakes(world) {
        for (const tile of world.getAllTiles()) {
            if (tile.isWater) continue;
            if (tile.elevation > 0.35) continue;

            // Check if sink
            const hasLowerNeighbor = tile.neighbors.some(id => {
                const n = world.getTile(id);
                return n && n.elevation < tile.elevation;
            });

            if (!hasLowerNeighbor && tile.moisture > 0.5) {
                tile.isWater = true;
                tile.biome = 'lake';
                tile.waterDepth = 0.1;
            }
        }
    }

    logStats(world) {
        const tiles = world.getAllTiles();
        const riverTiles = tiles.filter(t => t.riverEdges.length > 0);
        const lakes = tiles.filter(t => t.biome === 'lake');
        console.log(`Water: ${riverTiles.length} river tiles, ${lakes.length} lakes`);
    }
}
