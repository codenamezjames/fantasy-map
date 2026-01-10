/**
 * Polygon geometry utilities for sub-tile generation
 */

/**
 * Test if a point is inside a polygon using ray casting algorithm
 * @param {number[]} point - [x, y] coordinates
 * @param {number[][]} vertices - Array of [x, y] vertices
 * @returns {boolean} True if point is inside polygon
 */
export function pointInPolygon(point, vertices) {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [xi, yi] = vertices[i];
        const [xj, yj] = vertices[j];

        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Get bounding box of a polygon
 * @param {number[][]} vertices - Array of [x, y] vertices
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
 */
export function getPolygonBounds(vertices) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [x, y] of vertices) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

/**
 * Calculate polygon area using shoelace formula
 * @param {number[][]} vertices - Array of [x, y] vertices
 * @returns {number} Area (positive for counter-clockwise, negative for clockwise)
 */
export function getPolygonArea(vertices) {
    let area = 0;
    const n = vertices.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i][0] * vertices[j][1];
        area -= vertices[j][0] * vertices[i][1];
    }

    return Math.abs(area / 2);
}

/**
 * Sutherland-Hodgman polygon clipping algorithm
 * Clips a subject polygon against a convex clip polygon
 * @param {number[][]} subject - Polygon to be clipped
 * @param {number[][]} clip - Convex clipping polygon
 * @returns {number[][]|null} Clipped polygon or null if completely outside
 */
export function clipPolygon(subject, clip) {
    if (!subject || subject.length < 3) return null;
    if (!clip || clip.length < 3) return null;

    let output = [...subject];

    for (let i = 0; i < clip.length; i++) {
        if (output.length === 0) return null;

        const input = output;
        output = [];

        const edgeStart = clip[i];
        const edgeEnd = clip[(i + 1) % clip.length];

        for (let j = 0; j < input.length; j++) {
            const current = input[j];
            const next = input[(j + 1) % input.length];

            const currentInside = isLeft(edgeStart, edgeEnd, current);
            const nextInside = isLeft(edgeStart, edgeEnd, next);

            if (currentInside) {
                output.push(current);
                if (!nextInside) {
                    const inter = lineIntersection(edgeStart, edgeEnd, current, next);
                    if (inter) output.push(inter);
                }
            } else if (nextInside) {
                const inter = lineIntersection(edgeStart, edgeEnd, current, next);
                if (inter) output.push(inter);
            }
        }
    }

    return output.length >= 3 ? output : null;
}

/**
 * Check if point is on the left side of a directed edge
 * @param {number[]} a - Edge start point
 * @param {number[]} b - Edge end point
 * @param {number[]} p - Point to test
 * @returns {boolean} True if point is on left side (inside for CCW polygon)
 */
function isLeft(a, b, p) {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
}

/**
 * Calculate intersection point of two line segments
 * @param {number[]} a - First line start
 * @param {number[]} b - First line end
 * @param {number[]} c - Second line start
 * @param {number[]} d - Second line end
 * @returns {number[]|null} Intersection point or null
 */
function lineIntersection(a, b, c, d) {
    const x1 = a[0], y1 = a[1];
    const x2 = b[0], y2 = b[1];
    const x3 = c[0], y3 = c[1];
    const x4 = d[0], y4 = d[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 1e-10) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
    ];
}

/**
 * Calculate centroid of a polygon
 * @param {number[][]} vertices - Array of [x, y] vertices
 * @returns {number[]} Centroid [x, y]
 */
export function getPolygonCentroid(vertices) {
    let cx = 0, cy = 0;
    for (const [x, y] of vertices) {
        cx += x;
        cy += y;
    }
    return [cx / vertices.length, cy / vertices.length];
}

/**
 * Check if two edges share a vertex (within epsilon)
 * @param {number[]} v1 - First vertex
 * @param {number[]} v2 - Second vertex
 * @param {number} epsilon - Tolerance for comparison
 * @returns {boolean}
 */
export function verticesMatch(v1, v2, epsilon = 0.001) {
    return Math.abs(v1[0] - v2[0]) < epsilon && Math.abs(v1[1] - v2[1]) < epsilon;
}

/**
 * Check if an edge lies on a polygon boundary
 * @param {number[]} e1 - Edge start
 * @param {number[]} e2 - Edge end
 * @param {number[][]} polygon - Polygon vertices
 * @param {number} epsilon - Tolerance
 * @returns {boolean}
 */
export function edgeOnPolygonBoundary(e1, e2, polygon, epsilon = 0.5) {
    // Check if both edge vertices lie on any polygon edge
    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];

        // Check if both e1 and e2 lie on segment p1-p2
        if (pointOnSegment(e1, p1, p2, epsilon) && pointOnSegment(e2, p1, p2, epsilon)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a point lies on a line segment
 */
function pointOnSegment(p, a, b, epsilon = 0.5) {
    const cross = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(cross) > epsilon) return false;

    const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
    const lenSq = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;

    return dot >= -epsilon && dot <= lenSq + epsilon;
}
