import { CONFIG } from '../config.js';

/**
 * WeatherRenderer — draws weather overlay on the map canvas
 */
export class WeatherRenderer {
    /**
     * @param {Theme} theme - Theme reference for colors
     */
    constructor(theme) {
        this.theme = theme;
    }

    /**
     * Draw the full weather overlay
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} camera
     * @param {WeatherState} weatherState
     * @param {World} world
     * @param {Tile[]} tiles - Viewport-filtered tiles
     */
    drawWeatherOverlay(ctx, camera, weatherState, world, tiles) {
        if (!weatherState) return;

        ctx.save();

        // 1. Cloud cover
        this.drawCloudCover(ctx, camera, weatherState, tiles);

        // 2. Precipitation (rain/snow)
        this.drawPrecipitation(ctx, camera, weatherState, world, tiles);

        // 3. Wind arrows (sampled grid)
        this.drawWindArrows(ctx, camera, weatherState, world);

        // 4. Storm markers
        this.drawStormMarkers(ctx, camera, weatherState);

        ctx.restore();
    }

    /**
     * Draw semi-transparent cloud cover over tiles
     */
    drawCloudCover(ctx, camera, weatherState, tiles) {
        const cloudRGB = this.theme.getWeatherCloudColor();

        // Batch by opacity bucket for fewer state changes
        const buckets = new Map();
        const bucketSize = 0.05; // 20 opacity levels

        for (const tile of tiles) {
            const id = tile.id;
            if (id >= weatherState.tileCount) continue;
            if (tile.isWater) continue; // Skip cloud rendering on water

            const cover = weatherState.cloudCover[id];
            if (cover < 0.1) continue;

            const alpha = Math.min(0.25, cover * 0.22);
            const bucket = Math.round(alpha / bucketSize) * bucketSize;

            if (!buckets.has(bucket)) {
                buckets.set(bucket, []);
            }
            buckets.get(bucket).push(tile);
        }

        for (const [alpha, bucketTiles] of buckets) {
            ctx.fillStyle = `rgba(${cloudRGB.r}, ${cloudRGB.g}, ${cloudRGB.b}, ${alpha.toFixed(2)})`;
            for (const tile of bucketTiles) {
                const path = tile.getPath2D();
                if (path) {
                    ctx.fill(path);
                }
            }
        }
    }

    /**
     * Draw precipitation: rain streaks or snow dots
     */
    drawPrecipitation(ctx, camera, weatherState, world, tiles) {
        const lineWidth = 1 / camera.scale;

        for (const tile of tiles) {
            const id = tile.id;
            if (id >= weatherState.tileCount) continue;
            if (tile.isWater) continue;

            const precip = weatherState.precipitation[id];
            if (precip < 0.15) continue;

            const isSnow = weatherState.effectiveTemp[id] < 0.25;
            ctx.fillStyle = this.theme.getWeatherPrecipColor(isSnow);
            ctx.strokeStyle = this.theme.getWeatherPrecipColor(isSnow);
            ctx.lineWidth = lineWidth;

            const [cx, cy] = tile.center;
            // Number of marks scales with intensity (fewer, more selective)
            const count = Math.floor(precip * 3);
            if (count < 1) continue;

            // Use tile ID as seed for deterministic positions
            const seed = id * 7919 + weatherState.day * 31;

            if (isSnow) {
                // Snow: small dots
                for (let i = 0; i < count; i++) {
                    const hash = (seed + i * 1301) % 10000;
                    const ox = ((hash % 100) / 100 - 0.5) * 16;
                    const oy = (((hash / 100) | 0) % 100 / 100 - 0.5) * 16;
                    const r = (1.2 + precip * 0.8) / camera.scale;
                    ctx.beginPath();
                    ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                // Rain: short angled streaks
                const windX = weatherState.windDirX[id] || 0;
                const windY = weatherState.windDirY[id] || 0.5;
                const streakLen = (4 + precip * 4) / camera.scale;

                ctx.beginPath();
                for (let i = 0; i < count; i++) {
                    const hash = (seed + i * 1301) % 10000;
                    const ox = ((hash % 100) / 100 - 0.5) * 16;
                    const oy = (((hash / 100) | 0) % 100 / 100 - 0.5) * 16;
                    const sx = cx + ox;
                    const sy = cy + oy;
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sx + windX * streakLen, sy + (windY * 0.3 + 0.7) * streakLen);
                }
                ctx.stroke();
            }
        }
    }

