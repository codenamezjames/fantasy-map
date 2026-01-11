import { StreetNetwork, StreetNode, StreetEdge } from '../data/StreetNetwork.js';

/**
 * StreetGenerator - generates street networks for cities
 * Level 1 generation: main roads from gates to center
 */
export class StreetGenerator {
    constructor() {
        this.minAngle = 55;  // Minimum angle between edges at a node (degrees)
        this.maxDegree = 4;  // Maximum edges per node
        this.minNodeDistance = 15; // Minimum distance between nodes
        this.candidateGridSpacing = 25; // Grid spacing for candidate node generation
        this.jitterAmount = 8; // Random jitter for candidate positions
    }

    /**
     * Generate street network for a city
     * @param {City} city - City to generate streets for
     * @param {World} world - World for accessing roads
     * @param {SeededRandom} rng - Random number generator
     * @returns {StreetNetwork} Generated street network
     */
    generate(city, world, rng) {
        const network = new StreetNetwork();

        // Calculate bounds if not already set
        if (!city.bounds) {
            city.calculateBounds();
        }

        // Step 1: Place center node
        const centerNode = this.placeCenterNode(city, network);

        // Step 2: Place gate nodes where world roads enter
        const gateNodes = this.placeGateNodes(city, world, network);

        // Step 3: Generate candidate street nodes
        const candidateNodes = this.generateCandidateNodes(city, network, rng);

        // Step 4: Connect main roads from gates to center
        this.connectMainRoads(network, centerNode, gateNodes, candidateNodes, city, rng);

        // Step 5: Add district streets connecting candidate nodes
        this.addDistrictStreets(network, candidateNodes, city, rng);

        // Step 6: Remove isolated nodes
        this.removeIsolatedNodes(network);

        return network;
    }

    /**
     * Place the center node (market/castle)
     * @param {City} city - City data
     * @param {StreetNetwork} network - Network to add node to
     * @returns {StreetNode} The center node
     */
    placeCenterNode(city, network) {
        const node = network.createNode(city.center[0], city.center[1], 'center');
        return node;
    }

    /**
     * Place gate nodes where world roads cross city boundary
     * @param {City} city - City data
     * @param {World} world - World containing road data
     * @param {StreetNetwork} network - Network to add nodes to
     * @returns {StreetNode[]} Array of gate nodes
     */
    placeGateNodes(city, world, network) {
        const gateNodes = [];
        const occupiedTileSet = new Set(city.occupiedTileIds);

        // Find all tiles that have road edges crossing the city boundary
        for (const tileId of city.occupiedTileIds) {
            const tile = world.getTile(tileId);
            if (!tile || !tile.roadEdges || tile.roadEdges.length === 0) continue;

            for (const neighborId of tile.roadEdges) {
                // Check if this road edge goes to a tile outside the city
                if (!occupiedTileSet.has(neighborId)) {
                    const neighborTile = world.getTile(neighborId);
                    if (!neighborTile) continue;

                    // Find the intersection point on the city boundary
                    const gatePosition = this.findBoundaryIntersection(
                        tile.center,
                        neighborTile.center,
                        city.boundary
                    );

                    if (gatePosition) {
                        // Check if we already have a gate nearby
                        let tooClose = false;
                        for (const existing of gateNodes) {
                            if (this.distance(existing.position, gatePosition) < this.minNodeDistance * 2) {
                                tooClose = true;
                                break;
                            }
                        }

                        if (!tooClose) {
                            const gateNode = network.createNode(gatePosition[0], gatePosition[1], 'gate');
                            gateNodes.push(gateNode);
                        }
                    }
                }
            }
        }

        return gateNodes;
    }

    /**
     * Find where a line segment intersects a polygon boundary
     * @param {number[]} p1 - Start point [x, y] (inside)
     * @param {number[]} p2 - End point [x, y] (outside)
     * @param {number[][]} polygon - Polygon vertices
     * @returns {number[]|null} Intersection point or null
     */
    findBoundaryIntersection(p1, p2, polygon) {
        if (polygon.length < 3) return null;

        for (let i = 0; i < polygon.length; i++) {
            const v1 = polygon[i];
            const v2 = polygon[(i + 1) % polygon.length];

            const intersection = this.lineSegmentIntersection(p1, p2, v1, v2);
            if (intersection) {
                return intersection;
            }
        }

        // Fallback: use midpoint on the boundary closest to the line
        return this.closestPointOnBoundary(p1, p2, polygon);
    }

