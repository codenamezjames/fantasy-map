/**
 * POI - Point of Interest on the map
 * Represents settlements, dungeons, temples, and other notable locations
 */
export class POI {
    constructor(config = {}) {
        // Identity
        this.id = config.id ?? 0;
        this.name = config.name ?? 'Unknown';
        this.type = config.type ?? 'village'; // village, town, city, capital, dungeon, temple, ruins, port

        // Location
        this.position = config.position ?? [0, 0]; // [x, y] world coordinates
        this.tileId = config.tileId ?? null; // Which tile this POI is on

        // Size and importance
        this.size = config.size ?? 'small'; // small, medium, large
        this.population = config.population ?? 0;

        // Visibility (zoom percentage range)
        this.minZoom = config.minZoom ?? -50;
        this.maxZoom = config.maxZoom ?? 100;

        // Political
        this.regionId = config.regionId ?? null;
        this.isCapital = config.isCapital ?? false;
    }

    /**
     * Check if POI is visible at given zoom level
     */
    isVisibleAtZoom(zoom) {
        return zoom >= this.minZoom && zoom <= this.maxZoom;
    }

    /**
     * Check if POI is within a viewport
     */
    isInViewport(viewport) {
        const [x, y] = this.position;
        return x >= viewport.minX && x <= viewport.maxX &&
               y >= viewport.minY && y <= viewport.maxY;
    }

    /**
     * Get distance to another position
     */
    distanceTo(x, y) {
        const [px, py] = this.position;
        return Math.hypot(x - px, y - py);
    }

    /**
     * Serialize POI to plain object
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            position: this.position,
            tileId: this.tileId,
            size: this.size,
            population: this.population,
            minZoom: this.minZoom,
            maxZoom: this.maxZoom,
            regionId: this.regionId,
            isCapital: this.isCapital
        };
    }

    /**
     * Create POI from plain object
     */
    static fromJSON(data) {
        return new POI(data);
    }
}
