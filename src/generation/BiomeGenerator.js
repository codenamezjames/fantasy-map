/**
 * BiomeGenerator - assigns biomes based on elevation, temperature, and moisture
 * Uses a Whittaker-style diagram lookup
 */

const BIOMES = {
    ocean: 'ocean',
    snow: 'snow',
    tundra: 'tundra',
    taiga: 'taiga',
    temperate_forest: 'temperate_forest',
    temperate_grassland: 'temperate_grassland',
    shrubland: 'shrubland',
    desert: 'desert',
    savanna: 'savanna',
    tropical_forest: 'tropical_forest',
    rainforest: 'rainforest',
    beach: 'beach',
    marsh: 'marsh'
};

export class BiomeGenerator {
    constructor() {
        // No dependencies needed - pure lookup
    }

    /**
     * Generate biomes for all tiles in the world
     */
    generate(world) {
        for (const tile of world.getAllTiles()) {
            tile.biome = this.determineBiome(tile);
        }
        this.logStats(world);
    }

    /**
     * Determine biome based on tile properties
     * Uses Whittaker diagram logic: temperature + moisture → biome
     */
    determineBiome(tile) {
        const { elevation, temperature, moisture, isWater, isCoastal } = tile;

        // Water
        if (isWater) return BIOMES.ocean;

        // Snow peaks (high elevation regardless of temp)
        if (elevation > 0.8) return BIOMES.snow;

        // Special: beach (coastal lowland in warm areas)
        if (isCoastal && elevation < 0.4 && temperature > 0.4) {
            return BIOMES.beach;
        }

        // Special: marsh (wet lowlands)
        if (moisture > 0.8 && elevation < 0.4) {
            return BIOMES.marsh;
        }

        // Cold biomes (temp < 0.25)
        if (temperature < 0.25) {
            return moisture > 0.5 ? BIOMES.taiga : BIOMES.tundra;
        }

        // Cool/temperate biomes (temp 0.25-0.5)
        if (temperature < 0.5) {
            if (moisture < 0.3) return BIOMES.temperate_grassland;
            if (moisture < 0.6) return BIOMES.shrubland;
            return BIOMES.temperate_forest;
        }

        // Warm biomes (temp 0.5-0.75)
        if (temperature < 0.75) {
            if (moisture < 0.25) return BIOMES.desert;
            if (moisture < 0.5) return BIOMES.savanna;
            return BIOMES.tropical_forest;
        }

        // Hot biomes (temp > 0.75)
        if (moisture < 0.3) return BIOMES.desert;
        if (moisture < 0.6) return BIOMES.savanna;
        return BIOMES.rainforest;
    }

    /**
     * Log biome distribution statistics
     */
    logStats(world) {
        const tiles = world.getAllTiles();
        const counts = {};
        for (const tile of tiles) {
            counts[tile.biome] = (counts[tile.biome] || 0) + 1;
        }
        console.log('Biomes generated:', counts);
    }
}

export { BIOMES };
