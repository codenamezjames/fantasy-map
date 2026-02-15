import { CONFIG } from '../config.js';

/**
 * Theme - controls visual styling for map rendering
 */

/**
 * Default biome color palette
 */
const BIOME_COLORS = {
    ocean:              { h: 210, s: 60, l: 25 },
    lake:               { h: 200, s: 50, l: 40 },
    snow:               { h: 200, s: 10, l: 90 },
    tundra:             { h: 180, s: 20, l: 45 },
    taiga:              { h: 150, s: 35, l: 30 },
    temperate_forest:   { h: 120, s: 45, l: 28 },
    temperate_grassland:{ h: 90, s: 50, l: 40 },
    shrubland:          { h: 60, s: 40, l: 35 },
    desert:             { h: 45, s: 50, l: 55 },
    savanna:            { h: 50, s: 55, l: 45 },
    tropical_forest:    { h: 130, s: 55, l: 25 },
    rainforest:         { h: 140, s: 60, l: 20 },
    beach:              { h: 50, s: 40, l: 65 },
    marsh:              { h: 100, s: 40, l: 30 }
};

/**
 * POI (Point of Interest) color palette
 */
const POI_COLORS = {
    village:  { h: 30, s: 15, l: 55, stroke: { h: 30, s: 10, l: 35 } },   // Light gray-brown
    town:     { h: 220, s: 8, l: 50, stroke: { h: 220, s: 5, l: 30 } },   // Blue-gray
    city:     { h: 0, s: 0, l: 45, stroke: { h: 0, s: 0, l: 25 } },       // Gray
    capital:  { h: 0, s: 0, l: 40, stroke: { h: 0, s: 0, l: 20 } },       // Dark gray
    dungeon:  { h: 270, s: 50, l: 35, stroke: { h: 265, s: 40, l: 20 } }, // Purple
    temple:   { h: 200, s: 60, l: 60, stroke: { h: 195, s: 50, l: 40 } }, // Light blue
    ruins:    { h: 30, s: 20, l: 50, stroke: { h: 30, s: 15, l: 30 } },   // Dusty brown
    port:     { h: 210, s: 15, l: 48, stroke: { h: 210, s: 10, l: 28 } }  // Steel blue-gray
};

/**
 * Bright icon colors for POI markers (separate from tile-blending palette)
 */
const POI_ICON_COLORS = {
    village:  { fill: '#e8d5a3', stroke: '#3d2e1a' },   // Warm tan / dark brown
    town:     { fill: '#dbb870', stroke: '#3d2e1a' },   // Gold-tan / dark brown
    city:     { fill: '#f0e0b0', stroke: '#2a1f0f' },   // Parchment / near black
    capital:  { fill: '#ffd700', stroke: '#2a1f0f' },   // Gold / near black
    dungeon:  { fill: '#d94040', stroke: '#1a0505' },   // Red / dark
    temple:   { fill: '#60b0e0', stroke: '#0a2a3d' },   // Bright blue / dark blue
    ruins:    { fill: '#d4935a', stroke: '#2a1508' },   // Amber / dark brown
    port:     { fill: '#50c0c0', stroke: '#0a2d2d' }    // Teal / dark teal
};

/**
 * Interpolate between two HSL colors
 */
function lerpHSL(hsl1, hsl2, t) {
    // Handle hue wrapping (take shortest path around color wheel)
    let h1 = hsl1.h, h2 = hsl2.h;
    const hDiff = h2 - h1;
    if (Math.abs(hDiff) > 180) {
        if (hDiff > 0) {
            h1 += 360;
        } else {
            h2 += 360;
        }
    }
    return {
        h: (h1 + (h2 - h1) * t + 360) % 360,
        s: hsl1.s + (hsl2.s - hsl1.s) * t,
        l: hsl1.l + (hsl2.l - hsl1.l) * t
    };
}

/**
 * Get biome-based tile color (default palette)
 * Applies elevation lightness shift, hillshading, and biome blending
 */
