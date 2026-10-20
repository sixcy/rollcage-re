# Recovered collision indexing and grids

`src/spatial-index.mjs` and `src/collision-grid.mjs` reconstruct the installed Redux build's spatial lookup and collision geometry references. `src/terrain-candidates.mjs` adds candidate screening, and `src/terrain-query.mjs` adds the zero-radius terrain query used by wheels. The source executable remains the selected 1.3.8.0 build with SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Names are inferred from observed use. Placed-model hits, sphere/edge contacts and complete collision response remain open.

## Spatial rows and height layers

Relevant GFXM little-endian fields:

| Header offset | Use |
| --- | --- |
| `0x0c` | Count bounding the 12-byte spatial-node array. |
| `0x24` | Resource-relative offset of 256 spatial rows, 16 bytes each. |
| `0x68` | Resource-relative node-array offset. |
| `0x6c` | Resource-relative ushort node-map offset. |

Each row contains six packed u16 x spans, low byte start and high byte end, followed by a u32 one-based map index at `+0x0c`. `0x00ff` terminates its spans. The native loader relocates a populated row's map pointer as `mapBase + index * 2 - 2`. Each map word is a byte displacement into the node array, not a node number.

The lookup at `0x4286e0` computes x/z bins from signed Q16 high bytes plus 128. Its height bin is the signed y high byte plus 32, retained as u16. It finds the row/span map word, then follows adjacent 12-byte height nodes while the current node's reference word has bit 31 set and the height bin is at or below the next node's threshold. That threshold is bits 13..18 of the next node's first word. The upper half of node `+4`, masked with `0x3fff`, selects a zone root. Node `+8` holds runtime attachment links; the reader retains it but does not construct dynamic object/effect lists.

Outside covered spans, `0x4746f0` searches rows in order z, z-1, z+1, z-2, z+2, and so on. A containing x span returns immediately. Otherwise it retains the nearest horizontal endpoint, keeping earlier candidates on equal distances; a distance of one returns immediately. The scan ends when its attempt count reaches twice the best horizontal distance. This is the native search order, not a new Euclidean nearest-cell algorithm. Lookup reports when it used the outside fallback. If all six row spans are occupied and x exceeds the final span, the native direct loop reads the following map word; the parser preserves that path explicitly.

Validation covers all 84 GFXM files: 80 level packs have spatial data and four front-end packs have no SEGM grids. There are 96,348 nodes, 63,400 mapped x/z cells and 32,948 height continuations, including repeated content across resource packs. All 1,155,548 scene-vertex positions produce bounded lookup results; 151,196 use the outside fallback and 373,508 advance through height layers. These are structural/corpus checks, not comparisons against a running original process.

## Zones and collision planes

GFXM `+0x28` points to six-byte region records. A node selects a root record, whose second u16 shifted right by 9 gives the number of following records in its group; include the root itself. The candidate orchestrator advances by six bytes for each record.

| Region field | Packed use |
| --- | --- |
| u16 `+0` | Start row in low ten bits; start column in high six bits. |
| u16 `+2` | Sector in low seven bits; remaining control bits retained. The root's bits 9..15 give group size minus one. |
| u16 `+4` | Low byte padding; rows in bits 8..11; columns in bits 12..15. |

`0x428aa0` visits those sector rectangles. All referenced rectangles fit their sector grids. Their union establishes collision coverage; it is smaller than the complete rendered terrain. The parser retains raw normal codes in uncovered cells but does not dereference them or treat them as physical faces.

The normal table is at GFXM `+0x34`, counted by the u32 at `+0x38`. Its u32 entries pack signed ten-bit x/y/z components at bits 20..29, 10..19 and 0..9. The components use the native Q8 normal scale; the upper two bits are retained in the packed word and do not contribute to those components. Cell packet u16 `+2` indexes this normal table. This is separate from the packet's texture template and UV-record index.

Collision topology depends on the bottom-right grid vertex's flags:

| Flags | Native forms |
| --- | --- |
| Bit `0x2` clear | A planar quad, type 0. Plane anchoring uses the selected nearest corner at runtime. |
| Bits `0x2` and `0x4` set | Types 2 and 3: triangles TL/TR/BL and TR/BR/BL, using consecutive normal entries. |
| Bit `0x2` set, `0x4` clear | Types 5 and 4: triangles TL/TR/BR and TL/BR/BL, using consecutive normal entries. |

