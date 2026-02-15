import { SeededRandom } from '../utils/random.js';
import { WeatherState } from '../data/WeatherState.js';
import { CONFIG } from '../config.js';

/**
 * WeatherGenerator — day-by-day weather simulation
 * Produces deterministic weather given the same seed and day number.
 */
export class WeatherGenerator {
    /**
     * @param {SeededRandom} rng - Seeded random for weather
     */
    constructor(rng) {
        this.rng = rng;
        this.baseSeed = rng.seed;

        // Static wind field (set once per world)
        this.staticWindX = null;
        this.staticWindY = null;
        this.staticWindSpeed = null;

        // Tiles sorted in wind-direction order for rain shadow pass
        this.windSortedTileIds = null;
    }

    /**
     * One-time initialization: compute static prevailing wind per tile.
     * Must be called after world generation.
     * @param {World} world
     */
    initializeWindField(world) {
        const cfg = CONFIG.weather?.wind || {};
        const tileCount = world.tiles.size;

        this.staticWindX = new Float32Array(tileCount);
        this.staticWindY = new Float32Array(tileCount);
        this.staticWindSpeed = new Float32Array(tileCount);

        const worldHeight = world.height;
        const tradeWindBelt = cfg.tradeWindBelt || 0.3;
        const westerliesBelt = cfg.westerliesBelt || 0.6;
        const baseSpeed = cfg.baseSpeed || 0.5;
        const mountainDeflection = cfg.mountainDeflection || 0.6;

        for (const tile of world.tiles.values()) {
            const id = tile.id;
            if (id >= tileCount) continue;

            // Latitude as fraction 0 (top/north) to 1 (bottom/south)
            const lat = tile.center[1] / worldHeight;

            // Wind direction based on latitude bands
            let windX, windY;
            if (lat < tradeWindBelt) {
                // Trade winds: blow from east (NE trades)
                windX = -0.8;
                windY = 0.3;
            } else if (lat < westerliesBelt) {
                // Westerlies: blow from west
                windX = 0.7;
                windY = -0.2;
            } else {
                // Polar easterlies: blow from east
                windX = -0.6;
                windY = -0.3;
            }

            // Normalize
            const len = Math.sqrt(windX * windX + windY * windY);
            windX /= len;
            windY /= len;

            // Mountain deflection: blend wind away from upslope
            if (!tile.isWater && tile.elevation > CONFIG.elevation.seaLevel + 0.1) {
                const elevFactor = Math.min(1, (tile.elevation - CONFIG.elevation.seaLevel) * 2);
                // Use slope if available to deflect wind
                if (tile.slope) {
                    const slopeX = tile.slope.x;
                    const slopeY = tile.slope.y;
                    const slopeMag = tile.slope.magnitude;
                    if (slopeMag > 0.01) {
                        // Deflect perpendicular to slope (go around the mountain)
                        const deflectX = -slopeY;
                        const deflectY = slopeX;
                        const deflectAmount = mountainDeflection * elevFactor * Math.min(1, slopeMag * 5);
                        windX = windX * (1 - deflectAmount) + deflectX * deflectAmount;
                        windY = windY * (1 - deflectAmount) + deflectY * deflectAmount;
                        // Re-normalize
                        const newLen = Math.sqrt(windX * windX + windY * windY);
                        if (newLen > 0.001) {
                            windX /= newLen;
                            windY /= newLen;
                        }
                    }
                }
            }

            this.staticWindX[id] = windX;
            this.staticWindY[id] = windY;
            this.staticWindSpeed[id] = baseSpeed;
        }

        // Pre-sort tiles in wind-direction order for rain shadow pass
        // Sort by dot product of tile position with average wind direction
        // Use the dominant westerlies direction (left to right) as primary sort
        const tileIds = [];
        for (const tile of world.tiles.values()) {
            tileIds.push(tile.id);
        }

        tileIds.sort((a, b) => {
            const tileA = world.getTile(a);
            const tileB = world.getTile(b);
            if (!tileA || !tileB) return 0;
            // Sort by position projected onto average wind direction
            // Approximate: sort west to east (x position) since westerlies dominate
            const projA = tileA.center[0] * 0.8 + tileA.center[1] * 0.2;
            const projB = tileB.center[0] * 0.8 + tileB.center[1] * 0.2;
            return projA - projB;
        });

        this.windSortedTileIds = tileIds;
    }