function getBiomeHSL(tile, colors = BIOME_COLORS) {
    let base;

    if (tile.isWater) {
        const depth = Math.min(1, tile.waterDepth * 3);
        const oceanBase = colors.ocean || BIOME_COLORS.ocean;
        return { h: oceanBase.h, s: oceanBase.s, l: oceanBase.l - depth * 10 };
    }

    if (tile.biome && colors[tile.biome]) {
        base = { ...colors[tile.biome] };
    } else {
        // Fallback to elevation-based
        base = getElevationHSL(tile);
    }

    // Apply biome color blending for smooth transitions at boundaries
    if (tile.blendBiome && tile.blendFactor > 0 && colors[tile.blendBiome]) {
        const blendTarget = colors[tile.blendBiome];
        base = lerpHSL(base, blendTarget, tile.blendFactor);
    }

    // Apply POI occupation color blending
    if (tile.poiType && tile.poiInfluence > 0) {
        const poiColor = POI_COLORS[tile.poiType];
        if (poiColor) {
            // Blend toward POI color based on influence (max 60% blend to keep terrain visible)
            const blendAmount = tile.poiInfluence * 0.6;
            base = lerpHSL(base, poiColor, blendAmount);
        }
    }

    // Elevation lightness shift: higher = lighter, lower = darker
    const elevShift = (tile.elevation - CONFIG.rendering.elevationShift.baseline) * CONFIG.rendering.elevationShift.multiplier;
    base.l = Math.max(10, Math.min(90, base.l + elevShift));

    // Elevation tinting: cool at high, warm at low
    if (CONFIG.rendering.elevationTint?.enabled) {
        const { highHueShift, lowHueShift } = CONFIG.rendering.elevationTint;
        const elevNorm = tile.elevation; // 0-1
        // Interpolate: low elevation = lowHueShift, high elevation = highHueShift
        const hueShift = lowHueShift + (highHueShift - lowHueShift) * elevNorm;
        base.h = (base.h + hueShift + 360) % 360;
    }

    // Saturation reduction at elevation extremes (peaks and valleys become grayer)
    if (CONFIG.rendering.elevationSaturation?.enabled) {
        const { extremeReduction, peakThreshold, valleyThreshold } = CONFIG.rendering.elevationSaturation;
        let satReduction = 0;
        if (tile.elevation > peakThreshold) {
            // Above peak threshold - reduce saturation
            const t = (tile.elevation - peakThreshold) / (1 - peakThreshold);
            satReduction = t * extremeReduction;
        } else if (tile.elevation < valleyThreshold) {
            // Below valley threshold - reduce saturation
            const t = (valleyThreshold - tile.elevation) / valleyThreshold;
            satReduction = t * extremeReduction;
        }
        base.s = Math.max(5, base.s - satReduction);
    }

    // Hillshading: simulate NW light source
    // slope is calculated from neighbors in tile.slope (if available)
    if (tile.slope !== undefined) {
        // slope.x positive = facing east, slope.y positive = facing south
        // NW light means we want -x and -y to be bright
        const lightAngle = Math.atan2(-1, -1); // NW direction
        const slopeAngle = Math.atan2(tile.slope.y, tile.slope.x);
        const angleDiff = Math.cos(slopeAngle - lightAngle);
        const hillshade = angleDiff * tile.slope.magnitude * CONFIG.rendering.hillshade.multiplier;
        base.l = Math.max(10, Math.min(90, base.l + hillshade));
    }

    return base;
}

/**
 * Get elevation-based tile color (fallback)
 */
function getElevationHSL(tile) {
    if (tile.isWater) {
        const depth = Math.min(1, tile.waterDepth * 3);
        return { h: 210, s: 60, l: 20 + (1 - depth) * 15 };
    }

    const e = tile.elevation;
    if (e > 0.8) return { h: 0, s: 0, l: 90 };
    if (e > 0.65) return { h: 30, s: 25, l: 45 };
    if (e > 0.5) return { h: 80, s: 35, l: 35 };
    if (e > 0.4) return { h: 100, s: 40, l: 32 };
    return { h: 120, s: 45, l: 28 };
}

