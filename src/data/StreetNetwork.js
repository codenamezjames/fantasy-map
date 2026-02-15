/**
 * StreetNetwork - Graph data structure for city street networks
 * Contains nodes (intersections) and edges (street segments)
 */

/**
 * StreetNode - a node/intersection in the street network
 */
export class StreetNode {
    constructor(config = {}) {
        this.id = config.id ?? 0;
        this.position = config.position ?? [0, 0];
        this.type = config.type ?? 'main'; // center, gate, main, district, alley
        this._degree = 0;
    }

    /**
     * Get degree (number of connected edges) - managed by StreetNetwork
     */
    get degree() {
        return this._degree;
    }

    set degree(val) {
        this._degree = val;
    }

    /**
     * Calculate distance to a point
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Euclidean distance
     */
    distanceTo(x, y) {
        return Math.hypot(this.position[0] - x, this.position[1] - y);
    }

    /**
     * Calculate distance to another node
     * @param {StreetNode} other - Other node
     * @returns {number} Euclidean distance
     */
    distanceToNode(other) {
        return this.distanceTo(other.position[0], other.position[1]);
    }

    /**
     * Get angle from this node to a point (radians)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Angle in radians
     */
    angleTo(x, y) {
        return Math.atan2(y - this.position[1], x - this.position[0]);
    }

    /**
     * Get angle to another node
     * @param {StreetNode} other - Other node
     * @returns {number} Angle in radians
     */
    angleToNode(other) {
        return this.angleTo(other.position[0], other.position[1]);
    }

    /**
     * Clone this node
     * @returns {StreetNode} New node with same properties
     */
    clone() {
        return new StreetNode({
            id: this.id,
            position: [...this.position],
            type: this.type
        });
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            position: this.position,
            type: this.type,
            degree: this._degree
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(data) {
        const node = new StreetNode(data);
        node._degree = data.degree ?? 0;
        return node;
    }
}

/**
 * StreetEdge - a street segment connecting two nodes
 */
export class StreetEdge {
    constructor(config = {}) {
        this.id = config.id ?? 0;
        this.nodeIdA = config.nodeIdA ?? 0;
        this.nodeIdB = config.nodeIdB ?? 0;
        this.type = config.type ?? 'main'; // main, district, alley
        this.width = config.width ?? this.getDefaultWidth();
    }

    /**
     * Get default width based on street type
     * @returns {number} Default width in world units
     */
    getDefaultWidth() {
        const widths = { main: 8, district: 5, alley: 2 };
        return widths[this.type] ?? 5;
    }

    /**
     * Get canonical edge key for deduplication (smaller ID first)
     * @returns {string} Edge key
     */
    getKey() {
        const [a, b] = this.nodeIdA < this.nodeIdB
            ? [this.nodeIdA, this.nodeIdB]
            : [this.nodeIdB, this.nodeIdA];
        return `${a}-${b}`;
    }

    /**
     * Check if this edge connects the given node
     * @param {number} nodeId - Node ID to check
     * @returns {boolean} True if edge connects to this node
     */
    connectsNode(nodeId) {
        return this.nodeIdA === nodeId || this.nodeIdB === nodeId;
    }

    /**
     * Get the other node ID given one endpoint
     * @param {number} nodeId - One endpoint node ID
     * @returns {number} The other endpoint node ID
     */
    getOtherNode(nodeId) {
        return this.nodeIdA === nodeId ? this.nodeIdB : this.nodeIdA;
    }

    /**
     * Check if this edge connects the same nodes as another edge
     * @param {StreetEdge} other - Other edge to compare
     * @returns {boolean} True if edges connect same nodes
     */
    sameNodes(other) {
        return this.getKey() === other.getKey();
    }