    /**
     * Draw wind direction arrows on a regular grid
     */
    drawWindArrows(ctx, camera, weatherState, world) {
        const cfg = CONFIG.weather?.rendering || {};
        const spacing = cfg.windArrowSpacing || 80;
        const arrowSize = (cfg.windArrowSize || 12) / camera.scale;

        const viewport = camera.getViewport();
        const startX = Math.floor(viewport.minX / spacing) * spacing;
        const startY = Math.floor(viewport.minY / spacing) * spacing;
        const endX = Math.ceil(viewport.maxX / spacing) * spacing;
        const endY = Math.ceil(viewport.maxY / spacing) * spacing;

        ctx.strokeStyle = this.theme.getWeatherWindColor();
        ctx.fillStyle = this.theme.getWeatherWindColor();
        ctx.lineWidth = 1.5 / camera.scale;

        for (let x = startX; x <= endX; x += spacing) {
            for (let y = startY; y <= endY; y += spacing) {
                // Find nearest tile to this grid point
                const tile = world.getTileAtPosition(x, y);
                if (!tile || tile.id >= weatherState.tileCount) continue;
                if (tile.isWater) continue;

                const wx = weatherState.windDirX[tile.id];
                const wy = weatherState.windDirY[tile.id];
                const speed = weatherState.windSpeed[tile.id];
                if (speed < 0.1) continue;

                const len = arrowSize * (0.5 + speed);

                // Arrow shaft
                const ex = x + wx * len;
                const ey = y + wy * len;

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                // Arrowhead
                const headLen = len * 0.3;
                const angle = Math.atan2(wy, wx);
                const headAngle = 0.5;

                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(
                    ex - Math.cos(angle - headAngle) * headLen,
                    ey - Math.sin(angle - headAngle) * headLen
                );
                ctx.moveTo(ex, ey);
                ctx.lineTo(
                    ex - Math.cos(angle + headAngle) * headLen,
                    ey - Math.sin(angle + headAngle) * headLen
                );
                ctx.stroke();
            }
        }
    }

