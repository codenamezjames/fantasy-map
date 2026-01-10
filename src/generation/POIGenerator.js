import { POI } from '../data/POI.js';
import { NameGenerator } from './NameGenerator.js';
import { CONFIG } from '../config.js';

/**
 * POIGenerator - places Points of Interest on the map
 * Handles settlement placement with biome preferences and spacing rules
 */
export class POIGenerator {
    constructor(rng) {
        this.rng = rng;
        this.nameGenerator = new NameGenerator(rng);
    }

    /**
     * Generate all POIs for the world
     * @param {World} world - World to populate with POIs
     */
    generate(world) {
        const config = CONFIG.pois;

        // Get all habitable (non-water) level 0 tiles
        const habitableTiles = world.getTilesAtLevel(0).filter(t => !this.isWaterTile(t));
        const coastalTiles = habitableTiles.filter(t => t.isCoastal);

        // Place POIs in order of importance/scarcity
        this.placeCapitals(world, habitableTiles, config);
        this.placeCities(world, habitableTiles, config);
        this.placeTowns(world, habitableTiles, config);
        this.placeVillages(world, habitableTiles, config);
        this.placePorts(world, coastalTiles, config);
        this.placeDungeons(world, habitableTiles, config);
        this.placeTemples(world, habitableTiles, config);
        this.placeRuins(world, habitableTiles, config);
    }