    /**
     * Clone this edge
     * @returns {StreetEdge} New edge with same properties
     */
    clone() {
        return new StreetEdge({
            id: this.id,
            nodeIdA: this.nodeIdA,
            nodeIdB: this.nodeIdB,
            type: this.type,
            width: this.width
        });
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            id: this.id,
            nodeIdA: this.nodeIdA,
            nodeIdB: this.nodeIdB,
            type: this.type,
            width: this.width
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(data) {
        return new StreetEdge(data);
    }
}

/**
 * StreetNetwork - graph of street nodes and edges
 */
export class StreetNetwork {
    constructor() {
        this.nodes = new Map();      // id -> StreetNode
        this.edges = new Map();      // id -> StreetEdge
        this.edgesByKey = new Map(); // "nodeIdA-nodeIdB" -> edgeId
        this.nodeEdges = new Map();  // nodeId -> Set of edgeIds
        this.nextNodeId = 1;
        this.nextEdgeId = 1;
    }

    // ========================
    // Node Operations
    // ========================

    /**
     * Add a node to the network
     * @param {StreetNode} node - Node to add
     * @returns {StreetNode} The added node (with ID assigned if not set)
     */
    addNode(node) {
        // Assign ID if not set or if ID already exists
        if (node.id === 0 || this.nodes.has(node.id)) {
            node.id = this.nextNodeId++;
        } else {
            // Ensure nextNodeId stays ahead
            this.nextNodeId = Math.max(this.nextNodeId, node.id + 1);
        }

        this.nodes.set(node.id, node);
        this.nodeEdges.set(node.id, new Set());
        return node;
    }

    /**
     * Create and add a new node
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} type - Node type
     * @returns {StreetNode} The created node
     */
    createNode(x, y, type = 'main') {
        const node = new StreetNode({
            position: [x, y],
            type
        });
        return this.addNode(node);
    }

    /**
     * Get a node by ID
     * @param {number} nodeId - Node ID
     * @returns {StreetNode|undefined} The node or undefined
     */
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    /**
     * Remove a node and all its connected edges
     * @param {number} nodeId - Node ID to remove
     * @returns {boolean} True if node was removed
     */
    removeNode(nodeId) {
        if (!this.nodes.has(nodeId)) {
            return false;
        }

        // Remove all edges connected to this node
        const edgeIds = this.nodeEdges.get(nodeId);
        if (edgeIds) {
            for (const edgeId of [...edgeIds]) {
                this.removeEdge(edgeId);
            }
        }

        // Remove the node
        this.nodes.delete(nodeId);
        this.nodeEdges.delete(nodeId);
        return true;
    }

    /**
     * Get all nodes as an array
     * @returns {StreetNode[]} Array of all nodes
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    /**
     * Get nodes by type
     * @param {string} type - Node type to filter by
     * @returns {StreetNode[]} Array of matching nodes
     */
    getNodesByType(type) {
        return this.getAllNodes().filter(node => node.type === type);
    }

    /**
     * Find the nearest node to a point
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} maxDistance - Maximum search distance (optional)
     * @returns {StreetNode|null} Nearest node or null
     */
    findNearestNode(x, y, maxDistance = Infinity) {
        let nearest = null;
        let minDist = maxDistance;

        for (const node of this.nodes.values()) {
            const dist = node.distanceTo(x, y);
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        }

        return nearest;
    }

    // ========================
    // Edge Operations
    // ========================

    /**
     * Add an edge between two nodes
     * @param {number} nodeIdA - First node ID
     * @param {number} nodeIdB - Second node ID
     * @param {string} type - Edge type
     * @returns {StreetEdge|null} The created edge or null if invalid
     */
    addEdge(nodeIdA, nodeIdB, type = 'main') {
        // Validate nodes exist
        if (!this.nodes.has(nodeIdA) || !this.nodes.has(nodeIdB)) {
            return null;
        }

        // Don't allow self-loops
        if (nodeIdA === nodeIdB) {
            return null;
        }

        // Check if edge already exists
        const key = this._makeEdgeKey(nodeIdA, nodeIdB);
        if (this.edgesByKey.has(key)) {
            return this.edges.get(this.edgesByKey.get(key));
        }

        // Create the edge
        const edge = new StreetEdge({
            id: this.nextEdgeId++,
            nodeIdA,
            nodeIdB,
            type
        });

        // Store the edge
        this.edges.set(edge.id, edge);
        this.edgesByKey.set(key, edge.id);

        // Update node edge sets
        this.nodeEdges.get(nodeIdA).add(edge.id);
        this.nodeEdges.get(nodeIdB).add(edge.id);

        // Update node degrees
        this.nodes.get(nodeIdA).degree++;
        this.nodes.get(nodeIdB).degree++;

        return edge;
    }

