# Captured native frame geometry

`tools/lib/native-frame-geometry.mjs` binds relocated native memory to the existing 4287f0 terrain candidate stage, 429360 model candidate stage and 424040 model sphere consumers. It reads no installed archive or BTP placement metadata and initializes no game state. The caller supplies already-aliased captured memory; heap pointers retain their actual native identities.

## Native roots and extents

The runtime pack pointer is read at `90b98c`, and the retained original GFXM header pointer at `90b990`. The loader `44c2b0` publishes the runtime pack fields beginning at canonical `909240`:

| Runtime pack offset | Meaning | Exact count or index source |
| --- | --- | --- |
| `+00` | Sector pointer table | Runtime pack `+10` |
| `+14` | Spatial rows, absolute cell-map pointers at row `+12` | 256 rows, six packed span words |
| `+1c` | Packed collision normals | Runtime pack `+20` |
| `+38` | Twelve-byte spatial nodes | Original header `+0c` |
| `+7c` | Relocated ordinary object link words | Original header unsigned WORD `+96` |
| `+80` | Six-byte zone/region rows | Node zone bits and first region word `+2`, shifted right nine, plus one |

Sector headers supply columns at `+08`, rows at `+0c`, absolute vertices at `+20`, borders at `+38` and packet rows at `+50`. Vertices are eight-byte signed SHORT records. Cell plane forms follow the bottom-right vertex flags and the packet WORD at `+2`. Regions define collision coverage, including border side coverage. Native row fallback, layer chaining and the extra cell-map word when all six spans lack a sentinel follow `parseSpatialIndex` / retained 4746f0 behavior.

Ordinary linked objects are discovered only through node bounds-word start/length fields and the actual relocated link table. Instances are keyed by native object address. `object+10` supplies the model, `object+2c` the selected collision face array, and `object+194` the shape configurations. Shape records use model-relative WORD offsets `+34/+38/+3a`; the vertex pointer is absolute at model `+40`. The selected collision faces therefore do not assume a serialized child-model offset or BTP model identity.

Face/edge/vertex indices are bytes. Face-record addresses use a byte start plus at most 31 entries. Without optional allocation bounds, the decoder admits those source index domains and requires each reached record to lie in a captured span. This does **not** claim a 256-record allocation. It neither scans unreferenced memory nor invents missing rows. Optional `bounds.modelBoundsFor({object,model,faceBase})` can impose tighter observed allocation counts.

## API and mutable state

`createNativeFrameGeometry({memory,bounds?})` returns `grid`, `modelContext`, `candidateMapping`, and `nodeForAddress`. `nativeFrameGeometryLimits` contains frozen admission ceilings, while exact header counts and captured span ownership remain required. `createNativeTerrainSectorViews` supports original terrain-query captures without fabricating spatial state.

The `comparisonRegions` getter returns frozen native-address spans for the bytes validated by the binding, including geometry outside the body arena. Read it **after** the source frame: lazy reached model vertex rows join the ledger when read. Intervals deduplicate and merge overlaps/adjacency, and preferred module aliases resolve to their actual native backing addresses. All geometry spans use the mutable comparison policy; this compares their final bytes without asserting immutability. The root replay appends these spans to its semantic comparison manifest.

The ledger covers sector tables/headers/vertices/packets/borders, normal tables, selected zone groups, spatial nodes/rows/exact cell-map slices, static links, linked object headers, model headers/shapes, referenced face records/edges/faces, shape configurations and reached collision vertices. Additionally, the native `421f60` copy loop proves that model WORD `+4` describes an eight-byte primary/render vertex array. The ledger validates that exact declared extent at model `+40` and at a nonnull object `+24` render-copy pointer. It never expands a model vertex allocation to the 255-entry collision index admission ceiling. Failed uncaptured reads add no span.

Terrain vertices, normals, packet flags/forms, border normals, model vertices/faces/edges, object position/yaw/class/state, and configuration words read live native bytes. Shape and region topology, pointer chains and link membership are bound at frame entry. Replacing those pointers or topology requires rebuilding the binding. Model mappings reject detached settings or unknown object/shape pointer pairs. No fake serialized resource buffer or material address conversion is introduced; native vehicle surface/route providers are separate.

## Verification and limits

`node --test tests/native-frame-geometry.test.mjs tests/captured-memory.test.mjs tests/frame-candidates.test.mjs tests/model-sphere-query.test.mjs` passes 25 tests. Synthetic connected fixtures cover native spatial fallback/layers, split terrain forms, borders, eight complete two-pass candidate arena byte comparisons, point/edge/triangle/quad sphere queries, live mutations, exact pointer identity, explicit bounds and missing captured bytes. Ledger tests cover exact extents, interval merging, repeat-read deduplication, late vertex reads, failed reads, alias canonicalization and separate render copies. An explicit comparison test rejects changed terrain vertices, model faces/vertices and configuration bytes outside the core physics pools. `completeNativeFrameGeometryFixture` fills missing native header fields from declared synthetic fixture inputs only.

The optional local original-process test decodes all 41 sectors in the retained active-wheel terrain capture and matches 264 reached vertex rows across 32 native terrain queries. These original-process checks concern geometry reads; they do not establish a complete 4749e0 frame replay or a faithful native trajectory. Private capture blobs are not embedded. The test skips when those local blobs are unavailable.

`analysis/native-frame-geometry-expanded-comparison-20261022.json` retains the expanded semantic geometry comparison against the first original full-frame capture: all 363,342 bytes across 173 merged geometry spans match after the source frame. These spans can overlap preexisting core arena/global comparison regions; their sum is not a unique extra-byte count. The report records address/length metadata only, with no raw asset blobs.
