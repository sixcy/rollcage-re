# Model collision records and terrain surface metadata

The selected binary remains Rollcage Redux 1.3.8.0. `src/model-collision.mjs` reconstructs the `MODC` collision tables and ordinary-placement settings consumed by `0x429360`, `0x429600`, `0x423ab0` and `0x424040`. `MODL` collision interpretation is outside this reader; it reports `available:false` rather than interpreting header placeholders as tables. The subsequent [model ray query port](model-queries.md) consumes these records; per-frame candidate generation, effects and nonzero-radius contacts remain open.

## Model tables

All offsets are little-endian and relative to the primary model header unless stated otherwise.

| Offset | Observed use |
| --- | --- |
| `0x1c` u16 | First auxiliary model header, whose face list becomes object `+0x2c`. Zero retains the primary face list. |
| `0x27` u8 | Number of 20-byte shape records. |
| `0x34` u16 | Shape-table displacement. |
| `0x38` u16 | Nine-byte face/edge lookup table displacement. |
| `0x3a` u16 | Eight-byte edge-table displacement. |
| `0x40` u32 | Primary vertex-array displacement. |

The first auxiliary header's `+0x0c` identifies the face-array start. Its `+0x10` identifies the end of that stored face block. The block can contain additional faces after the rendered count at `+6`; shape records reference those faces too. Each face has four one-based vertex bytes (fourth zero for triangles), followed by a packed signed-ten-bit normal. The collision query reads those normals directly. The first auxiliary face list still indexes the primary model's vertex array.

Edges likewise reference vertices beyond the primary rendered vertex count. The reader resolves every referenced index against bounded primary vertex storage and returns the extra vertices. It does not clamp indices to the visible model or substitute render triangles. The exact meaning of other header fields that appear related to these counts remains open; the parser uses the established stored face extent and actual references.

## Shapes, face records and edges

A shape begins with three signed-short center coordinates. Its u32 at `+12`, masked with 15, selects a per-placement configuration slot. The u32 at `+16` carries the first lookup-record index in its low byte and a count in bits 16..20. The native code uses count zero as disabled, one as a point shape, two as an edge shape, and three or more as a polyhedron's face count. The reader retains every shape's complete 20 bytes; remaining fields are not assigned guessed meanings.

A polyhedron references `count` consecutive nine-byte records. Record byte 8 selects a face in the collision face pool; the first three/four bytes select edges for the face's triangle/quad. The middle fields remain raw in this reader. An edge shape uses the first byte of its first lookup record as its edge index. Point and disabled shapes do not dereference these lookup records.

Each edge occupies eight bytes: packed normal u32 at `+0`, one-based endpoint bytes at `+4/+5`, and two retained raw bytes. The original edge/sphere query uses these records separately from face containment.

`parseModelCollision` returns shapes, the stored first-auxiliary face pool, referenced lookup/edge records, and the primary vertices needed by those references. Lookup and edge arrays carry explicit source indices and can be sparse; use those indices rather than assuming the array position is an index.

`node tools/validate-model-collision.mjs` validates all 84 GFXM resources and their paired BTP placement records. The report is `analysis/model-collision-catalog.json`:

- 3,460 primary model records inspected; 1,236 `MODC` records have supported shape tables.
- 4,400 shapes: 2,744 polyhedra, 444 edges, 52 points and 1,160 disabled records.
- 39,540 stored collision-face-pool entries, 17,256 referenced nine-byte records and 31,264 referenced edges.
- 3,248 faces beyond first-auxiliary rendered counts and 856 vertices beyond primary rendered counts.
- All 5,172 ordinary-placement collision settings resolve with bounded per-shape configurations.

Counts include repeated content across resource packs. A bounded record is evidence of a valid data reference, not proof that every shape participates in gameplay or that the model-hit query is reconstructed.

## Placement collision settings

The ordinary-placement loader sets object `+0x194` from the GFXM table at header `+0x88`, plus BTP placement u16 `+20` times four. Each shape has a four-byte configuration; its final byte's low nibble controls native type filtering. `readPlacementCollision` preserves these words and the type values. These settings are separate from the instance's rendered face materials.

