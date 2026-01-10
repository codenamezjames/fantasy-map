/**
 * NameGenerator - generates fantasy names for settlements and POIs
 * Uses syllable-based generation with biome and type influences
 */
export class NameGenerator {
    constructor(rng) {
        this.rng = rng;
        this.usedNames = new Set();
    }

    // Syllable pools
    static PREFIXES = {
        cold: ['Frost', 'Ice', 'Snow', 'Winter', 'North', 'White', 'Cold', 'Pale'],
        hot: ['Sun', 'Sand', 'Gold', 'Dust', 'Dry', 'Red', 'Ash', 'Flame'],
        forest: ['Green', 'Oak', 'Elm', 'Wood', 'Leaf', 'Moss', 'Fern', 'Shadow'],
        water: ['River', 'Lake', 'Bay', 'Sea', 'Wave', 'Storm', 'Mist', 'Rain'],
        mountain: ['Stone', 'Rock', 'Iron', 'Grey', 'High', 'Peak', 'Cliff', 'Crag'],
        plains: ['Fair', 'Wide', 'Open', 'Wind', 'Grain', 'Gold', 'Bright', 'Clear'],
        dark: ['Black', 'Shadow', 'Dusk', 'Night', 'Gloom', 'Dark', 'Fell', 'Dread'],
        holy: ['High', 'Sacred', 'Blessed', 'Divine', 'Holy', 'Light', 'Star', 'Dawn'],
        neutral: ['Old', 'New', 'East', 'West', 'South', 'Long', 'Great', 'Little']
    };

    static ROOTS = [
        'val', 'holm', 'mund', 'gar', 'mir', 'wyn', 'don', 'thor',
        'bur', 'mor', 'ven', 'dal', 'mar', 'ston', 'crest', 'fell',
        'haven', 'ford', 'bridge', 'wick', 'ton', 'ham', 'bury', 'mouth',
        'watch', 'guard', 'hold', 'keep', 'gate', 'run', 'cross', 'way'
    ];

    static SUFFIXES = {
        village: ['bury', 'ton', 'wick', 'ham', 'field', 'dale', 'vale', 'stead'],
        town: ['ford', 'bridge', 'haven', 'port', 'holm', 'garde', 'worth', 'mere'],
        city: ['hold', 'keep', 'guard', 'gate', 'watch', 'throne', 'crown', 'spire'],
        capital: ['throne', 'crown', 'majesty', 'glory', 'reign', 'empire', 'dominion'],
        dungeon: ['deep', 'pit', 'tomb', 'crypt', 'dark', 'doom', 'dread', 'fell'],
        temple: ['shrine', 'sanctum', 'light', 'prayer', 'blessing', 'grace', 'altar'],
        ruins: ['fall', 'rest', 'memory', 'dust', 'echo', 'shadow', 'past', 'lost'],
        port: ['harbor', 'port', 'dock', 'bay', 'cove', 'anchor', 'sail', 'tide']
    };

    /**
     * Generate a name for a POI
     * @param {string} type - POI type (village, town, city, etc.)
     * @param {string} biome - Biome the POI is in
     * @returns {string} Generated name
     */
    generate(type, biome) {
        let name;
        let attempts = 0;
        const maxAttempts = 50;

        do {
            name = this.generateCandidate(type, biome);
            attempts++;
        } while (this.usedNames.has(name) && attempts < maxAttempts);

        // If we couldn't find a unique name, add a number
        if (this.usedNames.has(name)) {
            let counter = 2;
            while (this.usedNames.has(`${name} ${counter}`)) {
                counter++;
            }
            name = `${name} ${counter}`;
        }

        this.usedNames.add(name);
        return name;
    }

    /**
     * Generate a name candidate
     */
    generateCandidate(type, biome) {
        const prefixPool = this.getPrefixPool(biome, type);
        const suffixes = NameGenerator.SUFFIXES[type] || NameGenerator.SUFFIXES.village;

        // 60% chance of prefix + root/suffix combo
        // 40% chance of just prefix + suffix (shorter names)
        if (this.rng.random() < 0.6) {
            const prefix = this.pick(prefixPool);
            const root = this.pick(NameGenerator.ROOTS);
            return prefix + root;
        } else {
            const prefix = this.pick(prefixPool);
            const suffix = this.pick(suffixes);
            return prefix + suffix;
        }
    }

    /**
     * Get prefix pool based on biome and POI type
     */
    getPrefixPool(biome, type) {
        const pools = [];

        // Biome-based prefixes
        switch (biome) {
            case 'snow':
            case 'tundra':
            case 'taiga':
                pools.push(...NameGenerator.PREFIXES.cold);
                break;
            case 'desert':
            case 'savanna':
                pools.push(...NameGenerator.PREFIXES.hot);
                break;
            case 'temperate_forest':
            case 'tropical_forest':
            case 'rainforest':
                pools.push(...NameGenerator.PREFIXES.forest);
                break;
            case 'beach':
            case 'marsh':
                pools.push(...NameGenerator.PREFIXES.water);
                break;
            case 'temperate_grassland':
            case 'shrubland':
                pools.push(...NameGenerator.PREFIXES.plains);
                break;
        }

        // Type-based prefixes
        switch (type) {
            case 'dungeon':
                pools.push(...NameGenerator.PREFIXES.dark);
                pools.push(...NameGenerator.PREFIXES.mountain);
                break;
            case 'temple':
                pools.push(...NameGenerator.PREFIXES.holy);
                break;
            case 'port':
                pools.push(...NameGenerator.PREFIXES.water);
                break;
            case 'capital':
            case 'city':
                pools.push(...NameGenerator.PREFIXES.neutral);
                break;
        }

        // Always add some neutral options
        pools.push(...NameGenerator.PREFIXES.neutral);

        return pools;
    }

    /**
     * Pick random element from array
     */
    pick(arr) {
        return arr[Math.floor(this.rng.random() * arr.length)];
    }

    /**
     * Reset used names (for new world generation)
     */
    reset() {
        this.usedNames.clear();
    }
}
