# Fantasy Map Generator

A procedural fantasy map generator using Voronoi diagrams, built with Vanilla JavaScript.

## Tech Stack

- Vanilla JavaScript (ES6+ modules)
- HTML5 Canvas (for map rendering)
- CSS3

## Dependencies

- `d3-delaunay` - Voronoi diagram generation
- `seedrandom` - Seeded random number generation for reproducible worlds
- `simplex-noise` - Terrain noise generation (elevation, moisture)

## Commands

```bash
# Install dependencies
npm install

# Open index.html in browser to run
# (No build step required - uses ES modules directly)
```

## Project Structure

```
fanticy-map-generator/
├── index.html              # Main HTML entry point
├── src/
│   ├── main.js             # Application entry point
│   ├── canvas/             # Canvas viewer (pan/zoom)
│   ├── generation/         # World generation algorithms
│   ├── data/               # Tile/POI data structures
│   └── utils/
│       ├── random.js       # Seeded random wrapper
│       └── noise.js        # Simplex noise wrapper
├── styles/
│   └── main.css            # Styles
├── assets/                 # Textures, icons (future)
├── package.json
└── CLAUDE.md
```

## Architecture

### Tile Structure
Each Voronoi cell is a tile with: id, parentId, zoomLevel, biome, elevation, moisture, temperature, terrain, isWater, waterDepth, riverEdges, isCoastal, regionId, neighbors, roadEdges, center, vertices, detailGenerated, traversability

### Zoom Levels
0. World view - continental scale
1. Area view - regional scale
2. City view - local scale
3. Building/Dungeon view - detail scale

### Generation Order
1. Voronoi cells from seeded points
2. Elevation via Perlin/Simplex noise
3. Temperature (latitude + elevation)
4. Moisture (Perlin layer)
5. Biomes (lookup from elevation/temp/moisture)
6. Water features (rivers flow downhill, lakes in bowls)
7. POIs and settlements
8. Regions (grow from capitals)
9. Roads (connect POIs)

## Debugging

Access generator in browser console:
```js
window.mapGenerator
window.mapGenerator.rng      // Seeded random
window.mapGenerator.noise    // Noise generator
```
