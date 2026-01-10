import { SeededRandom } from './utils/random.js';
import { NoiseGenerator } from './utils/noise.js';
import { CanvasViewer } from './canvas/CanvasViewer.js';
import { VoronoiGenerator } from './generation/VoronoiGenerator.js';
import { ElevationGenerator } from './generation/ElevationGenerator.js';
import { TemperatureGenerator } from './generation/TemperatureGenerator.js';
import { MoistureGenerator } from './generation/MoistureGenerator.js';
import { BiomeGenerator } from './generation/BiomeGenerator.js';
import { WaterGenerator } from './generation/WaterGenerator.js';
import { SubTileGenerator } from './generation/SubTileGenerator.js';
import { TileLoadManager } from './generation/TileLoadManager.js';
import { POIGenerator } from './generation/POIGenerator.js';
import { RegionGenerator } from './generation/RegionGenerator.js';
import { RoadGenerator } from './generation/RoadGenerator.js';
import { Theme } from './rendering/Theme.js';
import { CONFIG } from './config.js';

/**
 * Fantasy Map Generator
 * Main entry point
 */
class MapGenerator {
    constructor(config = {}) {
        this.config = {
            seed: config.seed || CONFIG.seed || 'default',
            worldWidth: config.worldWidth || CONFIG.world.width,
            worldHeight: config.worldHeight || CONFIG.world.height,
            ...config
        };

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;
        this.rng = new SeededRandom(this.config.seed);
        this.noise = new NoiseGenerator(this.rng);

        // World data
        this.world = null;
        // Pass noise to VoronoiGenerator for density-based tile generation
        this.voronoiGenerator = new VoronoiGenerator(this.rng, this.noise);
        this.elevationGenerator = new ElevationGenerator(this.noise);
        this.temperatureGenerator = new TemperatureGenerator(this.noise);
        this.moistureGenerator = new MoistureGenerator(this.noise);
        this.biomeGenerator = new BiomeGenerator();

        // Separate RNG for rivers so they can be regenerated independently
        this.riverRng = new SeededRandom(CONFIG.water.riverSeed);
        this.waterGenerator = new WaterGenerator(this.riverRng);

        // Separate RNG for POIs
        this.poiRng = new SeededRandom(CONFIG.pois?.seed || 'pois-1');
        this.poiGenerator = new POIGenerator(this.poiRng);

        // Separate RNG for regions
        this.regionRng = new SeededRandom(CONFIG.regions?.seed || 'regions-1');
        this.regionGenerator = new RegionGenerator(this.regionRng);

        // Separate RNG for roads
        this.roadRng = new SeededRandom(CONFIG.roads?.seed || 'roads-1');
        this.roadGenerator = new RoadGenerator(this.roadRng);

        // Sub-tile generation for hierarchical zoom
        this.subTileGenerator = new SubTileGenerator(this.noise);
        this.tileLoadManager = null; // Created after world generation

        // Theme - load from localStorage or default to 'dark'
        const savedTheme = localStorage.getItem('mapGenerator.theme') || 'dark';
        this.theme = new Theme(savedTheme);

        // Selected region for highlighting
        this.selectedRegionId = null;

        // UI options - load from localStorage
        this.showRegions = localStorage.getItem('mapGenerator.showRegions') !== 'false';
        this.showTileBorders = localStorage.getItem('mapGenerator.showTileBorders') !== 'false';
        this.showGradientBlend = localStorage.getItem('mapGenerator.showGradientBlend') === 'true';
    }

    /**
     * Toggle region visibility
     */
    setShowRegions(show) {
        this.showRegions = show;
        localStorage.setItem('mapGenerator.showRegions', show);
        if (!show) {
            this.selectedRegionId = null; // Clear selection when hiding
        }
        if (this.viewer) {
            this.viewer.render();
        }
    }

    /**
     * Toggle tile border visibility
     */
    setShowTileBorders(show) {
        this.showTileBorders = show;
        localStorage.setItem('mapGenerator.showTileBorders', show);
        if (this.viewer) {
            this.viewer.render();
        }
    }

    /**
     * Toggle gradient blend between tiles
     */
    setShowGradientBlend(show) {
        this.showGradientBlend = show;
        localStorage.setItem('mapGenerator.showGradientBlend', show);
        if (this.viewer) {
            this.viewer.render();
        }
    }

