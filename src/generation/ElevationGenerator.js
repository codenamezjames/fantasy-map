/**
 * ElevationGenerator - generates terrain elevation using multi-layer noise
 */
export class ElevationGenerator {
    constructor(noise) {
        this.noise = noise;

        // Configuration
        this.seaLevel = 0.35;      // Tiles below this are water
        this.edgeMargin = 0.15;    // 15% border for ocean falloff
    }

    /**
     * Generate elevation for all tiles in the world
     */
    generate(world) {
        // Calculate elevation for each tile
        for (const tile of world.getAllTiles()) {
            tile.elevation = this.calculateElevation(
                tile.center[0],
                tile.center[1],
                world.width,
                world.height
            );

            // Mark as water if below sea level
            tile.isWater = tile.elevation < this.seaLevel;
            tile.waterDepth = tile.isWater ? this.seaLevel - tile.elevation : 0;
        }

        // Mark coastal tiles (land adjacent to water)
        this.markCoastalTiles(world);

        // Log stats
        const tiles = world.getAllTiles();
        const waterCount = tiles.filter(t => t.isWater).length;
        const coastalCount = tiles.filter(t => t.isCoastal).length;
        console.log(`Elevation generated: ${waterCount} water tiles, ${coastalCount} coastal tiles`);
    }

    /**
     * Calculate elevation at a given point using layered noise
     */
    calculateElevation(x, y, width, height) {
        // Continental layer - large landmasses (low frequency)
        const continental = this.noise.getOctave(x, y, 4, 0.5, 0.001);

        // Mountain layer - ridges and peaks (medium frequency)
        const mountain = this.noise.getOctave(x, y, 6, 0.6, 0.003);

        // Detail layer - local variation (higher frequency)
        const detail = this.noise.getOctave(x, y, 3, 0.5, 0.01);

        // Combine layers with weights
        let elevation = continental * 0.6 + mountain * 0.3 + detail * 0.1;

        // Apply edge falloff to force ocean at borders
        const falloff = this.getEdgeFalloff(x, y, width, height);
        elevation *= falloff;

        // Clamp to 0-1 range
        return Math.max(0, Math.min(1, elevation));
    }

    /**
     * Calculate edge falloff multiplier (0 at edges, 1 in center)
     */
    getEdgeFalloff(x, y, width, height) {
        // Distance from edges as 0-1 (0 at edge, 1 past margin)
        const dx = Math.min(x / width, 1 - x / width) / this.edgeMargin;
        const dy = Math.min(y / height, 1 - y / height) / this.edgeMargin;

        // Clamp to 0-1 and apply smoothstep
        const fx = this.smoothstep(Math.min(1, Math.max(0, dx)));
        const fy = this.smoothstep(Math.min(1, Math.max(0, dy)));

        return fx * fy;
    }

    /**
     * Smoothstep interpolation for natural falloff
     */
    smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    /**
     * Mark tiles that are land but adjacent to water
     */
    markCoastalTiles(world) {
        for (const tile of world.getAllTiles()) {
            if (!tile.isWater) {
                // Check if any neighbor is water
                tile.isCoastal = tile.neighbors.some(id => {
                    const neighbor = world.getTile(id);
                    return neighbor && neighbor.isWater;
                });
            }
        }
    }
}
