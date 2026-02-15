# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy Map Generator — a browser-based procedural world generation tool for tabletop campaigns. Generates terrain, biomes, rivers, POIs, regions, roads, and cities with hierarchical zoom (4 levels). Built with vanilla ES6 modules, Canvas 2D rendering, and Vite.

## Commands

```bash
npm start              # Vite dev server on :8765
npm run build          # Production build to dist/
npm test               # Runs tests/CityMode.test.js
node tests/<file>.js   # Run a single test file
```

Tests use a custom framework (no test runner dependency) — each test file is a standalone Node script with `test()`, `describe()`, `expect()` functions defined inline.

## Architecture

### Generation Pipeline

`MapGenerator` (src/main.js) orchestrates generation in this fixed order:

1. **VoronoiGenerator** — Delaunay triangulation → Voronoi cells → Lloyd's relaxation (~15k tiles)
2. **ElevationGenerator** — Multi-octave simplex noise (continental + mountain + detail layers)
3. **TemperatureGenerator** — Latitude-based + elevation penalty + noise
4. **MoistureGenerator** — Multi-octave noise for precipitation
5. **BiomeGenerator** — Whittaker diagram lookup (temperature × moisture → 13 biomes)
6. **WaterGenerator** — Downhill flow, bowl detection → lakes, overflow continuation
7. **POIGenerator** — Settlement/dungeon/temple placement with biome preferences and spacing
8. **RegionGenerator** — Kingdom borders grown outward from capitals
9. **RoadGenerator** — A* pathfinding between POIs with terrain-weighted costs

City generation (CityGenerator → StreetGenerator → BuildingGenerator) triggers on-demand when zooming into a settlement.

### Key Design Patterns

**Seeded determinism:** Every generator receives a separate `SeededRandom` instance (seedrandom library). Same seed = same world. Never use `Math.random()`.

**Edge-based features:** Rivers and roads are stored as shared edges between adjacent tiles — both tiles must agree on the edge. The tile with the lower ID decides.

**Hierarchical zoom:** 4 levels (Overview → World → Area → City/Building). `SubTileGenerator` creates child tiles on-demand; `TileLoadManager` evicts via LRU (max 50 loaded parents). Tiles have `minZoom`/`maxZoom` for LOD visibility.

**Viewport rendering:** Only tiles/POIs within the current viewport are drawn. `World.getTilesInViewport()` and `World.getPOIsInViewport()` handle spatial filtering.

### Module Layout

- `src/data/` — Data models: `World` (spatial container), `Tile` (Voronoi cell), `POI`, `City`, `Building`, `StreetNetwork` (graph: nodes + edges)
- `src/generation/` — All procedural generators (executed in pipeline order above)
- `src/canvas/` — `Camera` (pan/zoom transforms, 4 zoom levels), `CanvasViewer` (Canvas 2D events, inertia scrolling, render loop)
- `src/rendering/` — `Theme` (biome color palettes, hillshading)
- `src/utils/` — `random.js` (seeded RNG), `noise.js` (simplex), `polygon.js` (geometry), `ConfigLoader.js` (YAML config)
- `src/config.js` — Central CONFIG object with all tunable parameters

### Configuration System

`config/index.yaml` can import other YAML files (e.g., `pois.yaml` for custom POI definitions). `ConfigLoader` deep-merges YAML overrides on top of defaults from `src/config.js`. Users can also upload config files through the UI.

### Rendering Order (in renderWorld)

Tiles (with optional gradient blending) → Rivers (3-pass: glow/blend/core) → Roads (paths → minor → major) → City streets/buildings → Region borders → POIs (zoom-aware: dots → symbols → labels) → Grid overlay → World boundary.
