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

        // Click callback (set by MapGenerator for POI interaction)
        this.onClick = config.onClick || null;

        // Hover callback (set by MapGenerator for cursor changes)
        this.onHover = config.onHover || null;

        // Measurement data callback (set by MapGenerator)
        this.getMeasurementData = config.getMeasurementData || null;

        // Track drag distance to distinguish clicks from drags
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.clickThreshold = 5; // Max pixels moved to count as click

        // Last clicked world position
        this.lastClickPos = null;

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
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.stopInertia(); // Stop any ongoing inertia
            canvas.style.cursor = 'grabbing';
        });

        // Mouse move - pan if dragging, or check hover
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            if (!this.isDragging) {
                // Check for hover (only when not dragging)
                if (this.onHover) {
                    const worldPos = this.camera.screenToWorld(screenX, screenY);
                    const isOverInteractive = this.onHover(worldPos);
                    canvas.style.cursor = isOverInteractive ? 'pointer' : 'grab';
                }
                return;
            }

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

        // Mouse up - end drag, start inertia, or handle click
        canvas.addEventListener('mouseup', (e) => {
            const wasDragging = this.isDragging;
            this.isDragging = false;
            canvas.style.cursor = 'grab';

            // Check if this was a click (not a drag)
            const dragDistance = Math.hypot(
                e.clientX - this.dragStartX,
                e.clientY - this.dragStartY
            );

            if (wasDragging && dragDistance < this.clickThreshold) {
                // This was a click, not a drag
                const rect = canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldPos = this.camera.screenToWorld(screenX, screenY);
                this.lastClickPos = worldPos;
                if (this.onClick) {
                    this.onClick(worldPos, { screenX, screenY });
                }
                this.scheduleRender();
                return; // Don't start inertia for clicks
            }

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
        const frameStart = performance.now();
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

        // Overlay height depends on whether we have a click position
        const overlayH = this.lastClickPos ? 94 : 78;

        // Zoom level indicator
        ctx.fillStyle = overlayBg;
        ctx.fillRect(10, 10, 160, overlayH);

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
        ctx.fillRect(20, 74, 130, 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a9eff';
        ctx.fillRect(20, 74, (camera.zoom / 100) * 130, 4);

        // Clicked position
        if (this.lastClickPos) {
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '12px monospace';
            ctx.fillText(`Click: ${Math.round(this.lastClickPos.x)}, ${Math.round(this.lastClickPos.y)}`, 20, 92);
        }

        // Distance scale bar (bottom-right) — 1 world unit = 0.5 miles
        this.drawScaleBar(ctx, camera);

        // Measurement total distance readout (bottom-left)
        if (this.getMeasurementData) {
            const data = this.getMeasurementData();
            if (data.points.length > 0) {
                this.drawMeasurementOverlay(ctx, data);
            }
        }
    }

    /**
     * Draw measurement distance readout panel (bottom-left, screen space)
     */
    drawMeasurementOverlay(ctx, data) {
        const overlayBg = this.getOverlayBackground();
        const overlayText = this.getOverlayText();

        const pad = 20;
        const panelW = 180;
        const panelH = data.points.length >= 2 ? 52 : 32;
        const panelX = pad;
        const panelY = this.canvas.height - pad - panelH;

        ctx.fillStyle = overlayBg;
        ctx.fillRect(panelX, panelY, panelW, panelH);

        ctx.fillStyle = overlayText;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        if (data.points.length >= 2) {
            const dist = data.totalDistance;
            const label = dist >= 1
                ? `${dist.toFixed(1)} miles`
                : `${(dist * 5280).toFixed(0)} ft`;
            ctx.fillText(`Total: ${label}`, panelX + 10, panelY + 8);

            ctx.font = '11px monospace';
            ctx.globalAlpha = 0.6;
            ctx.fillText(`${data.points.length} waypoints`, panelX + 10, panelY + 28);
            ctx.globalAlpha = 1;
        } else {
            ctx.font = '11px monospace';
            ctx.globalAlpha = 0.7;
            ctx.fillText('Click to add waypoints', panelX + 10, panelY + 8);
            ctx.globalAlpha = 1;
        }

        // Hint line
        ctx.fillStyle = overlayText;
        ctx.globalAlpha = 0.4;
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('Esc/Right-click: clear', panelX + panelW - 6, panelY + panelH - 12);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    /**
     * Draw a map scale bar in the bottom-right corner
     * 1 world unit = 0.5 miles
     */
    drawScaleBar(ctx, camera) {
        const milesPerUnit = 0.5;
        // Nice round distances to pick from
        const steps = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500];
        const targetBarPx = 120; // aim for ~120px wide bar

        // How many world units fit in targetBarPx at current scale
        const worldUnitsInBar = targetBarPx / camera.scale;
        const milesInBar = worldUnitsInBar * milesPerUnit;

        // Pick the largest nice step that fits
        let niceMiles = steps[0];
        for (const s of steps) {
            if (s <= milesInBar) niceMiles = s;
        }

        const barWorldUnits = niceMiles / milesPerUnit;
        const barPx = barWorldUnits * camera.scale;

        // Position: bottom-right with padding
        const pad = 20;
        const barX = this.canvas.width - pad - barPx;
        const barY = this.canvas.height - pad;

        const overlayBg = this.getOverlayBackground();
        const overlayText = this.getOverlayText();

        // Background
        ctx.fillStyle = overlayBg;
        ctx.fillRect(barX - 8, barY - 20, barPx + 16, 28);

        // Bar line
        ctx.strokeStyle = overlayText;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Left tick
        ctx.moveTo(barX, barY - 4);
        ctx.lineTo(barX, barY);
        // Horizontal
        ctx.lineTo(barX + barPx, barY);
        // Right tick
        ctx.lineTo(barX + barPx, barY - 4);
        ctx.stroke();

        // Label
        const label = niceMiles >= 1 ? `${niceMiles} mi` : `${niceMiles * 5280} ft`;
        ctx.fillStyle = overlayText;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, barX + barPx / 2, barY - 4);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
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
