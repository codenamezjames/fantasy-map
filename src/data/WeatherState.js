/**
 * WeatherState — snapshot of weather for a single day
 * Per-tile data stored in typed arrays indexed by tile ID for performance
 */
export class WeatherState {
    /**
     * @param {number} day - Day number
     * @param {number} tileCount - Total number of tiles
     */
    constructor(day, tileCount) {
        this.day = day;
        this.tileCount = tileCount;

        // Season derived from day
        const seasonProgress = (day % 365) / 365;
        this.seasonProgress = seasonProgress;
        this.season = WeatherState.getSeason(seasonProgress);
        this.seasonalTempOffset = 0;

        // Per-tile typed arrays (indexed by tile ID)
        this.windDirX = new Float32Array(tileCount);
        this.windDirY = new Float32Array(tileCount);
        this.windSpeed = new Float32Array(tileCount);
        this.precipitation = new Float32Array(tileCount);
        this.cloudCover = new Float32Array(tileCount);
        this.effectiveTemp = new Float32Array(tileCount);

        // Active storms (sparse)
        this.storms = [];
    }

    /**
     * Get season name from progress through the year
     * @param {number} progress - 0-1 progress through year
     * @returns {string} Season name
     */
    static getSeason(progress) {
        if (progress < 0.25) return 'spring';
        if (progress < 0.5) return 'summer';
        if (progress < 0.75) return 'autumn';
        return 'winter';
    }
}
