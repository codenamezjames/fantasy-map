/**
 * StreetGenerator Tests
 * Tests for the city street network generation
 */

import { StreetGenerator } from '../src/generation/StreetGenerator.js';
import { StreetNetwork, StreetNode, StreetEdge } from '../src/data/StreetNetwork.js';

// ========== Mock Data ==========

/**
 * Mock RNG with deterministic output
 */
class MockRNG {
    constructor(seed = 12345) {
        this.seed = seed;
    }

    random() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return (this.seed / 0x7fffffff);
    }

    range(min, max) {
        return min + this.random() * (max - min);
    }
}

/**
 * Create mock city with configurable parameters
 */
function createMockCity(options = {}) {
    const center = options.center ?? [100, 100];
    const size = options.size ?? 100;
    const halfSize = size / 2;

    return {
        center: center,
        boundary: options.boundary ?? [
            [center[0] - halfSize, center[1] - halfSize],
            [center[0] + halfSize, center[1] - halfSize],
            [center[0] + halfSize, center[1] + halfSize],
            [center[0] - halfSize, center[1] + halfSize]
        ],
        bounds: options.bounds ?? {
            minX: center[0] - halfSize,
            minY: center[1] - halfSize,
            maxX: center[0] + halfSize,
            maxY: center[1] + halfSize
        },
        type: options.type ?? 'town',
        params: options.params ?? { streetDensity: 0.5 },
        occupiedTileIds: options.occupiedTileIds ?? ['tile_100_100'],
        containsPoint: function(x, y) {
            return x >= this.bounds.minX && x <= this.bounds.maxX &&
                   y >= this.bounds.minY && y <= this.bounds.maxY;
        },
        calculateBounds: function() {
            // Already has bounds
        }
    };
}

/**
 * Create mock world with optional roads
 */
function createMockWorld(options = {}) {
    const tiles = new Map();

    if (options.tiles) {
        for (const [id, tile] of Object.entries(options.tiles)) {
            tiles.set(id, tile);
        }
    }

    return {
        tiles: tiles,
        getTile: function(id) {
            return this.tiles.get(id) ?? null;
        }
    };
}

