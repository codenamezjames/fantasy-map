import seedrandom from 'seedrandom';

/**
 * Seeded random number generator wrapper
 * Ensures reproducible world generation with the same seed
 */
export class SeededRandom {
    constructor(seed) {
        this.seed = seed;
        this.rng = seedrandom(seed);
    }

    /** Returns random float between 0 and 1 */
    random() {
        return this.rng();
    }

    /** Returns random float between min and max */
    range(min, max) {
        return min + this.rng() * (max - min);
    }

    /** Returns random integer between min and max (inclusive) */
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }

    /** Returns random element from array */
    pick(array) {
        return array[this.int(0, array.length - 1)];
    }

    /** Shuffles array in place using Fisher-Yates */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /** Reset to initial state */
    reset() {
        this.rng = seedrandom(this.seed);
    }
}