The parser retains each form's normal, native type, source vertex indices and fixed plane point where applicable. It does not replace planar quads with generic rendering triangles.

For sectors whose first flag byte lacks bit 0, the candidate builder can add side walls of types 6/7. Boundary columns come from sector bytes `+0x26` and `columns - byte[+0x27]`. Border normal pairs are u16 values at `GFXM[0x50] + sector[0x38]`, four bytes per grid row. Only region-covered border rows are used; `0xffff` means no border plane. The native narrow phase constructs raised side-wall vertices separately; this parser inventories their references without exporting replacement triangles.

Corpus validation: 447,564 normal records, 261,380 referenced region records, 96,036 zone roots, 817,040 covered cells, 912,488 cell forms and 57,192 covered nonempty border-plane references across the 80 level packs. Of the uncovered render cells, 25,779 carry normal codes outside the normal table; those codes are not silently masked into valid references. All active references pass bounds checks. Counts include repeated content across packs.

## Evidence and checks

Complete results are under `analysis/scene/results`; the ledger at this checkpoint is `analysis/scene/collision-data-evidence-bundle.json`.

- `156-spatial-node-select.json` and `160-spatial-lookup-assembly.json`: direct rows and height layers, native `0x4286e0`. Assembly Evidence `ev_c6a2374e89dbbbe4ac910f859bf8b3b85b61309e39c36eadb3e476e1c08bdc3d`.
- `159-spatial-outside-fallback.json`, `161-outside-fallback-assembly.json`: outside search, native `0x4746f0`. Assembly Evidence `ev_fae753a2c0ab0212aaeeb4bcf93aefff3fcc7e18191fa69ad9b666d3f7600475`.
- Earlier loader `analysis/asset-formats/results/006-pseudo-load-e.json`: resource-relative/one-based pointer relocation.
- `155-contact-candidate-build.json`, `164-candidate-orchestration-assembly.json`: zone root/group traversal at `0x4287f0`.
- `158-sector-candidate-builder.json`, `162-candidate-builder-assembly.json`: rectangles, distance screening, plane indices, cell types and border references at `0x428aa0`. Pseudocode Evidence `ev_40a9af6a43dd6fae17819a6d0ceb3516bfecb5e218898a24e764c3966846587f`.
- `163-collision-normal-filter.json`: native plane components and approach/overlap filtering at `0x4292a0`.
- `150-terrain-contact-query.json`: polygon and side-wall geometry use at `0x424ff0`.

`node tools/validate-spatial-index.mjs` writes `analysis/spatial-index-catalog.json`; `node tools/validate-collision-grid.mjs` writes `analysis/collision-grid-catalog.json`. The full focused suite now has 45 passing tests. New fixtures cover signed bin boundaries, inclusive height thresholds, fallback order/ties, the six-span path, invalid maps, normal unpacking, both diagonals, planar quads, uncovered normal codes, absent border planes and invalid active regions/references.

## Candidate screening

`buildTerrainCandidates` reconstructs the terrain stage of `0x4287f0`. It evaluates the body's half-frame midpoint, selects the spatial zone and visits its region group. Callers can provide the previous spatial registration: when a newly outside lookup follows an inside registration, the original retains the previous node; two outside registrations skip the terrain stage. Dynamic attachment lists and cache lifecycle are separate.

The radius is an integer lookup square root of the half-displacement's squared world length, plus the integer part of the supplied Q8 body radius. `appendRegionCandidates` reproduces `0x428aa0`: vertex-distance quantization/saturation, row-major traversal, nearest-corner tie order, normal-filter caching, prior-call duplicate checks, corner-wedge pruning, border append order and truncation to the first 64 entries after each region. `acceptsCollisionPlane` reproduces `0x4292a0` with signed Q8 normals and Q8 query coordinates. The broad-phase quad filter anchors at TL; the emitted quad's plane point uses its selected nearest corner. Split forms use fixed anchors.