    /**
     * Draw storms as organic cloud masses with spiral structure
     * Uses scattered semi-transparent blobs instead of crisp geometric lines
     */
    drawStormMarkers(ctx, camera, weatherState) {
        for (const storm of weatherState.storms) {
            const [sx, sy] = storm.position;
            const r = storm.radius;
            const intensity = storm.intensity;
            const rotation = storm.rotation || 0;
            const spinDir = storm.spinDir || -1;
            const armCount = storm.armCount || 3;

            // Life progress (1 = just spawned, 0 = about to die)
            const life = storm.maxLifetime
                ? Math.min(1, storm.lifetime / storm.maxLifetime)
                : 1;

            // Type-specific palette
            let cR, cG, cB;
            if (storm.type === 'blizzard') {
                cR = 200; cG = 210; cB = 230;
            } else if (storm.type === 'thunderstorm') {
                cR = 80; cG = 85; cB = 105;
            } else {
                cR = 160; cG = 170; cB = 190;
            }

            // Deterministic pseudo-random from storm id
            const hash = (v) => {
                const x = Math.sin(v * 127.1 + storm.id * 311.7) * 43758.5453;
                return x - Math.floor(x);
            };

            // 1. Broad cloud mass — large soft blobs filling the storm area
            const massCount = 12 + Math.floor(intensity * 8);
            for (let i = 0; i < massCount; i++) {
                const angle = hash(i * 3) * Math.PI * 2;
                const dist = hash(i * 3 + 1) * r * 0.75;
                const blobR = r * (0.2 + hash(i * 3 + 2) * 0.25);
                const bx = sx + Math.cos(angle) * dist;
                const by = sy + Math.sin(angle) * dist;
                const alpha = (0.04 + intensity * 0.04) * life;

                const g = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
                g.addColorStop(0, `rgba(${cR}, ${cG}, ${cB}, ${alpha.toFixed(3)})`);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(bx, by, blobR, 0, Math.PI * 2);
                ctx.fill();
            }

            // 2. Spiral cloud bands — blobs scattered along spiral paths
            const spiralTightness = storm.type === 'thunderstorm' ? 0.22 : 0.16;
            const blobsPerArm = 25 + Math.floor(intensity * 15);

            for (let arm = 0; arm < armCount; arm++) {
                const armAngle = -rotation * spinDir + (arm * Math.PI * 2) / armCount;

                for (let b = 0; b < blobsPerArm; b++) {
                    const t = b / blobsPerArm; // 0 = center, 1 = edge
                    const seed = arm * 1000 + b;

                    // Position along spiral with jitter
                    const spiralAngle = armAngle + t * Math.PI * 1.6 * spinDir + t * t * spiralTightness * 10;
                    const dist = r * (0.08 + t * 0.82);

                    // Perpendicular jitter for organic spread
                    const jitterAmt = r * 0.08 * (1 - t * 0.5);
                    const jx = (hash(seed) - 0.5) * jitterAmt * 2;
                    const jy = (hash(seed + 7) - 0.5) * jitterAmt * 2;

                    const bx = sx + Math.cos(spiralAngle) * dist + jx;
                    const by = sy + Math.sin(spiralAngle) * dist + jy;

                    // Blob size: larger near center, smaller at edges
                    const blobSize = r * (0.06 + (1 - t) * 0.08) * (0.7 + hash(seed + 13) * 0.6);

                    // Opacity: denser near center, fading at edges
                    const alpha = (0.06 + intensity * 0.06) * (1 - t * 0.6) * life;

                    const g = ctx.createRadialGradient(bx, by, 0, bx, by, blobSize);
                    g.addColorStop(0, `rgba(${cR}, ${cG}, ${cB}, ${alpha.toFixed(3)})`);
                    g.addColorStop(0.6, `rgba(${cR}, ${cG}, ${cB}, ${(alpha * 0.5).toFixed(3)})`);
                    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(bx, by, blobSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 3. Concentric dashed rings from center outward
            const isDark = this.theme.isDark();
            const ringColor = isDark
                ? `rgba(180, 200, 230, ${(0.12 * life).toFixed(3)})`
                : `rgba(80, 100, 140, ${(0.12 * life).toFixed(3)})`;
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = 1 / camera.scale;
            ctx.setLineDash([5 / camera.scale, 6 / camera.scale]);
            const ringCount = 4;
            for (let i = 1; i <= ringCount; i++) {
                const ringR = r * (i / ringCount) * 0.95;
                ctx.beginPath();
                ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // 4. Dense eye wall — ring of overlapping blobs
            const eyeWallR = r * 0.1 * (1 + intensity * 0.4);
            const eyeBlobs = 10 + Math.floor(intensity * 6);
            for (let i = 0; i < eyeBlobs; i++) {
                const angle = -rotation * spinDir * 0.5 + (i / eyeBlobs) * Math.PI * 2;
                const jitter = (hash(i * 17 + 99) - 0.5) * eyeWallR * 0.4;
                const dist = eyeWallR + jitter;
                const bx = sx + Math.cos(angle) * dist;
                const by = sy + Math.sin(angle) * dist;
                const blobSize = r * 0.05 * (0.8 + hash(i * 17 + 50) * 0.4);
                const alpha = (0.1 + intensity * 0.08) * life;

                const g = ctx.createRadialGradient(bx, by, 0, bx, by, blobSize);
                g.addColorStop(0, `rgba(${cR}, ${cG}, ${cB}, ${alpha.toFixed(3)})`);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(bx, by, blobSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
