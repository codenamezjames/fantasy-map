import { createNoise2D } from 'simplex-noise';

/**
 * Noise generator wrapper for terrain generation
 * Uses simplex noise (improved Perlin noise)
 */
export class NoiseGenerator {
    constructor(rng) {
        // Create noise function using seeded random
        this.noise2D = createNoise2D(() => rng.random());
    }

    /**
     * Get noise value at coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} scale - Scale factor (smaller = more zoomed in)
     * @returns {number} Value between -1 and 1
     */
    get(x, y, scale = 1) {
        return this.noise2D(x * scale, y * scale);
    }

    /**
     * Get normalized noise value (0 to 1)
     */
    getNormalized(x, y, scale = 1) {
        return (this.get(x, y, scale) + 1) / 2;
    }

    /**
     * Get octave noise (multiple layers for more detail)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} octaves - Number of noise layers
     * @param {number} persistence - How much each octave contributes
     * @param {number} scale - Base scale
     * @returns {number} Value between 0 and 1
     */
    getOctave(x, y, octaves = 4, persistence = 0.5, scale = 1) {
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.get(x, y, frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        // Normalize to 0-1
        return (total / maxValue + 1) / 2;
    }
}
