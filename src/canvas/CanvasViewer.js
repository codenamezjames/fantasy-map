import { Camera } from './Camera.js';

/**
 * CanvasViewer - handles canvas rendering with pan/zoom
 */
export class CanvasViewer {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Create camera
        this.camera = new Camera({
            worldWidth: config.worldWidth || 2000,
            worldHeight: config.worldHeight || 2000,
            viewportWidth: canvas.width,
            viewportHeight: canvas.height
        });

        // Drag state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Inertia/momentum
        this.velocityX = 0;
        this.velocityY = 0;
        this.friction = 0.92; // Slowdown factor per frame
        this.minVelocity = 0.1; // Stop when velocity below this
        this.inertiaActive = false;

        // Render callback (set by MapGenerator)
        this.onRender = config.onRender || null;

        // Theme callbacks for colors
        this.getBackground = config.getBackground || (() => '#1a1a2e');
        this.getOverlayBackground = config.getOverlayBackground || (() => 'rgba(0, 0, 0, 0.5)');
        this.getOverlayText = config.getOverlayText || (() => '#fff');

        // Animation frame throttling for smooth rendering
        this.needsRender = false;
        this.renderScheduled = false;

        // Bind event handlers
        this.setupEventListeners();
    }

    /**
     * Schedule a render on next animation frame (throttles to 60fps)
     */
    scheduleRender() {
        this.needsRender = true;
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => {
                this.renderScheduled = false;
                if (this.needsRender) {
                    this.needsRender = false;
                    this.render();
                }
            });
        }
    }

    /**
     * Start inertia animation loop
     */
    startInertia() {
        if (this.inertiaActive) return;
        this.inertiaActive = true;
        this.updateInertia();
    }

    /**
     * Update inertia (called each frame while momentum is active)
     */
    updateInertia() {
        if (!this.inertiaActive) return;

        // Apply velocity
        this.camera.pan(this.velocityX, this.velocityY);

        // Apply friction
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;

        // Check if we should stop
        if (Math.abs(this.velocityX) < this.minVelocity &&
            Math.abs(this.velocityY) < this.minVelocity) {
            this.inertiaActive = false;
            this.velocityX = 0;
            this.velocityY = 0;
            return;
        }

        // Render and continue
        this.render();
        requestAnimationFrame(() => this.updateInertia());
    }

    /**
     * Stop inertia
     */
    stopInertia() {
        this.inertiaActive = false;
        this.velocityX = 0;
        this.velocityY = 0;
    }

    /**
     * Set up mouse/wheel event listeners
     */
    setupEventListeners() {
        const canvas = this.canvas;

        // Mouse down - start drag
        canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.stopInertia(); // Stop any ongoing inertia
            canvas.style.cursor = 'grabbing';
        });

        // Mouse move - pan if dragging
        canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;

            // Track velocity for inertia
            this.velocityX = dx;
            this.velocityY = dy;

            this.camera.pan(dx, dy);

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.scheduleRender();
        });

        // Mouse up - end drag, start inertia
        canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            canvas.style.cursor = 'grab';
            // Start inertia if we have velocity
            if (Math.abs(this.velocityX) > this.minVelocity ||
                Math.abs(this.velocityY) > this.minVelocity) {
                this.startInertia();
            }
        });

        // Mouse leave - end drag, start inertia
        canvas.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.isDragging = false;
                canvas.style.cursor = 'grab';
                if (Math.abs(this.velocityX) > this.minVelocity ||
                    Math.abs(this.velocityY) > this.minVelocity) {
                    this.startInertia();
                }
            }
        });

        // Wheel - zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            // Get mouse position for zoom focus
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (e.deltaY < 0) {
                // Scroll up - zoom in
                this.camera.zoomIn(mouseX, mouseY);
            } else {
                // Scroll down - zoom out
                this.camera.zoomOut(mouseX, mouseY);
            }

            this.scheduleRender();
        }, { passive: false });

        // Set initial cursor
        canvas.style.cursor = 'grab';
    }

    /**
     * Handle canvas resize
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.camera.setViewport(width, height);
        this.render();
    }

    /**
     * Render the canvas
     */
    render() {
        const { ctx, canvas, camera } = this;

        // Clear canvas
        ctx.fillStyle = this.getBackground();
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Save context state
        ctx.save();

        // Apply camera transform
        ctx.scale(camera.scale, camera.scale);
        ctx.translate(-camera.x, -camera.y);

        // Call custom render callback if set
        if (this.onRender) {
            this.onRender(ctx, camera);
        } else {
            // Default: draw test grid
            this.drawTestGrid(ctx);
        }

        // Restore context state
        ctx.restore();

        // Draw UI overlay (zoom level, etc.)
        this.drawOverlay();
    }

    /**
     * Draw a test grid to visualize pan/zoom
     */
    drawTestGrid(ctx) {
        const gridSize = 100; // World units
        const worldWidth = this.camera.worldWidth;
        const worldHeight = this.camera.worldHeight;

        // Draw world boundary
        ctx.strokeStyle = '#4a4a6a';
        ctx.lineWidth = 4 / this.camera.scale;
        ctx.strokeRect(0, 0, worldWidth, worldHeight);

        // Draw grid lines
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 1 / this.camera.scale;

        // Vertical lines
        for (let x = 0; x <= worldWidth; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, worldHeight);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= worldHeight; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(worldWidth, y);
            ctx.stroke();
        }

        // Draw some reference points
        ctx.fillStyle = '#6a6a8a';
        const fontSize = 14 / this.camera.scale;
        ctx.font = `${fontSize}px monospace`;

        for (let x = 0; x <= worldWidth; x += 500) {
            for (let y = 0; y <= worldHeight; y += 500) {
                ctx.fillText(`${x},${y}`, x + 5, y + fontSize + 5);
            }
        }

        // Draw center marker
        const cx = worldWidth / 2;
        const cy = worldHeight / 2;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(cx, cy, 10 / this.camera.scale, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw UI overlay (not affected by camera transform)
     */
    drawOverlay() {
        const { ctx, camera } = this;
        const overlayBg = this.getOverlayBackground();
        const overlayText = this.getOverlayText();

        // Zoom level indicator
        ctx.fillStyle = overlayBg;
        ctx.fillRect(10, 10, 160, 80);

        ctx.fillStyle = overlayText;
        ctx.font = '14px monospace';
        ctx.fillText(`${camera.zoomName} (${Math.round(camera.zoom)}%)`, 20, 30);
        ctx.fillText(`Scale: ${camera.scale.toFixed(1)}x`, 20, 50);

        const vp = camera.getViewport();
        ctx.font = '12px monospace';
        ctx.globalAlpha = 0.6;
        ctx.fillText(`View: ${Math.round(vp.x)},${Math.round(vp.y)}`, 20, 68);
        ctx.globalAlpha = 1;

        // Zoom bar
        ctx.globalAlpha = 0.2;
        ctx.fillRect(20, 78, 130, 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a9eff';
        ctx.fillRect(20, 78, (camera.zoom / 100) * 130, 4);
    }

    /**
     * Check if a world rect is visible
     */
    isInViewport(x, y, width, height) {
        return this.camera.isVisible(x, y, width, height);
    }

    /**
     * Get visible world bounds
     */
    getVisibleBounds() {
        return this.camera.getViewport();
    }
}