    /**
     * Compute weather for a given day.
     * @param {World} world
     * @param {number} day
     * @param {WeatherState|null} prevState - Previous day state (for storm continuity)
     * @returns {WeatherState}
     */
    computeDay(world, day, prevState) {
        const cfg = CONFIG.weather || {};
        const tileCount = world.tiles.size;
        const state = new WeatherState(day, tileCount);

        // Day-specific RNG for determinism
        const dayRng = new SeededRandom(this.baseSeed + '-day-' + day);

        // 1. Season
        const daysPerYear = cfg.daysPerYear || 365;
        const seasonProgress = (day % daysPerYear) / daysPerYear;
        const tempAmplitude = cfg.seasons?.tempAmplitude || 0.15;
        const precipAmplitude = cfg.seasons?.precipAmplitude || 0.1;
        state.seasonalTempOffset = Math.sin(seasonProgress * Math.PI * 2 - Math.PI / 2) * tempAmplitude;
        const seasonalPrecipMod = 1 + Math.sin(seasonProgress * Math.PI * 2) * precipAmplitude;

        // 2. Wind: copy static field + day-specific noise perturbation
        const noiseInfluence = cfg.wind?.noiseInfluence || 0.2;
        for (let i = 0; i < tileCount; i++) {
            if (!this.staticWindX) break;
            const noiseX = (dayRng.random() - 0.5) * 2 * noiseInfluence;
            const noiseY = (dayRng.random() - 0.5) * 2 * noiseInfluence;
            let wx = this.staticWindX[i] + noiseX;
            let wy = this.staticWindY[i] + noiseY;
            const len = Math.sqrt(wx * wx + wy * wy);
            if (len > 0.001) {
                wx /= len;
                wy /= len;
            }
            state.windDirX[i] = wx;
            state.windDirY[i] = wy;
            state.windSpeed[i] = this.staticWindSpeed[i] * (0.8 + dayRng.random() * 0.4);
        }

        // 3. Precipitation & rain shadow
        const rainCfg = cfg.rainShadow || {};
        const elevThreshold = rainCfg.elevationThreshold || 0.15;
        const moistureDrop = rainCfg.moistureDrop || 0.6;

        // Moisture carry buffer: start with tile's inherent moisture
        const moistureCarry = new Float32Array(tileCount);
        for (const tile of world.tiles.values()) {
            if (tile.id >= tileCount) continue;
            if (tile.isWater) {
                moistureCarry[tile.id] = 0.9; // Water tiles are moisture sources
            } else {
                moistureCarry[tile.id] = tile.moisture || 0;
            }
        }

        // Process tiles in wind-direction order
        if (this.windSortedTileIds) {
            for (const tileId of this.windSortedTileIds) {
                const tile = world.getTile(tileId);
                if (!tile || tileId >= tileCount) continue;

                // Find upwind neighbor to inherit moisture carry
                let maxCarry = moistureCarry[tileId];
                for (const neighborId of tile.neighbors) {
                    if (neighborId >= tileCount) continue;
                    const neighbor = world.getTile(neighborId);
                    if (!neighbor) continue;

                    // Check if neighbor is upwind (wind from neighbor toward this tile)
                    const dx = tile.center[0] - neighbor.center[0];
                    const dy = tile.center[1] - neighbor.center[1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 0.001) continue;

                    // Dot product: positive means neighbor is upwind
                    const dot = (dx / dist) * state.windDirX[neighborId] + (dy / dist) * state.windDirY[neighborId];
                    if (dot > 0.3) {
                        maxCarry = Math.max(maxCarry, moistureCarry[neighborId] * 0.85);
                    }
                }

                moistureCarry[tileId] = maxCarry;

                // Rain shadow: elevation rise dumps precipitation
                if (!tile.isWater) {
                    let elevRise = 0;
                    for (const neighborId of tile.neighbors) {
                        const neighbor = world.getTile(neighborId);
                        if (!neighbor) continue;
                        const rise = tile.elevation - neighbor.elevation;
                        if (rise > elevRise) elevRise = rise;
                    }

                    if (elevRise > elevThreshold) {
                        // Windward side: high precipitation
                        state.precipitation[tileId] = Math.min(1, moistureCarry[tileId] * (0.3 + elevRise * 1.5)) * seasonalPrecipMod;
                        // Reduce moisture carry for leeward side
                        moistureCarry[tileId] *= (1 - moistureDrop * Math.min(1, elevRise / 0.3));
                    } else {
                        // Normal precipitation based on available moisture
                        state.precipitation[tileId] = moistureCarry[tileId] * 0.08 * seasonalPrecipMod;
                    }
                } else {
                    state.precipitation[tileId] = 0;
                }
            }
        }

        // 4. Cloud cover
        for (const tile of world.tiles.values()) {
            const id = tile.id;
            if (id >= tileCount) continue;
            if (tile.isWater) {
                state.cloudCover[id] = dayRng.random() * 0.06;
                continue;
            }
            const noise = dayRng.random();
            state.cloudCover[id] = Math.min(0.8, Math.max(0,
                state.precipitation[id] * 0.6 +
                (tile.moisture || 0) * 0.1 +
                noise * 0.08
            ));
        }

        // 5. Storms
        const stormCfg = cfg.storms || {};
        const existingStorms = prevState ? [...prevState.storms] : [];

        // Move and decay existing storms
        for (const storm of existingStorms) {
            storm.lifetime -= 1;

            // Extra decay over mountains
            const stormTile = world.getTile(storm.centerTileId);
            if (stormTile && !stormTile.isWater && stormTile.elevation > 0.7) {
                storm.lifetime -= (stormCfg.mountainDissipation || 0.3);
            }

            if (storm.lifetime <= 0) continue;

            // Move storm along wind vector
            if (stormTile) {
                const wx = state.windDirX[storm.centerTileId] || 0;
                const wy = state.windDirY[storm.centerTileId] || 0;
                const moveSpeed = stormCfg.moveSpeed || 1.5;
                const targetX = storm.position[0] + wx * moveSpeed * 20;
                const targetY = storm.position[1] + wy * moveSpeed * 20;

                // Find closest neighbor tile to target position
                let bestId = storm.centerTileId;
                let bestDist = Infinity;
                for (const neighborId of stormTile.neighbors) {
                    const neighbor = world.getTile(neighborId);
                    if (!neighbor) continue;
                    const dx = neighbor.center[0] - targetX;
                    const dy = neighbor.center[1] - targetY;
                    const dist = dx * dx + dy * dy;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestId = neighborId;
                    }
                }

                const newTile = world.getTile(bestId);
                if (newTile) {
                    storm.centerTileId = bestId;
                    storm.position = [...newTile.center];
                }
            }

            // Advance rotation (counterclockwise, faster for thunderstorms)
            const rotSpeed = storm.type === 'thunderstorm' ? 0.4
                : storm.type === 'blizzard' ? 0.15
                : 0.25;
            storm.rotation = (storm.rotation || 0) + rotSpeed;

            state.storms.push(storm);
        }