The loader also stores placement byte `+31` as object class `+0x19a`, and `(placement rotationY >> 4) & 255` as object yaw byte `+0x199`. Model candidates and hits apply an inverse-yaw transform around object position. This byte transform is separate from the full quaternion/matrix used by the visible model. The quantized table is now recovered and verified in `src/yaw-table.json`; `src/model-transforms.mjs` preserves the original shifts/products.

Observed placement classes are 0/1/2/3/4/7. The validated per-shape configurations contain type values 0/1/2/3/4. Their semantic names remain unassigned. Native `0x423ab0` filters class and type using query radius, probe tag and vehicle state, and can trigger object effects. Those behaviors remain outside this reader.

## Terrain surface records

`src/terrain-surfaces.mjs` ports the cell-reference resolution at `0x488bf0`: decode sector, signed column and signed row; read the cell packet's u32 `+4`; use that index in the GFXM `+0x110` table of sixteen-byte descriptors. This is also the base UV table used by the renderer. Negative surface references yield no terrain descriptor, matching the native sentinel handling.

Descriptor u32 `+12` supplies a low-byte category and a five-bit grip-reduction field at bits 8..12. `0x41c080` passes that reduction to the traction routine; a separate vehicle-state path can override it with 26. The reader retains the whole flag word and original sixteen bytes, and does not assign names to category numbers or interpret the remaining bits.

`node tools/validate-terrain-surfaces.mjs` resolves all 817,040 active terrain cells in 80 level packs, using 7,400 descriptor references counted uniquely within each pack. Category values are 0/1/3/5/6/7/9/11/12/14; grip reductions are 0/5/8/10/15/16/17/18/22. The report is `analysis/terrain-surface-catalog.json`.

The connected wheel probe now uses `readTerrainSurface` as its side-preparation surface resolver. Its 364 synthetic bodies retain 989 final hit surfaces, including categories 0/1/3/5/7 and grip reductions 0/8/15. The complete report remains `analysis/terrain-wheel-contact-probes.json`. Complete vehicle drive-capacity calculation, special overrides and effects are still separate.

## Evidence and verification

The focused suite has 69 passing tests. Eight added fixtures cover collision-only faces/vertices, triangles, edge/point/disabled shapes, raw placement settings, yaw quantization, invalid table/vertex references, surface bit fields and negative sentinels. These readers have structural/corpus checks, not original-process comparisons.

Complete REA replies are in `analysis/scene/results`; the evidence ledger is exported to `analysis/scene/model-collision-evidence-bundle.json`.

| Evidence | Use |
| --- | --- |
| `061`, `190` (`0x4741c0`) | Primary vertices and first-auxiliary face pointer installed in the runtime object. |
| `068` (`0x44c2b0`) | Placement configuration, class, yaw, table relocation and position. |
| `183/184` (`0x429360`) | Static model candidates, shape count/table and placement type filtering; inverse-yaw query transform. |
| `186/187` (`0x429600`) | Shape count dispatch, edge endpoints and face-plane references. |
| `172/173` (`0x424040`) | Stored face records, face-pool indices, primary vertices and per-shape slot. |
| `179/193` (`0x424a40`) | Triangle/quad containment and outside-edge codes. |
| `151/191` (`0x423ab0`) | Placement class/type filtering, local queries, yaw rotation and hit-side effects. |
| `141` (`0x488bf0`) | Terrain cell reference to sixteen-byte surface descriptor. |
| `188` (`0x41c080`) | Category and grip-reduction consumption. |
| `194` (`0x451210`) | Model-hit fraction helper uses a signed 64-bit shifted numerator, unlike the terrain ray's wrapped 32-bit numerator. |

## Query continuation

The zero-radius shape query, native yaw transforms, outer placed-model query and combined wheel selector are now ported and checked against retained instructions. [Model query notes](model-queries.md) record exact arithmetic, inside-start misses, inclusive limits, call order and result-buffer behavior. The static placement lists are also decoded in `src/model-links.mjs`. Nonzero-radius sphere/edge branches, per-frame candidate generation and mutable object damage/effects remain open.