// ========== Test Utilities ==========

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertApproxEqual(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}: expected ${expected}, got ${actual} (tolerance: ${tolerance})`);
    }
}

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`  [PASS] ${name}`);
        testsPassed++;
    } catch (error) {
        console.log(`  [FAIL] ${name}`);
        console.log(`         ${error.message}`);
        testsFailed++;
    }
}

// ========== Test Suites ==========

console.log('\n=== StreetGenerator Tests ===\n');

// ----- Test Suite: placeCenterNode -----
console.log('Testing placeCenterNode():');

runTest('should place node at city center coordinates', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ center: [150, 200] });
    const network = new StreetNetwork();

    const centerNode = generator.placeCenterNode(city, network);

    assert(centerNode !== null, 'Center node should not be null');
    assert(centerNode.position[0] === 150, `X should be 150, got ${centerNode.position[0]}`);
    assert(centerNode.position[1] === 200, `Y should be 200, got ${centerNode.position[1]}`);
});

runTest('should set node type to center', () => {
    const generator = new StreetGenerator();
    const city = createMockCity();
    const network = new StreetNetwork();

    const centerNode = generator.placeCenterNode(city, network);

    assert(centerNode.type === 'center', `Type should be 'center', got '${centerNode.type}'`);
});

runTest('should add node to network', () => {
    const generator = new StreetGenerator();
    const city = createMockCity();
    const network = new StreetNetwork();

    const centerNode = generator.placeCenterNode(city, network);

    assert(network.getNode(centerNode.id) === centerNode, 'Node should be in network');
    assert(network.getAllNodes().length === 1, 'Network should have exactly 1 node');
});

// ----- Test Suite: generateCandidateNodes -----
console.log('\nTesting generateCandidateNodes():');

runTest('should create nodes within city boundary', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const network = new StreetNetwork();
    const rng = new MockRNG();

    // Add center node first
    generator.placeCenterNode(city, network);

    const candidates = generator.generateCandidateNodes(city, network, rng);

    assert(candidates.length > 0, 'Should generate some candidate nodes');

    for (const node of candidates) {
        const inBounds = city.containsPoint(node.position[0], node.position[1]);
        assert(inBounds, `Node at (${node.position[0]}, ${node.position[1]}) should be inside city`);
    }
});

runTest('should respect minimum node distance', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const network = new StreetNetwork();
    const rng = new MockRNG();

    generator.placeCenterNode(city, network);
    const candidates = generator.generateCandidateNodes(city, network, rng);

    // Check all pairs of candidates
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const dist = generator.distance(candidates[i].position, candidates[j].position);
            assert(
                dist >= generator.minNodeDistance - 0.01,
                `Distance ${dist} between nodes ${i} and ${j} should be >= ${generator.minNodeDistance}`
            );
        }
    }
});

runTest('should create district-type nodes', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const network = new StreetNetwork();
    const rng = new MockRNG();

    generator.placeCenterNode(city, network);
    const candidates = generator.generateCandidateNodes(city, network, rng);

    for (const node of candidates) {
        assert(node.type === 'district', `Node type should be 'district', got '${node.type}'`);
    }
});

runTest('should return empty array for city without bounds', () => {
    const generator = new StreetGenerator();
    const city = createMockCity();
    city.bounds = null; // Remove bounds
    const network = new StreetNetwork();
    const rng = new MockRNG();

    const candidates = generator.generateCandidateNodes(city, network, rng);

    assert(candidates.length === 0, 'Should return empty array when no bounds');
});

// ----- Test Suite: linesIntersect -----
console.log('\nTesting linesIntersect():');

runTest('should detect crossing lines', () => {
    const generator = new StreetGenerator();

    // Two lines that clearly cross
    const result = generator.linesIntersect(
        [0, 0], [10, 10],   // Line 1: diagonal from origin
        [0, 10], [10, 0]    // Line 2: opposite diagonal
    );

    assert(result === true, 'Should detect intersection');
});

runTest('should return false for parallel lines', () => {
    const generator = new StreetGenerator();

    // Two parallel horizontal lines
    const result = generator.linesIntersect(
        [0, 0], [10, 0],    // Line 1
        [0, 5], [10, 5]     // Line 2 (parallel, above)
    );

    assert(result === false, 'Should not detect intersection for parallel lines');
});

runTest('should return false for non-crossing segments', () => {
    const generator = new StreetGenerator();

    // Two segments that don't reach each other
    const result = generator.linesIntersect(
        [0, 0], [3, 3],     // Line 1: short diagonal
        [7, 7], [10, 10]    // Line 2: continues diagonal but separate
    );

    assert(result === false, 'Should not detect intersection for non-crossing segments');
});

runTest('should handle T-shaped near-intersections', () => {
    const generator = new StreetGenerator();

    // Lines that form a T shape but don't actually cross
    const result = generator.linesIntersect(
        [0, 5], [10, 5],    // Horizontal line
        [5, 0], [5, 4.99]   // Vertical line stops just before intersection
    );

    assert(result === false, 'T-shaped near-intersection should return false');
});

runTest('should handle collinear segments as non-intersecting', () => {
    const generator = new StreetGenerator();

    // Two collinear segments that overlap
    const result = generator.linesIntersect(
        [0, 0], [5, 0],
        [3, 0], [8, 0]
    );

    // The implementation treats collinear as non-intersecting for street purposes
    assert(result === false, 'Collinear segments should return false');
});

// ----- Test Suite: angleBetweenEdges -----
console.log('\nTesting angleBetweenEdges():');

runTest('should return 90 degrees for perpendicular edges', () => {
    const generator = new StreetGenerator();

    const nodePos = [0, 0];
    const neighborA = [10, 0];   // Right
    const neighborB = [0, 10];   // Up

    const angle = generator.angleBetweenEdges(nodePos, neighborA, neighborB);

    assertApproxEqual(angle, 90, 0.01, 'Angle should be 90 degrees');
});

runTest('should return 180 degrees for opposite edges', () => {
    const generator = new StreetGenerator();

    const nodePos = [0, 0];
    const neighborA = [-10, 0];  // Left
    const neighborB = [10, 0];   // Right

    const angle = generator.angleBetweenEdges(nodePos, neighborA, neighborB);

    assertApproxEqual(angle, 180, 0.01, 'Angle should be 180 degrees');
});

runTest('should return 45 degrees for diagonal edges', () => {
    const generator = new StreetGenerator();

    const nodePos = [0, 0];
    const neighborA = [10, 0];   // Right (0 degrees)
    const neighborB = [10, 10];  // Up-right (45 degrees)

    const angle = generator.angleBetweenEdges(nodePos, neighborA, neighborB);

    assertApproxEqual(angle, 45, 0.01, 'Angle should be 45 degrees');
});

runTest('should return 180 for degenerate case (zero-length edge)', () => {
    const generator = new StreetGenerator();

    const nodePos = [0, 0];
    const neighborA = [0, 0];    // Same as node (degenerate)
    const neighborB = [10, 0];

    const angle = generator.angleBetweenEdges(nodePos, neighborA, neighborB);

    assert(angle === 180, `Degenerate case should return 180, got ${angle}`);
});

runTest('should calculate correct acute angle', () => {
    const generator = new StreetGenerator();

    const nodePos = [0, 0];
    const neighborA = [10, 0];   // Right
    const neighborB = [10, 5];   // Slight upward angle

    const angle = generator.angleBetweenEdges(nodePos, neighborA, neighborB);

    // arctan(5/10) = 26.57 degrees
    assertApproxEqual(angle, 26.57, 0.1, 'Angle should be approximately 26.57 degrees');
});

// ----- Test Suite: connectMainRoads -----
console.log('\nTesting connectMainRoads():');

runTest('should connect gates to center via paths', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();
    const city = createMockCity({ size: 100 });
    const rng = new MockRNG();

    // Create center
    const centerNode = network.createNode(100, 100, 'center');

    // Create gate nodes
    const gate1 = network.createNode(50, 100, 'gate');
    const gate2 = network.createNode(150, 100, 'gate');

    // Create some candidate nodes
    const cand1 = network.createNode(75, 100, 'district');
    const cand2 = network.createNode(125, 100, 'district');

    generator.connectMainRoads(network, centerNode, [gate1, gate2], [cand1, cand2], city, rng);

    // Should have created some edges
    assert(network.getAllEdges().length > 0, 'Should create edges');

    // Check that there are main road edges
    const mainEdges = network.getEdgesByType('main');
    assert(mainEdges.length > 0, 'Should create main road edges');
});

runTest('should create streets from center when no gates', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();
    const city = createMockCity({ size: 100 });
    const rng = new MockRNG();

    // Create center
    const centerNode = network.createNode(100, 100, 'center');

    // Create candidate nodes in different directions
    const candidates = [
        network.createNode(80, 100, 'district'),
        network.createNode(120, 100, 'district'),
        network.createNode(100, 80, 'district'),
        network.createNode(100, 120, 'district')
    ];

    generator.connectMainRoads(network, centerNode, [], candidates, city, rng);

    // Should create edges from center
    const centerEdges = network.getEdgesAtNode(centerNode.id);
    assert(centerEdges.length > 0, 'Should create edges from center when no gates');
});

runTest('should not create crossings between main roads', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();
    const city = createMockCity({ size: 100 });
    const rng = new MockRNG();

    // Create center
    const centerNode = network.createNode(100, 100, 'center');

    // Create gate nodes at different corners
    const gates = [
        network.createNode(50, 50, 'gate'),
        network.createNode(150, 150, 'gate'),
        network.createNode(50, 150, 'gate'),
        network.createNode(150, 50, 'gate')
    ];

    // Create candidate nodes
    const candidates = [
        network.createNode(75, 75, 'district'),
        network.createNode(125, 125, 'district'),
        network.createNode(75, 125, 'district'),
        network.createNode(125, 75, 'district')
    ];

    generator.connectMainRoads(network, centerNode, gates, candidates, city, rng);

    // Check for no edge crossings
    const mainEdges = network.getEdgesByType('main');
    for (let i = 0; i < mainEdges.length; i++) {
        for (let j = i + 1; j < mainEdges.length; j++) {
            const crosses = network.edgesIntersect(mainEdges[i].id, mainEdges[j].id);
            assert(!crosses, `Main roads ${mainEdges[i].id} and ${mainEdges[j].id} should not cross`);
        }
    }
});

// ----- Test Suite: Full generate() -----
console.log('\nTesting full generate():');

runTest('should produce valid street network', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    assert(network instanceof StreetNetwork, 'Should return StreetNetwork');
    assert(network.getAllNodes().length > 0, 'Should have nodes');
});

runTest('should have exactly one center node', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    const centerNodes = network.getNodesByType('center');
    assert(centerNodes.length === 1, `Should have 1 center node, got ${centerNodes.length}`);
});

runTest('should have center node at city center', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ center: [150, 200], size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    const centerNodes = network.getNodesByType('center');
    assert(centerNodes[0].position[0] === 150, 'Center X should match city center');
    assert(centerNodes[0].position[1] === 200, 'Center Y should match city center');
});

runTest('should not have isolated district nodes', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    for (const node of network.getAllNodes()) {
        if (node.type === 'district') {
            assert(node.degree > 0, `District node ${node.id} should not be isolated`);
        }
    }
});

runTest('should respect max degree constraint', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    for (const node of network.getAllNodes()) {
        assert(
            node.degree <= generator.maxDegree,
            `Node ${node.id} has degree ${node.degree}, max is ${generator.maxDegree}`
        );
    }
});

runTest('should produce network without edge crossings (except at nodes)', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    const edges = network.getAllEdges();
    let crossings = 0;

    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            if (network.edgesIntersect(edges[i].id, edges[j].id)) {
                crossings++;
            }
        }
    }

    assert(crossings === 0, `Should have no edge crossings, found ${crossings}`);
});

runTest('should create gate nodes when world has roads crossing boundary', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({
        center: [100, 100],
        size: 100,
        occupiedTileIds: ['tile_100_100']
    });

    // Create world with a road crossing boundary
    const world = createMockWorld({
        tiles: {
            'tile_100_100': {
                center: [100, 100],
                roadEdges: ['tile_200_100'] // Road going east outside city
            },
            'tile_200_100': {
                center: [200, 100],
                roadEdges: ['tile_100_100']
            }
        }
    });

    const rng = new MockRNG();
    const network = generator.generate(city, world, rng);

    const gateNodes = network.getNodesByType('gate');
    assert(gateNodes.length > 0, 'Should create gate nodes when roads cross boundary');
});

// ----- Test Suite: Helper methods -----
console.log('\nTesting helper methods:');

runTest('distance() should calculate Euclidean distance', () => {
    const generator = new StreetGenerator();

    const dist = generator.distance([0, 0], [3, 4]);

    assertApproxEqual(dist, 5, 0.001, 'Distance should be 5');
});

runTest('distance() should return 0 for same point', () => {
    const generator = new StreetGenerator();

    const dist = generator.distance([5, 5], [5, 5]);

    assert(dist === 0, 'Distance to same point should be 0');
});

runTest('lineSegmentIntersection() should find intersection point', () => {
    const generator = new StreetGenerator();

    const point = generator.lineSegmentIntersection(
        [0, 0], [10, 10],
        [0, 10], [10, 0]
    );

    assert(point !== null, 'Should find intersection');
    assertApproxEqual(point[0], 5, 0.01, 'Intersection X should be 5');
    assertApproxEqual(point[1], 5, 0.01, 'Intersection Y should be 5');
});

runTest('lineSegmentIntersection() should return null for parallel lines', () => {
    const generator = new StreetGenerator();

    const point = generator.lineSegmentIntersection(
        [0, 0], [10, 0],
        [0, 5], [10, 5]
    );

    assert(point === null, 'Should return null for parallel lines');
});

runTest('wouldCrossExistingEdges() should detect crossings', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();

    // Create two nodes with an edge
    const n1 = network.createNode(0, 5, 'district');
    const n2 = network.createNode(10, 5, 'district');
    network.addEdge(n1.id, n2.id, 'district');

    // Check if a vertical line would cross
    const crosses = generator.wouldCrossExistingEdges(network, [5, 0], [5, 10]);

    assert(crosses === true, 'Should detect crossing with existing edge');
});

runTest('wouldCrossExistingEdges() should not detect shared vertices as crossings', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();

    // Create two nodes with an edge
    const n1 = network.createNode(0, 0, 'district');
    const n2 = network.createNode(10, 0, 'district');
    network.addEdge(n1.id, n2.id, 'district');

    // Check from n2's position (shared vertex)
    const crosses = generator.wouldCrossExistingEdges(network, [10, 0], [10, 10]);

    assert(crosses === false, 'Should not detect shared vertex as crossing');
});

// ----- Test Suite: Edge cases -----
console.log('\nTesting edge cases:');

runTest('should handle very small city', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 20 }); // Very small
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    // Should still have at least center node
    assert(network.getAllNodes().length >= 1, 'Should have at least center node');
});

runTest('should handle city with no candidate space', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 10 }); // Smaller than grid spacing
    const world = createMockWorld();
    const rng = new MockRNG();

    const network = generator.generate(city, world, rng);

    // Should still work, just with fewer/no candidates
    assert(network instanceof StreetNetwork, 'Should return valid network');
});

runTest('should produce deterministic results with same RNG seed', () => {
    const generator = new StreetGenerator();
    const city = createMockCity({ size: 100 });
    const world = createMockWorld();

    const rng1 = new MockRNG(42);
    const network1 = generator.generate(city, world, rng1);

    const rng2 = new MockRNG(42);
    const network2 = generator.generate(city, world, rng2);

    assert(
        network1.getAllNodes().length === network2.getAllNodes().length,
        'Same seed should produce same number of nodes'
    );
    assert(
        network1.getAllEdges().length === network2.getAllEdges().length,
        'Same seed should produce same number of edges'
    );
});

runTest('selectDirectionalNodes() should return nodes in different directions', () => {
    const generator = new StreetGenerator();
    const network = new StreetNetwork();

    const centerNode = network.createNode(100, 100, 'center');

    // Create candidates in 8 directions
    const candidates = [
        network.createNode(120, 100, 'district'), // E
        network.createNode(100, 120, 'district'), // S
        network.createNode(80, 100, 'district'),  // W
        network.createNode(100, 80, 'district'),  // N
        network.createNode(115, 115, 'district'), // SE
        network.createNode(85, 115, 'district'),  // SW
        network.createNode(85, 85, 'district'),   // NW
        network.createNode(115, 85, 'district')   // NE
    ];

    const selected = generator.selectDirectionalNodes(centerNode, candidates, 4);

    assert(selected.length === 4, `Should select 4 nodes, got ${selected.length}`);
});

// ========== Summary ==========

console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    console.log('\nSome tests failed!');
    process.exit(1);
} else {
    console.log('\nAll tests passed!');
    process.exit(0);
}