    /**
     * Set the current theme and persist to localStorage
     */
    setTheme(themeName) {
        this.theme.set(themeName);
        localStorage.setItem('mapGenerator.theme', themeName);
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

    /**
     * Get sub-tile loading statistics (for debugging)
     */
    getSubTileStats() {
        if (!this.tileLoadManager) return null;
        return this.tileLoadManager.getStats();
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
            getOverlayText: () => this.theme.getOverlayText(),
            onClick: (worldPos) => this.handleMapClick(worldPos),
            onHover: (worldPos) => this.handleMapHover(worldPos)
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

        // Setup UI
        this.setupThemeUI();

        // Initial render
        this.viewer.render();

        return true;
    }

    /**
     * Setup theme selector UI
     */
    setupThemeUI() {
        const select = document.getElementById('theme-select');
        if (!select) return;

        // Populate options
        const themes = Theme.getThemeList();
        for (const theme of themes) {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.name;
            if (theme.id === this.theme.currentName) {
                option.selected = true;
            }
            select.appendChild(option);
        }

        // Handle change
        select.addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });

        // Setup regions toggle
        const regionsToggle = document.getElementById('regions-toggle');
        if (regionsToggle) {
            regionsToggle.checked = this.showRegions;
            regionsToggle.addEventListener('change', (e) => {
                this.setShowRegions(e.target.checked);
            });
        }

        // Setup tile borders toggle
        const tileBordersToggle = document.getElementById('tile-borders-toggle');
        if (tileBordersToggle) {
            tileBordersToggle.checked = this.showTileBorders;
            tileBordersToggle.addEventListener('change', (e) => {
                this.setShowTileBorders(e.target.checked);
            });
        }