        // Spawn new storms
        const maxActive = stormCfg.maxActive || 5;
        if (state.storms.length < maxActive) {
            const spawnChance = stormCfg.spawnChance || 0.0003;
            const minMoisture = stormCfg.minMoisture || 0.4;
            const minTemp = stormCfg.minTemperature || 0.3;

            for (const tile of world.tiles.values()) {
                if (state.storms.length >= maxActive) break;
                if (tile.isWater) continue;
                if ((tile.moisture || 0) < minMoisture) continue;
                if ((tile.temperature || 0) < minTemp) continue;

                if (dayRng.random() < spawnChance) {
                    // Determine storm type
                    let type = 'rain';
                    if ((tile.temperature || 0) < 0.3) {
                        type = 'blizzard';
                    } else if ((tile.temperature || 0) > 0.6 && (tile.moisture || 0) > 0.5) {
                        type = 'thunderstorm';
                    }

                    const lifetime = dayRng.int(
                        stormCfg.minLifetime || 3,
                        stormCfg.maxLifetime || 8
                    );

                    // Northern hemisphere = counterclockwise, southern = clockwise
                    const lat = tile.center[1] / world.height;
                    const spinDir = lat < 0.5 ? -1 : 1;

                    state.storms.push({
                        id: day * 1000 + tile.id,
                        centerTileId: tile.id,
                        position: [...tile.center],
                        radius: (stormCfg.baseRadius || 80) * (0.7 + dayRng.random() * 0.6),
                        intensity: 0.5 + dayRng.random() * 0.5,
                        lifetime,
                        maxLifetime: lifetime,
                        type,
                        rotation: dayRng.random() * Math.PI * 2,
                        spinDir,
                        armCount: type === 'thunderstorm' ? dayRng.int(3, 5) : dayRng.int(2, 3)
                    });
                }
            }
        }

        // Storm effects: boost precipitation and cloud cover within storm radius
        for (const storm of state.storms) {
            const sx = storm.position[0];
            const sy = storm.position[1];
            const r2 = storm.radius * storm.radius;

            // Affect tiles near the storm
            // Use the storm's center tile and its neighbors as a starting point for BFS
            const stormTile = world.getTile(storm.centerTileId);
            if (!stormTile) continue;

            const visited = new Set();
            let frontier = [storm.centerTileId];
            visited.add(storm.centerTileId);

            while (frontier.length > 0) {
                const nextFrontier = [];
                for (const tileId of frontier) {
                    const tile = world.getTile(tileId);
                    if (!tile || tileId >= tileCount) continue;

                    const dx = tile.center[0] - sx;
                    const dy = tile.center[1] - sy;
                    const dist2 = dx * dx + dy * dy;
                    if (dist2 > r2) continue;

                    // Intensity falls off with distance
                    const falloff = 1 - Math.sqrt(dist2) / storm.radius;
                    const boost = falloff * storm.intensity;

                    // Skip water tiles for storm precipitation
                    if (!tile.isWater) {
                        state.precipitation[tileId] = Math.min(1, state.precipitation[tileId] + boost * 0.6);
                    }
                    state.cloudCover[tileId] = Math.min(0.9, state.cloudCover[tileId] + boost * 0.7);

                    for (const neighborId of tile.neighbors) {
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            nextFrontier.push(neighborId);
                        }
                    }
                }
                frontier = nextFrontier;
            }
        }

        // 6. Effective temperature
        for (const tile of world.tiles.values()) {
            const id = tile.id;
            if (id >= tileCount) continue;
            state.effectiveTemp[id] = (tile.temperature || 0.5) +
                state.seasonalTempOffset -
                state.cloudCover[id] * 0.05;
        }

        return state;
    }
}