// Preset theme definitions
const THEMES = {
    default: {
        name: 'Default',
        background: '#1a1a2e',
        tileStroke: 'rgba(0, 0, 0, 0.3)',
        gridColor: 'rgba(255, 255, 255, 0.1)',
        gridLabelColor: 'rgba(255, 255, 255, 0.4)',
        borderColor: '#4a9eff',
        overlayBackground: 'rgba(0, 0, 0, 0.5)',
        overlayText: '#fff',
        oceanColor: BIOME_COLORS.ocean,
        getTileHSL: (tile) => getBiomeHSL(tile)
    },

    sepia: {
        name: 'Sepia',
        background: '#2c2416',
        tileStroke: 'rgba(60, 40, 20, 0.4)',
        gridColor: 'rgba(180, 150, 100, 0.15)',
        gridLabelColor: 'rgba(180, 150, 100, 0.5)',
        borderColor: '#8b7355',
        overlayBackground: 'rgba(30, 20, 10, 0.7)',
        overlayText: '#d4c4a8',
        oceanColor: { h: 30, s: 25, l: 18 },
        getTileHSL: (tile) => getBiomeHSL(tile, {
            ocean:              { h: 30, s: 25, l: 18 },
            lake:               { h: 32, s: 30, l: 28 },
            snow:               { h: 35, s: 15, l: 65 },
            tundra:             { h: 35, s: 20, l: 40 },
            taiga:              { h: 40, s: 30, l: 30 },
            temperate_forest:   { h: 45, s: 35, l: 28 },
            temperate_grassland:{ h: 40, s: 35, l: 35 },
            shrubland:          { h: 35, s: 30, l: 32 },
            desert:             { h: 35, s: 40, l: 45 },
            savanna:            { h: 38, s: 38, l: 38 },
            tropical_forest:    { h: 45, s: 40, l: 25 },
            rainforest:         { h: 48, s: 45, l: 22 },
            beach:              { h: 35, s: 30, l: 50 },
            marsh:              { h: 42, s: 30, l: 28 }
        })
    },

    parchment: {
        name: 'Parchment',
        background: '#f4e4c1',
        tileStroke: 'rgba(139, 115, 85, 0.3)',
        gridColor: 'rgba(139, 115, 85, 0.2)',
        gridLabelColor: 'rgba(100, 80, 50, 0.6)',
        borderColor: '#8b7355',
        overlayBackground: 'rgba(139, 115, 85, 0.8)',
        overlayText: '#3d2914',
        oceanColor: { h: 200, s: 20, l: 65 },
        getTileHSL: (tile) => getBiomeHSL(tile, {
            ocean:              { h: 200, s: 20, l: 65 },
            lake:               { h: 195, s: 25, l: 55 },
            snow:               { h: 35, s: 10, l: 90 },
            tundra:             { h: 180, s: 15, l: 70 },
            taiga:              { h: 150, s: 25, l: 55 },
            temperate_forest:   { h: 100, s: 30, l: 50 },
            temperate_grassland:{ h: 80, s: 35, l: 60 },
            shrubland:          { h: 55, s: 30, l: 55 },
            desert:             { h: 40, s: 35, l: 70 },
            savanna:            { h: 45, s: 40, l: 62 },
            tropical_forest:    { h: 110, s: 35, l: 45 },
            rainforest:         { h: 120, s: 40, l: 40 },
            beach:              { h: 45, s: 30, l: 75 },
            marsh:              { h: 90, s: 25, l: 52 }
        })
    },

    dark: {
        name: 'Dark',
        background: '#0d0d0d',
        tileStroke: 'rgba(255, 255, 255, 0.05)',
        gridColor: 'rgba(255, 255, 255, 0.05)',
        gridLabelColor: 'rgba(255, 255, 255, 0.3)',
        borderColor: '#333',
        overlayBackground: 'rgba(0, 0, 0, 0.8)',
        overlayText: '#888',
        oceanColor: { h: 210, s: 30, l: 12 },
        getTileHSL: (tile) => getBiomeHSL(tile, {
            ocean:              { h: 210, s: 30, l: 12 },
            lake:               { h: 200, s: 35, l: 22 },
            snow:               { h: 200, s: 5, l: 50 },
            tundra:             { h: 180, s: 15, l: 25 },
            taiga:              { h: 150, s: 25, l: 18 },
            temperate_forest:   { h: 120, s: 25, l: 15 },
            temperate_grassland:{ h: 90, s: 30, l: 22 },
            shrubland:          { h: 60, s: 25, l: 20 },
            desert:             { h: 45, s: 30, l: 30 },
            savanna:            { h: 50, s: 35, l: 25 },
            tropical_forest:    { h: 130, s: 35, l: 14 },
            rainforest:         { h: 140, s: 40, l: 12 },
            beach:              { h: 50, s: 25, l: 35 },
            marsh:              { h: 100, s: 25, l: 18 }
        })
    },

    ocean: {
        name: 'Ocean',
        background: '#0a1628',
        tileStroke: 'rgba(100, 180, 255, 0.2)',
        gridColor: 'rgba(100, 180, 255, 0.1)',
        gridLabelColor: 'rgba(100, 180, 255, 0.4)',
        borderColor: '#2a5a8a',
        overlayBackground: 'rgba(10, 22, 40, 0.8)',
        overlayText: '#8ac4ff',
        oceanColor: { h: 210, s: 70, l: 20 },
        getTileHSL: (tile) => getBiomeHSL(tile, {
            ocean:              { h: 210, s: 70, l: 20 },
            lake:               { h: 200, s: 60, l: 35 },
            snow:               { h: 200, s: 10, l: 70 },
            tundra:             { h: 190, s: 30, l: 45 },
            taiga:              { h: 170, s: 40, l: 30 },
            temperate_forest:   { h: 160, s: 45, l: 28 },
            temperate_grassland:{ h: 150, s: 45, l: 35 },
            shrubland:          { h: 140, s: 35, l: 32 },
            desert:             { h: 180, s: 25, l: 50 },
            savanna:            { h: 165, s: 35, l: 40 },
            tropical_forest:    { h: 155, s: 50, l: 25 },
            rainforest:         { h: 150, s: 55, l: 22 },
            beach:              { h: 185, s: 30, l: 55 },
            marsh:              { h: 170, s: 40, l: 30 }
        })
    },

    forest: {
        name: 'Forest',
        background: '#0d1a0d',
        tileStroke: 'rgba(100, 150, 80, 0.3)',
        gridColor: 'rgba(100, 150, 80, 0.15)',
        gridLabelColor: 'rgba(150, 200, 100, 0.5)',
        borderColor: '#3a5a2a',
        overlayBackground: 'rgba(13, 26, 13, 0.8)',
        overlayText: '#a8d48a',
        oceanColor: { h: 180, s: 40, l: 18 },
        getTileHSL: (tile) => getBiomeHSL(tile, {
            ocean:              { h: 180, s: 40, l: 18 },
            lake:               { h: 175, s: 45, l: 28 },
            snow:               { h: 100, s: 10, l: 70 },
            tundra:             { h: 120, s: 20, l: 40 },
            taiga:              { h: 140, s: 45, l: 25 },
            temperate_forest:   { h: 120, s: 55, l: 22 },
            temperate_grassland:{ h: 100, s: 50, l: 32 },
            shrubland:          { h: 80, s: 40, l: 30 },
            desert:             { h: 60, s: 35, l: 45 },
            savanna:            { h: 70, s: 45, l: 38 },
            tropical_forest:    { h: 130, s: 60, l: 20 },
            rainforest:         { h: 135, s: 65, l: 16 },
            beach:              { h: 65, s: 35, l: 50 },
            marsh:              { h: 110, s: 45, l: 25 }
        })
    }
};

