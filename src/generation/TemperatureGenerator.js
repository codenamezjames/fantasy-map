/**
 * TemperatureGenerator - generates temperature values based on latitude and elevation
 */
export class TemperatureGenerator {
    constructor(noise) {
        this.noise = noise;
        this.lapseRate = 0.4;        // Temperature drop per elevation unit
        this.noiseInfluence = 0.15;  // How much noise affects temperature
    }

    /**
     * Generate temperature for all tiles in the world
     */
    generate(world) {
        for (const tile of world.getAllTiles()) {
            tile.temperature = this.calculateTemperature(
                tile.center[0],
                tile.center[1],
                tile.elevation,
                world.width,
                world.height
            );
        }
        this.logStats(world);
    }

    /**
     * Calculate temperature at a given point
     * Based on latitude (y position) and elevation
     */
    calculateTemperature(x, y, elevation, width, height) {
        // Latitude: 0 at poles, 1 at equator
        // Map y position to latitude (assuming y=0 is north, y=height is south)
        const normalizedY = y / height;
        // Equator in middle (y=0.5), poles at edges
        const distFromEquator = Math.abs(normalizedY - 0.5) * 2; // 0 at equator, 1 at poles
        const latitudeTemp = 1 - distFromEquator; // 1 at equator, 0 at poles

        // Elevation penalty (higher = colder)
        const elevationPenalty = elevation * this.lapseRate;

        // Noise for local variation
        const noise = this.noise.getOctave(x, y, 3, 0.5, 0.005);

        // Combine factors
        let temperature = latitudeTemp * (1 - elevationPenalty) + (noise - 0.5) * this.noiseInfluence;

        return Math.max(0, Math.min(1, temperature));
    }

    /**
     * Log temperature statistics
     */
    logStats(world) {
        const tiles = world.getAllTiles();
        const temps = tiles.map(t => t.temperature);
        const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
        console.log(`Temperature generated: avg=${avg.toFixed(2)}, min=${Math.min(...temps).toFixed(2)}, max=${Math.max(...temps).toFixed(2)}`);
    }
}
