# Existing race layout editor

Updated 2026-10-25. The editor changes original records only: route XYZ and recovered speed bytes, checkpoint plane positions/directions, and starting-slot XYZ. It does not add route groups, graph links, checkpoints, starts or new sectors. Those counts and graph structures stay authored.

## Authored records and evidence

| Record | File table | Edited fields | Preserved fields |
| --- | --- | --- | --- |
| Route group | GFXM byte 0x79 groups at DWORD 0x8c, 12-byte rows | None | Count, reverse/cyclic/mode/bias metadata and relative point offset |
| Route point | Group-relative offset +8 into GFXM DWORD 0x98 point base; 16-byte rows | signed16 XYZ +0/+2/+4; unsigned minimum speed +6 and target speed +7 | DWORD flags +8 and packed graph links +12 |
| Checkpoint | GFXM DWORD 0xa0; 20-byte rows referenced by byte ID lanes at DWORD 0xbc, count byte 0x95 | signed16 XYZ +4/+6/+8; signed16 direction +0xc/+0xe/+0x10; dependent sector byte +0 | Order +1, unsigned progress +2, padding +10, flags +18 and all ID lanes |
| Starting grid | GFXM DWORD 0x74, count byte 0x78; 8-byte rows | signed16 XYZ +0/+2/+4 | Last word +6; no guessed yaw meaning |

The retained 44c2b0 loader (asset-format result 006, Evidence ev_7223d7b195c9dce27ce3662ae697bc4ec68ff0400b307243f911e04006d50751) publishes byte 0x78 to pack +0x47 and relocated DWORD 0x74 to pack +0x48. The actual 41dbb0 constructor reads signed XYZ from the selected pack+0x48 slot; orientation comes from the first packed checkpoint direction, with side-dependent negation and 41e3f0 quaternion construction. Thus starting-slot yaw is not exposed as an invented property. Constructor parent assembly Evidence ev_16e1c6a62e466500605b98333c96f4863f748728e8f58cd1708448cd6dd17a25 is retained in the [constructor notes](vehicle-construction.md).

[Route control](autonomous-route-control.md) and its retained parent Evidence ev_c99c3a6ce0d40808f111cd290378e32df7c375f2b65a6fd0adad13571bc1514a establish signed route coordinates and native 431750 reading unsigned point+7 times two. The 421430 scoring parent reads point+6 times two as a minimum-speed screen. The UI labels these raw bytes with their native doubled interpretation; they are not verified km/h settings. Flags, special-target metadata and packed graph links remain read-only.

The [checkpoint transition](respawn-progress.md), retained 449d40 Evidence ev_74cf530de140cce396ceb52b8b8fa307af6367c48618e76c10e8913823a175ea, establishes plane position, signed direction, sector gating and the low lap-marker flag. Directions are generally Q14 vectors in the source corpus; editing preserves signed16 components and rejects a zero vector. The editor does not guess a width field or change checkpoint ordering, progress values or finish flags.

## API and limits

src/race-layout-editor.mjs exposes inspectRaceLayout, emptyRaceLayoutDraft, createRaceLayoutDraft, raceLayoutMoveConstraint, raceLayoutCheckpointConstraint, validateRaceLayoutDraft and compileRaceLayoutEdits. The empty draft is {routes: [], checkpoints: [], starts: []}; sparse rows contain route {group,point,position,minSpeed,targetSpeed}, checkpoint {id,position,direction}, or start {index,position}. createRaceLayoutDraft returns a complete editable snapshot, while inspect exposes offsets and preserved metadata separately. Coordinates use native XYZ; viewer Y-up conversion belongs to the UI.

The original offline route fallback builder is not recovered. Native 48da10 obtains its fallback route/index from the first word of a spatial model-link group; 429360 skips that first word to read the following static model references. Its exact native consumer is retained as Evidence ev_6f9f032c0fd1193ece12bf384c1510d4bc8709e8c3acdb2274b6b0af2f8f85bf in [finish bookkeeping](lap-and-finish-bookkeeping.md). Native 48da10 compares the current route neighborhood and packed links against that fallback, with signed32 distance arithmetic and fallback winning an exact tie.

### Route relocation and fallback rebuilding

Positions are no longer restricted to their original 256-unit cell. Routes and starts may move to existing populated native spatial cells with covered nearby terrain in the selected height layer. A geometric closest-triangle check requires distance within 256 original units, or the original marker's existing terrain distance plus 64 where larger. This is an explicit editor admission bound; it is not a reconstructed vehicle radius or original authoring limit. It permits established elevated route targets while rejecting unrelated empty-space destinations. It does not guarantee a useful racing line or collision-free starting grid.

Route coordinate changes trigger an offline fallback rebuild in src/race-layout-spatial.mjs. Each node retains its ORIGINAL ROUTE GROUP. Existing source model words stay in original order. The editor can change the fallback point index only within that authored group; it does not invent route connectivity or redirect an entire branch to another group.

