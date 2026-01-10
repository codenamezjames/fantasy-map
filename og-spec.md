A map style veiwer with panning and zooming and 4 levels of zoom and hard edges (like a piece of paer).
World view, area view, city, building/dungon view. ONLY load whats in the viewport and the current zoom level.

generate global points with jitter. using a worldSeed - master seed so the same seed = same world

The outter most tiles should be ocean regardless of generation.
we can use Perlin noise, with some blob placement to generate the elevation, we can also cut some of the elevation in places to make clifs by running a second Perlin noise and alowing for interferience.
Every random decision must use the seed so same seed = same world
we can use https://www.npmjs.com/package/seedrandom

The jitter should not be random but weighted based on the biome time.. like deserts are large and mostly unchanging so points will be farther away. Forests and fields are denser as they shift from forest to plains to field to woods etc white often.

rivers should flow from higher elevation to lower elevation.
They should be connecting end to end. They can join and split at intersections.

Flow downhill toward neighbors with lower elevation
If you hit a "bowl" (all neighbors are higher or equal):
Fill it with water → lake
Lake "overflows" at lowest rim point
Continue river from there


We should do a multi pass to generate the points inically. the first pass can be mostly even and then we can go in and fill in the gaps based on the biomes chosen. 

The more points the higher the fadelity is

Voronoi shapes should support sub Voronoi systems so i can increase fadelity on the map when we zoom in to the different levels. 

Sub tiles can have different biomes within reason. So a forest can have clearings but a desert cannot have a forest. It could however have an oasis.

The map only need sto load whats in the view port so it doesnt overwehel the browser.

Each "tile" should have an ID, biome (this will handle biomeVariant, and vegetationDensity. EG biome: "Dense Forest", or "Rocky Desert"), elevation, moisture, temperature, terrain, isWater, waterDepth, riverEdges (only actually creates a river when 2 edges that meet have "riverEdges"), isCoastal (used for blending when touching a water's face), regionId, neighbors, roadsEdge (these will work the same way as rivers, the agacent tile needs to also be "roadsEdge"), parentId, detailGenerated, traversability, center, vertices, zoomLevel

id: 4827,              // Unique numeric ID
parentId: 42,          // Parent tile's ID (null for world-level)

Temperature: Typically latitude (north/south = colder) + elevation (higher = colder)
Moisture: Another Perlin layer

POI will be differnt and dont require tiles, However when zooming in to a POI it will be likely that it will overlap 1 or more tiles.

The generator will write these tiles points to a file that can be updated as the world gets explored.

For riverEdges/roadsEdge to work, both tiles must agree The tile with lower ID decides.

We need a biome lookup table or function Example: high elevation + cold + wet = "Snowy Peaks"

Road Generation
Roads connect settlements so roads should be generated after the POI's are placed. traversability should affect roads. There will likely be very few rodes that go through the mountains for example. The larger the POI and the shorter the distance the larger the road is.

A POI lives on top of the map but still affects and interacts with the map. POI have names, type, position (where the label sits, and about the center of the area it takes up), size, overlapping tiles (the tiles that the POI is occuping).

Region Assignment
Grow outward from capital cities
Follow natural borders (rivers, mountains)


Order
Basic Voronoi rendering (just see the cells)
Simple elevation with Perlin noise
Land/ocean threshold
Biome assignment
Then layer on rivers, regions, roads