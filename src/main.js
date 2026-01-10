import { SeededRandom } from './utils/random.js';
import { NoiseGenerator } from './utils/noise.js';
import { CanvasViewer } from './canvas/CanvasViewer.js';
import { VoronoiGenerator } from './generation/VoronoiGenerator.js';
import { ElevationGenerator } from './generation/ElevationGenerator.js';
import { Theme } from './rendering/Theme.js';

/**
 * Fantasy Map Generator
 * Main entry point
 */
class MapGenerator {
    constructor(config = {}) {
        this.config = {
            seed: config.seed || 'fantasy-world-42',
            worldWidth: config.worldWidth || 2000,
            worldHeight: config.worldHeight || 2000,
            ...config
        };

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.rng = new SeededRandom(this.config.seed);
        this.noise = new NoiseGenerator(this.rng);

        // World data
        this.world = null;
        this.voronoiGenerator = new VoronoiGenerator(this.rng);
        this.elevationGenerator = new ElevationGenerator(this.noise);

        // Theme
        this.theme = new Theme('dark');
    }

    /**
     * Set the current theme
     */
    setTheme(themeName) {
        this.theme.set(themeName);
        if (this.viewer) {
            this.viewer.render();
        }
        console.log(`Theme set to: ${this.theme.current.name}`);
    }

    /**
     * Get list of available themes
     */
    getThemes() {
        return Theme.getThemeList();
    }

    init() {
        // Get canvas element
        this.canvas = document.getElementById('map-canvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return false;
        }

        // Set canvas size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Create viewer with pan/zoom
        this.viewer = new CanvasViewer(this.canvas, {
            worldWidth: this.config.worldWidth,
            worldHeight: this.config.worldHeight,
            onRender: (ctx, camera) => this.renderWorld(ctx, camera),
            getBackground: () => this.theme.getBackground(),
            getOverlayBackground: () => this.theme.getOverlayBackground(),
            getOverlayText: () => this.theme.getOverlayText()
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.viewer.resize(window.innerWidth, window.innerHeight);
        });

        console.log('Fantasy Map Generator initialized');
        console.log('Seed:', this.config.seed);
        console.log('World size:', this.config.worldWidth, 'x', this.config.worldHeight);
        console.log('Controls: Drag to pan, Scroll to zoom');

        // Generate world with Voronoi tiles
        this.generateWorld();

        // Initial render
        this.viewer.render();

        return true;
    }

    /**
     * Generate the world with Voronoi tiles
     */
    generateWorld() {
        this.world = this.voronoiGenerator.generate({
            seed: this.config.seed,
            width: this.config.worldWidth,
            height: this.config.worldHeight,
            tileCount: 10000
        });

        // Apply Lloyd relaxation for more uniform cells
        this.voronoiGenerator.relax(this.world, 2);

        console.log('World generated with', this.world.tiles.size, 'tiles');

        // Generate elevation
        this.elevationGenerator.generate(this.world);
    }

    /**
     * Render the world (called by viewer with camera transform applied)
     */
    renderWorld(ctx, camera) {
        const { worldWidth, worldHeight } = this.config;

        // Draw tiles
        this.drawTiles(ctx, camera);

        // Draw grid overlay (optional, visible at higher zoom)
        if (camera.isVisibleAtZoom(30, 100)) {
            this.drawGrid(ctx, camera);
        }

        // Draw world boundary
        ctx.strokeStyle = this.theme.getBorderColor();
        ctx.lineWidth = 4 / camera.scale;
        ctx.strokeRect(0, 0, worldWidth, worldHeight);
    }

    /**
     * Draw Voronoi tiles
     */
    drawTiles(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        const tiles = this.world.getTilesInViewport(viewport, camera.zoom);

        for (const tile of tiles) {
            // Draw cell polygon
            ctx.beginPath();
            const vertices = tile.vertices;
            if (vertices.length < 3) continue;

            ctx.moveTo(vertices[0][0], vertices[0][1]);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i][0], vertices[i][1]);
            }
            ctx.closePath();

            // Fill with theme color
            ctx.fillStyle = this.theme.getTileColor(tile);
            ctx.fill();

            // Stroke outline
            ctx.strokeStyle = this.theme.getTileStroke();
            ctx.lineWidth = 1 / camera.scale;
            ctx.stroke();
        }
    }

    /**
     * Draw coordinate grid
     * Uses visibility thresholds based on zoom percentage
     */
    drawGrid(ctx, camera) {
        const vp = camera.getViewport();
        const { worldWidth, worldHeight } = this.config;

        // Grid density increases with zoom
        // Fine grid (50px) visible at 50%+ zoom
        // Coarse grid (100px) always visible
        const fineGridVisible = camera.isVisibleAtZoom(50, 100);
        const gridSize = fineGridVisible ? 50 : 100;

        // Calculate visible grid lines
        const startX = Math.floor(vp.minX / gridSize) * gridSize;
        const startY = Math.floor(vp.minY / gridSize) * gridSize;
        const endX = Math.min(worldWidth, Math.ceil(vp.maxX / gridSize) * gridSize);
        const endY = Math.min(worldHeight, Math.ceil(vp.maxY / gridSize) * gridSize);

        // Draw grid lines
        ctx.strokeStyle = this.theme.getGridColor();
        ctx.lineWidth = 1 / camera.scale;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            if (x >= 0 && x <= worldWidth) {
                ctx.moveTo(x, Math.max(0, vp.minY));
                ctx.lineTo(x, Math.min(worldHeight, vp.maxY));
            }
        }
        for (let y = startY; y <= endY; y += gridSize) {
            if (y >= 0 && y <= worldHeight) {
                ctx.moveTo(Math.max(0, vp.minX), y);
                ctx.lineTo(Math.min(worldWidth, vp.maxX), y);
            }
        }
        ctx.stroke();

        // Coordinate labels - visibility thresholds:
        // Major labels (500px) visible at 20%+ zoom
        // Minor labels (100px) visible at 50%+ zoom
        const showMajorLabels = camera.isVisibleAtZoom(20, 100);
        const showMinorLabels = camera.isVisibleAtZoom(50, 100);

        if (showMajorLabels) {
            ctx.fillStyle = this.theme.getGridLabelColor();
            const fontSize = Math.max(10, 12 / camera.scale);
            ctx.font = `${fontSize}px monospace`;

            const labelStep = showMinorLabels ? 100 : 500;
            for (let x = Math.ceil(startX / labelStep) * labelStep; x <= endX; x += labelStep) {
                for (let y = Math.ceil(startY / labelStep) * labelStep; y <= endY; y += labelStep) {
                    if (x >= 0 && x <= worldWidth && y >= 0 && y <= worldHeight) {
                        ctx.fillText(`${x},${y}`, x + 3 / camera.scale, y + fontSize + 3 / camera.scale);
                    }
                }
            }
        }
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    const generator = new MapGenerator({
        seed: 'fantasy-world-42',
        worldWidth: 2000,
        worldHeight: 2000
    });

    generator.init();

    // Expose to window for debugging
    window.mapGenerator = generator;
});

export { MapGenerator };