The editor collects every X/Z map cell that aliases each spatial node, preserving actual height-chain selection domains. These domains reproduce the signed Q16 high-word/256-unit Y-bin conversion, unsigned +32 bias and native threshold comparison, including wrap. A candidate score minimizes the worst squared distance to the node's complete cell/layer footprint, then the sum of distances to cell centers using the original fallback point's altitude as an anchor. Existing ties preserve the authored point. If the authored point moved, all existing points in that group are reconsidered. Otherwise only a moved point whose score improved may replace it. Unrelated authored choices are retained.

Distinct new fallback/model sequences are deduplicated and appended to a new serialized table; node starts are repointed while all lower 22 bounds bits, model-count bits, spatial rows, cell maps, reference words, region groups and height thresholds remain unchanged. This handles shared original group aliases without overwriting model lists. Native 10-bit group starts, 3-bit model counts, table width and resource size are checked before output; capacity overflow rejects rather than truncating fields. Original table bytes remain retained inside the resource, and no-edit output is byte-identical.

This is an independently tested editor policy, not recovered original offline-builder arithmetic. Existing route graph links and point order remain authored. Large changes can make the racing line or progression nonsensical even though the native-format references are valid; complete-lap behavior after arbitrary route editing is not guaranteed.

### Checkpoints are infinite planes

Checkpoint positions are PLANE ANCHORS. They do not have to lie over road geometry or inside populated spatial cells. The initial local prototype incorrectly applied point-placement restrictions to them; this was corrected before the wider delivery.

raceLayoutCheckpointConstraint(info, originalCheckpoint, nextCheckpoint) evaluates 449d40's exact signed per-product projection (Math.imul followed by each >>6 before summation) at covered-cell triangle vertices. It retains the authored sector if the plane still intersects covered terrain there. Otherwise an offline geometric policy selects the sector with the nearest covered plane intersection to the new anchor. A plane with no covered intersection is rejected. Native IDs, ordering, progress fractions and lap flags stay unchanged; the sector byte is updated coherently when required. Direction-only changes run the same check.

The diagnostic returns supportSector, supportCell, intersectionPoint and intersectionSegments, even for an unchanged plane where geometry is available. Coordinates are native XYZ. Clipping segments use floating interpolation between native projection signs for visualization and editor sector selection; they are not a native rendering reconstruction. The UI can focus/pick the road intersection while exposing the actual editable plane-anchor coordinates. Cached unchanged source planes remain readable even if a separate terrain edit removed their current intersection; moving such a plane requires restoring a valid crossing.

Starts own no route fallback reference, so changing starts does not rebuild the route table. Their existing unknown last words remain untouched. Starting orientation still comes from the original first checkpoint construction path.

Original graph counts and route/checkpoint/start table offsets stay unchanged. New coincident adjacent route points and conflicting edits of aliased byte storage reject atomically. Every compile returns a fresh resource. Empty and full unchanged snapshots are byte-identical to source; changed output edits only declared fields and the necessary serialized lookup metadata.

## LEV16/17 correction

The installed resources actually contain one nonempty cyclic 13-point group each, in the same table used by route control and respawn; group zero is empty. LEV16 has three logical checkpoints, LEV17 four, and each has six starting slots. These observations correct the earlier shorthand that they contain no path data. They do not independently establish a complete usable AI race, correct special-mode semantics or lap completion. Their existing records can be inspected/edited, but Racing test remains disabled pending separate validation. No new paths are fabricated.

## Validation

- Ten synthetic regressions cover full/empty no-edit identity, exact edited-byte boundaries, metadata/graph preservation, covered terrain admission, off-road infinite-plane anchors, checkpoint sector reassignment, native widths, malformed tables, duplicate IDs, zero directions, coincident neighbors and conflicting aliases.
- The distant-move fixture moves a route 320 units across cells, checks preserved shared model words/layer chains, then executes the actual reconstructed 48da10 consumer against the rebuilt serialized table. It selects the expected fallback waypoint outside the original route's three-point local neighborhood.
- Separate fixtures exercise an overlapping road's height branch and native shared-table offset overflow, checking that no source bytes are mutated and no width is truncated.
- [Initial local matrix](../analysis/race-layout-editor-matrix-20261025-v1.json) and [fallback-aware local matrix](../analysis/race-layout-editor-matrix-20261025-v2.json) retain earlier 40-variant checkpoints separately.
- [Wider relocation matrix](../analysis/race-layout-relocation-matrix-20261025-v1.json) passes all 40 LOW/HIGH variants. Each case moves a route 2,092–15,064 units and the first starting slot 692–15,504 units, changes a checkpoint plane and rebuilds 3–111 fallback nodes. Every original fallback group, static model list and spatial height/reference word is preserved. Thirty variants exercise checkpoint-sector reassignment. All 854 referenced checkpoint planes intersect their authored sectors and permit a small legitimate anchor move. The 36 currently enabled racing variants each run 90 reconstructed three-car Expert/weapon ticks after the combined wider changes; LEV16/17 remain source/edit checks only. All original resource hashes stay unchanged.
- These are synthetic and installed-data/source checks. They are not new original-process capture, proof of the original offline builder or complete-race parity. Native race-layout export acceptance remains separately reported.