export class Theme {
    constructor(themeName = 'default') {
        this.current = null;
        this.set(themeName);
    }

    /**
     * Set the current theme by name
     */
    set(themeName) {
        if (!THEMES[themeName]) {
            console.warn(`Theme "${themeName}" not found, using default`);
            themeName = 'default';
        }
        this.current = THEMES[themeName];
        this.currentName = themeName;
    }

    /**
     * Get list of available theme names
     */
    static getAvailableThemes() {
        return Object.keys(THEMES);
    }

    /**
     * Get theme display names
     */
    static getThemeList() {
        return Object.entries(THEMES).map(([key, theme]) => ({
            id: key,
            name: theme.name
        }));
    }

    /**
     * Get tile fill color
     */
    getTileColor(tile) {
        const { h, s, l } = this.current.getTileHSL(tile);
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    /**
     * Get tile HSL values directly (for gradient calculations)
     */
    getTileHSL(tile) {
        return this.current.getTileHSL(tile);
    }

    /**
     * Get tile stroke color
     */
    getTileStroke() {
        return this.current.tileStroke;
    }

    /**
     * Get background color
     */
    getBackground() {
        return this.current.background;
    }

    /**
     * Get grid color
     */
    getGridColor() {
        return this.current.gridColor;
    }

    /**
     * Get grid label color
     */
    getGridLabelColor() {
        return this.current.gridLabelColor;
    }

    /**
     * Get border color
     */
    getBorderColor() {
        return this.current.borderColor;
    }

    /**
     * Get overlay background color
     */
    getOverlayBackground() {
        return this.current.overlayBackground;
    }

    /**
     * Get overlay text color
     */
    getOverlayText() {
        return this.current.overlayText;
    }

    /**
     * Get river color (based on ocean color)
     */
    getRiverHSL() {
        return this.current.oceanColor;
    }

    /**
     * Get POI fill color
     * @param {string} type - POI type (village, town, city, etc.)
     * @returns {string} HSL color string
     */
    getPOIColor(type) {
        const color = POI_COLORS[type] || POI_COLORS.village;
        return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
    }

    /**
     * Get POI stroke color
     * @param {string} type - POI type
     * @returns {string} HSL color string
     */
    getPOIStrokeColor(type) {
        const color = POI_COLORS[type] || POI_COLORS.village;
        const stroke = color.stroke;
        return `hsl(${stroke.h}, ${stroke.s}%, ${stroke.l}%)`;
    }

    /**
     * Get bright icon fill color for POI markers
     */
    getPOIIconFill(type) {
        return (POI_ICON_COLORS[type] || POI_ICON_COLORS.village).fill;
    }

    /**
     * Get dark icon stroke color for POI markers
     */
    getPOIIconStroke(type) {
        return (POI_ICON_COLORS[type] || POI_ICON_COLORS.village).stroke;
    }

    /**
     * Get POI label color
     * @returns {string} Color for POI labels
     */
    getPOILabelColor() {
        return this.current.overlayText;
    }

    /**
     * Get POI label background
     * @returns {string} Background color for POI labels
     */
    getPOILabelBackground() {
        return this.current.overlayBackground;
    }

    /**
     * Register a custom theme
     */
    static register(name, definition) {
        if (!definition.getTileHSL) {
            // Default tile color if not provided
            definition.getTileHSL = (tile) => {
                const hue = (tile.id * 137.508) % 360;
                return { h: hue, s: 40, l: 35 };
            };
        }
        THEMES[name] = definition;
    }

    /**
     * Get street fill color based on street type
     * @param {string} type - Street type (main, district, alley)
     * @returns {string} HSL color string
     */
    getStreetColor(type) {
        // Street colors - warm browns/tans that work across themes
        const streetColors = {
            main:     { h: 35, s: 25, l: 45 },  // Main roads - slightly darker
            district: { h: 35, s: 20, l: 50 },  // District streets - medium
            alley:    { h: 35, s: 15, l: 55 }   // Alleys - lighter, less prominent
        };

        // Adjust based on theme for better contrast
        const themeAdjust = {
            dark:      { l: -15, s: -5 },
            parchment: { l: -20, s: 10 },
            sepia:     { l: -5, s: 5 },
            ocean:     { l: -10, s: -5 },
            forest:    { l: -10, s: 0 }
        };

        const base = streetColors[type] || streetColors.alley;
        const adjust = themeAdjust[this.currentName] || { l: 0, s: 0 };

        const h = base.h;
        const s = Math.max(5, Math.min(60, base.s + adjust.s));
        const l = Math.max(20, Math.min(70, base.l + adjust.l));

        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    /**
     * Get street stroke/outline color
     * @returns {string} HSL color string
     */
    getStreetStrokeColor() {
        // Darker outline for street edges
        const base = { h: 30, s: 15, l: 30 };

        // Adjust for dark themes
        if (this.currentName === 'dark' || this.currentName === 'ocean' || this.currentName === 'forest') {
            return `hsl(${base.h}, ${base.s}%, 20%)`;
        }

        return `hsl(${base.h}, ${base.s}%, ${base.l}%)`;
    }

    /**
     * Get building fill color based on building type
     * @param {string} type - Building type (house, shop, temple, etc.)
     * @returns {string} HSL color string
     */
    getBuildingColor(type) {
        const colors = {
            house:      { h: 30, s: 40, l: 55 },   // Warm tan
            shop:       { h: 35, s: 45, l: 50 },   // Brown
            temple:     { h: 45, s: 30, l: 65 },   // Light gold
            tavern:     { h: 25, s: 50, l: 45 },   // Dark brown
            warehouse:  { h: 20, s: 25, l: 40 },   // Gray-brown
            market:     { h: 40, s: 35, l: 60 },   // Light tan
            castle:     { h: 220, s: 15, l: 45 },  // Gray-blue
            wall_tower: { h: 30, s: 20, l: 50 }    // Stone gray
        };

        // Adjust colors based on theme
        const themeAdjust = {
            dark:      { l: -15, s: -10 },
            parchment: { l: 5, s: 5 },
            sepia:     { l: -5, s: -5 },
            ocean:     { l: -10, s: -5 },
            forest:    { l: -10, s: 0 }
        };

        const base = colors[type] ?? colors.house;
        const adjust = themeAdjust[this.currentName] || { l: 0, s: 0 };

        const h = base.h;
        const s = Math.max(5, Math.min(60, base.s + adjust.s));
        const l = Math.max(20, Math.min(80, base.l + adjust.l));

        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    /**
     * Get building stroke/outline color
     * @returns {string} RGBA color string
     */
    getBuildingStrokeColor() {
        return this.isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)';
    }

    /**
     * Get building shadow color
     * @returns {string} RGBA color string
     */
    getBuildingShadowColor() {
        return 'rgba(0,0,0,0.2)';
    }

    /**
     * Check if current theme is a dark theme
     * @returns {boolean} True if dark theme
     */
    isDark() {
        return ['dark', 'ocean', 'forest', 'default', 'sepia'].includes(this.currentName);
    }
}
