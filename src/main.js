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
import { CityGenerator } from './generation/CityGenerator.js';
import { Theme } from './rendering/Theme.js';
import { CONFIG } from './config.js';
import { configLoader } from './utils/ConfigLoader.js';
import { POI } from './data/POI.js';

/**
 * Fantasy Map Generator
 * Main entry point
 */
class MapGenerator {
    constructor(config = {}) {
        // Use merged config from configLoader
        const mergedConfig = configLoader.getConfig();

        this.config = {
            seed: config.seed || mergedConfig.seed || 'default',
            worldWidth: config.worldWidth || mergedConfig.world.width,
            worldHeight: config.worldHeight || mergedConfig.world.height,
            ...config
        };

        this.canvas = null;
        this.ctx = null;
        this.viewer = null;

        this.initGenerators(mergedConfig);

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
     * Initialize all generators with config
     */
    initGenerators(cfg) {
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
        this.riverRng = new SeededRandom(cfg.water?.riverSeed || 'rivers-1');
        this.waterGenerator = new WaterGenerator(this.riverRng);

        // Separate RNG for POIs
        this.poiRng = new SeededRandom(cfg.pois?.seed || 'pois-1');
        this.poiGenerator = new POIGenerator(this.poiRng);

        // Separate RNG for regions
        this.regionRng = new SeededRandom(cfg.regions?.seed || 'regions-1');
        this.regionGenerator = new RegionGenerator(this.regionRng);

        // Separate RNG for roads
        this.roadRng = new SeededRandom(cfg.roads?.seed || 'roads-1');
        this.roadGenerator = new RoadGenerator(this.roadRng);

        // City generation for settlement detail views
        this.cityGenerator = new CityGenerator();

        // Sub-tile generation for hierarchical zoom
        this.subTileGenerator = new SubTileGenerator(this.noise);
        this.tileLoadManager = null; // Created after world generation
    }

    /**
     * Regenerate world with new config (after config override)
     */
    regenerateWithConfig() {
        const mergedConfig = configLoader.getConfig();

        // Update config values
        this.config.seed = mergedConfig.seed || this.config.seed;
        this.config.worldWidth = mergedConfig.world?.width || this.config.worldWidth;
        this.config.worldHeight = mergedConfig.world?.height || this.config.worldHeight;

        // Reinitialize generators with new config
        this.initGenerators(mergedConfig);

        // Regenerate world
        this.generateWorld();

        // Re-render
        if (this.viewer) {
            this.viewer.render();
        }

        console.log('World regenerated with new config');
    }

    /**
     * Handle config file upload from browser
     */
    async handleConfigUpload(file) {
        try {
            await configLoader.loadFromFile(file);
            this.regenerateWithConfig();
            return true;
        } catch (err) {
            console.error('Config upload failed:', err.message);
            return false;
        }
    }

    /**
     * Reset config to defaults and regenerate
     */
    resetConfig() {
        configLoader.reset();
        this.regenerateWithConfig();
        console.log('Config reset to defaults');
    }

    /**
     * Add custom POIs from config to the world
     * Custom POIs are defined in config.customPOIs array
     */
    addCustomPOIs() {
        const cfg = configLoader.getConfig();
        const customPOIs = cfg.customPOIs || [];

        if (customPOIs.length === 0) return;

        let addedCount = 0;
        for (const poiData of customPOIs) {
            // Validate required fields
            if (!poiData.name || !poiData.position) {
                console.warn('Custom POI missing name or position:', poiData);
                continue;
            }

            const [x, y] = poiData.position;

            // Find the tile at this position
            const tile = this.world.getTileAtPosition(x, y);
            if (!tile) {
                console.warn(`Custom POI "${poiData.name}" at [${x}, ${y}] is outside world bounds`);
                continue;
            }

            // Create the POI
            const poi = new POI({
                id: this.world.nextPoiId++,
                name: poiData.name,
                type: poiData.type || 'ruins',
                position: [x, y],
                tileId: tile.id,
                size: poiData.size || 'medium',
                population: poiData.population || 0,
                regionId: tile.regionId,
                isCapital: false,
                // Custom POIs visible at all zoom levels by default
                minZoom: poiData.minZoom ?? -100,
                maxZoom: poiData.maxZoom ?? 100
            });

            // Store custom description if provided
            if (poiData.description) {
                poi.description = poiData.description;
            }

            this.world.addPOI(poi);

            // Apply biome override if specified
            if (poiData.biome) {
                const radius = poiData.biomeRadius ?? 3;
                this.applyBiomeOverride(tile, poiData.biome, radius);
            }

            addedCount++;
        }

        if (addedCount > 0) {
            console.log(`Added ${addedCount} custom POIs from config`);
        }
    }

    /**
     * Apply POI replacements from config
     * Matches generated POIs by name and overrides specified fields
     */
    applyPOIReplacements() {
        const cfg = configLoader.getConfig();
        const replacements = cfg.replacePOIs || [];

        if (replacements.length === 0) return;

        let replacedCount = 0;
        for (const repl of replacements) {
            if (!repl.match) {
                console.warn('replacePOIs entry missing "match" field:', repl);
                continue;
            }

            // Find the POI by name
            let target = null;
            for (const poi of this.world.pois.values()) {
                if (poi.name === repl.match) {
                    target = poi;
                    break;
                }
            }

            if (!target) {
                console.warn(`replacePOIs: no POI found matching "${repl.match}"`);
                continue;
            }

            // Apply overrides
            if (repl.name !== undefined) target.name = repl.name;
            if (repl.type !== undefined) target.type = repl.type;
            if (repl.size !== undefined) target.size = repl.size;
            if (repl.population !== undefined) target.population = repl.population;
            if (repl.description !== undefined) target.description = repl.description;
            if (repl.minZoom !== undefined) target.minZoom = repl.minZoom;
            if (repl.maxZoom !== undefined) target.maxZoom = repl.maxZoom;

            // Apply biome override around the POI's tile
            if (repl.biome) {
                const tile = this.world.getTile(target.tileId);
                if (tile) {
                    const radius = repl.biomeRadius ?? 3;
                    this.applyBiomeOverride(tile, repl.biome, radius);
                }
            }

            replacedCount++;
            console.log(`Replaced POI "${repl.match}" → "${target.name}"`);
        }

        if (replacedCount > 0) {
            console.log(`Applied ${replacedCount} POI replacements from config`);
        }
    }

    /**
     * Override the biome on tiles radiating outward from a center tile
     * Uses BFS rings with blending at the edges for a natural transition
     * @param {Tile} centerTile - The tile to start from
     * @param {string} biome - Biome name to apply (e.g. 'temperate_forest')
     * @param {number} radius - Number of rings outward from center
     */
    applyBiomeOverride(centerTile, biome, radius) {
        centerTile.biome = biome;

        if (radius <= 0) return;

        const visited = new Set([centerTile.id]);
        let currentRing = [centerTile];
        let changed = 1;

        for (let ring = 1; ring <= radius; ring++) {
            const nextRing = [];
            for (const tile of currentRing) {
                for (const neighborId of tile.neighbors) {
                    if (visited.has(neighborId)) continue;
                    visited.add(neighborId);

                    const neighbor = this.world.getTile(neighborId);
                    if (!neighbor || neighbor.isWater) continue;

                    if (ring < radius) {
                        // Inner rings: full biome override
                        neighbor.biome = biome;
                    } else {
                        // Outer ring: blend toward the new biome for soft edges
                        neighbor.blendBiome = biome;
                        neighbor.blendFactor = 0.5;
                    }

                    nextRing.push(neighbor);
                    changed++;
                }
            }
            currentRing = nextRing;
        }

        console.log(`Biome override: set ${changed} tiles to "${biome}" (radius ${radius})`);
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

        // Setup config upload button
        const configUploadBtn = document.getElementById('config-upload-btn');
        const configFileInput = document.getElementById('config-file-input');
        if (configUploadBtn && configFileInput) {
            configUploadBtn.addEventListener('click', () => {
                configFileInput.click();
            });

            configFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const success = await this.handleConfigUpload(file);
                    if (success) {
                        configUploadBtn.textContent = 'Config loaded!';
                        setTimeout(() => {
                            configUploadBtn.textContent = 'Upload Config';
                        }, 2000);
                    } else {
                        configUploadBtn.textContent = 'Upload failed';
                        setTimeout(() => {
                            configUploadBtn.textContent = 'Upload Config';
                        }, 2000);
                    }
                    // Reset input so same file can be re-uploaded
                    configFileInput.value = '';
                }
            });
        }

        // Setup config reset button
        const configResetBtn = document.getElementById('config-reset-btn');
        if (configResetBtn) {
            configResetBtn.addEventListener('click', () => {
                this.resetConfig();
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

        // Add custom POIs from config (after regions so they get regionId)
        this.addCustomPOIs();

        // Apply POI replacements (rename/modify generated POIs)
        this.applyPOIReplacements();

        // Generate roads (connect POIs with pathfinding)
        this.roadGenerator.generate(this.world);

        // Pre-build road type lookup for O(1) edge queries
        this.roadEdgeTypes = new Map();
        for (const road of this.world.getAllRoads()) {
            const tileIds = road.tileIds;
            for (let i = 0; i < tileIds.length - 1; i++) {
                const a = tileIds[i], b = tileIds[i + 1];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                this.roadEdgeTypes.set(key, road.type);
            }
        }

        // Set zoom thresholds from config
        this.world.setZoomThresholds(CONFIG.subtiles?.zoomThresholds || [0, 40, 60, 80]);

        // Create tile load manager for hierarchical sub-tiles
        this.tileLoadManager = new TileLoadManager(
            this.world,
            this.subTileGenerator,
            {
                seed: this.config.seed,
                onCityModeChange: (event) => this.handleCityModeChange(event)
            }
        );
    }

    /**
     * Handle city mode transitions (entering/exiting settlement detail view)
     * @param {Object} event - City mode change event
     * @param {boolean} event.entering - True if entering city mode
     * @param {boolean} event.exiting - True if exiting city mode
     * @param {POI} event.poi - The settlement POI (null when exiting)
     */
    handleCityModeChange(event) {
        if (event.entering) {
            // Generate city when entering city mode
            const city = this.cityGenerator.generate(
                event.poi,
                this.world,
                this.config.seed
            );
            // Store city in the cityMode state
            this.tileLoadManager.cityMode.city = city;
            console.log(`Entered city mode: ${city.name}, streets: ${city.streets?.edges?.size ?? 0}`);
        } else if (event.exiting) {
            console.log('Exited city mode');
        }
        // Re-render to show/hide city streets
        this.viewer.render();
    }

    /**
     * Render the world (called by viewer with camera transform applied)
     */
    renderWorld(ctx, camera) {
        const { worldWidth, worldHeight } = this.config;
        const viewport = camera.getViewport();

        // Update sub-tile loading based on viewport and zoom
        if (this.tileLoadManager) {
            this.tileLoadManager.update(viewport, camera.zoom);
        }

        // Cache viewport tile queries for this frame (avoid redundant spatial lookups)
        const viewportTiles = this.world.getTilesInViewport(viewport, camera.zoom);
        const level0Tiles = this.world.getLevel0TilesInViewport(viewport);

        // Draw tiles
        this.drawTiles(ctx, camera, viewportTiles);

        // Draw rivers
        this.drawRivers(ctx, camera, level0Tiles);

        // Draw roads
        this.drawRoads(ctx, camera, level0Tiles);

        // Draw city streets and buildings when in city mode
        if (this.tileLoadManager && this.tileLoadManager.isInCityMode()) {
            this.drawCityStreets(ctx, camera);
            this.drawCityBuildings(ctx, camera);
        }

        // Draw region borders and selection (if enabled)
        if (this.showRegions) {
            this.drawRegionBorders(ctx, camera, viewportTiles);
            this.drawSelectedRegion(ctx, camera, viewportTiles);
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
     * Draw Voronoi tiles (batched by fill color using cached Path2D)
     */
    drawTiles(ctx, camera, tiles) {
        if (!this.world) return;

        if (this.showGradientBlend) {
            // Gradient mode: per-tile gradient draws (cannot batch)
            for (const tile of tiles) {
                if (tile.vertices.length < 3) continue;
                this.drawTileWithGradient(ctx, tile);
            }
        } else {
            // Batch tiles by fill color for fewer state changes
            const colorGroups = new Map();
            for (const tile of tiles) {
                const path = tile.getPath2D();
                if (!path) continue;
                const fillColor = this.theme.getTileColor(tile);
                let group = colorGroups.get(fillColor);
                if (!group) {
                    group = [];
                    colorGroups.set(fillColor, group);
                }
                group.push(path);
            }

            // Fill + anti-aliasing gap stroke batched per color
            const gapWidth = 1 / camera.scale;
            for (const [color, paths] of colorGroups) {
                ctx.fillStyle = color;
                ctx.strokeStyle = color;
                ctx.lineWidth = gapWidth;
                for (const path of paths) {
                    ctx.fill(path);
                    ctx.stroke(path);
                }
            }
        }

        // Tile borders (if enabled) — batch into a single stroke pass
        if (this.showTileBorders) {
            ctx.strokeStyle = this.theme.getTileStroke();
            ctx.lineWidth = 1 / camera.scale;
            for (const tile of tiles) {
                const path = tile.getPath2D();
                if (path) ctx.stroke(path);
            }
        }
    }

    /**
     * Draw a tile with directional gradients blending toward each neighbor
     */
    drawTileWithGradient(ctx, tile) {
        const [cx, cy] = tile.center;
        const vertices = tile.vertices;
        const tileHSL = this.theme.getTileHSL(tile);
        const tileColor = `hsl(${tileHSL.h}, ${tileHSL.s}%, ${tileHSL.l}%)`;

        // Draw solid base color first to prevent gaps between triangles
        ctx.beginPath();
        ctx.moveTo(vertices[0][0], vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i][0], vertices[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = tileColor;
        ctx.fill();

        // Build edge-to-neighbor map
        const edgeNeighbors = this.getEdgeNeighborMap(tile);

        // Draw each triangle segment from center to edge
        for (let i = 0; i < vertices.length; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % vertices.length];

            // Find which neighbor shares this edge
            const edgeKey = this.makeEdgeKey(v1, v2);
            const neighborId = edgeNeighbors.get(edgeKey);
            const neighbor = neighborId !== undefined ? this.world.getTile(neighborId) : null;

            // Calculate edge midpoint for gradient direction
            const edgeMidX = (v1[0] + v2[0]) / 2;
            const edgeMidY = (v1[1] + v2[1]) / 2;

            // Create linear gradient from center toward edge midpoint
            const gradient = ctx.createLinearGradient(cx, cy, edgeMidX, edgeMidY);
            gradient.addColorStop(0, tileColor);
            gradient.addColorStop(0.9, tileColor);  // Stay solid until 75%

            if (neighbor && !neighbor.isWater) {
                const nHSL = this.theme.getTileHSL(neighbor);
                // Blend 35% toward neighbor at edge (subtle blend)
                const blendH = this.lerpHue(tileHSL.h, nHSL.h, 0.35);
                const blendS = tileHSL.s * 0.65 + nHSL.s * 0.35;
                const blendL = tileHSL.l * 0.65 + nHSL.l * 0.35;
                gradient.addColorStop(1, `hsl(${blendH}, ${blendS}%, ${blendL}%)`);
            } else {
                // No blend for water neighbors or missing neighbors
                gradient.addColorStop(1, tileColor);
            }

            // Draw triangle: center -> v1 -> v2
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(v1[0], v1[1]);
            ctx.lineTo(v2[0], v2[1]);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Add thin stroke in tile color to cover anti-aliasing gaps between tiles
        ctx.beginPath();
        ctx.moveTo(vertices[0][0], vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i][0], vertices[i][1]);
        }
        ctx.closePath();
        ctx.strokeStyle = tileColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    /**
     * Build a map of edge keys to neighbor tile IDs
     */
    getEdgeNeighborMap(tile) {
        const edgeNeighbors = new Map();

        for (const neighborId of tile.neighbors) {
            const sharedEdge = this.world.getSharedEdge(tile.id, neighborId);
            if (sharedEdge) {
                const edgeKey = this.makeEdgeKey(sharedEdge[0], sharedEdge[1]);
                edgeNeighbors.set(edgeKey, neighborId);
            }
        }

        return edgeNeighbors;
    }

    /**
     * Create a consistent key for an edge (vertex pair)
     */
    makeEdgeKey(v1, v2) {
        const k1 = `${v1[0].toFixed(2)},${v1[1].toFixed(2)}`;
        const k2 = `${v2[0].toFixed(2)},${v2[1].toFixed(2)}`;
        return k1 < k2 ? `${k1}-${k2}` : `${k2}-${k1}`;
    }

    /**
     * Interpolate between two hue values (handling wrap-around)
     */
    lerpHue(h1, h2, t) {
        let diff = h2 - h1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return (h1 + diff * t + 360) % 360;
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
            ${poi.description ? `<div class="poi-description">${poi.description}</div>` : ''}
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
                        const sharedEdge = this.world.getSharedEdge(tile.id, neighborId);
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
    drawRivers(ctx, camera, tiles) {
        if (!this.world) return;

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

                const sharedEdge = this.world.getSharedEdge(tile.id, neighborId);
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
    drawRoads(ctx, camera, tiles) {
        if (!this.world) return;

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
     * Get road type for a tile edge (O(1) lookup from pre-built map)
     */
    getRoadTypeForEdge(tileId1, tileId2) {
        if (!this.roadEdgeTypes) return 'path';
        const key = tileId1 < tileId2 ? `${tileId1}-${tileId2}` : `${tileId2}-${tileId1}`;
        return this.roadEdgeTypes.get(key) || 'path';
    }

    /**
     * Draw city streets when in city mode
     * Streets are rendered as lines connecting street nodes
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} camera - Camera with scale and viewport
     */
    drawCityStreets(ctx, camera) {
        const cityMode = this.tileLoadManager.getCityModeState();
        if (!cityMode.city || !cityMode.city.streets) return;

        const network = cityMode.city.streets;
        if (!network.nodes || !network.edges) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Street widths by type (in world units)
        const streetWidths = {
            main: 8,
            district: 5,
            alley: 2
        };

        // Draw edges by type: alleys first (bottom), then district, then main (top)
        // This ensures main roads are rendered on top of smaller streets
        for (const type of ['alley', 'district', 'main']) {
            ctx.strokeStyle = this.theme.getStreetColor(type);

            for (const edge of network.edges.values()) {
                if (edge.type !== type) continue;

                const nodeA = network.nodes.get(edge.nodeIdA);
                const nodeB = network.nodes.get(edge.nodeIdB);
                if (!nodeA || !nodeB) continue;

                // Use edge.width if defined, otherwise fall back to type-based width
                const width = edge.width ?? streetWidths[type] ?? 2;
                ctx.lineWidth = width / camera.scale;

                ctx.beginPath();
                ctx.moveTo(nodeA.position[0], nodeA.position[1]);
                ctx.lineTo(nodeB.position[0], nodeB.position[1]);
                ctx.stroke();
            }
        }

        // Optional: Draw street outlines for definition
        // Uses a darker stroke on top for visual separation
        ctx.strokeStyle = this.theme.getStreetStrokeColor();
        for (const type of ['alley', 'district', 'main']) {
            const outlineWidth = type === 'main' ? 0.8 : type === 'district' ? 0.5 : 0.3;

            for (const edge of network.edges.values()) {
                if (edge.type !== type) continue;

                const nodeA = network.nodes.get(edge.nodeIdA);
                const nodeB = network.nodes.get(edge.nodeIdB);
                if (!nodeA || !nodeB) continue;

                ctx.lineWidth = outlineWidth / camera.scale;

                ctx.beginPath();
                ctx.moveTo(nodeA.position[0], nodeA.position[1]);
                ctx.lineTo(nodeB.position[0], nodeB.position[1]);
                ctx.stroke();
            }
        }

        // Draw special nodes (gates, plazas, intersections) if they have a visible type
        const specialNodeTypes = ['gate', 'plaza', 'market', 'well'];
        ctx.fillStyle = this.theme.getStreetStrokeColor();

        for (const node of network.nodes.values()) {
            if (!node.type || !specialNodeTypes.includes(node.type)) continue;

            const radius = (node.type === 'plaza' || node.type === 'market') ? 4 : 2;
            ctx.beginPath();
            ctx.arc(node.position[0], node.position[1], radius / camera.scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Draw buildings in city mode
     * Buildings are rendered as filled polygons with optional shadows
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} camera - Camera with scale and viewport
     */
    drawCityBuildings(ctx, camera) {
        const cityMode = this.tileLoadManager.getCityModeState();
        if (!cityMode.city || !cityMode.city.buildings) return;

        const buildings = cityMode.city.buildings;
        if (buildings.length === 0) return;

        // Sort by Y position for pseudo-3D (back to front rendering)
        const sorted = [...buildings].sort((a, b) => {
            const aY = a.position ? a.position[1] : a.vertices[0][1];
            const bY = b.position ? b.position[1] : b.vertices[0][1];
            return aY - bY;
        });

        for (const building of sorted) {
            if (!building.vertices || building.vertices.length < 3) continue;

            // Draw shadow first (offset by height)
            if (building.height > 0.5) {
                const shadowOffset = building.height * 3 / camera.scale;
                ctx.fillStyle = this.theme.getBuildingShadowColor();
                ctx.beginPath();
                ctx.moveTo(
                    building.vertices[0][0] + shadowOffset,
                    building.vertices[0][1] + shadowOffset
                );
                for (let i = 1; i < building.vertices.length; i++) {
                    ctx.lineTo(
                        building.vertices[i][0] + shadowOffset,
                        building.vertices[i][1] + shadowOffset
                    );
                }
                ctx.closePath();
                ctx.fill();
            }

            // Draw building fill
            ctx.fillStyle = building.color || this.theme.getBuildingColor(building.type);
            ctx.strokeStyle = this.theme.getBuildingStrokeColor();
            ctx.lineWidth = 1 / camera.scale;

            ctx.beginPath();
            ctx.moveTo(building.vertices[0][0], building.vertices[0][1]);
            for (let i = 1; i < building.vertices.length; i++) {
                ctx.lineTo(building.vertices[i][0], building.vertices[i][1]);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    /**
     * Draw region borders between different kingdoms
     */
    drawRegionBorders(ctx, camera, tiles) {
        if (!this.world) return;

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
                    const sharedEdge = this.world.getSharedEdge(tile.id, neighborId);
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
    drawSelectedRegion(ctx, camera, tiles) {
        if (!this.world || this.selectedRegionId === null) return;

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
                        ? this.world.getSharedEdge(tile.id, neighborId)
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
document.addEventListener('DOMContentLoaded', async () => {
    // Load config overrides from config/ folder (if any)
    await configLoader.loadFromFileSystem();

    const mergedConfig = configLoader.getConfig();

    const generator = new MapGenerator({
        seed: mergedConfig.seed,
        worldWidth: mergedConfig.world.width,
        worldHeight: mergedConfig.world.height
    });

    generator.init();

    // Expose to window for debugging
    window.mapGenerator = generator;
    window.configLoader = configLoader;
});

export { MapGenerator };
