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
            zoomWidthPower: 2,      // How much rivers thin when zoomed out (1 = no change, 2 = very thin)
            zoomOpacityMin: 0.1,      // River opacity when fully zoomed out (0 = invisible)
            zoomOpacityScale: 2       // How quickly rivers become opaque as you zoom in
        }
    }
};
