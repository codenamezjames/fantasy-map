/**
 * City - represents a generated city for a settlement POI
 * Contains all city data: streets, buildings, districts, walls
 */
export class City {
    constructor(config = {}) {
        // Identity
        this.id = config.id ?? 0;
        this.poiId = config.poiId ?? null;
        this.name = config.name ?? 'Unknown';
        this.type = config.type ?? 'village'; // village, town, city, capital, port
        this.seed = config.seed ?? '';

        // Geometry
        this.center = config.center ?? [0, 0];
        this.boundary = config.boundary ?? []; // Array of [x,y] points forming city polygon
        this.occupiedTileIds = config.occupiedTileIds ?? [];
        this.bounds = config.bounds ?? null; // {minX, minY, maxX, maxY}

        // Generation state
        this.generationState = config.generationState ?? {
            streets: false,
            buildings: false,
            districts: false,
            walls: false
        };

        // Generated content
        this.streets = config.streets ?? null;      // StreetNetwork (Phase 1)
        this.buildings = config.buildings ?? [];     // Building[] (Phase 2)
        this.districts = config.districts ?? [];     // District[] (Phase 3)
        this.walls = config.walls ?? null;           // WallSystem (Phase 3)

        // City parameters (derived from type/size)
        this.params = config.params ?? this.getDefaultParams();
    }

    /**
     * Get default city parameters based on type
     */
    getDefaultParams() {
        const params = {
            village: {
                streetDensity: 0.3,
                buildingDensity: 0.4,
                hasWalls: false,
                hasDistricts: false,
                minBuildings: 5,
                maxBuildings: 20
            },
            town: {
                streetDensity: 0.5,
                buildingDensity: 0.6,
                hasWalls: false,
                hasDistricts: true,
                minBuildings: 20,
                maxBuildings: 60
            },
            city: {
                streetDensity: 0.7,
                buildingDensity: 0.75,
                hasWalls: true,
                hasDistricts: true,
                minBuildings: 60,
                maxBuildings: 150
            },
            capital: {
                streetDensity: 0.8,
                buildingDensity: 0.85,
                hasWalls: true,
                hasDistricts: true,
                minBuildings: 100,
                maxBuildings: 300
            },
            port: {
                streetDensity: 0.6,
                buildingDensity: 0.65,
                hasWalls: true,
                hasDistricts: true,
                hasDocks: true,
                minBuildings: 40,
                maxBuildings: 120
            }
        };
        return params[this.type] ?? params.village;
    }

    /**
     * Calculate bounds from boundary polygon
     */
    calculateBounds() {
        if (this.boundary.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const [x, y] of this.boundary) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        this.bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        return this.bounds;
    }

    /**
     * Check if a point is inside the city boundary
     */
    containsPoint(x, y) {
        // Simple bounds check first
        if (this.bounds) {
            if (x < this.bounds.minX || x > this.bounds.maxX ||
                y < this.bounds.minY || y > this.bounds.maxY) {
                return false;
            }
        }

        // Point-in-polygon test using ray casting
        return this.pointInPolygon([x, y], this.boundary);
    }

    /**
     * Ray casting point-in-polygon test
     */
    pointInPolygon(point, polygon) {
        if (polygon.length < 3) return false;

        const [px, py] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Check if city is fully generated
     */
    isFullyGenerated() {
        return this.generationState.streets &&
               this.generationState.buildings;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            poiId: this.poiId,
            name: this.name,
            type: this.type,
            seed: this.seed,
            center: this.center,
            boundary: this.boundary,
            occupiedTileIds: this.occupiedTileIds,
            bounds: this.bounds,
            generationState: this.generationState,
            params: this.params,
            // Streets, buildings, etc. serialized separately if needed
            streetsGenerated: this.generationState.streets,
            buildingCount: this.buildings.length
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(data) {
        return new City(data);
    }
}
