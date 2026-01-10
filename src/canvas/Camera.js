/**
 * Camera - manages view state for the map viewer
 * Handles pan position, smooth zoom, and coordinate transforms
 */
export class Camera {
    constructor(config = {}) {
        // World bounds (map size at zoom 0%)
        this.worldWidth = config.worldWidth || 2000;
        this.worldHeight = config.worldHeight || 2000;

        // Viewport size (screen dimensions)
        this.viewportWidth = config.viewportWidth || 800;
        this.viewportHeight = config.viewportHeight || 600;

        // Camera position (world coordinates of top-left corner)
        this.x = 0;
        this.y = 0;

        // Smooth zoom (-50 to 100%)
        // -50 = Full map overview, 0 = World view, 100 = Building view
        this.zoom = 0;
        this.minZoom = config.minZoom ?? -50;    // Minimum zoom % (negative = zoomed out)
        this.maxZoom = config.maxZoom ?? 100;    // Maximum zoom %
        this.minScale = config.minScale || 1;    // Scale at zoom 0%
        this.maxScale = config.maxScale || 64;   // Scale at zoom 100%
        this.zoomStep = config.zoomStep || 1;    // % change per scroll tick
    }

    /**
     * Get current zoom scale (exponential interpolation)
     * This gives a natural zoom feel where each step feels equal
     */
    get scale() {
        const t = this.zoom / 100;
        return this.minScale * Math.pow(this.maxScale / this.minScale, t);
    }

    /**
     * Get approximate zoom level name
     */
    get zoomName() {
        if (this.zoom < 0) return 'Overview';
        if (this.zoom < 25) return 'World';
        if (this.zoom < 50) return 'Area';
        if (this.zoom < 75) return 'City';
        return 'Building';
    }

    /**
     * Get zoom level index (-1 to 3) for compatibility
     */
    get zoomLevel() {
        if (this.zoom < 0) return -1;
        if (this.zoom < 25) return 0;
        if (this.zoom < 50) return 1;
        if (this.zoom < 75) return 2;
        return 3;
    }

    /**
     * Check if an element should be visible at current zoom
     * @param {number} minZoom - Element becomes visible at this zoom %
     * @param {number} maxZoom - Element hidden above this zoom %
     */
    isVisibleAtZoom(minZoom, maxZoom = 100) {
        return this.zoom >= minZoom && this.zoom <= maxZoom;
    }

    /**
     * Set viewport dimensions (call on resize)
     */
    setViewport(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.clampPosition();
    }

    /**
     * Pan the camera by delta in screen pixels
     */
    pan(dx, dy) {
        // Convert screen delta to world delta (divide by scale)
        this.x -= dx / this.scale;
        this.y -= dy / this.scale;
        this.clampPosition();
    }

    /**
     * Set camera position directly (world coordinates)
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.clampPosition();
    }

    /**
     * Center camera on a world position
     */
    centerOn(worldX, worldY) {
        this.x = worldX - (this.viewportWidth / this.scale) / 2;
        this.y = worldY - (this.viewportHeight / this.scale) / 2;
        this.clampPosition();
    }

    /**
     * Set zoom level, optionally focusing on a screen point
     */
    setZoom(level, focusScreenX = null, focusScreenY = null) {
        // Clamp to valid range
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, level));
        if (newZoom === this.zoom) return;

        // If focus point provided, zoom toward that point
        if (focusScreenX !== null && focusScreenY !== null) {
            // Get world position under cursor before zoom
            const worldPos = this.screenToWorld(focusScreenX, focusScreenY);

            // Change zoom
            this.zoom = newZoom;

            // Adjust camera so world position stays under cursor
            this.x = worldPos.x - focusScreenX / this.scale;
            this.y = worldPos.y - focusScreenY / this.scale;
        } else {
            // Zoom toward center
            const centerWorld = this.screenToWorld(
                this.viewportWidth / 2,
                this.viewportHeight / 2
            );
            this.zoom = newZoom;
            this.centerOn(centerWorld.x, centerWorld.y);
        }

        this.clampPosition();
    }

    /**
     * Zoom in by zoomStep %
     */
    zoomIn(focusScreenX = null, focusScreenY = null) {
        this.setZoom(this.zoom + this.zoomStep, focusScreenX, focusScreenY);
    }

    /**
     * Zoom out by zoomStep %
     */
    zoomOut(focusScreenX = null, focusScreenY = null) {
        this.setZoom(this.zoom - this.zoomStep, focusScreenX, focusScreenY);
    }

    /**
     * Convert screen coordinates to world coordinates
     */
    screenToWorld(screenX, screenY) {
        return {
            x: this.x + screenX / this.scale,
            y: this.y + screenY / this.scale
        };
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.x) * this.scale,
            y: (worldY - this.y) * this.scale
        };
    }

    /**
     * Get the visible world bounds
     */
    getViewport() {
        const width = this.viewportWidth / this.scale;
        const height = this.viewportHeight / this.scale;
        return {
            x: this.x,
            y: this.y,
            width: width,
            height: height,
            minX: this.x,
            minY: this.y,
            maxX: this.x + width,
            maxY: this.y + height
        };
    }

    /**
     * Check if a world rect is visible in viewport
     */
    isVisible(x, y, width, height) {
        const vp = this.getViewport();
        return !(x + width < vp.minX ||
                 x > vp.maxX ||
                 y + height < vp.minY ||
                 y > vp.maxY);
    }

    /**
     * Clamp camera position to world bounds
     */
    clampPosition() {
        const viewWidth = this.viewportWidth / this.scale;
        const viewHeight = this.viewportHeight / this.scale;

        // If viewport is larger than world, center the world
        if (viewWidth >= this.worldWidth) {
            this.x = (this.worldWidth - viewWidth) / 2;
        } else {
            // Clamp to world bounds
            const maxX = this.worldWidth - viewWidth;
            this.x = Math.max(0, Math.min(maxX, this.x));
        }

        if (viewHeight >= this.worldHeight) {
            this.y = (this.worldHeight - viewHeight) / 2;
        } else {
            const maxY = this.worldHeight - viewHeight;
            this.y = Math.max(0, Math.min(maxY, this.y));
        }
    }
}