    /**
     * Get an edge by ID
     * @param {number} edgeId - Edge ID
     * @returns {StreetEdge|undefined} The edge or undefined
     */
    getEdge(edgeId) {
        return this.edges.get(edgeId);
    }

    /**
     * Check if an edge exists between two nodes
     * @param {number} nodeIdA - First node ID
     * @param {number} nodeIdB - Second node ID
     * @returns {boolean} True if edge exists
     */
    hasEdge(nodeIdA, nodeIdB) {
        const key = this._makeEdgeKey(nodeIdA, nodeIdB);
        return this.edgesByKey.has(key);
    }

    /**
     * Get edge between two nodes
     * @param {number} nodeIdA - First node ID
     * @param {number} nodeIdB - Second node ID
     * @returns {StreetEdge|undefined} The edge or undefined
     */
    getEdgeBetween(nodeIdA, nodeIdB) {
        const key = this._makeEdgeKey(nodeIdA, nodeIdB);
        const edgeId = this.edgesByKey.get(key);
        return edgeId !== undefined ? this.edges.get(edgeId) : undefined;
    }

    /**
     * Remove an edge by ID
     * @param {number} edgeId - Edge ID to remove
     * @returns {boolean} True if edge was removed
     */
    removeEdge(edgeId) {
        const edge = this.edges.get(edgeId);
        if (!edge) {
            return false;
        }

        // Remove from edge maps
        this.edges.delete(edgeId);
        this.edgesByKey.delete(edge.getKey());

        // Update node edge sets and degrees
        const nodeA = this.nodes.get(edge.nodeIdA);
        const nodeB = this.nodes.get(edge.nodeIdB);

        if (this.nodeEdges.has(edge.nodeIdA)) {
            this.nodeEdges.get(edge.nodeIdA).delete(edgeId);
            if (nodeA) nodeA.degree--;
        }

        if (this.nodeEdges.has(edge.nodeIdB)) {
            this.nodeEdges.get(edge.nodeIdB).delete(edgeId);
            if (nodeB) nodeB.degree--;
        }

        return true;
    }

    /**
     * Get all edges connected to a node
     * @param {number} nodeId - Node ID
     * @returns {StreetEdge[]} Array of connected edges
     */
    getEdgesAtNode(nodeId) {
        const edgeIds = this.nodeEdges.get(nodeId);
        if (!edgeIds) return [];

        return Array.from(edgeIds)
            .map(id => this.edges.get(id))
            .filter(edge => edge !== undefined);
    }

    /**
     * Get all edges as an array
     * @returns {StreetEdge[]} Array of all edges
     */
    getAllEdges() {
        return Array.from(this.edges.values());
    }

    /**
     * Get edges by type
     * @param {string} type - Edge type to filter by
     * @returns {StreetEdge[]} Array of matching edges
     */
    getEdgesByType(type) {
        return this.getAllEdges().filter(edge => edge.type === type);
    }

    // ========================
    // Graph Traversal
    // ========================

    /**
     * Get neighbor node IDs for a node
     * @param {number} nodeId - Node ID
     * @returns {number[]} Array of neighbor node IDs
     */
    getNeighbors(nodeId) {
        const edges = this.getEdgesAtNode(nodeId);
        return edges.map(edge => edge.getOtherNode(nodeId));
    }

    /**
     * Get neighbor nodes for a node
     * @param {number} nodeId - Node ID
     * @returns {StreetNode[]} Array of neighbor nodes
     */
    getNeighborNodes(nodeId) {
        return this.getNeighbors(nodeId)
            .map(id => this.nodes.get(id))
            .filter(node => node !== undefined);
    }

