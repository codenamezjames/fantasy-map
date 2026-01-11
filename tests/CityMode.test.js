/**
 * City Mode Integration Tests
 * Tests the flow: TileLoadManager -> CityGenerator -> City -> Streets
 */

// Simple test framework
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        passCount++;
        console.log(`  PASS: ${name}`);
    } catch (error) {
        failCount++;
        console.log(`  FAIL: ${name}`);
        console.log(`        ${error.message}`);
    }
}

function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

function expect(value) {
    return {
        toBe(expected) {
            if (value !== expected) {
                throw new Error(`Expected ${expected}, got ${value}`);
            }
        },
        toEqual(expected) {
            if (JSON.stringify(value) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
            }
        },
        toBeDefined() {
            if (value === undefined) {
                throw new Error(`Expected value to be defined`);
            }
        },
        toBeNull() {
            if (value !== null) {
                throw new Error(`Expected null, got ${value}`);
            }
        },
        toBeGreaterThan(expected) {
            if (value <= expected) {
                throw new Error(`Expected ${value} to be greater than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual(expected) {
            if (value < expected) {
                throw new Error(`Expected ${value} to be >= ${expected}`);
            }
        },
        toBeLessThan(expected) {
            if (value >= expected) {
                throw new Error(`Expected ${value} to be less than ${expected}`);
            }
        },
        toBeTruthy() {
            if (!value) {
                throw new Error(`Expected truthy value, got ${value}`);
            }
        },
        toBeFalsy() {
            if (value) {
                throw new Error(`Expected falsy value, got ${value}`);
            }
        },
        toContain(item) {
            if (!value.includes(item)) {
                throw new Error(`Expected array to contain ${item}`);
            }
        },
        toHaveLength(length) {
            if (value.length !== length) {
                throw new Error(`Expected length ${length}, got ${value.length}`);
            }
        },
        toHaveProperty(prop) {
            if (!(prop in value)) {
                throw new Error(`Expected object to have property ${prop}`);
            }
        }
    };
}

// ============== MOCK DATA ==============

// Mock POI class
class MockPOI {
    constructor(config) {
        this.id = config.id ?? 0;
        this.name = config.name ?? 'Unknown';
        this.type = config.type ?? 'village';
        this.position = config.position ?? [0, 0];
        this.tileId = config.tileId ?? 0;
    }

    distanceTo(x, y) {
        return Math.hypot(x - this.position[0], y - this.position[1]);
    }
}

// Mock Tile class
class MockTile {
    constructor(config) {
        this.id = config.id ?? 0;
        this.center = config.center ?? [0, 0];
        this.vertices = config.vertices ?? [];
        this.neighbors = config.neighbors ?? [];
        this.isWater = config.isWater ?? false;
        this.poiId = config.poiId ?? null;
        this.zoomLevel = config.zoomLevel ?? 0;
        this.detailGenerated = config.detailGenerated ?? false;
        this.roadEdges = config.roadEdges ?? [];
    }

    intersectsViewport(viewport) {
        return this.center[0] >= viewport.minX && this.center[0] <= viewport.maxX &&
               this.center[1] >= viewport.minY && this.center[1] <= viewport.maxY;
    }

    isAtMaxDetail() {
        return this.zoomLevel >= 3;
    }
}

// Mock World class
class MockWorld {
    constructor() {
        this.tiles = new Map();
        this.pois = new Map();
        this.poiByType = new Map();
    }

    getTile(id) {
        return this.tiles.get(id);
    }

    addTile(tile) {
        this.tiles.set(tile.id, tile);
    }

    addPOI(poi) {
        this.pois.set(poi.id, poi);
        const type = poi.type;
        if (!this.poiByType.has(type)) {
            this.poiByType.set(type, []);
        }
        this.poiByType.get(type).push(poi);
    }

    getPOIsByType(type) {
        return this.poiByType.get(type) || [];
    }

    getZoomLevelFromPercent(zoom) {
        if (zoom < 40) return 0;
        if (zoom < 60) return 1;
        if (zoom < 80) return 2;
        return 3;
    }

    getTilesAtLevel(level) {
        return Array.from(this.tiles.values()).filter(t => t.zoomLevel === level);
    }

    addChildTile(child, parentId) {
        this.tiles.set(child.id, child);
    }

    unloadChildren(parentId) {
        // Mock implementation
    }
}

// Mock SubTileGenerator
class MockSubTileGenerator {
    generate(parent, world, seed) {
        return [];
    }
}

// Create standard test fixtures
function createTestFixtures() {
    const mockPOI = new MockPOI({
        id: 1,
        name: 'Test Town',
        type: 'town',
        position: [500, 500],
        tileId: 100
    });

    const mockWorld = new MockWorld();

    // Create hex-like tiles around the POI center
    const tileSize = 30;
    const centerTile = new MockTile({
        id: 100,
        center: [500, 500],
        vertices: [
            [485, 474], [515, 474], [530, 500],
            [515, 526], [485, 526], [470, 500]
        ],
        neighbors: [101, 102, 103, 104, 105, 106],
        isWater: false,
        poiId: 1,
        roadEdges: [101, 103]
    });
    mockWorld.addTile(centerTile);

    // Add neighboring tiles
    const neighborConfigs = [
        { id: 101, center: [530, 474], neighbors: [100, 102, 107] },
        { id: 102, center: [560, 500], neighbors: [100, 101, 103] },
        { id: 103, center: [530, 526], neighbors: [100, 102, 104] },
        { id: 104, center: [500, 552], neighbors: [100, 103, 105] },
        { id: 105, center: [470, 526], neighbors: [100, 104, 106] },
        { id: 106, center: [440, 500], neighbors: [100, 105, 101] },
        { id: 107, center: [560, 448], neighbors: [101], isWater: false }
    ];

    for (const config of neighborConfigs) {
        const tile = new MockTile({
            id: config.id,
            center: config.center,
            vertices: generateHexVertices(config.center, 25),
            neighbors: config.neighbors,
            isWater: config.isWater ?? false,
            roadEdges: config.id === 107 ? [] : []
        });
        mockWorld.addTile(tile);
    }

    mockWorld.addPOI(mockPOI);

    return { mockPOI, mockWorld };
}

function generateHexVertices(center, radius) {
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        vertices.push([
            center[0] + radius * Math.cos(angle),
            center[1] + radius * Math.sin(angle)
        ]);
    }
    return vertices;
}

// ============== TESTS ==============

// Import actual modules (using dynamic imports for ES modules)
async function runTests() {
    console.log('Loading modules...');

    // Import modules
    const { TileLoadManager } = await import('../src/generation/TileLoadManager.js');
    const { CityGenerator, City: CityFromGenerator } = await import('../src/generation/CityGenerator.js');
    const { City } = await import('../src/data/City.js');
    const { StreetNetwork, StreetNode, StreetEdge } = await import('../src/data/StreetNetwork.js');
    const { SeededRandom } = await import('../src/utils/random.js');

    console.log('Modules loaded. Running tests...\n');

    // ============ Test Suite: TileLoadManager ============

    describe('TileLoadManager', () => {
        const { mockPOI, mockWorld } = createTestFixtures();
        const manager = new TileLoadManager(mockWorld, new MockSubTileGenerator(), { seed: 'test-seed' });

        describe('.getCityModeThreshold()', () => {
            test('returns 55 for capital', () => {
                expect(manager.getCityModeThreshold('capital')).toBe(55);
            });

            test('returns 60 for city', () => {
                expect(manager.getCityModeThreshold('city')).toBe(60);
            });

            test('returns 65 for town', () => {
                expect(manager.getCityModeThreshold('town')).toBe(65);
            });

            test('returns 70 for village', () => {
                expect(manager.getCityModeThreshold('village')).toBe(70);
            });

            test('returns 60 for port', () => {
                expect(manager.getCityModeThreshold('port')).toBe(60);
            });

            test('returns default (65) for unknown type', () => {
                expect(manager.getCityModeThreshold('unknown')).toBe(65);
            });
        });

        describe('.getSettlementDetectionRadius()', () => {
            test('returns 100 for capital', () => {
                expect(manager.getSettlementDetectionRadius('capital')).toBe(100);
            });

            test('returns 80 for city', () => {
                expect(manager.getSettlementDetectionRadius('city')).toBe(80);
            });

            test('returns 60 for town', () => {
                expect(manager.getSettlementDetectionRadius('town')).toBe(60);
            });

            test('returns 40 for village', () => {
                expect(manager.getSettlementDetectionRadius('village')).toBe(40);
            });

            test('returns 70 for port', () => {
                expect(manager.getSettlementDetectionRadius('port')).toBe(70);
            });
        });

        describe('.findNearestSettlement()', () => {
            test('finds settlement when viewport is centered on it', () => {
                const viewport = { minX: 400, minY: 400, maxX: 600, maxY: 600 };
                const settlement = manager.findNearestSettlement(viewport);
                expect(settlement).toBeDefined();
                expect(settlement.id).toBe(1);
                expect(settlement.name).toBe('Test Town');
            });

            test('returns null when no settlements in viewport range', () => {
                const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
                const settlement = manager.findNearestSettlement(viewport);
                expect(settlement).toBeNull();
            });

            test('finds nearest settlement when multiple exist', () => {
                // Add another POI farther away
                const farPOI = new MockPOI({
                    id: 2,
                    name: 'Far Village',
                    type: 'village',
                    position: [800, 800],
                    tileId: 200
                });
                mockWorld.addPOI(farPOI);
                manager.invalidateSettlementCache();

                // Viewport centered at (550, 550), closer to Test Town at (500, 500) than Far Village at (800, 800)
                // Distance to Test Town: sqrt(50^2 + 50^2) = 70.7
                // Distance to Far Village: sqrt(250^2 + 250^2) = 353.5
                const viewport = { minX: 400, minY: 400, maxX: 700, maxY: 700 };
                const settlement = manager.findNearestSettlement(viewport);
                expect(settlement).toBeDefined();
                expect(settlement.id).toBe(1);
            });
        });

        describe('.checkCityMode()', () => {
            test('enters city mode when zoom passes threshold near settlement', () => {
                const viewport = { minX: 450, minY: 450, maxX: 550, maxY: 550 };
                expect(manager.isInCityMode()).toBeFalsy();

                manager.checkCityMode(viewport, 70); // Above town threshold of 65
                expect(manager.isInCityMode()).toBeTruthy();
            });

            test('exits city mode when zoom below threshold', () => {
                const viewport = { minX: 450, minY: 450, maxX: 550, maxY: 550 };
                manager.checkCityMode(viewport, 70);
                expect(manager.isInCityMode()).toBeTruthy();

                manager.checkCityMode(viewport, 50); // Below threshold
                expect(manager.isInCityMode()).toBeFalsy();
            });
        });

        describe('.getCityModeState()', () => {
            test('returns complete state object', () => {
                const state = manager.getCityModeState();
                expect(state).toHaveProperty('active');
                expect(state).toHaveProperty('poi');
                expect(state).toHaveProperty('city');
            });
        });
    });

    // ============ Test Suite: CityGenerator ============

    describe('CityGenerator', () => {
        const generator = new CityGenerator();

        describe('.calculateSeed()', () => {
            test('returns deterministic seed for same inputs', () => {
                const seed1 = generator.calculateSeed(1, 'world-seed');
                const seed2 = generator.calculateSeed(1, 'world-seed');
                expect(seed1).toBe(seed2);
            });

            test('returns different seeds for different POI IDs', () => {
                const seed1 = generator.calculateSeed(1, 'world-seed');
                const seed2 = generator.calculateSeed(2, 'world-seed');
                expect(seed1).toBe('city-world-seed-poi1');
                expect(seed2).toBe('city-world-seed-poi2');
            });

            test('returns different seeds for different world seeds', () => {
                const seed1 = generator.calculateSeed(1, 'seed-a');
                const seed2 = generator.calculateSeed(1, 'seed-b');
                expect(seed1).toBe('city-seed-a-poi1');
                expect(seed2).toBe('city-seed-b-poi1');
            });

            test('produces valid seed string format', () => {
                const seed = generator.calculateSeed(42, 'my-world');
                expect(seed).toBe('city-my-world-poi42');
            });
        });

        describe('.calculateBoundary()', () => {
            test('returns empty when center tile not found', () => {
                const { mockWorld } = createTestFixtures();
                const poi = new MockPOI({ id: 999, tileId: 9999 });
                const result = generator.calculateBoundary(poi, mockWorld);
                expect(result.boundary).toEqual([]);
                expect(result.tileIds).toEqual([]);
            });

            test('returns tile IDs for occupied tiles', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                const result = generator.calculateBoundary(mockPOI, mockWorld);
                expect(result.tileIds.length).toBeGreaterThan(0);
                expect(result.tileIds).toContain(100); // Center tile
            });

            test('returns boundary polygon vertices', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                const result = generator.calculateBoundary(mockPOI, mockWorld);
                // Boundary should have multiple vertices
                expect(result.boundary.length).toBeGreaterThanOrEqual(3);
            });
        });

        describe('.findOccupiedTiles()', () => {
            test('returns center tile when maxRings is 0', () => {
                const { mockWorld } = createTestFixtures();
                const centerTile = mockWorld.getTile(100);
                const result = generator.findOccupiedTiles(centerTile, mockWorld, 0);
                expect(result).toHaveLength(1);
                expect(result[0]).toBe(100);
            });

            test('includes neighbors when maxRings is 1', () => {
                const { mockWorld } = createTestFixtures();
                const centerTile = mockWorld.getTile(100);
                const result = generator.findOccupiedTiles(centerTile, mockWorld, 1);
                expect(result.length).toBeGreaterThan(1);
                expect(result).toContain(100);
                expect(result).toContain(101);
            });
        });

        describe('.generate()', () => {
            test('generates city with correct properties', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                const city = generator.generate(mockPOI, mockWorld, 'test-world');

                expect(city.id).toBe(mockPOI.id);
                expect(city.name).toBe(mockPOI.name);
                expect(city.type).toBe(mockPOI.type);
                expect(city.center).toEqual(mockPOI.position);
            });

            test('caches generated cities', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                const city1 = generator.generate(mockPOI, mockWorld, 'test-world');
                const city2 = generator.generate(mockPOI, mockWorld, 'test-world');
                expect(city1).toBe(city2); // Same reference
            });

            test('generates streets for city', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                generator.clearCache();
                const city = generator.generate(mockPOI, mockWorld, 'test-world');
                expect(city.streets).toBeDefined();
                expect(city.generationState.streets).toBeTruthy();
            });
        });

        describe('.hasCity() and .getCity()', () => {
            test('hasCity returns false for uncached POI', () => {
                generator.clearCache();
                expect(generator.hasCity(999)).toBeFalsy();
            });

            test('hasCity returns true after generation', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                generator.clearCache();
                generator.generate(mockPOI, mockWorld, 'test-world');
                expect(generator.hasCity(mockPOI.id)).toBeTruthy();
            });

            test('getCity returns cached city', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                generator.clearCache();
                const generated = generator.generate(mockPOI, mockWorld, 'test-world');
                const retrieved = generator.getCity(mockPOI.id);
                expect(retrieved).toBe(generated);
            });
        });

        describe('.clearCache()', () => {
            test('clears specific POI cache', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                generator.generate(mockPOI, mockWorld, 'test-world');
                expect(generator.hasCity(mockPOI.id)).toBeTruthy();

                generator.clearCache(mockPOI.id);
                expect(generator.hasCity(mockPOI.id)).toBeFalsy();
            });

            test('clears all caches when called with null', () => {
                const { mockPOI, mockWorld } = createTestFixtures();
                generator.generate(mockPOI, mockWorld, 'test-world');
                generator.clearCache(null);
                expect(generator.hasCity(mockPOI.id)).toBeFalsy();
            });
        });
    });

    // ============ Test Suite: City (data class) ============

    describe('City', () => {
        describe('.containsPoint()', () => {
            test('returns true for point inside boundary', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [
                        [50, 50], [150, 50], [150, 150], [50, 150]
                    ]
                });
                city.calculateBounds();
                expect(city.containsPoint(100, 100)).toBeTruthy();
            });

            test('returns false for point outside boundary', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [
                        [50, 50], [150, 50], [150, 150], [50, 150]
                    ]
                });
                city.calculateBounds();
                expect(city.containsPoint(200, 200)).toBeFalsy();
            });

            test('returns false for point outside bounds check', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [
                        [50, 50], [150, 50], [150, 150], [50, 150]
                    ]
                });
                city.calculateBounds();
                expect(city.containsPoint(0, 0)).toBeFalsy();
            });

            test('handles points near boundary edges', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [
                        [50, 50], [150, 50], [150, 150], [50, 150]
                    ]
                });
                city.calculateBounds();
                // Point just inside the boundary
                expect(city.containsPoint(51, 51)).toBeTruthy();
                // Point just outside the boundary
                expect(city.containsPoint(49, 49)).toBeFalsy();
            });

            test('returns false for polygon with less than 3 vertices', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [[50, 50], [150, 50]]
                });
                expect(city.containsPoint(100, 100)).toBeFalsy();
            });
        });

        describe('.calculateBounds()', () => {
            test('calculates correct bounds from boundary', () => {
                const city = new City({
                    center: [100, 100],
                    boundary: [
                        [50, 30], [150, 30], [180, 100],
                        [150, 170], [50, 170], [20, 100]
                    ]
                });
                const bounds = city.calculateBounds();
                expect(bounds.minX).toBe(20);
                expect(bounds.maxX).toBe(180);
                expect(bounds.minY).toBe(30);
                expect(bounds.maxY).toBe(170);
            });

            test('returns null for empty boundary', () => {
                const city = new City({ center: [100, 100], boundary: [] });
                const bounds = city.calculateBounds();
                expect(bounds).toBeNull();
            });
        });

        describe('.getDefaultParams()', () => {
            test('returns village params for village type', () => {
                const city = new City({ type: 'village' });
                const params = city.getDefaultParams();
                expect(params.streetDensity).toBe(0.3);
                expect(params.hasWalls).toBeFalsy();
            });

            test('returns city params for city type', () => {
                const city = new City({ type: 'city' });
                const params = city.getDefaultParams();
                expect(params.streetDensity).toBe(0.7);
                expect(params.hasWalls).toBeTruthy();
            });

            test('returns capital params for capital type', () => {
                const city = new City({ type: 'capital' });
                const params = city.getDefaultParams();
                expect(params.streetDensity).toBe(0.8);
                expect(params.maxBuildings).toBe(300);
            });

            test('returns port params with docks for port type', () => {
                const city = new City({ type: 'port' });
                const params = city.getDefaultParams();
                expect(params.hasDocks).toBeTruthy();
            });
        });

        describe('.isFullyGenerated()', () => {
            test('returns false when not fully generated', () => {
                const city = new City({ generationState: { streets: true, buildings: false } });
                expect(city.isFullyGenerated()).toBeFalsy();
            });

            test('returns true when fully generated', () => {
                const city = new City({ generationState: { streets: true, buildings: true } });
                expect(city.isFullyGenerated()).toBeTruthy();
            });
        });

        describe('.toJSON() and .fromJSON()', () => {
            test('serializes and deserializes city', () => {
                const city = new City({
                    id: 42,
                    name: 'Test City',
                    type: 'town',
                    center: [100, 200],
                    boundary: [[50, 50], [150, 50], [150, 150], [50, 150]]
                });
                const json = city.toJSON();
                const restored = City.fromJSON(json);

                expect(restored.id).toBe(42);
                expect(restored.name).toBe('Test City');
                expect(restored.type).toBe('town');
                expect(restored.center).toEqual([100, 200]);
            });
        });
    });

    // ============ Test Suite: StreetNetwork ============

    describe('StreetNetwork', () => {
        describe('node operations', () => {
            test('creates node with position and type', () => {
                const network = new StreetNetwork();
                const node = network.createNode(100, 200, 'center');
                expect(node.position).toEqual([100, 200]);
                expect(node.type).toBe('center');
                expect(node.id).toBeGreaterThan(0);
            });

            test('getAllNodes returns all added nodes', () => {
                const network = new StreetNetwork();
                network.createNode(0, 0, 'center');
                network.createNode(100, 0, 'gate');
                network.createNode(50, 50, 'district');
                expect(network.getAllNodes()).toHaveLength(3);
            });

            test('getNodesByType filters correctly', () => {
                const network = new StreetNetwork();
                network.createNode(0, 0, 'center');
                network.createNode(100, 0, 'gate');
                network.createNode(-100, 0, 'gate');
                const gates = network.getNodesByType('gate');
                expect(gates).toHaveLength(2);
            });
        });

        describe('edge operations', () => {
            test('addEdge creates edge between nodes', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                const edge = network.addEdge(n1.id, n2.id, 'main');
                expect(edge).toBeDefined();
                expect(edge.nodeIdA).toBe(n1.id);
                expect(edge.nodeIdB).toBe(n2.id);
            });

            test('hasEdge returns true for existing edge', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                network.addEdge(n1.id, n2.id);
                expect(network.hasEdge(n1.id, n2.id)).toBeTruthy();
                expect(network.hasEdge(n2.id, n1.id)).toBeTruthy();
            });

            test('updates node degrees on edge add', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                expect(n1.degree).toBe(0);
                network.addEdge(n1.id, n2.id);
                expect(n1.degree).toBe(1);
                expect(n2.degree).toBe(1);
            });

            test('getAllEdges returns all edges', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                const n3 = network.createNode(50, 50);
                network.addEdge(n1.id, n2.id);
                network.addEdge(n2.id, n3.id);
                expect(network.getAllEdges()).toHaveLength(2);
            });
        });

        describe('graph traversal', () => {
            test('getNeighbors returns connected node IDs', () => {
                const network = new StreetNetwork();
                const center = network.createNode(0, 0, 'center');
                const gate1 = network.createNode(100, 0, 'gate');
                const gate2 = network.createNode(0, 100, 'gate');
                network.addEdge(center.id, gate1.id);
                network.addEdge(center.id, gate2.id);

                const neighbors = network.getNeighbors(center.id);
                expect(neighbors).toHaveLength(2);
                expect(neighbors).toContain(gate1.id);
                expect(neighbors).toContain(gate2.id);
            });

            test('isConnected returns true for connected graph', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                const n3 = network.createNode(50, 50);
                network.addEdge(n1.id, n2.id);
                network.addEdge(n2.id, n3.id);
                expect(network.isConnected()).toBeTruthy();
            });

            test('isConnected returns false for disconnected graph', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0);
                const n2 = network.createNode(100, 0);
                const n3 = network.createNode(200, 0);
                const n4 = network.createNode(300, 0);
                network.addEdge(n1.id, n2.id);
                network.addEdge(n3.id, n4.id);
                expect(network.isConnected()).toBeFalsy();
            });
        });

        describe('getStats()', () => {
            test('returns correct statistics', () => {
                const network = new StreetNetwork();
                const n1 = network.createNode(0, 0, 'center');
                const n2 = network.createNode(100, 0, 'gate');
                const n3 = network.createNode(50, 50, 'district');
                network.addEdge(n1.id, n2.id, 'main');
                network.addEdge(n1.id, n3.id, 'district');

                const stats = network.getStats();
                expect(stats.nodeCount).toBe(3);
                expect(stats.edgeCount).toBe(2);
                expect(stats.nodesByType['center']).toBe(1);
                expect(stats.nodesByType['gate']).toBe(1);
                expect(stats.edgesByType['main']).toBe(1);
            });
        });
    });

    // ============ Test Suite: Full Integration ============

    describe('Full Integration: City Generation Flow', () => {
        test('complete flow: POI -> TileLoadManager -> CityGenerator -> City with streets', () => {
            const { mockPOI, mockWorld } = createTestFixtures();
            const subTileGenerator = new MockSubTileGenerator();
            const cityGenerator = new CityGenerator();
            cityGenerator.clearCache();

            // Step 1: TileLoadManager detects settlement
            const manager = new TileLoadManager(mockWorld, subTileGenerator, { seed: 'integration-test' });
            const viewport = { minX: 450, minY: 450, maxX: 550, maxY: 550 };
            const settlement = manager.findNearestSettlement(viewport);

            expect(settlement).toBeDefined();
            expect(settlement.id).toBe(mockPOI.id);

            // Step 2: Check threshold
            const threshold = manager.getCityModeThreshold(settlement.type);
            expect(threshold).toBe(65); // town

            // Step 3: Generate city
            const city = cityGenerator.generate(settlement, mockWorld, 'integration-test');

            expect(city).toBeDefined();
            expect(city.id).toBe(settlement.id);
            expect(city.name).toBe(settlement.name);

            // Step 4: City has valid boundary and occupied tiles
            expect(city.boundary.length).toBeGreaterThanOrEqual(3);
            expect(city.occupiedTileIds.length).toBeGreaterThan(0);

            // Step 5: Streets network exists
            expect(city.streets).toBeDefined();

            // Step 6: Streets network has nodes and edges
            const stats = city.streets.getStats();
            expect(stats.nodeCount).toBeGreaterThan(0);
            // Center node should exist
            const centerNodes = city.streets.getNodesByType('center');
            expect(centerNodes.length).toBeGreaterThan(0);

            // Step 7: City contains its center point
            city.calculateBounds();
            expect(city.containsPoint(city.center[0], city.center[1])).toBeTruthy();
        });

        test('city generation is deterministic', () => {
            const { mockPOI, mockWorld } = createTestFixtures();
            const generator1 = new CityGenerator();
            const generator2 = new CityGenerator();

            const city1 = generator1.generate(mockPOI, mockWorld, 'determinism-test');
            const city2 = generator2.generate(mockPOI, mockWorld, 'determinism-test');

            expect(city1.seed).toBe(city2.seed);
            expect(city1.boundary).toEqual(city2.boundary);
            expect(city1.occupiedTileIds).toEqual(city2.occupiedTileIds);
        });
    });

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log(`Test Results: ${passCount}/${testCount} passed`);
    if (failCount > 0) {
        console.log(`Failures: ${failCount}`);
        process.exit(1);
    } else {
        console.log('All tests passed!');
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
