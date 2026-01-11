/**
 * Building - represents a building in a city
 */
export class Building {
    constructor(config = {}) {
        this.id = config.id ?? 0;
        this.position = config.position ?? [0, 0]; // Center point
        this.vertices = config.vertices ?? []; // Polygon vertices [[x,y],...]
        this.type = config.type ?? 'house'; // house, shop, temple, tavern, warehouse, market, castle, wall_tower
        this.height = config.height ?? 1; // Relative height for shadows
        this.rotation = config.rotation ?? 0; // Rotation in radians
        this.width = config.width ?? 10;
        this.depth = config.depth ?? 10;

        // Visual properties
        this.roofType = config.roofType ?? 'flat'; // flat, peaked, dome
        this.color = config.color ?? null; // Override color, or null for type default

        // Placement info
        this.blockId = config.blockId ?? null; // Which city block this is in
        this.districtType = config.districtType ?? null;
    }

    /**
     * Get bounding box
     */
    getBounds() {
        if (this.vertices.length === 0) {
            return {
                minX: this.position[0] - this.width/2,
                minY: this.position[1] - this.depth/2,
                maxX: this.position[0] + this.width/2,
                maxY: this.position[1] + this.depth/2
            };
        }
        // Calculate from vertices
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of this.vertices) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        return { minX, minY, maxX, maxY };
    }

    /**
     * Generate rectangular vertices from position, width, depth, rotation
     */
    generateRectVertices() {
        const [cx, cy] = this.position;
        const hw = this.width / 2;
        const hd = this.depth / 2;
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);

        // Corners before rotation
        const corners = [
            [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]
        ];

        // Rotate and translate
        this.vertices = corners.map(([x, y]) => [
            cx + x * cos - y * sin,
            cy + x * sin + y * cos
        ]);

        return this.vertices;
    }

    /**
     * Check if point is inside building
     */
    containsPoint(x, y) {
        return this.pointInPolygon([x, y], this.vertices);
    }

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
     * Get default properties by building type
     */
    static getTypeDefaults(type) {
        const defaults = {
            house: { width: 8, depth: 10, height: 1, roofType: 'peaked' },
            shop: { width: 10, depth: 12, height: 1.2, roofType: 'flat' },
            temple: { width: 20, depth: 25, height: 2.5, roofType: 'dome' },
            tavern: { width: 15, depth: 15, height: 1.5, roofType: 'peaked' },
            warehouse: { width: 20, depth: 30, height: 2, roofType: 'flat' },
            market: { width: 25, depth: 25, height: 0.5, roofType: 'flat' },
            castle: { width: 40, depth: 40, height: 4, roofType: 'flat' },
            wall_tower: { width: 8, depth: 8, height: 3, roofType: 'flat' }
        };
        return defaults[type] ?? defaults.house;
    }

    toJSON() {
        return {
            id: this.id,
            position: this.position,
            vertices: this.vertices,
            type: this.type,
            height: this.height,
            rotation: this.rotation,
            width: this.width,
            depth: this.depth,
            roofType: this.roofType,
            color: this.color,
            blockId: this.blockId,
            districtType: this.districtType
        };
    }

    static fromJSON(data) {
        return new Building(data);
    }
}