Side-wall candidates have asymmetric bases: type 6 points at the bottom vertex of its row, while type 7 points at the top vertex. The latter was corrected when checking the downstream native polygon construction. Both carry the original row ID. `analysis/terrain-candidate-probes.json` checks 3,636 synthetic stationary bodies on all 80 level packs, yielding 41,512 candidate references without bounds failures. Candidate generation itself has fixtures and corpus checks, rather than an independent instruction comparison.

## Zero-radius terrain query

`queryTerrainRay(grid, candidates, query, options)` reconstructs the radius-zero path through `0x424ff0`. The normal wheel parameter is `0x1010000`: the upper byte excludes types 6/7, and the low 23 bits supply an exclusive fraction bound of 65,536. An entirely empty/filtered list returns the original unmasked parameter and zero flags, matching the native early return. The output otherwise carries `fractionQ16`, `flags`, and, on a hit, `pointQ8`, `normalQ16`, `distanceQ8`, `cellRef` and `candidateIndex`. Nonzero query radii are rejected explicitly because they require the separate edge-contact stage.

The port retains planar quads, both triangle splits, and the original side-wall polygons. Side walls raise constructed signed-short y coordinates by subtracting 256 with wrapping. Plane intersection uses a **32-bit wrapped numerator** before signed division. Hit-point arithmetic discards the fraction's low eight bits before multiplying by the ray delta; fraction and returned point therefore need not lie at exactly the same mathematical parameter. Overlaps return fraction zero and a projected point. Classification `0x80000` retains the less-than-one-source-unit tolerance, with the original body-type-4 exception.

Containment operates on truncated short world coordinates and wrapping integer cross/dot products. The query retains same-plane reuse, candidate order, edge codes, prioritized adjacent-cell traversal and the visited-edge seam acceptance rules. It returns the first accepted contact through that traversal, rather than sorting generic triangle intersections by distance. Global side-wall debug/effect bookkeeping is not reproduced.

`tools/verify-terrain-query-instructions.mjs` independently interprets the 974 retained x86 instructions and original switch-table bytes. No external calls are admitted; zero-radius fixtures cannot enter `0x425f10`. All 4,000 synthetic fixtures match the returned fraction and all 36 output bytes, covering hits, misses, overlaps, tolerance flags, planar/split forms and both wall types. There are 26,383,183 interpreted instruction steps. Reports: `analysis/terrain-ray-instruction-check.json`; native assembly Evidence `ev_09d15f0892dfc9ccc560324ae116401f481304a14e0d3d78a98bac3438d46d39`, switch-table Evidence `ev_644d027d2e3c016fc78606d3b44adc50667113b0f651ba568570d623988df6a1`. Complete replies are `168-terrain-query-assembly.json` and `169-terrain-query-switch-tables.json`; the ledger is `terrain-ray-evidence-bundle.json`.

`tools/probe-terrain-wheel-contacts.mjs` connects candidates, `buildWheelProbe`, `queryTerrainRay`, `resolveWheelContact` and suspension using declared synthetic upright bodies and four synthetic wheel descriptors. Across 80 level packs it exercises 3,636 positions / 14,544 rays: 9,188 hits (6,272 zero-fraction overlaps) and 5,356 misses. All 364 sampled installed-data queries match the retained-instruction interpreter. The reports are `analysis/terrain-wheel-contact-probes.json` and `analysis/level1-wheel-contact-probes.json`. This demonstrates the connected arithmetic on recovered geometry; it does not establish sensible spawn placement, a playable simulation or equivalence to a running game. All 57 focused tests pass.

## Next boundary

Wheel-side attempts are now ported as `prepareWheelContactSides`, with the hit selector supplied by the caller; see `docs/wheels.md`. Recover placed-model hits at `0x423ab0`, combined hit/material selection at `0x488e20`, and sphere/edge contacts via `0x425f10`. The full drive-capacity computation and collision response/event queue remain separate. Preserve native surface metadata before treating the connected terrain probe as the complete wheel solver.

Subsequent milestones recover those placed-model, wheel drive and response stages. The latest [static sphere geometry](static-sphere-contacts.md) adds the nonzero-radius terrain path, actual edge/point contacts and a connected installed-data detection/response probe. This section's zero-radius checks remain a separate wheel-ray baseline.