    /**
     * Check if the network is connected (all nodes reachable from any node)
     * @returns {boolean} True if connected
     */
    isConnected() {
        if (this.nodes.size <= 1) return true;

        const visited = new Set();
        const startId = this.nodes.keys().next().value;

        // BFS traversal
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift();
            for (const neighbor of this.getNeighbors(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return visited.size === this.nodes.size;
    }

    /**
     * Find all connected components
     * @returns {number[][]} Array of arrays of node IDs for each component
     */
    getConnectedComponents() {
        const visited = new Set();
        const components = [];

        for (const nodeId of this.nodes.keys()) {
            if (visited.has(nodeId)) continue;

            const component = [];
            const queue = [nodeId];
            visited.add(nodeId);

            while (queue.length > 0) {
                const current = queue.shift();
                component.push(current);

                for (const neighbor of this.getNeighbors(current)) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }

            components.push(component);
        }

        return components;
    }

    // ========================
    // Face Finding (Cycle Detection)
    // ========================

    /**
     * Find all faces (minimal cycles) in the planar graph
     * These represent city blocks suitable for building placement
     * @returns {number[][]} Array of faces, each face is an array of node IDs
     */
    findFaces() {
        if (this.nodes.size < 3 || this.edges.size < 3) {
            return [];
        }

        // Build adjacency structure sorted by angle
        const sortedAdjacency = this._buildSortedAdjacency();

        // Track used half-edges (directed edges)
        const usedHalfEdges = new Set();
        const faces = [];

        // For each directed edge, try to find a face
        for (const [nodeId, neighbors] of sortedAdjacency) {
            for (const neighborId of neighbors) {
                const halfEdgeKey = `${nodeId}->${neighborId}`;
                if (usedHalfEdges.has(halfEdgeKey)) continue;

                // Try to trace a face starting from this half-edge
                const face = this._traceFace(nodeId, neighborId, sortedAdjacency, usedHalfEdges);

                if (face && face.length >= 3) {
                    // Verify it's a valid face (not the outer boundary)
                    if (!this._isOuterBoundary(face)) {
                        faces.push(face);
                    }
                }
            }
        }

        return faces;
    }

    /**
     * Build adjacency list with neighbors sorted by angle (CCW order)
     * @private
     */
    _buildSortedAdjacency() {
        const adjacency = new Map();

        for (const [nodeId, node] of this.nodes) {
            const neighbors = this.getNeighbors(nodeId);

            // Sort neighbors by angle from this node
            neighbors.sort((a, b) => {
                const nodeA = this.nodes.get(a);
                const nodeB = this.nodes.get(b);
                const angleA = node.angleToNode(nodeA);
                const angleB = node.angleToNode(nodeB);
                return angleA - angleB;
            });

            adjacency.set(nodeId, neighbors);
        }

        return adjacency;
    }

    /**
     * Trace a face starting from a directed edge
     * Uses the "next edge in CW order" rule for finding interior faces
     * When at a node, we turn right (CW) to stay inside the face
     * @private
     */
    _traceFace(startNode, nextNode, adjacency, usedHalfEdges) {
        const face = [startNode];
        let current = startNode;
        let next = nextNode;
        const maxIterations = this.nodes.size + 1;
        let iterations = 0;

        while (iterations < maxIterations) {
            const halfEdgeKey = `${current}->${next}`;

            // Check if already used - if so, stop tracing
            if (usedHalfEdges.has(halfEdgeKey)) {
                return null;
            }

            // Mark this half-edge as used
            usedHalfEdges.add(halfEdgeKey);

            face.push(next);

            // Check if we've completed the cycle
            if (next === startNode) {
                // Remove the duplicate start node from end
                face.pop();
                return face;
            }

            // Find the next edge: turn right (clockwise) from incoming direction
            // This ensures we trace the minimal face (city block)
            const neighbors = adjacency.get(next);
            if (!neighbors || neighbors.length === 0) {
                return null;
            }

            // Find index of current (where we came from) in next's neighbor list
            const prevIndex = neighbors.indexOf(current);
            if (prevIndex === -1) {
                return null;
            }

            // For interior faces, we turn right (CW), which means going backwards
            // in the CCW-sorted neighbor list (subtract 1 and wrap)
            // This ensures we trace the minimal cycle enclosing the interior
            const nextIndex = (prevIndex - 1 + neighbors.length) % neighbors.length;

            current = next;
            next = neighbors[nextIndex];
            iterations++;
        }

        // Exceeded max iterations - not a valid face
        return null;
    }

    /**
     * Check if a face is the outer boundary (should be excluded)
     * The outer boundary has the largest area with clockwise orientation
     * @private
     */
    _isOuterBoundary(faceNodeIds) {
        if (faceNodeIds.length < 3) return false;

        // Calculate signed area using shoelace formula
        let signedArea = 0;
        const n = faceNodeIds.length;

        for (let i = 0; i < n; i++) {
            const node1 = this.nodes.get(faceNodeIds[i]);
            const node2 = this.nodes.get(faceNodeIds[(i + 1) % n]);

            if (!node1 || !node2) return false;

            signedArea += node1.position[0] * node2.position[1];
            signedArea -= node2.position[0] * node1.position[1];
        }

        // Negative signed area indicates clockwise winding (outer boundary)
        if (signedArea < 0) return true;

        // Also reject oversized faces that slipped through winding check
        // These are likely semi-enclosed regions or boundary artifacts
        const absArea = Math.abs(signedArea / 2);
        if (absArea > 4000) return true;

        return false;
    }

    /**
     * Get the polygon coordinates for a face
     * @param {number[]} faceNodeIds - Array of node IDs forming the face
     * @returns {number[][]} Array of [x, y] coordinates
     */
    getFacePolygon(faceNodeIds) {
        return faceNodeIds
            .map(id => this.nodes.get(id))
            .filter(node => node !== undefined)
            .map(node => [...node.position]);
    }

    /**
     * Calculate the area of a face
     * @param {number[]} faceNodeIds - Array of node IDs
     * @returns {number} Area (always positive)
     */
    getFaceArea(faceNodeIds) {
        const polygon = this.getFacePolygon(faceNodeIds);
        return this._calculatePolygonArea(polygon);
    }

    /**
     * Calculate polygon area using shoelace formula
     * @private
     */
    _calculatePolygonArea(vertices) {
        if (vertices.length < 3) return 0;

        let area = 0;
        const n = vertices.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += vertices[i][0] * vertices[j][1];
            area -= vertices[j][0] * vertices[i][1];
        }

        return Math.abs(area / 2);
    }

    // ========================
    // Geometry Helpers
    // ========================

    /**
     * Get the length of an edge
     * @param {number} edgeId - Edge ID
     * @returns {number} Edge length
     */
    getEdgeLength(edgeId) {
        const edge = this.edges.get(edgeId);
        if (!edge) return 0;

        const nodeA = this.nodes.get(edge.nodeIdA);
        const nodeB = this.nodes.get(edge.nodeIdB);
        if (!nodeA || !nodeB) return 0;

        return nodeA.distanceToNode(nodeB);
    }

    /**
     * Get the midpoint of an edge
     * @param {number} edgeId - Edge ID
     * @returns {number[]|null} [x, y] midpoint or null
     */
    getEdgeMidpoint(edgeId) {
        const edge = this.edges.get(edgeId);
        if (!edge) return null;

        const nodeA = this.nodes.get(edge.nodeIdA);
        const nodeB = this.nodes.get(edge.nodeIdB);
        if (!nodeA || !nodeB) return null;

        return [
            (nodeA.position[0] + nodeB.position[0]) / 2,
            (nodeA.position[1] + nodeB.position[1]) / 2
        ];
    }

    /**
     * Get the angle of an edge (from node A to node B)
     * @param {number} edgeId - Edge ID
     * @returns {number} Angle in radians
     */
    getEdgeAngle(edgeId) {
        const edge = this.edges.get(edgeId);
        if (!edge) return 0;

        const nodeA = this.nodes.get(edge.nodeIdA);
        const nodeB = this.nodes.get(edge.nodeIdB);
        if (!nodeA || !nodeB) return 0;

        return nodeA.angleToNode(nodeB);
    }

    /**
     * Calculate angle between two edges at a shared node
     * @param {number} edgeId1 - First edge ID
     * @param {number} edgeId2 - Second edge ID
     * @param {number} sharedNodeId - The shared node ID
     * @returns {number} Angle in radians (0 to 2*PI)
     */
    getAngleBetweenEdges(edgeId1, edgeId2, sharedNodeId) {
        const edge1 = this.edges.get(edgeId1);
        const edge2 = this.edges.get(edgeId2);
        if (!edge1 || !edge2) return 0;

        const sharedNode = this.nodes.get(sharedNodeId);
        if (!sharedNode) return 0;

        // Get the other nodes
        const other1 = this.nodes.get(edge1.getOtherNode(sharedNodeId));
        const other2 = this.nodes.get(edge2.getOtherNode(sharedNodeId));
        if (!other1 || !other2) return 0;

        // Calculate angles
        const angle1 = sharedNode.angleToNode(other1);
        const angle2 = sharedNode.angleToNode(other2);

        // Return positive angle difference
        let diff = angle2 - angle1;
        while (diff < 0) diff += 2 * Math.PI;
        while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;

        return diff;
    }

    /**
     * Check if two edges intersect (not counting shared endpoints)
     * @param {number} edgeId1 - First edge ID
     * @param {number} edgeId2 - Second edge ID
     * @returns {boolean} True if edges intersect
     */
    edgesIntersect(edgeId1, edgeId2) {
        const edge1 = this.edges.get(edgeId1);
        const edge2 = this.edges.get(edgeId2);
        if (!edge1 || !edge2) return false;

        // Check for shared endpoints
        if (edge1.nodeIdA === edge2.nodeIdA || edge1.nodeIdA === edge2.nodeIdB ||
            edge1.nodeIdB === edge2.nodeIdA || edge1.nodeIdB === edge2.nodeIdB) {
            return false; // Shared endpoint doesn't count as intersection
        }

        const a1 = this.nodes.get(edge1.nodeIdA);
        const b1 = this.nodes.get(edge1.nodeIdB);
        const a2 = this.nodes.get(edge2.nodeIdA);
        const b2 = this.nodes.get(edge2.nodeIdB);

        if (!a1 || !b1 || !a2 || !b2) return false;

        return this._segmentsIntersect(
            a1.position, b1.position,
            a2.position, b2.position
        );
    }

    /**
     * Check if two line segments intersect
     * @private
     */
    _segmentsIntersect(p1, p2, p3, p4) {
        const d1 = this._direction(p3, p4, p1);
        const d2 = this._direction(p3, p4, p2);
        const d3 = this._direction(p1, p2, p3);
        const d4 = this._direction(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        if (d1 === 0 && this._onSegment(p3, p4, p1)) return true;
        if (d2 === 0 && this._onSegment(p3, p4, p2)) return true;
        if (d3 === 0 && this._onSegment(p1, p2, p3)) return true;
        if (d4 === 0 && this._onSegment(p1, p2, p4)) return true;

        return false;
    }

    /**
     * Calculate cross product direction
     * @private
     */
    _direction(p1, p2, p3) {
        return (p3[0] - p1[0]) * (p2[1] - p1[1]) - (p2[0] - p1[0]) * (p3[1] - p1[1]);
    }

    /**
     * Check if point is on segment
     * @private
     */
    _onSegment(p1, p2, p) {
        return Math.min(p1[0], p2[0]) <= p[0] && p[0] <= Math.max(p1[0], p2[0]) &&
               Math.min(p1[1], p2[1]) <= p[1] && p[1] <= Math.max(p1[1], p2[1]);
    }

    /**
     * Find intersection point of two line segments (if they intersect)
     * @param {number[]} p1 - First segment start
     * @param {number[]} p2 - First segment end
     * @param {number[]} p3 - Second segment start
     * @param {number[]} p4 - Second segment end
     * @returns {number[]|null} Intersection point [x, y] or null
     */
    lineIntersection(p1, p2, p3, p4) {
        const x1 = p1[0], y1 = p1[1];
        const x2 = p2[0], y2 = p2[1];
        const x3 = p3[0], y3 = p3[1];
        const x4 = p4[0], y4 = p4[1];

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        // Check if intersection is within both segments
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return [
                x1 + t * (x2 - x1),
                y1 + t * (y2 - y1)
            ];
        }

        return null;
    }

    // ========================
    // Utility Methods
    // ========================

    /**
     * Create canonical edge key
     * @private
     */
    _makeEdgeKey(nodeIdA, nodeIdB) {
        const [a, b] = nodeIdA < nodeIdB ? [nodeIdA, nodeIdB] : [nodeIdB, nodeIdA];
        return `${a}-${b}`;
    }

    /**
     * Get total length of all edges
     * @returns {number} Total length
     */
    getTotalLength() {
        let total = 0;
        for (const edge of this.edges.values()) {
            total += this.getEdgeLength(edge.id);
        }
        return total;
    }

    /**
     * Get network statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const nodes = this.getAllNodes();
        const edges = this.getAllEdges();

        const degrees = nodes.map(n => n.degree);
        const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;

        return {
            nodeCount: this.nodes.size,
            edgeCount: this.edges.size,
            averageDegree: avgDegree,
            maxDegree: Math.max(0, ...degrees),
            minDegree: Math.min(Infinity, ...degrees),
            totalLength: this.getTotalLength(),
            isConnected: this.isConnected(),
            componentCount: this.getConnectedComponents().length,
            nodesByType: this._countByType(nodes, 'type'),
            edgesByType: this._countByType(edges, 'type')
        };
    }

    /**
     * Count items by a property
     * @private
     */
    _countByType(items, property) {
        const counts = {};
        for (const item of items) {
            const type = item[property];
            counts[type] = (counts[type] || 0) + 1;
        }
        return counts;
    }

    /**
     * Get bounding box of all nodes
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
     */
    getBounds() {
        if (this.nodes.size === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const node of this.nodes.values()) {
            const [x, y] = node.position;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Clear all nodes and edges
     */
    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.edgesByKey.clear();
        this.nodeEdges.clear();
        this.nextNodeId = 1;
        this.nextEdgeId = 1;
    }

    /**
     * Clone the entire network
     * @returns {StreetNetwork} New network with copied data
     */
    clone() {
        const network = new StreetNetwork();

        // Clone nodes
        for (const node of this.nodes.values()) {
            network.addNode(node.clone());
        }

        // Clone edges
        for (const edge of this.edges.values()) {
            network.addEdge(edge.nodeIdA, edge.nodeIdB, edge.type);
        }

        return network;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        return {
            nodes: this.getAllNodes().map(n => n.toJSON()),
            edges: this.getAllEdges().map(e => e.toJSON()),
            nextNodeId: this.nextNodeId,
            nextEdgeId: this.nextEdgeId
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(data) {
        const network = new StreetNetwork();

        // Restore nodes
        if (data.nodes) {
            for (const nodeData of data.nodes) {
                const node = StreetNode.fromJSON(nodeData);
                network.nodes.set(node.id, node);
                network.nodeEdges.set(node.id, new Set());
            }
        }

        // Restore edges
        if (data.edges) {
            for (const edgeData of data.edges) {
                const edge = StreetEdge.fromJSON(edgeData);
                network.edges.set(edge.id, edge);
                network.edgesByKey.set(edge.getKey(), edge.id);

                // Update node edge sets
                if (network.nodeEdges.has(edge.nodeIdA)) {
                    network.nodeEdges.get(edge.nodeIdA).add(edge.id);
                }
                if (network.nodeEdges.has(edge.nodeIdB)) {
                    network.nodeEdges.get(edge.nodeIdB).add(edge.id);
                }
            }
        }

        network.nextNodeId = data.nextNodeId ?? 1;
        network.nextEdgeId = data.nextEdgeId ?? 1;

        return network;
    }
}
