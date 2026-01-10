/**
 * Theme - controls visual styling for map rendering
 */

/**
 * Get elevation-based tile color for terrain themes
 */
function getElevationHSL(tile) {
    if (tile.isWater) {
        // Water: blue, darker = deeper
        const depth = Math.min(1, tile.waterDepth * 3);
        return { h: 210, s: 60, l: 20 + (1 - depth) * 15 };
    }

    // Land based on elevation
    const e = tile.elevation;
    if (e > 0.8) return { h: 0, s: 0, l: 90 };        // Snow peaks
    if (e > 0.65) return { h: 30, s: 25, l: 45 };     // Mountain rock
    if (e > 0.5) return { h: 80, s: 35, l: 35 };      // Hills
    if (e > 0.4) return { h: 100, s: 40, l: 32 };     // Highlands
    return { h: 120, s: 45, l: 28 };                   // Lowlands
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
        getTileHSL: getElevationHSL
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
        getTileHSL: (tile) => {
            if (tile.isWater) {
                const depth = Math.min(1, tile.waterDepth * 3);
                return { h: 30, s: 25, l: 15 + (1 - depth) * 10 };
            }
            const e = tile.elevation;
            if (e > 0.8) return { h: 35, s: 15, l: 65 };
            if (e > 0.65) return { h: 30, s: 25, l: 45 };
            if (e > 0.5) return { h: 35, s: 30, l: 35 };
            if (e > 0.4) return { h: 40, s: 35, l: 30 };
            return { h: 45, s: 30, l: 25 };
        }
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
        getTileHSL: (tile) => {
            if (tile.isWater) {
                const depth = Math.min(1, tile.waterDepth * 3);
                return { h: 200, s: 20, l: 60 + (1 - depth) * 15 };
            }
            const e = tile.elevation;
            if (e > 0.8) return { h: 35, s: 10, l: 90 };
            if (e > 0.65) return { h: 30, s: 20, l: 70 };
            if (e > 0.5) return { h: 80, s: 25, l: 65 };
            if (e > 0.4) return { h: 90, s: 30, l: 60 };
            return { h: 100, s: 35, l: 55 };
        }
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
        getTileHSL: (tile) => {
            if (tile.isWater) {
                const depth = Math.min(1, tile.waterDepth * 3);
                return { h: 210, s: 30, l: 8 + (1 - depth) * 8 };
            }
            const e = tile.elevation;
            if (e > 0.8) return { h: 0, s: 0, l: 50 };
            if (e > 0.65) return { h: 30, s: 15, l: 25 };
            if (e > 0.5) return { h: 80, s: 20, l: 18 };
            if (e > 0.4) return { h: 100, s: 25, l: 15 };
            return { h: 120, s: 25, l: 12 };
        }
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
        getTileHSL: (tile) => {
            if (tile.isWater) {
                const depth = Math.min(1, tile.waterDepth * 3);
                return { h: 210, s: 70, l: 15 + (1 - depth) * 20 };
            }
            const e = tile.elevation;
            if (e > 0.8) return { h: 200, s: 10, l: 70 };
            if (e > 0.65) return { h: 190, s: 30, l: 40 };
            if (e > 0.5) return { h: 170, s: 40, l: 30 };
            if (e > 0.4) return { h: 160, s: 45, l: 25 };
            return { h: 150, s: 50, l: 22 };
        }
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
        getTileHSL: (tile) => {
            if (tile.isWater) {
                const depth = Math.min(1, tile.waterDepth * 3);
                return { h: 180, s: 40, l: 15 + (1 - depth) * 10 };
            }
            const e = tile.elevation;
            if (e > 0.8) return { h: 100, s: 10, l: 70 };
            if (e > 0.65) return { h: 60, s: 25, l: 35 };
            if (e > 0.5) return { h: 90, s: 45, l: 28 };
            if (e > 0.4) return { h: 110, s: 50, l: 22 };
            return { h: 130, s: 55, l: 18 };
        }
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
}