    /**
     * Place capital cities - high value locations, evenly distributed
     */
    placeCapitals(world, tiles, config) {
        const count = config.counts.capitals;
        const minDist = config.minDistances.capital;

        // Score tiles for capital suitability
        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'capital', config)
        })).filter(s => s.score > 0);

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        this.placeFromScored(world, scored, count, minDist, 'capital', 'large', config);
    }

    /**
     * Place major cities
     */
    placeCities(world, tiles, config) {
        const count = config.counts.cities;
        const minDist = config.minDistances.city;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'city', config)
        })).filter(s => s.score > 0);

        scored.sort((a, b) => b.score - a.score);
        this.placeFromScored(world, scored, count, minDist, 'city', 'large', config);
    }

    /**
     * Place towns
     */
    placeTowns(world, tiles, config) {
        const count = config.counts.towns;
        const minDist = config.minDistances.town;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'town', config)
        })).filter(s => s.score > 0);

        scored.sort((a, b) => b.score - a.score);
        this.placeFromScored(world, scored, count, minDist, 'town', 'medium', config);
    }

    /**
     * Place villages - dense, smaller settlements
     */
    placeVillages(world, tiles, config) {
        const count = config.counts.villages;
        const minDist = config.minDistances.village;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'village', config)
        })).filter(s => s.score > 0);

        // Add some randomness for villages
        scored.forEach(s => s.score *= 0.5 + this.rng.random());
        scored.sort((a, b) => b.score - a.score);

        this.placeFromScored(world, scored, count, minDist, 'village', 'small', config);
    }

    /**
     * Place ports - coastal settlements
     */
    placePorts(world, coastalTiles, config) {
        const count = config.counts.ports;
        const minDist = config.minDistances.port;

        const scored = coastalTiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'port', config)
        })).filter(s => s.score > 0);

        scored.sort((a, b) => b.score - a.score);
        this.placeFromScored(world, scored, count, minDist, 'port', 'medium', config);
    }

    /**
     * Place dungeons - remote, dangerous locations
     */
    placeDungeons(world, tiles, config) {
        const count = config.counts.dungeons;
        const minDist = config.minDistances.dungeon;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'dungeon', config)
        })).filter(s => s.score > 0);

        // Prefer tiles far from settlements
        scored.forEach(s => {
            const nearestSettlement = this.getDistanceToNearestPOI(world, s.tile.center, ['village', 'town', 'city', 'capital']);
            if (nearestSettlement > 0) {
                s.score *= Math.min(2, nearestSettlement / 200);
            }
        });

        scored.sort((a, b) => b.score - a.score);
        this.placeFromScored(world, scored, count, minDist, 'dungeon', 'medium', config);
    }

    /**
     * Place temples - sacred locations
     */
    placeTemples(world, tiles, config) {
        const count = config.counts.temples;
        const minDist = config.minDistances.temple;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'temple', config)
        })).filter(s => s.score > 0);

        scored.sort((a, b) => b.score - a.score);
        this.placeFromScored(world, scored, count, minDist, 'temple', 'medium', config);
    }

    /**
     * Place ruins - ancient, abandoned locations
     */
    placeRuins(world, tiles, config) {
        const count = config.counts.ruins;
        const minDist = config.minDistances.ruins;

        const scored = tiles.map(t => ({
            tile: t,
            score: this.getTileScore(t, 'ruins', config)
        })).filter(s => s.score > 0);

        // Add randomness for ruins
        scored.forEach(s => s.score *= 0.3 + this.rng.random() * 0.7);
        scored.sort((a, b) => b.score - a.score);

        this.placeFromScored(world, scored, count, minDist, 'ruins', 'small', config);
    }

    /**
     * Place POIs from scored tile list
     */
    placeFromScored(world, scored, count, minDist, type, size, config) {
        let placed = 0;

        for (const { tile } of scored) {
            if (placed >= count) break;

            // Extra safety: skip water tiles (ruins can spawn in shallow water)
            if (this.isWaterTile(tile) && type !== 'ruins') {
                continue;
            }

            // Skip tiles that are too isolated (surrounded by water)
            if (this.isTooIsolated(world, tile) && type !== 'ruins') {
                continue;
            }

            // Check minimum distance to existing POIs of same type
            if (!this.isValidPlacement(world, tile.center, type, minDist)) {
                continue;
            }

            // Create POI at tile center with slight offset (reduced to keep within tile)
            const offsetX = (this.rng.random() - 0.5) * 8;
            const offsetY = (this.rng.random() - 0.5) * 8;
            const position = [tile.center[0] + offsetX, tile.center[1] + offsetY];

            const poi = new POI({
                id: world.nextPoiId++,
                name: this.nameGenerator.generate(type, tile.biome),
                type,
                position,
                tileId: tile.id,
                size,
                population: this.generatePopulation(type, size),
                minZoom: this.getMinZoom(type, size),
                maxZoom: 100,
                regionId: tile.regionId,
                isCapital: type === 'capital'
            });

            world.addPOI(poi);

            // Mark tiles as occupied by this POI
            this.markOccupiedTiles(world, poi, tile, config);

            placed++;
        }
    }

    /**
     * Mark tiles as occupied by a POI
     * Larger POIs occupy more tiles with decreasing influence
     */
    markOccupiedTiles(world, poi, centerTile, config) {
        // How many rings of neighbors to occupy based on POI type
        const occupationRings = config.tileOccupation?.[poi.type] ?? {
            capital: 3,
            city: 2,
            town: 1,
            port: 1,
            village: 0,
            dungeon: 0,
            temple: 0,
            ruins: 0
        }[poi.type] ?? 0;

        // Mark center tile with full influence
        centerTile.poiId = poi.id;
        centerTile.poiType = poi.type;
        centerTile.poiInfluence = 1;

        if (occupationRings === 0) return;

        // BFS to mark neighboring tiles with decreasing influence
        const visited = new Set([centerTile.id]);
        let currentRing = [centerTile];

        for (let ring = 1; ring <= occupationRings; ring++) {
            const nextRing = [];
            const influence = 1 - (ring / (occupationRings + 1));

            for (const tile of currentRing) {
                for (const neighborId of tile.neighbors) {
                    if (visited.has(neighborId)) continue;
                    visited.add(neighborId);

                    const neighbor = world.getTile(neighborId);
                    if (!neighbor || neighbor.isWater) continue;

                    // Only occupy if not already occupied by a higher-influence POI
                    if (neighbor.poiInfluence < influence) {
                        neighbor.poiId = poi.id;
                        neighbor.poiType = poi.type;
                        neighbor.poiInfluence = influence;
                    }

                    nextRing.push(neighbor);
                }
            }

            currentRing = nextRing;
        }
    }

    /**
     * Check if a tile is water (by flag, biome, or elevation)
     */
    isWaterTile(tile) {
        // Explicit water flag
        if (tile.isWater) return true;

        // Water-type biomes
        const waterBiomes = ['ocean', 'deep_ocean', 'shallow_water', 'lake', 'river'];
        if (waterBiomes.includes(tile.biome)) return true;

        // Tiles very close to sea level might render as water due to edge cases
        const seaLevel = CONFIG.elevation?.seaLevel || 0.53;
        if (tile.elevation < seaLevel + 0.01) return true;

        return false;
    }

    /**
     * Check if a tile is too isolated (surrounded mostly by water)
     * @param {World} world - World reference
     * @param {Tile} tile - Tile to check
     * @returns {boolean} True if tile is too isolated for settlement
     */
    isTooIsolated(world, tile) {
        if (tile.neighbors.length === 0) return true;

        let waterNeighbors = 0;
        for (const neighborId of tile.neighbors) {
            const neighbor = world.getTile(neighborId);
            if (!neighbor || this.isWaterTile(neighbor)) {
                waterNeighbors++;
            }
        }

        // If more than 75% of neighbors are water, tile is too isolated
        const waterRatio = waterNeighbors / tile.neighbors.length;
        return waterRatio > 0.75;
    }

    /**
     * Calculate tile score for POI placement
     */
    getTileScore(tile, type, config) {
        // Never place on water (except ruins which can be in shallow water)
        if (this.isWaterTile(tile) && type !== 'ruins') {
            return 0;
        }

        // Base score
        let score = 1;

        // Biome preference
        const prefs = config.biomePreferences[type] || {};
        const biomePref = prefs[tile.biome] ?? prefs.default ?? 1;
        score *= biomePref;

        // Elevation preference (most settlements prefer lower elevations)
        if (type !== 'dungeon' && type !== 'temple') {
            score *= 1 - tile.elevation * 0.5;
        } else if (type === 'dungeon') {
            // Dungeons prefer higher/more extreme elevations
            score *= 0.5 + tile.elevation;
        }

        // Coastal bonus for ports
        if (type === 'port') {
            if (!tile.isCoastal) return 0;
            score *= 2;
        }

        // Settlements near rivers get bonus
        if (['village', 'town', 'city', 'capital'].includes(type)) {
            if (tile.riverEdges && tile.riverEdges.length > 0) {
                score *= 1.5;
            }
        }

        return score;
    }

    /**
     * Check if placement is valid (respects minimum distances)
     */
    isValidPlacement(world, position, type, minDist) {
        const [x, y] = position;

        // Check distance to all existing POIs
        for (const poi of world.pois.values()) {
            const dist = poi.distanceTo(x, y);

            // Use stricter distance for same type
            const effectiveMinDist = poi.type === type ? minDist : minDist * 0.5;

            if (dist < effectiveMinDist) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get distance to nearest POI of specified types
     */
    getDistanceToNearestPOI(world, position, types) {
        const [x, y] = position;
        let minDist = Infinity;

        for (const poi of world.pois.values()) {
            if (types.includes(poi.type)) {
                const dist = poi.distanceTo(x, y);
                minDist = Math.min(minDist, dist);
            }
        }

        return minDist === Infinity ? 0 : minDist;
    }

    /**
     * Generate population based on POI type and size
     */
    generatePopulation(type, size) {
        const basePopulations = {
            village: { small: 50, medium: 150, large: 300 },
            town: { small: 500, medium: 1500, large: 3000 },
            city: { small: 5000, medium: 15000, large: 30000 },
            capital: { small: 20000, medium: 50000, large: 100000 },
            port: { small: 1000, medium: 3000, large: 8000 },
            dungeon: { small: 0, medium: 0, large: 0 },
            temple: { small: 20, medium: 50, large: 100 },
            ruins: { small: 0, medium: 0, large: 0 }
        };

        const base = basePopulations[type]?.[size] ?? 100;
        const variance = 0.5 + this.rng.random();
        return Math.floor(base * variance);
    }

    /**
     * Get minimum zoom level for POI visibility
     */
    getMinZoom(type, size) {
        // Larger/more important POIs visible from further out
        const baseZooms = {
            capital: -50,
            city: -30,
            town: -10,
            port: -10,
            village: 10,
            dungeon: 20,
            temple: 10,
            ruins: 30
        };

        const sizeBonus = { small: 10, medium: 0, large: -10 };
        return (baseZooms[type] ?? 0) + (sizeBonus[size] ?? 0);
    }
}
