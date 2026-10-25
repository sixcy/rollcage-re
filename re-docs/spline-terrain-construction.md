# Authored spline terrain construction

The editor stores centreline control points, width and banking in project v6.
These are an authoring representation, not a recovered native spline format.
`generateSplineRoad` samples them deterministically into ordinary SEGM grids;
`compileSplineRoads(source, roads, {texture})` returns rebuilt `data`, companion
`texture`, normalized `roads`, `generated` metadata and `packetInitializers`.
Always export the returned GFXM and BTP together. Empty roads preserve both files.

Generated metadata has `roadId`, appended sector indices, sampled native XYZ
`centerline`, per-axis `bounds`, and full-boundary `seams`. Original sectors keep
their indices, headers and vertex records. Recompilation starts from immutable
source, so deleting a definition removes its generated records. New route groups
are independent authored data; `upsertSplineRoadRoute` and
`compileRaceRouteTopology(...,{generatedRoads})` associate their native spatial
fallbacks with the road rather than leaving fallback to an unrelated source group.

## Retained native contracts

These contracts come from existing retained Redux instructions, not a new game
capture. The source evidence is `analysis/scene/results/068-loader-assembly.json`
(44c2b0 loader; evidence
`ev_f5eddfe878790ed034b165f848b3f30c76f84c3a9ca63310c4a967679e949ff6`), and
scene results 028 (48cc30), 029 (44d230), 034 (48f2d0), 042 (489e40).

| Native field | Construction |
| --- | --- |
| SEGM 0x00..0x5f | Complete source header template; dimensions, addresses and runtime counts replaced |
| +04 | Open-edge flag retained/set; animated source sectors rejected |
| +08/+0c | Grid columns/rows; rows split at15 for collision-region dimensions |
| +14 | Signed16 maximum terrain Y +128 for recovery, checked before writing |
| +20 | Fresh signed16 XYZ/u16 flags grid,8 bytes per vertex |
| +24 | Packed source metadata retained; +26/+27 are collision border insets, unused with open-edge flag |
| +28/+2c/+30 | Valid bounded lower LOD column-stride headers |
| +38 | Zero offset into native GFXM+50 animation table |
| +3c/+40/+44 | Valid bounded lower LOD lighting nibble buffers |
| +48 | Byte displacement into GFXM+3c row instance-offset table; zero instances |
| +4c | Row-state **index**, converted by loader to28-byte GFXM+c4 entries |
| +50 | Primary8-byte packets: render ID, two-normal base index, UV-record index |
| +54/+58/+5c | Bounded primary-packet aliases; generated PVS selects LOD1 only |

44c6a0..44c712 relocates resource-relative pointers and the instance/animation
roots, and scales +4c by28. The builder preserves original instance/state prefixes
and appends rows, rather than allocating one state per sector. Primary vertex
winding faces geometric +Y (native Y increases downwards); stored Q8 collision
normals point opposite winding. The source corner flag determines the diagonal
and renderer corner mapping; each cell gets its own correctly oriented normals.

44c3ea allocates GFXM+8 records of0x120 bytes. New cells require unique render IDs:
source IDs are reused across disjoint original visibility windows and cannot be
aliased by new always-visible faces. 44c93c/44c99a initialize records from inline
BTP+40 words. `extendSplineRoadPacketInitializers` expands this table, updates
BTP+0c, clones the source material initializer, shifts the five proven absolute
BTP pointers, and preserves existing placement/pixel data. Unknown reserved-header
variants are rejected. GFXM/BTP counts must agree.

48cc30 PVS entries have start-row11/count5 in word0, sector/last in byte2,
and their **first step byte at byte3**, overlapping the second word. Each step
contains row-count6/LOD-minus-one2; the next entry is aligned(3+count,2).
Generated LOD1 entries are included in original visibility programs as well as
new spatial chains so geometry appears before entering its collision cell.

44d230 lighting coverage is a separate program addressed relative to the PVS root
using node bounds low13. Its original inline/explicit intervals are decoded and
preserved exactly. It supports only **four sector/row intervals per node**. A new
road that exceeds this capacity is rejected with a placement error. Distinct
source intervals are never merged or dropped to make room.

## Spatial and collision data

New coverage uses regions of at most15x15 cells and padding up to255, checked
against actual cell diagonals. Original map/node indices remain the prefix;
changed cell chains are cloned with original thresholds, original region lists,
model words and fallback words retained. Road regions are reachable in every
applicable height layer. Different road heights remain separate geometric planes;
actual triangle queries distinguish an elevated bridge from ground below it.

Outside the original mapped area, supplied BTP placement transforms and native
model collision bounds rebuild nearby static model membership. There is no empty
model-list shortcut. Route fallback uses a valid nearby original group until an
authored road route replaces it. Native limits reject before serialization:
128 sectors,14-bit region roots,128 regions per group,7 models per cell,10-bit
model sequence starts,16-bit map byte displacements,6 row spans,16-bit render IDs,
bounded PVS counts/offsets and the four lighting intervals. No field wraps.

The compiler tests every generated triangle centre with `buildTerrainCandidates`
and `queryTerrainRay`: an origin8 units above the plane and a16-unit downward ray
must hit the newly generated sector within native candidate capacity. This is
reconstructed-algorithm evidence; original-process acceptance is separate.

## Supported scope and verification

Open-edged roads, ramps, banked roads and bridges are supported. End connections
copy a full first/last boundary with the same column count, using current edited
source heights. Animated boundaries, animated/packed surface presets, folds,
degeneracy, signed16 overflow and cells requiring padding above255 are rejected.
There are no generated walls, undersides, loops, tunnels, vertical/inverted grids,
T-junctions or arbitrary topology. Source geometry still needs manual removal or
editing where a road overlaps it. Conservative visibility costs rendering work;
visibility optimization is future work.

`node --test tests/spline-road.test.mjs tests/terrain-construction.test.mjs`
covers immutable sampling, split seams, boundary connections, curves, ramps,
banking, stacked bridges, actual contacts, native PVS/light round trips and invalid
input. `tools/validate-spline-terrain.mjs NEW_REPORT.json` checks all40 original
LOW/HIGH resources, no-edit identity, original vertices/model/fallback preservation,
BTP initializer preservation, per-triangle contacts and30 reconstructed race ticks
(LEV16/17 have no original route, so parser/terrain checks only). The corpus report
records rejected crowded placements and a successful bounded alternative per track.
