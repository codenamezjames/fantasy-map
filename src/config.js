/**
 * Central configuration for Fantasy Map Generator
 * Edit these values to tweak world generation
 */

export const CONFIG = {
    seed: 'cassini',  // Base seed for world generation
    // World settings
    world: {
        width: 2000,
        height: 2000,
        tileCount: 30000,
        relaxationIterations: 2,
        densityContrast: 3,      // Land tiles are this many times denser than ocean (1 = uniform)
        // Biome-based density multipliers (higher = more tiles/smaller cells)
        biomeDensity: {
            forest: 1.5,         // Dense tiles in forests
            desert: 0.4,         // Sparse tiles in deserts
            tundra: 0.5,         // Sparse tiles in tundra
            grassland: 0.9,      // Normal density
            default: 1           // Fallback
        }
    },

    // Elevation settings
    elevation: {
        seaLevel: 0.53,          // Tiles below this are water (~60% water at 0.53)
        edgeMargin: 0.15         // Border falloff for ocean at edges (0-1)
    },

    // Water features
    water: {
        riverSeed: 'rivers-1',    // Separate seed for rivers (change to regenerate rivers only)
        riverCount: 100,          // Target number of main rivers
        minSourceElevation: 0.4,  // Min elevation for river sources
        minSourceMoisture: 0.2,   // Min moisture for river sources (lower = more rivers)
        sourceSpacing: 6,         // Min tiles between river sources (lower = denser rivers)
        maxHigherNeighbors: 3     // Max neighbors that can be higher (higher = more sources)
    },

    // Sub-tile generation (hierarchical zoom)
    subtiles: {
        baseCount: 12,              // Base sub-tiles per parent
        elevationVariation: 0.1,    // Max elevation deviation from parent
        moistureVariation: 0.1,     // Max moisture deviation from parent
        maxLoadedParents: 50,       // Max parents with loaded children (memory limit)
        minParentArea: 10,          // Minimum parent tile area to subdivide
        // Zoom thresholds for each level (zoom % where level starts)
        zoomThresholds: [0, 40, 60, 80]  // World at 0%, Area at 40%, City at 60%, Building at 80%
    },

    // Points of Interest
    pois: {
        seed: 'pois-1',  // Separate seed for POI regeneration
        counts: {
            capitals: 5,
            cities: 15,
            towns: 40,
            villages: 100,
            dungeons: 20,
            temples: 10,
            ruins: 30,
            ports: 15
        },
        minDistances: {
            capital: 500,
            city: 300,
            town: 150,
            village: 50,
            dungeon: 200,
            temple: 250,
            ruins: 100,
            port: 200
        },
        // Biome preferences for each POI type (higher = more likely)
        biomePreferences: {
            village: { temperate_grassland: 2, temperate_forest: 1.5, savanna: 1.2, default: 0.5 },
            town: { temperate_grassland: 2, temperate_forest: 1.5, beach: 1.3, default: 0.6 },
            city: { temperate_grassland: 2.5, beach: 1.5, default: 0.4 },
            capital: { temperate_grassland: 2, temperate_forest: 1.5, default: 1 },
            dungeon: { snow: 2, tundra: 1.5, taiga: 1.5, marsh: 1.3, default: 0.5 },
            temple: { temperate_forest: 1.5, tropical_forest: 1.5, rainforest: 1.3, default: 1 },
            ruins: { desert: 2, tundra: 1.5, savanna: 1.3, default: 0.8 },
            port: { beach: 3, default: 0 }  // Ports require coastal tiles
        },
        // How many rings of neighboring tiles each POI type occupies
        tileOccupation: {
            capital: 3,  // Large footprint
            city: 2,
            town: 1,
            port: 1,
            village: 0,  // Single tile
            dungeon: 0,
            temple: 0,
            ruins: 0
        },
        rendering: {
            dotSize: 3,
            symbolSize: 8,
            iconSize: 16,
            labelOffset: 12,
            labelFont: '12px sans-serif'
        }
    },

    // Regions / Kingdoms
    regions: {
        seed: 'regions-1',
        costs: {
            base: 1,
            riverCrossing: 5,
            mountainBase: 8,
            mountainSteep: 15,
            elevationPenalty: 10
        },
        colors: [
            { h: 0, s: 35, l: 45 },    // Red
            { h: 45, s: 35, l: 45 },   // Orange
            { h: 120, s: 35, l: 40 },  // Green
            { h: 210, s: 35, l: 45 },  // Blue
            { h: 280, s: 35, l: 45 }   // Purple
        ],
        borderWidth: 2,
        borderOpacity: 0.7
    },

    // Roads
    roads: {
        seed: 'roads-1',
        costs: {
            base: 1,
            forest: 2,
            hills: 3,
            mountains: 8,
            peaks: 20,
            riverCrossing: 3,
            existingRoadBonus: -0.5
        },
        connections: {
            capitalToCapitals: true,
            capitalToCities: 2,
            cityToCities: 2,
            cityToTowns: 2,
            townToTowns: 2,
            townToVillages: 3,
            villageToTown: 1,
            specialToSettlement: 1
        },
        rendering: {
            majorWidth: 4,
            minorWidth: 2.5,
            pathWidth: 1.5,
            color: { h: 35, s: 30, l: 40 },  // Brown/tan
            opacity: 0.85
        }
    },

    // Visual rendering
    rendering: {
        // Elevation lightness shift
        elevationShift: {
            baseline: 0.4,       // Elevation considered "neutral"
            multiplier: 60       // How much lightness changes with elevation
        },
        // Hillshading
        hillshade: {
            multiplier: 85       // Strength of light/shadow effect
        },
        // Elevation tinting (hue shift based on elevation)
        elevationTint: {
            enabled: true,
            highHueShift: -20,   // Shift toward blue/cool at high elevation (negative = cooler)
            lowHueShift: 15      // Shift toward yellow/warm at low elevation (positive = warmer)
        },
        // Saturation reduction at elevation extremes
        elevationSaturation: {
            enabled: true,
            extremeReduction: 25, // How much to reduce saturation at peaks/valleys
            peakThreshold: 0.75,  // Elevation above this starts losing saturation
            valleyThreshold: 0.35 // Elevation below this starts losing saturation
        },
        // River appearance
        rivers: {
            coreOpacity: 0.9,
            coreWidth: 2,
            flowWidthMultiplier: 0.1,
            zoomWidthPower: 1,        // How much rivers thin when zoomed out (1 = no change, 2 = very thin)
            zoomOpacityMin: 0.9,      // River opacity when fully zoomed out (0 = invisible)
            zoomOpacityScale: 0.1     // How quickly rivers become opaque as you zoom in
        }
    }
};
