# Coherent native terrain-query writes

`src/raw-terrain-query.mjs` connects the complete recovered `424ff0` ray/sphere query graph to shared native storage. Candidate flags and edge bytes, 40-byte plane caches, border contact diagnostics, shared cross-product globals and normalization/root globals are written at their original algorithmic steps. This closes the terrain-query storage boundary identified in [physics runtime views](physics-runtime-views.md); it does not establish complete `4749e0` equivalence.

```js
const rawGrid = createRawTerrainGrid(parsedGrid, terrainVerticesFor, {memory});
const fraction = queryRawTerrain(bodyAddress, cacheRecordAddress,
  outputAddress, parameter, {
    memory, views: physicsViews, grid: rawGrid,
    roundingMode: 'nearest-even',
  });
```

`views.candidateAt(address)` supplies the existing candidate identities. The query captures the original count and candidate-array pointer from body `+15c/+154`; the radius is captured from cache `+40`. Query position/velocity are captured after candidate initialization, matching the native order. The output is the original 36-byte point/normal/distance/flags/cell record, and the returned integer is native EAX's fraction. The input `parameter` retains the original high-byte wall filter and low 23-bit fraction bound.

`createRawTerrainGrid` retains parsed topology while exposing each vertex lane through its supplied native address. Rows used in the exterior edge pass are read through `[90b98c] → table → sector +0c`. Vertex addresses, sector tables, original math tables and runtime globals remain caller supplied. The adapter does not invent a loader or synchronize copies of parsed geometry. A declared floating-point conversion mode remains necessary when finite-edge normalizers are reached.

## Writes and ordering

Both structured query branches now perform candidate initialization in order: clear bit `10h`, read the low type nibble, reset edge byte `+2` to `ffh`, then mark filtered wall entries as visited. Processing marks each selected candidate before reading its plane fields. Edge rejection writes the actual signed code to the same candidate's byte `+2`; subsequent traversal reads live flags and edge bytes.

For nonzero radii, each eligible plane writes globals at `91e7a0 + 40*index` in native order: point Y, normal X/Y/Z, distance, point X/Z, fraction. Offsets `+1c/+20` remain stale. The edge pass reads live plane views, so output/plane overlap does not silently fall back to earlier JavaScript snapshots.

Accepted face contacts write output normal X/Y/Z, distance, point X/Y/Z, then cell ID. Flags remain a local classification until the final native flags store. Accepted border contacts write diagnostic point DWORDs, three anchor words, output normal DWORDs and the current clock at `911c00..911c27`, retaining padding. The smooth-neighbor and finite-edge branches retain their distinct original output store order.

Polygon edge tests expose the native short operands at `91d360/+8/+10` and `91d408/+4/+8`, plus their three DWORD cross products at `91d448/+4/+8`. Vertices are consumed lazily with the original cached first/previous relative vertex, so writes overlapping later vertex storage remain visible. The actual finite-edge producer also exposes its full-DWORD matrix operands and word vector operands. `422c70` normalizer writes and `432e70/432e30` lookup-root leading-zero writes update `91d45c/+4` at each reached step, including repeated same-value stores.

The raw adapter also fixes a previously untested zero-bound case: a ray overlap with an already-zero fraction compares its penetration against the existing output distance. Omitting that stale scalar could accept a contact the retained caller suppresses.

Standalone numeric APIs remain available. `terrain-query.mjs` and `terrain-sphere-query.mjs` share `terrain-query-state.mjs` for candidate state. Optional internal `nativeState` hooks in `terrain-sphere-edge.mjs`, `static-sphere-primitives.mjs` and `sphere-collision.mjs` expose recovered writes without changing their ordinary numeric return contracts. These hooks execute within the actual algorithms; they do not replay an end-of-call memory image.

## Evidence and checks

The parent uses retained `analysis/scene/results/168-terrain-query-assembly.json` and its original switch tables `169-terrain-query-switch-tables.json`. Edge evidence is retained under native-simulation results `040/041`, with original edge tables `043`. Actual point/edge primitives, short cross, lookup root, leading-zero and normalization evidence is enumerated in `analysis/raw-terrain-query-instruction-check.json`.

`node tools/verify-raw-terrain-query-instructions.mjs` passes 1,800 synthetic ray/sphere fixtures and 48 explicit alias fixtures against 2,368 retained instructions, executing 17,168,807 steps. It reaches the real exterior-edge helper 252 times and compares **1,008,160 ordered stores**, including byte/word/DWORD width and unchanged-value writes. It also compares every candidate byte, the complete output, all 64 plane records, 40 border bytes and shared `91d360..91d463` scratch. There are no mocked callees.

Alias cases cover output overlapping the query, candidate storage or plane storage, and vertices overlapping cross-product globals. These are bounded explicit alias fixtures, not a proof over every arbitrary pointer overlap. Unconsumed stack-local and saved-register remnants are outside the public storage contract. Original executable execution is not claimed.

`node --test tests/raw-terrain-query.test.mjs` passes seven focused tests for reset/filtered-write order, exterior edge state, plane padding/store order, border widths/order, query/output overlap, stale zero-bound distance and actual finite-edge/math scratch. The 55 relevant terrain/primitive/shared-physics/simulation tests pass together. Existing 4,000-ray and 4,000-sphere instruction comparisons also pass with the original numeric behavior. Requests 1080–1119 were unnecessary; all evidence was already retained.

The remaining full-frame work is to bind this adapter into the complete native parent oracle alongside real candidate production, model geometry/effects, body/event lifecycle and reached runtime roots. A successful terrain subgraph or source-step fixture alone is not a complete game-physics claim.