        // Setup gradient blend toggle
        const gradientBlendToggle = document.getElementById('gradient-blend-toggle');
        if (gradientBlendToggle) {
            gradientBlendToggle.checked = this.showGradientBlend;
            gradientBlendToggle.addEventListener('change', (e) => {
                this.setShowGradientBlend(e.target.checked);
            });
        }
    }

    /**
     * Generate the world with Voronoi tiles
     */
    generateWorld() {
        this.world = this.voronoiGenerator.generate({
            seed: this.config.seed,
            width: this.config.worldWidth,
            height: this.config.worldHeight,
            tileCount: CONFIG.world.tileCount
        });

        // Apply Lloyd relaxation for more uniform cells
        this.voronoiGenerator.relax(this.world, CONFIG.world.relaxationIterations);

        console.log('World generated with', this.world.tiles.size, 'tiles');

        // Generate elevation
        this.elevationGenerator.generate(this.world);

        // Generate temperature and moisture
        this.temperatureGenerator.generate(this.world);
        this.moistureGenerator.generate(this.world);

        // Generate biomes
        this.biomeGenerator.generate(this.world);

        // Generate water features (rivers and lakes)
        this.waterGenerator.generate(this.world);

        // Generate POIs (settlements, dungeons, temples, etc.)
        this.poiGenerator.generate(this.world);
        console.log('POIs generated:', this.world.pois.size);

        // Generate regions (grow from capitals)
        this.regionGenerator.generate(this.world);

        // Generate roads (connect POIs with pathfinding)
        this.roadGenerator.generate(this.world);

        // Set zoom thresholds from config
        this.world.setZoomThresholds(CONFIG.subtiles?.zoomThresholds || [0, 40, 60, 80]);

        // Create tile load manager for hierarchical sub-tiles
        this.tileLoadManager = new TileLoadManager(
            this.world,
            this.subTileGenerator,
            { seed: this.config.seed }
        );
    }

    /**
     * Render the world (called by viewer with camera transform applied)
     */
    renderWorld(ctx, camera) {
        const { worldWidth, worldHeight } = this.config;

        // Update sub-tile loading based on viewport and zoom
        if (this.tileLoadManager) {
            const viewport = camera.getViewport();
            this.tileLoadManager.update(viewport, camera.zoom);
        }

        // Draw tiles
        this.drawTiles(ctx, camera);

        // Draw rivers
        this.drawRivers(ctx, camera);

        // Draw roads
        this.drawRoads(ctx, camera);

        // Draw region borders and selection (if enabled)
        if (this.showRegions) {
            this.drawRegionBorders(ctx, camera);
            this.drawSelectedRegion(ctx, camera);
        }

        // Draw POIs
        this.drawPOIs(ctx, camera);

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

            // Fill with gradient or solid color
            if (this.showGradientBlend) {
                ctx.fillStyle = this.getTileGradient(ctx, tile);
            } else {
                ctx.fillStyle = this.theme.getTileColor(tile);
            }
            ctx.fill();

            // Stroke outline (if enabled)
            if (this.showTileBorders) {
                ctx.strokeStyle = this.theme.getTileStroke();
                ctx.lineWidth = 1 / camera.scale;
                ctx.stroke();
            }
        }
    }

    /**
     * Create a radial gradient for a tile that blends toward neighbor colors
     */
    getTileGradient(ctx, tile) {
        const [cx, cy] = tile.center;
        const tileHSL = this.theme.getTileHSL(tile);

        // Calculate tile radius (distance to farthest vertex)
        let maxDist = 0;
        for (const v of tile.vertices) {
            const dist = Math.hypot(v[0] - cx, v[1] - cy);
            if (dist > maxDist) maxDist = dist;
        }

        // Calculate average neighbor color
        let avgH = 0, avgS = 0, avgL = 0, count = 0;
        for (const neighborId of tile.neighbors) {
            const neighbor = this.world.getTile(neighborId);
            if (neighbor) {
                const nHSL = this.theme.getTileHSL(neighbor);
                // Handle hue wrapping for averaging
                let hDiff = nHSL.h - tileHSL.h;
                if (hDiff > 180) hDiff -= 360;
                if (hDiff < -180) hDiff += 360;
                avgH += tileHSL.h + hDiff;
                avgS += nHSL.s;
                avgL += nHSL.l;
                count++;
            }
        }

        // Create gradient
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDist);

        // Inner: tile's own color
        gradient.addColorStop(0, `hsl(${tileHSL.h}, ${tileHSL.s}%, ${tileHSL.l}%)`);
        gradient.addColorStop(0.5, `hsl(${tileHSL.h}, ${tileHSL.s}%, ${tileHSL.l}%)`);

        // Outer: blend toward neighbor average (if we have neighbors)
        if (count > 0) {
            avgH = ((avgH / count) + 360) % 360;
            avgS /= count;
            avgL /= count;

            // Blend 40% toward neighbor average at edges
            const blendH = (tileHSL.h * 0.6 + avgH * 0.4 + 360) % 360;
            const blendS = tileHSL.s * 0.6 + avgS * 0.4;
            const blendL = tileHSL.l * 0.6 + avgL * 0.4;

            gradient.addColorStop(1, `hsl(${blendH}, ${blendS}%, ${blendL}%)`);
        } else {
            gradient.addColorStop(1, `hsl(${tileHSL.h}, ${tileHSL.s}%, ${tileHSL.l}%)`);
        }

        return gradient;
    }

    /**
     * Draw Points of Interest (settlements, dungeons, etc.)
     */
    drawPOIs(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        const pois = this.world.getPOIsInViewport(viewport, camera.zoom);
        const poiConfig = CONFIG.pois?.rendering || {};

        for (const poi of pois) {
            const [x, y] = poi.position;

            // Determine rendering style based on zoom
            if (camera.zoom < 0) {
                // Very distant: small dot for major POIs only
                if (['capital', 'city'].includes(poi.type)) {
                    this.drawPOIDot(ctx, x, y, poi, camera, poiConfig);
                }
            } else if (camera.zoom < 30) {
                // Distant: dots for all visible POIs
                this.drawPOIDot(ctx, x, y, poi, camera, poiConfig);
            } else if (camera.zoom < 60) {
                // Medium: symbols
                this.drawPOISymbol(ctx, x, y, poi, camera, poiConfig);
            } else {
                // Close: symbols with labels
                this.drawPOISymbol(ctx, x, y, poi, camera, poiConfig);
                this.drawPOILabel(ctx, x, y, poi, camera, poiConfig);
            }
        }
    }

    /**
     * Draw a simple dot for distant POIs
     */
    drawPOIDot(ctx, x, y, poi, camera, config) {
        const size = (config.dotSize || 3) / camera.scale;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = this.theme.getPOIColor(poi.type);
        ctx.fill();
        ctx.strokeStyle = this.theme.getPOIStrokeColor(poi.type);
        ctx.lineWidth = 1 / camera.scale;
        ctx.stroke();
    }

    /**
     * Draw a symbol for medium-distance POIs
     */
    drawPOISymbol(ctx, x, y, poi, camera, config) {
        const size = (config.symbolSize || 8) / camera.scale;
        const fillColor = this.theme.getPOIColor(poi.type);
        const strokeColor = this.theme.getPOIStrokeColor(poi.type);

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5 / camera.scale;

        switch (poi.type) {
            case 'capital':
                // Star shape
                this.drawStar(ctx, x, y, size, 5);
                break;
            case 'city':
                // Square
                ctx.fillRect(x - size / 2, y - size / 2, size, size);
                ctx.strokeRect(x - size / 2, y - size / 2, size, size);
                break;
            case 'town':
                // Circle
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            case 'village':
                // Small circle
                ctx.beginPath();
                ctx.arc(x, y, size / 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            case 'dungeon':
                // Triangle pointing down
                this.drawTriangle(ctx, x, y, size, true);
                break;
            case 'temple':
                // Triangle pointing up
                this.drawTriangle(ctx, x, y, size, false);
                break;
            case 'ruins':
                // X mark
                this.drawX(ctx, x, y, size);
                break;
            case 'port':
                // Diamond
                this.drawDiamond(ctx, x, y, size);
                break;
            default:
                // Default circle
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
        }
    }

    /**
     * Draw a star shape
     */
    drawStar(ctx, x, y, size, points) {
        const outerRadius = size;
        const innerRadius = size * 0.4;

        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw a triangle
     */
    drawTriangle(ctx, x, y, size, pointDown) {
        const h = size * 0.866; // height of equilateral triangle
        const dir = pointDown ? 1 : -1;

        ctx.beginPath();
        ctx.moveTo(x, y + dir * h / 2);
        ctx.lineTo(x - size / 2, y - dir * h / 2);
        ctx.lineTo(x + size / 2, y - dir * h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw an X mark
     */
    drawX(ctx, x, y, size) {
        const half = size / 2;
        ctx.beginPath();
        ctx.moveTo(x - half, y - half);
        ctx.lineTo(x + half, y + half);
        ctx.moveTo(x + half, y - half);
        ctx.lineTo(x - half, y + half);
        ctx.stroke();
    }

    /**
     * Draw a diamond shape
     */
    drawDiamond(ctx, x, y, size) {
        const half = size / 2;
        ctx.beginPath();
        ctx.moveTo(x, y - half);
        ctx.lineTo(x + half, y);
        ctx.lineTo(x, y + half);
        ctx.lineTo(x - half, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * Draw POI label
     */
    drawPOILabel(ctx, x, y, poi, camera, config) {
        const fontSize = Math.max(10, (config.labelOffset || 12) / camera.scale);
        const offset = (config.symbolSize || 8) / camera.scale + 4 / camera.scale;

        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const text = poi.name;
        const metrics = ctx.measureText(text);
        const padding = 2 / camera.scale;

        // Draw label background
        ctx.fillStyle = this.theme.getPOILabelBackground();
        ctx.fillRect(
            x - metrics.width / 2 - padding,
            y + offset - padding,
            metrics.width + padding * 2,
            fontSize + padding * 2
        );

        // Draw label text
        ctx.fillStyle = this.theme.getPOILabelColor();
        ctx.fillText(text, x, y + offset);
    }

    /**
     * Handle click on the map
     * @param {Object} worldPos - World coordinates {x, y}
     */
    handleMapClick(worldPos) {
        const poi = this.findPOIAtPosition(worldPos.x, worldPos.y);
        if (poi) {
            this.showPOIDialog(poi);
            this.selectRegion(poi.regionId);
        } else {
            this.hidePOIDialog();
            // Check if clicked on a tile with a region
            const tile = this.world?.getTileAtPosition(worldPos.x, worldPos.y);
            if (tile && tile.regionId !== null) {
                this.selectRegion(tile.regionId);
            } else {
                this.selectRegion(null);
            }
        }
    }

    /**
     * Select a region to highlight
     * @param {number|null} regionId - Region ID to highlight, or null to clear
     */
    selectRegion(regionId) {
        if (this.selectedRegionId !== regionId) {
            this.selectedRegionId = regionId;
            this.viewer.render();
        }
    }

    /**
     * Handle hover on the map - returns true if over an interactive element
     * @param {Object} worldPos - World coordinates {x, y}
     * @returns {boolean} True if hovering over a POI
     */
    handleMapHover(worldPos) {
        const poi = this.findPOIAtPosition(worldPos.x, worldPos.y);
        return poi !== null;
    }

    /**
     * Find a POI near the given world position
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @returns {POI|null} The POI at that position, or null
     */
    findPOIAtPosition(x, y) {
        if (!this.world) return null;

        const camera = this.viewer.camera;
        const poiConfig = CONFIG.pois?.rendering || {};

        // Hit radius depends on zoom level and symbol size
        const baseSize = poiConfig.symbolSize || 8;
        const hitRadius = Math.max(15, baseSize * 2) / camera.scale;

        // Get visible POIs
        const viewport = camera.getViewport();
        const pois = this.world.getPOIsInViewport(viewport, camera.zoom);

        // Find closest POI within hit radius
        let closestPOI = null;
        let closestDist = hitRadius;

        for (const poi of pois) {
            const dist = poi.distanceTo(x, y);
            if (dist < closestDist) {
                closestDist = dist;
                closestPOI = poi;
            }
        }

        return closestPOI;
    }

    /**
     * Show POI info dialog
     * @param {POI} poi - The POI to display
     */
    showPOIDialog(poi) {
        let dialog = document.getElementById('poi-dialog');
        if (!dialog) {
            dialog = this.createPOIDialog();
        }

        // Get tile info for biome
        const tile = this.world.getTile(poi.tileId);
        const biome = tile?.biome?.replaceAll('_', ' ') || 'Unknown';

        // Format population
        const population = poi.population > 0
            ? poi.population.toLocaleString()
            : 'Uninhabited';

        // Format type with capital letter
        const typeDisplay = poi.type.charAt(0).toUpperCase() + poi.type.slice(1);

        // Update dialog content
        dialog.querySelector('.poi-dialog-title').textContent = poi.name;
        dialog.querySelector('.poi-dialog-type').textContent = typeDisplay;
        dialog.querySelector('.poi-dialog-type').className = `poi-dialog-type poi-type-${poi.type}`;

        // Get region name
        const region = poi.regionId !== null ? this.world.getRegion(poi.regionId) : null;
        const regionName = region?.name || 'Unclaimed';

        const detailsHTML = `
            <div class="poi-detail-row">
                <span class="poi-detail-label">Population:</span>
                <span class="poi-detail-value">${population}</span>
            </div>
            <div class="poi-detail-row">
                <span class="poi-detail-label">Region:</span>
                <span class="poi-detail-value">${regionName}</span>
            </div>
            <div class="poi-detail-row">
                <span class="poi-detail-label">Biome:</span>
                <span class="poi-detail-value">${biome}</span>
            </div>
            <div class="poi-detail-row">
                <span class="poi-detail-label">Size:</span>
                <span class="poi-detail-value">${poi.size}</span>
            </div>
            ${poi.isCapital ? '<div class="poi-capital-badge">Capital City</div>' : ''}
        `;
        dialog.querySelector('.poi-dialog-details').innerHTML = detailsHTML;

        dialog.classList.add('visible');
    }

    /**
     * Hide POI info dialog
     */
    hidePOIDialog() {
        const dialog = document.getElementById('poi-dialog');
        if (dialog) {
            dialog.classList.remove('visible');
        }
    }

    /**
     * Create the POI dialog element
     */
    createPOIDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'poi-dialog';
        dialog.className = 'poi-dialog';
        dialog.innerHTML = `
            <button class="poi-dialog-close" aria-label="Close">&times;</button>
            <div class="poi-dialog-header">
                <h2 class="poi-dialog-title">POI Name</h2>
                <span class="poi-dialog-type">Type</span>
            </div>
            <div class="poi-dialog-details"></div>
        `;

        // Close button handler
        dialog.querySelector('.poi-dialog-close').addEventListener('click', () => {
            this.hidePOIDialog();
        });

        document.body.appendChild(dialog);
        return dialog;
    }

    /**
     * Draw contour lines at elevation intervals
     * Lines are drawn on edges where neighbors cross elevation thresholds
     */
    drawContours(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        const tiles = this.world.getTilesInViewport(viewport, camera.zoom);

        // Contour intervals - major every 0.2, minor every 0.1
        const majorInterval = 0.2;
        const minorInterval = 0.1;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawnEdges = new Set();

        for (const tile of tiles) {
            if (tile.isWater) continue;

            for (const neighborId of tile.neighbors) {
                const edgeKey = tile.id < neighborId ? `${tile.id}-${neighborId}` : `${neighborId}-${tile.id}`;
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighbor = this.world.getTile(neighborId);
                if (!neighbor || neighbor.isWater) continue;

                const minElev = Math.min(tile.elevation, neighbor.elevation);
                const maxElev = Math.max(tile.elevation, neighbor.elevation);

                // Check for contour crossings
                for (let level = minorInterval; level < 1; level += minorInterval) {
                    if (minElev < level && maxElev >= level) {
                        const isMajor = Math.abs(level % majorInterval) < 0.01;
                        const sharedEdge = this.findSharedEdge(tile.vertices, neighbor.vertices);
                        if (!sharedEdge) continue;

                        // Draw contour segment along shared edge
                        ctx.strokeStyle = isMajor
                            ? 'rgba(0, 0, 0, 0.45)'
                            : 'rgba(0, 0, 0, 0.22)';
                        ctx.lineWidth = (isMajor ? 1.8 : 1) / camera.scale;

                        ctx.beginPath();
                        ctx.moveTo(sharedEdge[0][0], sharedEdge[0][1]);
                        ctx.lineTo(sharedEdge[1][0], sharedEdge[1][1]);
                        ctx.stroke();
                    }
                }
            }
        }
    }

    /**
     * Draw all river edges - handles branches and junctions
     * Uses multi-pass rendering for feathered edges
     */
    drawRivers(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        // Use level-0 tiles only (rivers are stored on base tiles, not sub-tiles)
        const tiles = this.world.getTilesAtLevel(0).filter(t => t.intersectsViewport(viewport));

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Collect river segments to draw
        const segments = [];
        const drawnEdges = new Set();

        for (const tile of tiles) {
            if (tile.riverEdges.length === 0) continue;

            for (const neighborId of tile.riverEdges) {
                const edgeKey = tile.id < neighborId ? `${tile.id}-${neighborId}` : `${neighborId}-${tile.id}`;
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighbor = this.world.getTile(neighborId);
                if (!neighbor) continue;

                const sharedEdge = this.findSharedEdge(tile.vertices, neighbor.vertices);
                if (!sharedEdge) continue;

                const flow = Math.min((tile.riverFlow || 1) + (neighbor.riverFlow || 1), 20) / 2;
                const mid = [
                    (sharedEdge[0][0] + sharedEdge[1][0]) / 2,
                    (sharedEdge[0][1] + sharedEdge[1][1]) / 2
                ];

                // Stop at edge when reaching water - don't draw into water tile centers
                const from = tile.isWater ? mid : tile.center;
                const to = neighbor.isWater ? mid : neighbor.center;

                // Skip if both are water (nothing to draw)
                if (tile.isWater && neighbor.isWater) continue;

                segments.push({
                    from,
                    mid,
                    to,
                    flow
                });
            }
        }

        // Get river color from theme (10% darker than ocean)
        const { h, s, l } = this.theme.getRiverHSL();
        const riverL = Math.max(5, l - 10);

        // Zoom-based scaling: thinner and more transparent when zoomed out
        // Power formula: scale^power where power>1 makes rivers thinner at low zoom
        const { zoomWidthPower, zoomOpacityMin, zoomOpacityScale } = CONFIG.rendering.rivers;
        const zoomWidth = Math.pow(Math.min(1, camera.scale), zoomWidthPower);
        const zoomOpacity = Math.min(1, zoomOpacityMin + camera.scale * zoomOpacityScale);

        // Only draw feathering when zoomed in enough (scale > 1.5 = 150% zoom)
        const drawFeathering = camera.scale > 1.5;

        if (drawFeathering) {
            // Pass 1: Outer glow
            ctx.strokeStyle = `hsla(${h}, ${s}%, ${riverL + 5}%, 0.12)`;
            for (const seg of segments) {
                ctx.lineWidth = (5 + seg.flow * 0.6) * zoomWidth / camera.scale;
                ctx.beginPath();
                ctx.moveTo(seg.from[0], seg.from[1]);
                ctx.lineTo(seg.mid[0], seg.mid[1]);
                ctx.lineTo(seg.to[0], seg.to[1]);
                ctx.stroke();
            }

            // Pass 2: Middle blend
            ctx.strokeStyle = `hsla(${h}, ${s}%, ${riverL + 3}%, 0.25)`;
            for (const seg of segments) {
                ctx.lineWidth = (3.5 + seg.flow * 0.5) * zoomWidth / camera.scale;
                ctx.beginPath();
                ctx.moveTo(seg.from[0], seg.from[1]);
                ctx.lineTo(seg.mid[0], seg.mid[1]);
                ctx.lineTo(seg.to[0], seg.to[1]);
                ctx.stroke();
            }
        }

        // Core - always drawn
        ctx.strokeStyle = `hsla(${h}, ${s}%, ${riverL}%, ${CONFIG.rendering.rivers.coreOpacity * zoomOpacity})`;
        for (const seg of segments) {
            ctx.lineWidth = (CONFIG.rendering.rivers.coreWidth + seg.flow * CONFIG.rendering.rivers.flowWidthMultiplier) * zoomWidth / camera.scale;
            ctx.beginPath();
            ctx.moveTo(seg.from[0], seg.from[1]);
            ctx.lineTo(seg.mid[0], seg.mid[1]);
            ctx.lineTo(seg.to[0], seg.to[1]);
            ctx.stroke();
        }
    }

    /**
     * Draw roads connecting POIs
     */
    drawRoads(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        // Use level-0 tiles only (roads are stored on base tiles, not sub-tiles)
        const tiles = this.world.getTilesAtLevel(0).filter(t => t.intersectsViewport(viewport));
        const drawnEdges = new Set();

        const config = CONFIG.roads?.rendering || {};
        const color = config.color || { h: 35, s: 30, l: 40 };
        const opacity = config.opacity || 0.7;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Group road edges by type for batch rendering
        const roadSegments = { major: [], minor: [], path: [] };

        for (const tile of tiles) {
            if (!tile.roadEdges || tile.roadEdges.length === 0) continue;

            for (const neighborId of tile.roadEdges) {
                const edgeKey = tile.id < neighborId
                    ? `${tile.id}-${neighborId}`
                    : `${neighborId}-${tile.id}`;
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighbor = this.world.getTile(neighborId);
                if (!neighbor) continue;

                // Determine road type from road metadata
                const roadType = this.getRoadTypeForEdge(tile.id, neighborId);

                roadSegments[roadType].push({
                    from: tile.center,
                    to: neighbor.center
                });
            }
        }

        // Draw paths first (bottom), then minor, then major (top)
        const widths = {
            path: config.pathWidth || 1,
            minor: config.minorWidth || 2,
            major: config.majorWidth || 3
        };

        for (const type of ['path', 'minor', 'major']) {
            if (roadSegments[type].length === 0) continue;

            ctx.strokeStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${opacity})`;
            ctx.lineWidth = widths[type] / camera.scale;

            ctx.beginPath();
            for (const seg of roadSegments[type]) {
                ctx.moveTo(seg.from[0], seg.from[1]);
                ctx.lineTo(seg.to[0], seg.to[1]);
            }
            ctx.stroke();
        }
    }

    /**
     * Get road type for a tile edge by checking road metadata
     */
    getRoadTypeForEdge(tileId1, tileId2) {
        if (!this.world) return 'path';

        // Check roads to find type
        for (const road of this.world.getAllRoads()) {
            const tiles = road.tileIds;
            for (let i = 0; i < tiles.length - 1; i++) {
                if ((tiles[i] === tileId1 && tiles[i + 1] === tileId2) ||
                    (tiles[i] === tileId2 && tiles[i + 1] === tileId1)) {
                    return road.type;
                }
            }
        }
        return 'path';  // Default
    }

    /**
     * Draw region borders between different kingdoms
     */
    drawRegionBorders(ctx, camera) {
        if (!this.world) return;

        const viewport = camera.getViewport();
        const tiles = this.world.getTilesInViewport(viewport, camera.zoom);
        const drawnEdges = new Set();

        const config = CONFIG.regions || {};
        const borderWidth = config.borderWidth || 2;
        const borderOpacity = config.borderOpacity || 0.7;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const tile of tiles) {
            if (tile.regionId === null) continue;

            for (const neighborId of tile.neighbors) {
                // Skip duplicate edges
                const edgeKey = tile.id < neighborId
                    ? `${tile.id}-${neighborId}`
                    : `${neighborId}-${tile.id}`;
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighbor = this.world.getTile(neighborId);
                if (!neighbor) continue;

                // Draw border if different regions (and neighbor has a region)
                if (tile.regionId !== neighbor.regionId && neighbor.regionId !== null) {
                    const sharedEdge = this.findSharedEdge(tile.vertices, neighbor.vertices);
                    if (!sharedEdge) continue;

                    // Get region color for border
                    const region = this.world.getRegion(tile.regionId);
                    const color = region?.color || { h: 0, s: 0, l: 50 };

                    ctx.strokeStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${borderOpacity})`;
                    ctx.lineWidth = borderWidth / camera.scale;

                    ctx.beginPath();
                    ctx.moveTo(sharedEdge[0][0], sharedEdge[0][1]);
                    ctx.lineTo(sharedEdge[1][0], sharedEdge[1][1]);
                    ctx.stroke();
                }
            }
        }
    }

    /**
     * Draw highlight outline around the selected region's tiles
     */
    drawSelectedRegion(ctx, camera) {
        if (!this.world || this.selectedRegionId === null) return;

        const viewport = camera.getViewport();
        const tiles = this.world.getTilesInViewport(viewport, camera.zoom);

        // Get region color
        const region = this.world.getRegion(this.selectedRegionId);
        const color = region?.color || { h: 0, s: 0, l: 50 };

        // Draw outer edges of selected region (edges where neighbor is different region or water)
        const drawnEdges = new Set();

        ctx.strokeStyle = `hsla(${color.h}, ${Math.min(100, color.s + 30)}%, ${Math.min(90, color.l + 20)}%, 0.9)`;
        ctx.lineWidth = 3 / camera.scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const tile of tiles) {
            if (tile.regionId !== this.selectedRegionId) continue;

            for (const neighborId of tile.neighbors) {
                const edgeKey = tile.id < neighborId
                    ? `${tile.id}-${neighborId}`
                    : `${neighborId}-${tile.id}`;
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const neighbor = this.world.getTile(neighborId);

                // Draw edge if neighbor is different region, water, or doesn't exist
                const isDifferentRegion = !neighbor || neighbor.regionId !== this.selectedRegionId;
                if (isDifferentRegion) {
                    const sharedEdge = neighbor
                        ? this.findSharedEdge(tile.vertices, neighbor.vertices)
                        : null;

                    if (sharedEdge) {
                        ctx.beginPath();
                        ctx.moveTo(sharedEdge[0][0], sharedEdge[0][1]);
                        ctx.lineTo(sharedEdge[1][0], sharedEdge[1][1]);
                        ctx.stroke();
                    }
                }
            }
        }
    }

    /**
     * Find the shared edge between two tile polygons
     */
    findSharedEdge(verticesA, verticesB) {
        const shared = [];
        const epsilon = 0.001;

        for (const vA of verticesA) {
            for (const vB of verticesB) {
                if (Math.abs(vA[0] - vB[0]) < epsilon && Math.abs(vA[1] - vB[1]) < epsilon) {
                    shared.push(vA);
                    break;
                }
            }
        }

        return shared.length >= 2 ? [shared[0], shared[1]] : null;
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
        seed: CONFIG.seed,
        worldWidth: CONFIG.world.width,
        worldHeight: CONFIG.world.height
    });

    generator.init();

    // Expose to window for debugging
    window.mapGenerator = generator;
});

export { MapGenerator };