    /**
     * Find closest point on polygon boundary to a line
     * @param {number[]} p1 - Line start
     * @param {number[]} p2 - Line end
     * @param {number[][]} polygon - Polygon vertices
     * @returns {number[]|null} Closest point
     */
    closestPointOnBoundary(p1, p2, polygon) {
        if (polygon.length < 3) return null;

        // Find polygon edge closest to the midpoint of p1-p2
        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;

        let bestPoint = null;
        let bestDist = Infinity;

        for (let i = 0; i < polygon.length; i++) {
            const v1 = polygon[i];
            const v2 = polygon[(i + 1) % polygon.length];

            const closest = this.closestPointOnSegment([midX, midY], v1, v2);
            const dist = this.distance([midX, midY], closest);

            if (dist < bestDist) {
                bestDist = dist;
                bestPoint = closest;
            }
        }

        return bestPoint;
    }

    /**
     * Find closest point on a line segment to a point
     * @param {number[]} p - Point
     * @param {number[]} v1 - Segment start
     * @param {number[]} v2 - Segment end
     * @returns {number[]} Closest point on segment
     */
    closestPointOnSegment(p, v1, v2) {
        const dx = v2[0] - v1[0];
        const dy = v2[1] - v1[1];
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return [...v1];

        let t = ((p[0] - v1[0]) * dx + (p[1] - v1[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        return [v1[0] + t * dx, v1[1] + t * dy];
    }

    /**
     * Generate candidate nodes with distance constraints
     * @param {City} city - City data
     * @param {StreetNetwork} network - Network with existing nodes
     * @param {SeededRandom} rng - Random number generator
     * @returns {StreetNode[]} Array of candidate nodes
     */
    generateCandidateNodes(city, network, rng) {
        const candidates = [];
        const bounds = city.bounds;
        if (!bounds) return candidates;

        const existingPositions = network.getAllNodes().map(n => n.position);

        // Generate grid-based candidates with jitter
        for (let x = bounds.minX + this.candidateGridSpacing / 2;
             x < bounds.maxX;
             x += this.candidateGridSpacing) {
            for (let y = bounds.minY + this.candidateGridSpacing / 2;
                 y < bounds.maxY;
                 y += this.candidateGridSpacing) {

                // Add jitter
                const jx = x + rng.range(-this.jitterAmount, this.jitterAmount);
                const jy = y + rng.range(-this.jitterAmount, this.jitterAmount);
                const pos = [jx, jy];

                // Check if inside city boundary
                if (!city.containsPoint(jx, jy)) continue;

                // Check minimum distance from existing nodes
                let tooClose = false;
                for (const existing of existingPositions) {
                    if (this.distance(pos, existing) < this.minNodeDistance) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    for (const candidate of candidates) {
                        if (this.distance(pos, candidate.position) < this.minNodeDistance) {
                            tooClose = true;
                            break;
                        }
                    }
                }

                if (!tooClose) {
                    const node = network.createNode(jx, jy, 'district');
                    candidates.push(node);
                    existingPositions.push(pos);
                }
            }
        }

        return candidates;
    }

    /**
     * Connect main roads from gates to center
     * @param {StreetNetwork} network - Street network
     * @param {StreetNode} centerNode - Center node
     * @param {StreetNode[]} gateNodes - Gate nodes
     * @param {StreetNode[]} candidateNodes - Candidate intersection nodes
     * @param {City} city - City data
     * @param {SeededRandom} rng - Random number generator
     */
    connectMainRoads(network, centerNode, gateNodes, candidateNodes, city, rng) {
        // Connect each gate to the center via intermediate nodes
        for (const gate of gateNodes) {
            this.connectGateToCenter(network, gate, centerNode, candidateNodes, city);
        }

        // If no gates, create some direct streets from center outward
        if (gateNodes.length === 0 && candidateNodes.length > 0) {
            // Find 3-4 candidates roughly in different directions from center
            const directions = this.selectDirectionalNodes(centerNode, candidateNodes, 4);
            for (const node of directions) {
                this.tryAddEdge(network, centerNode.id, node.id, 'main');
            }
        }
    }

    /**
     * Connect a gate to the center using A* through candidate nodes
     * @param {StreetNetwork} network - Street network
     * @param {StreetNode} gate - Gate node
     * @param {StreetNode} center - Center node
     * @param {StreetNode[]} candidates - Available intermediate nodes
     * @param {City} city - City data
     */
    connectGateToCenter(network, gate, center, candidates, city) {
        // Simple approach: find path using intermediate nodes
        const path = this.findPathThroughNodes(gate, center, candidates, network, city);

        if (path.length >= 2) {
            // Create main road edges along the path
            for (let i = 0; i < path.length - 1; i++) {
                this.tryAddEdge(network, path[i].id, path[i + 1].id, 'main');
            }
        } else {
            // Direct connection if no path found
            this.tryAddEdge(network, gate.id, center.id, 'main');
        }
    }

    /**
     * Find a path through nodes using greedy approach toward target
     * @param {StreetNode} start - Start node
     * @param {StreetNode} end - End node
     * @param {StreetNode[]} intermediates - Available intermediate nodes
     * @param {StreetNetwork} network - Network for crossing checks
     * @param {City} city - City data
     * @returns {StreetNode[]} Path of nodes
     */
    findPathThroughNodes(start, end, intermediates, network, city) {
        const path = [start];
        let current = start;
        const used = new Set([start.id, end.id]);
        const maxSteps = 20;

        for (let step = 0; step < maxSteps; step++) {
            const distToEnd = this.distance(current.position, end.position);

            // If close enough, connect directly to end
            if (distToEnd < this.candidateGridSpacing * 2) {
                path.push(end);
                return path;
            }

            // Find best next node: closest to end that doesn't cause crossing
            let bestNode = null;
            let bestScore = Infinity;

            for (const node of intermediates) {
                if (used.has(node.id)) continue;

                const distFromCurrent = this.distance(current.position, node.position);
                const distFromNodeToEnd = this.distance(node.position, end.position);

                // Skip if too far from current position
                if (distFromCurrent > this.candidateGridSpacing * 2.5) continue;

                // Skip if moving away from target
                if (distFromNodeToEnd >= distToEnd) continue;

                // Check if edge would cross existing edges
                if (this.wouldCrossExistingEdges(network, current.position, node.position)) continue;

                // Score: distance to end + some cost for the hop
                const score = distFromNodeToEnd + distFromCurrent * 0.3;
                if (score < bestScore) {
                    bestScore = score;
                    bestNode = node;
                }
            }

            if (bestNode) {
                path.push(bestNode);
                used.add(bestNode.id);
                current = bestNode;
            } else {
                // No valid intermediate, try direct connection to end
                if (!this.wouldCrossExistingEdges(network, current.position, end.position)) {
                    path.push(end);
                }
                return path;
            }
        }

        path.push(end);
        return path;
    }

    /**
     * Select nodes in roughly different directions from a center point
     * @param {StreetNode} center - Center node
     * @param {StreetNode[]} candidates - Candidate nodes
     * @param {number} count - Number of directions to select
     * @returns {StreetNode[]} Selected nodes
     */
    selectDirectionalNodes(center, candidates, count) {
        if (candidates.length <= count) return [...candidates];

        // Divide into angular sectors and pick best from each
        const sectors = [];
        const sectorAngle = (2 * Math.PI) / count;

        for (let i = 0; i < count; i++) {
            sectors.push([]);
        }

        for (const node of candidates) {
            const dx = node.position[0] - center.position[0];
            const dy = node.position[1] - center.position[1];
            const angle = Math.atan2(dy, dx) + Math.PI; // 0 to 2PI
            const sector = Math.floor(angle / sectorAngle) % count;
            sectors[sector].push(node);
        }

        // Pick closest from each sector
        const result = [];
        for (const sector of sectors) {
            if (sector.length > 0) {
                sector.sort((a, b) =>
                    this.distance(a.position, center.position) -
                    this.distance(b.position, center.position)
                );
                result.push(sector[0]);
            }
        }

        return result;
    }

    /**
     * Add district-level streets
     * @param {StreetNetwork} network - Street network
     * @param {StreetNode[]} candidateNodes - Candidate nodes
     * @param {City} city - City data
     * @param {SeededRandom} rng - Random number generator
     */
    addDistrictStreets(network, candidateNodes, city, rng) {
        // Get all nodes and create potential connections
        const allNodes = network.getAllNodes();
        const potentialConnections = [];

        // Generate all potential connections with scores
        for (let i = 0; i < allNodes.length; i++) {
            for (let j = i + 1; j < allNodes.length; j++) {
                const nodeA = allNodes[i];
                const nodeB = allNodes[j];

                // Skip if already connected
                if (network.hasEdge(nodeA.id, nodeB.id)) continue;

                const dist = this.distance(nodeA.position, nodeB.position);

                // Skip if too far apart
                if (dist > this.candidateGridSpacing * 2) continue;

                // Calculate connection score (lower is better)
                const score = this.scoreConnection(nodeA, nodeB, dist, network);

                potentialConnections.push({
                    nodeA,
                    nodeB,
                    dist,
                    score
                });
            }
        }

        // Sort by score (best first)
        potentialConnections.sort((a, b) => a.score - b.score);

        // Add connections greedily, respecting constraints
        for (const conn of potentialConnections) {
            if (this.canAddConnection(network, conn.nodeA, conn.nodeB)) {
                this.tryAddEdge(network, conn.nodeA.id, conn.nodeB.id, 'district');
            }
        }
    }

    /**
     * Score a potential connection (lower is better)
     * @param {StreetNode} nodeA - First node
     * @param {StreetNode} nodeB - Second node
     * @param {number} dist - Distance between nodes
     * @param {StreetNetwork} network - Current network
     * @returns {number} Score value
     */
    scoreConnection(nodeA, nodeB, dist, network) {
        let score = dist;

        // Prefer connections involving center or gate nodes
        if (nodeA.type === 'center' || nodeB.type === 'center') {
            score *= 0.5;
        }
        if (nodeA.type === 'gate' || nodeB.type === 'gate') {
            score *= 0.7;
        }

        // Penalize connections to high-degree nodes
        const degA = nodeA.degree;
        const degB = nodeB.degree;
        if (degA >= 3) score *= 1.2;
        if (degB >= 3) score *= 1.2;

        // Slightly penalize very short connections
        if (dist < this.minNodeDistance * 1.2) {
            score *= 1.3;
        }

        return score;
    }

    /**
     * Check if a connection can be added respecting constraints
     * @param {StreetNetwork} network - Street network
     * @param {StreetNode} nodeA - First node
     * @param {StreetNode} nodeB - Second node
     * @returns {boolean} True if connection can be added
     */
    canAddConnection(network, nodeA, nodeB) {
        // Check max degree constraint
        if (nodeA.degree >= this.maxDegree || nodeB.degree >= this.maxDegree) {
            return false;
        }

        // Check angle constraint at both nodes
        if (!this.checkAngleConstraint(network, nodeA, nodeB.position)) {
            return false;
        }
        if (!this.checkAngleConstraint(network, nodeB, nodeA.position)) {
            return false;
        }

        // Check for edge crossings
        if (this.wouldCrossExistingEdges(network, nodeA.position, nodeB.position)) {
            return false;
        }

        return true;
    }

    /**
     * Check if adding an edge to a node would violate angle constraint
     * @param {StreetNetwork} network - Street network
     * @param {StreetNode} node - Node to check
     * @param {number[]} newNeighborPos - Position of potential new neighbor
     * @returns {boolean} True if angle constraint is satisfied
     */
    checkAngleConstraint(network, node, newNeighborPos) {
        const edges = network.getEdgesAtNode(node.id);
        if (edges.length === 0) return true;

        for (const edge of edges) {
            const otherId = edge.getOtherNode(node.id);
            const other = network.getNode(otherId);
            if (!other) continue;

            const angle = this.angleBetweenEdges(node.position, other.position, newNeighborPos);
            if (angle < this.minAngle) {
                return false;
            }
        }

        return true;
    }

    /**
     * Try to add an edge, respecting constraints
     * @param {StreetNetwork} network - Street network
     * @param {number} nodeIdA - First node ID
     * @param {number} nodeIdB - Second node ID
     * @param {string} type - Edge type
     * @returns {StreetEdge|null} Created edge or null
     */
    tryAddEdge(network, nodeIdA, nodeIdB, type) {
        const nodeA = network.getNode(nodeIdA);
        const nodeB = network.getNode(nodeIdB);
        if (!nodeA || !nodeB) return null;

        // Check if already connected
        if (network.hasEdge(nodeIdA, nodeIdB)) {
            return null;
        }

        // For main roads, be more lenient with constraints
        if (type === 'main') {
            // Only check for crossings with other main roads
            const mainEdges = network.getEdgesByType('main');
            for (const edge of mainEdges) {
                const n1 = network.getNode(edge.nodeIdA);
                const n2 = network.getNode(edge.nodeIdB);
                if (!n1 || !n2) continue;

                if (this.linesIntersect(nodeA.position, nodeB.position, n1.position, n2.position)) {
                    return null;
                }
            }

            return network.addEdge(nodeIdA, nodeIdB, type);
        }

        // For regular streets, check all constraints
        if (!this.canAddConnection(network, nodeA, nodeB)) {
            return null;
        }

        return network.addEdge(nodeIdA, nodeIdB, type);
    }

    /**
     * Remove nodes with no connections
     * @param {StreetNetwork} network - Street network
     */
    removeIsolatedNodes(network) {
        const toRemove = [];

        for (const node of network.getAllNodes()) {
            // Don't remove center or gate nodes even if isolated
            if (node.type === 'center' || node.type === 'gate') continue;

            if (node.degree === 0) {
                toRemove.push(node.id);
            }
        }

        for (const id of toRemove) {
            network.removeNode(id);
        }
    }

    // ========== Geometry Helpers ==========

    /**
     * Check if two line segments intersect (excluding endpoints)
     * @param {number[]} p1 - First segment start
     * @param {number[]} p2 - First segment end
     * @param {number[]} p3 - Second segment start
     * @param {number[]} p4 - Second segment end
     * @returns {boolean} True if segments intersect
     */
    linesIntersect(p1, p2, p3, p4) {
        const d1 = this.direction(p3, p4, p1);
        const d2 = this.direction(p3, p4, p2);
        const d3 = this.direction(p1, p2, p3);
        const d4 = this.direction(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        // Check collinear cases (we treat these as non-intersecting for streets)
        return false;
    }

    /**
     * Calculate direction (cross product sign) of point relative to line
     */
    direction(p1, p2, p3) {
        return (p3[0] - p1[0]) * (p2[1] - p1[1]) - (p2[0] - p1[0]) * (p3[1] - p1[1]);
    }

    /**
     * Find intersection point of two line segments
     * @param {number[]} p1 - First segment start
     * @param {number[]} p2 - First segment end
     * @param {number[]} p3 - Second segment start
     * @param {number[]} p4 - Second segment end
     * @returns {number[]|null} Intersection point or null
     */
    lineSegmentIntersection(p1, p2, p3, p4) {
        const denom = (p4[1] - p3[1]) * (p2[0] - p1[0]) - (p4[0] - p3[0]) * (p2[1] - p1[1]);
        if (Math.abs(denom) < 1e-10) return null; // Parallel

        const ua = ((p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0])) / denom;
        const ub = ((p2[0] - p1[0]) * (p1[1] - p3[1]) - (p2[1] - p1[1]) * (p1[0] - p3[0])) / denom;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return [
                p1[0] + ua * (p2[0] - p1[0]),
                p1[1] + ua * (p2[1] - p1[1])
            ];
        }

        return null;
    }

    /**
     * Check if adding an edge would cross any existing edges
     * @param {StreetNetwork} network - Street network
     * @param {number[]} posA - Start position
     * @param {number[]} posB - End position
     * @returns {boolean} True if would cross
     */
    wouldCrossExistingEdges(network, posA, posB) {
        for (const edge of network.getAllEdges()) {
            const n1 = network.getNode(edge.nodeIdA);
            const n2 = network.getNode(edge.nodeIdB);
            if (!n1 || !n2) continue;

            // Skip if sharing a vertex (adjacent edges can't cross)
            const shareVertex =
                this.distance(posA, n1.position) < 0.01 ||
                this.distance(posA, n2.position) < 0.01 ||
                this.distance(posB, n1.position) < 0.01 ||
                this.distance(posB, n2.position) < 0.01;

            if (shareVertex) continue;

            if (this.linesIntersect(posA, posB, n1.position, n2.position)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate angle between two edges at a node (in degrees)
     * @param {number[]} nodePos - Node position
     * @param {number[]} neighborPosA - First neighbor position
     * @param {number[]} neighborPosB - Second neighbor position
     * @returns {number} Angle in degrees (0-180)
     */
    angleBetweenEdges(nodePos, neighborPosA, neighborPosB) {
        // Vectors from node to neighbors
        const vAx = neighborPosA[0] - nodePos[0];
        const vAy = neighborPosA[1] - nodePos[1];
        const vBx = neighborPosB[0] - nodePos[0];
        const vBy = neighborPosB[1] - nodePos[1];

        // Normalize
        const lenA = Math.sqrt(vAx * vAx + vAy * vAy);
        const lenB = Math.sqrt(vBx * vBx + vBy * vBy);

        if (lenA < 0.001 || lenB < 0.001) return 180; // Degenerate case

        const nAx = vAx / lenA;
        const nAy = vAy / lenA;
        const nBx = vBx / lenB;
        const nBy = vBy / lenB;

        // Dot product gives cosine of angle
        const dot = nAx * nBx + nAy * nBy;

        // Clamp to avoid numerical issues
        const clamped = Math.max(-1, Math.min(1, dot));
        const angleRad = Math.acos(clamped);

        return angleRad * (180 / Math.PI);
    }

    /**
     * Calculate Euclidean distance between two points
     * @param {number[]} a - First point [x, y]
     * @param {number[]} b - Second point [x, y]
     * @returns {number} Distance
     */
    distance(a, b) {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if point is inside city boundary
     * @param {number[]} point - Point to check
     * @param {City} city - City with boundary
     * @returns {boolean} True if inside
     */
    isInsideCity(point, city) {
        return city.containsPoint(point[0], point[1]);
    }
}
