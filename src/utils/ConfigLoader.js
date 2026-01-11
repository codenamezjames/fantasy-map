import yaml from 'js-yaml';
import { CONFIG } from '../config.js';

/**
 * ConfigLoader - handles loading and merging YAML config overrides
 *
 * Supports:
 * - Loading from config/index.yaml with imports
 * - Browser file upload
 * - Deep merging on top of defaults
 */
export class ConfigLoader {
    constructor() {
        this.baseConfig = CONFIG;
        this.overrides = {};
        this.mergedConfig = this.deepClone(CONFIG);
    }

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Deep merge source into target (mutates target)
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Load config from the config/ folder
     * Looks for config/index.yaml and processes imports
     */
    async loadFromFileSystem() {
        try {
            const indexResponse = await fetch('config/index.yaml');
            if (!indexResponse.ok) {
                console.log('No config/index.yaml found, using defaults');
                return this.mergedConfig;
            }

            const indexYaml = await indexResponse.text();
            const indexConfig = yaml.load(indexYaml) || {};

            // Process imports if present
            if (indexConfig.imports && Array.isArray(indexConfig.imports)) {
                for (const importFile of indexConfig.imports) {
                    try {
                        const fileResponse = await fetch(`config/${importFile}`);
                        if (fileResponse.ok) {
                            const fileYaml = await fileResponse.text();
                            const fileConfig = yaml.load(fileYaml) || {};
                            this.deepMerge(this.overrides, fileConfig);
                            console.log(`Loaded config override: ${importFile}`);
                        } else {
                            console.warn(`Could not load config/${importFile}`);
                        }
                    } catch (e) {
                        console.warn(`Error loading config/${importFile}:`, e.message);
                    }
                }
            }

            // Also merge any direct properties from index.yaml (excluding 'imports')
            const { imports, ...directOverrides } = indexConfig;
            if (Object.keys(directOverrides).length > 0) {
                this.deepMerge(this.overrides, directOverrides);
            }

            // Rebuild merged config
            this.mergedConfig = this.deepClone(this.baseConfig);
            this.deepMerge(this.mergedConfig, this.overrides);

            console.log('Config loaded with overrides:', Object.keys(this.overrides));
            return this.mergedConfig;

        } catch (e) {
            console.log('Could not load config overrides:', e.message);
            return this.mergedConfig;
        }
    }

    /**
     * Load config from a File object (browser upload)
     */
    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    let parsed;

                    if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
                        parsed = yaml.load(content) || {};
                    } else if (file.name.endsWith('.json')) {
                        parsed = JSON.parse(content);
                    } else {
                        // Try YAML first, fall back to JSON
                        try {
                            parsed = yaml.load(content) || {};
                        } catch {
                            parsed = JSON.parse(content);
                        }
                    }

                    // Merge the uploaded config
                    this.deepMerge(this.overrides, parsed);

                    // Rebuild merged config
                    this.mergedConfig = this.deepClone(this.baseConfig);
                    this.deepMerge(this.mergedConfig, this.overrides);

                    console.log('Uploaded config merged:', file.name);
                    resolve(this.mergedConfig);

                } catch (err) {
                    reject(new Error(`Failed to parse config file: ${err.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Reset to base config (clear all overrides)
     */
    reset() {
        this.overrides = {};
        this.mergedConfig = this.deepClone(this.baseConfig);
        return this.mergedConfig;
    }

    /**
     * Get the current merged config
     */
    getConfig() {
        return this.mergedConfig;
    }

    /**
     * Get a specific config value by path (e.g., 'world.tileCount')
     */
    get(path) {
        const parts = path.split('.');
        let value = this.mergedConfig;
        for (const part of parts) {
            if (value === undefined || value === null) return undefined;
            value = value[part];
        }
        return value;
    }
}

// Singleton instance
export const configLoader = new ConfigLoader();
