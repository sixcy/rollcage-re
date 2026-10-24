# Existing terrain height and surface editor

Updated 2026-10-25. Open docs/track-viewer.html, select a verified Rollcage archive pair and choose **Track editor**. All 20 LOW/HIGH pairs, including LEV16/17, are editing targets. Stage II and Firebugs remain viewers. LEV16/17 offer **Preview changes**, with AI racing disabled because usable paths have not been established.

## Delivered tools

The Terrain heights tool has Raise, Lower, Smooth, Flatten to first click and Set height. Left-drag stamps connected terrain; right/Shift drag moves the camera. The wireframe previews a stroke, release compiles it and Escape cancels it. A stroke is one undo operation. Radius, strength and target height use original game units; the UI displays Y-up while project heights use the native signed Y coordinate.

Brush distance follows grid edges and exact matched two-sector boundary edges. Coincident points alone do not join separate roads. Shared vertex storage and verified boundary seams stay linked. This does not infer arbitrary T-junctions or stitch new sectors. Sector-animated and point-animated regions, including LEV8 animation, are locked rather than silently frozen.

The Surfaces tool offers searchable paged thumbnails and an eyedropper. Each preset pairs the same original cell in LOW/HIGH, copying its complete existing texture/UV/category/grip record. It does not overwrite shared descriptors, import textures, invent material names, or create collision for decorative cells. Thumbnails always use the original LOW textures and survive removal of the last visible reference to a preset page. Numeric category/grip fields are retained without guessing descriptive material labels.

Heights and surfaces compile both qualities before committing any state. Existing pickups, scenery, race starts and routes retain their saved positions. The UI warns that clearance may need adjustment; automatic object/route repositioning and a full clearance audit are not implemented.

## Compiler and spatial data

src/terrain-editor.mjs is an offline editor algorithm; it is not the original track-builder source. It changes existing signed 16-bit Y coordinates only. X/Z, grid dimensions, sector topology and collision-enabled coverage stay unchanged.

Touched collision cells receive newly packed paired normals and an explicit triangular split, preserving the authored diagonal and normal orientation. The compiler retains native signed 10-bit normal components at Q8 precision. Sector recovery/max-Y metadata retains its original margin. Border walls are vertical extrusions: their X/Z geometry and horizontal normals do not change with vertex height.

Existing spatial height-chain thresholds, model lists and route fallback words are preserved. Affected terrain regions are propagated conservatively through each existing chain and only affected region padding grows by the largest local vertex displacement. This broadens candidate lookup without claiming recovery of the original offline spatial builder. The compiler reparses the result and requires touched cells to remain reachable within bounded native candidate limits.

Degenerate faces, animation locks, signed-width overflow, 255-unit padding overflow, region/group/normal-index capacity overflow, unsafe candidate growth and oversized resources reject before changing the committed project. Rejected edits leave both quality sources unchanged. These limits mean large edits may require smaller terrain changes; capacity is not bypassed by truncating native fields.

## Projects and export

New track-project.json files use schema version 3 with sparse height values and surface source-cell references, alongside pickup/model drafts and exact source hashes. Version-1 pickup projects and version-2 track projects remain readable. Loading validates every source and compiles both qualities before replacing any draft. Loading a project keeps the toolbar's selected tool active.

Export game files writes a new IMG/IDX ZIP with the project and instructions for a separate installation. Selected source files and installed archives are never overwritten. The browser acceptance independently checks ZIP CRCs, the unchanged original IMG prefix, the exact changed IDX entries and both independently compiled resources. Continue an older project using its matching starting archive pair; reopening an exported pair starts from the already exported edits.

## Validation retained on 2026-10-25

- Synthetic regressions exercise actual terrain rays, normals, both spatial height layers, linked seams, disconnected stacked roads, full surface descriptors, animation locks, arithmetic/capacity rejection and atomic paired compilation.
- [Installed-data matrix](../analysis/terrain-editor-matrix-20261025-v1.json): byte identity with no edits for all 40 variants; representative height and surface edits reparse in both qualities; reconstructed three-car Expert/weapon simulations run for 90 ticks on the 18 racing levels. LEV16/17 use static compile/preview.
- [Browser terrain/export acceptance](../analysis/terrain-editor-browser-20261025-v3/report.json): real clicks, brush history/cancellation, surface painting, v3 reload, downloaded ZIP comparisons and fresh edited race initialization.
- [Browser workspace acceptance](../analysis/editor-workspaces-browser-20261025-v3/report.json): all 40 targets, all 20 libraries, LEV16/17 preview without AI, paused workspace transitions and a stable Camera selector.

## Original-process validation

The dedicated tools/native-terrain-editor-capture.ps1 uses tools/lib/terrain-editor-native-debugger.cs, a fork of the retained pickup observer. The preparer makes a verified isolated installation and replaces only its two archive files with compiler exports. The user's installation and pristine baseline stay read-only.

The debugger changes the selected level and LOW/HIGH bytes in frontend configuration immediately before the original demo session initialization. It checks the expected original bytes and thread/context first. It does not rename a LEV1 resource to masquerade as LEV16, replace the native filename result, or force AI paths. At the native loader it verifies the actual requested stem, then reads bounded resource-relative vertex, packet, normal and surface bytes. First simulation tick, complete pickup initialization and owned-process termination are required. Each independent checker also rehashes all 171 pristine files.

LEV1 fixtures lift original starting-area cells by four source units and copy full alternative surface presets. Both qualities record a real wheel query contacting an edited cell. The returned point lies on the exported plane (zero error in these cases) and its Q16 normal exactly matches the exported Q8 normal expanded by 256. The observer does not write wheel outputs or car pose to manufacture a contact.

| Native case | Retained independent acceptance | Proven scope |
| --- | --- | --- |
| LEV1 LOW | [Contact](../analysis/native-terrain-editor-contact-low-acceptance-20261025-v2.json) | Edited bytes loaded, actual wheel contact, matching normal/plane |
| LEV1 HIGH | [Contact](../analysis/native-terrain-editor-contact-high-acceptance-20261025-v1.json) | Edited bytes loaded, actual wheel contact, matching normal/plane |
| LEV16 LOW | [Loading](../analysis/native-terrain-editor-lev16-low-acceptance-20261025-v1.json) | Correct level stem, edited resource bytes, native initialization |
| LEV16 HIGH | [Loading](../analysis/native-terrain-editor-lev16-high-acceptance-20261025-v1.json) | Correct level stem, edited resource bytes, native initialization |
| LEV17 LOW | [Loading](../analysis/native-terrain-editor-lev17-low-acceptance-20261025-v1.json) | Correct level stem, edited resource bytes, native initialization |
| LEV17 HIGH | [Loading](../analysis/native-terrain-editor-lev17-high-acceptance-20261025-v1.json) | Correct level stem, edited resource bytes, native initialization |

Native loading on LEV16/17 does not establish AI racing on those levels. Complete-track contact coverage, long runs, all grip-dependent behavior, original renderer equivalence and native scenery-export acceptance remain unproved. Retained native process blobs and private installation copies stay local and excluded from Git; trace/manifests/report hashes preserve provenance.

Pure observer-policy tests compile the C# helper and reject malformed read bounds and observation sites without launching a game. Source/JavaScript comparisons and original-process observations remain distinct evidence classes.
