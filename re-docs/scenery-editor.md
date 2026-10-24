# Static scenery editor

The Track Viewer now has **Edit static models** alongside pickup editing.
Both modes pause Racing test and keep Orbit/Fly-in camera navigation available.
Select a model in the view or list, drag it over terrain, or edit X, Height, Z
and Yaw. Rotation controls snap to the native collision yaw's 256 directions
(1.40625 degrees); moving an existing object preserves its authored yaw.
Focus selection fits the camera to the model. Right/Shift drag moves the camera.

**Model library…** opens the existing textured Object Viewer catalog in a
modal preview, with library selection, search, orbit/pan and zoom. Place this
model starts a translucent terrain preview; clicking commits, Escape cancels.
Duplicate uses the same confirm/cancel workflow. Delete, undo, redo and reset
models operate on the current track; a drag is one history entry.
The optional **Show only placeable models** checkbox hides locked/unsupported
entries and checks destination texture slots and resource/reference limits in
both LOW and HIGH, using the same asset preflight as the Place button. It starts
unchecked, combines with search and stays selected when switching libraries.
An incompatible model remains viewable with filtering off, with its reason in
the dialog and Place disabled. Preflight results are cached for the current
destination draft. Cross-library imports can reuse exact textures or copy them
into free compatible slots; origin in another library alone does not block them.

Collision-cell capacity depends on the chosen location and remains checked on
the placement click. A visible message over the canvas explains rejected clicks,
including missing terrain or a full collision cell, while keeping the preview
available for retry elsewhere. Successful placement removes the transparent
preview and message. Escape cancels it without changing the draft.

## Compatibility

This first version edits ordinary visible class-7 `MODC` placements with no
group, attachments, authored tilt, extra flags or animated material dependencies.
Other scenery remains visible, selectable and explicitly locked. Class zero
alone does not establish ordinary static behavior: many such objects carry
grouped destruction or attachment metadata. Vehicle imports and Blender models
are outside this feature.

All 20 verified Rollcage levels can be editing targets and libraries.
Some contain no compatible original scenery, but can receive compatible imports.
The historical pre-LEV16/17 corpus check found editable originals in 13 of its
18 levels. LEV16/17 now support editing and static preview; AI racing remains
disabled. Stage II, Firebugs and unknown releases remain viewers.

Every committed operation compiles and validates LOW and HIGH before changing
the draft. Cross-library support is conditional on native capacities. In
particular, the supported base texture page reference has six bits, ID63 stays
reserved, and many HIGH packs have no compatible free slots below it. The
compiler never wraps page IDs, overwrites active destination textures, changes
the black-transparency interval or freezes animated materials to force a fit.
An incompatible import is disabled with its reason before a placement preview
starts, and the project remains unchanged. Location-specific collision limits
instead keep a preview available for retry elsewhere or cancellation.

## Compilation and preservation

`src/scenery-editor.mjs` is shared by browser and Node. It preserves native
placement/configuration bytes and model-relative collision/LOD offsets.
Ordinary authored placement mode is the nonzero `authored+28` argument to
`4741c0` in `44c2b0`; these objects use instance UV keys rather than the vehicle
embedded-packet path. Unassigned model bytes are never interpreted as textures.

Foreign model closures are copied as isolated donor-resource blocks. Only the
selected primary model is exposed through the destination model table; the
other copied bytes are inert. This intentionally spends space to retain all
relative references and unknown fields. Repeated imports reuse the donor model,
geometry table, identical material descriptors, and compatible exact texture
and palette data. The placement UV/configuration/geometry references are remapped.
Source/destination resources exceeding 128 MiB or native reference widths fail.
The editor caps authored placements at 256 to leave half the recovered 512-body
registry for vehicles, pickups and effects; this is an editor bound, not a claim
about the game's maximum authored count or every runtime pool combination.

Deletion writes a skipped-dispatch placement type (25, outside `44c2b0`'s
0–24 constructor dispatch). It removes the model's static collision memberships
without renumbering unrelated authored objects or linked/special references.
The original unused bytes stay in the append-only resource.

Edited collision candidates use a conservative spatial rebuild, not a claimed
recovery of the original offline track builder. Unedited memberships and terrain
topology remain intact. Edited models register in existing XZ cells overlapping
their horizontal bounding sphere plus one 256-unit cell of padding, across all
height layers. Empty cells use the recovered nearest-cell fallback, including
stock decorative model origins outside populated spans; coordinate bins wrap
with the native signed-Q16 domain. Bounds include collision-only vertices and point-shape centers;
unknown shape fields do not supply invented extents. Native shape/plane filters
continue deciding actual contacts. The recovered vehicle query radius is below
one cell; arbitrary unbounded swept queries are not a demonstrated equivalence.

Identical route-word/model-list groups are interned. More than seven models per node, 10-bit list-start
overflow, missing spatial coverage, or table/index overflow rejects the edit.
Footprints over 16,384 queried cells also fail the editor's conservative bound.
This can refuse crowded/large placements even when a more exact original
partitioning might fit. No collision shapes are dropped to fit the limits.

### Shared race-route fallback words

The GFXM `+0xac` table has two consumers. A spatial node's upper ten bounds-word
bits select a start word. `429360` pre-increments past that word to read its
static model references. `48da10`, through runtime pack `+0x7c`, reads the start
word itself as `(routeGroup << 16) | pointIndex` for race progress fallback.
It is not padding and cannot be replaced by a generic zero sentinel.

The initial editor rebuild discarded that word. Adding LEV3 model 27 to HIGH
LEV3 could therefore parse and render correctly but fail race progress with an
out-of-bounds read. Rebuilding now preserves every node's original route word,
and interning includes the route word as well as the model references. Even
identical model lists with different route fallbacks stay distinct.

Regression tests cover movement, duplication and deletion with distinct route
words. The installed-data matrix asserts all per-node route words survive and
tests up to three different placed models, restarting after each, in LOW/HIGH.
`analysis/scenery-route-racing-matrix-20261024-v1.json` records 66 restarts and
28 runs of 600 reconstructed runtime updates without errors. The headless Edge
check `analysis/scenery-race-restarts-browser-20261024-v1/report.json` places
models 27/19/29 through actual HIGH/LEV3 terrain clicks, tests after each, then
tests undo/redo/delete/restoration and 600 further race updates.

Exports made with the earlier rebuild should be regenerated from the saved
project and its starting archives. This fix preserves the original route data;
it does not infer missing routes from an already damaged export.

## Projects, preview and export

One `track-project.json` (schema version 2) saves pickup and scenery drafts,
stable placement identities, donor template references, the archive fingerprint,
and original geometry/texture hashes for both qualities. It embeds no game
models/textures or arbitrary patches. Version-1 pickup projects remain accepted;
loading them restores original scenery and opens pickup editing.

Loading validates all required originals and compiles both qualities for every
edited level before replacing any drafts. Switching tracks retains drafts.
An existing project must be reopened against its exact starting IDX and the
matching geometry/BTP source hashes. Most starting pairs are original game
files. Exported IMG/IDX files already contain the edits and can instead be
opened as a new project base when their append-only format is recognized.
The same cached compiled geometry **and BTP** feed scene rendering, OBJ download,
Racing test and game export. Test changes restarts the selected Expert roster
with weapons enabled. History, selection and pointer previews never modify the
original archives or simulation state.

`rollcage-track-edits.zip` contains IMG/IDX, the combined project and README for
a separate installation copy. The archive writer preserves the original IMG
prefix and unrelated IDX entries. Cancellation retains drafts. Source files are
read-only and all browsing, compilation and export happen locally.

### Recognizing edited archives

`src/edited-rollcage-index.mjs` recognizes the archive writer's layout using
the small stock track-index metadata catalog in `rollcage-editable-index.json`.
Only the 80 known track geometry/BTP rows may change offset/stored/decoded size;
allocation/link metadata remains unchanged. Replacements must be aligned,
uncompressed, non-overlapping and appended beyond the stock IMG size.

Restoring those rows in a private index copy must reproduce the complete known
stock IDX SHA-256. A private archive view then reads and hashes the original
LOW/LEV1 geometry and BTP sentinels retained in the IMG prefix. Current selected
resources still undergo their ordinary format checks. The source IDX/cursor
and IMG are never modified. This also recognizes repeated editor exports.

Recognition establishes a supported base/index layout and preserved sentinel
content, not an authenticated producer signature or a hash of every IMG byte.
It does not establish native gameplay compatibility for edited resources.
The UI therefore calls these **recognized edited archives**. Unrelated index
changes and mismatched retained sentinels do not enable racing/editing.
Project hashes bind to the actual selected starting archives, including when
that starting pair is itself edited; projects are not silently rebased.

The HIGH/LEV1 disabled-controls regression is covered by
`tools/check-edited-archive-viewer.mjs`: automatic edited-archive detection,
HIGH and LOW racing, pickup editing, project-source messaging and unchanged
input-file hashes. It runs in headless Edge without launching the game.

## Model Library collision status

The library now labels each model/material variant with **active collision records**,
**no active collision**, **collision unknown**, or differing LOW/HIGH state.
The preview gives separate LOW/HIGH active shape counts and kinds. Search also
matches these labels; for example, `enabled` or `active collision records` combined with **Show only placeable
models** finds placeable templates with active authored collision. Collision
status and editor eligibility are independent: a grouped/effect-linked model
can have collision while remaining locked for duplication.

The 2026-10-25 revision replaces the overly strong **collision enabled** wording:
active records are not proof of a solid obstacle. **Shape warning** identifies
active polyhedra whose face half-spaces exclude another vertex of the same
shape by more than two source units (a tolerance for packed-normal rounding).
This diagnostic does not prove that a shape without warnings blocks cars,
nor establish the original artists' intent.

**Show collision shapes** is on by default in the Model Library preview.
The LOW model-local collision faces are drawn as cyan wire perimeters through
the textured mesh. Amber arrows show decoded face normals. The user can hide
the textured model or the arrows independently. **Show disabled records** adds
grey primitives; records with zero face count only show a cross at the stored
center, since their intended topology is unknown. Point shapes also use center
crosses, edge shapes use their actual endpoint segment, and no artificial
radius, bounding box or solid geometry is supplied. The explicit LOW preview
label distinguishes it from the separately listed LOW/HIGH metadata.
`src/model-collision-preview.mjs` builds these display primitives without
changing source geometry/settings, and the separate preview GL overlay reuses
the existing camera/line shader. Buffers are rebuilt on selection, not per frame.

`src/scenery-collision-info.mjs` reads the same MODC shapes and placement
configuration slots used by the reconstructed contact path. Zero face-count
records, class 5 placements and configuration type 5 are excluded. Unsupported
representations, invalid slots and parse failures are reported as unknown,
not silently treated as disabled. These labels describe the selected original
placement template, not a native-process contact observation. Active shapes
can cover only part of the visible mesh; tags, damage and runtime effects can
also affect contacts.

The read-only inventory tool is:

```
node tools/inventory-placeable-collisions.mjs NEW_REPORT.json [INSTALLATION]
```

`analysis/placeable-collision-inventory-20261024-v1.json` records source hashes,
53 supported own-library model/material variants across 18 LOW/HIGH pairs,
with 12 having active collision in both qualities and 41 having none:

These are **record-state counts**, not a list of twelve proven solid obstacles.
In particular, LEV2 models 0 and 22 have conflicting base-plane directions.
`analysis/placeable-collision-inventory-20261025-v1.json` retains the same
inventory with the additional per-shape plane diagnostics.

| Library | Model | Material variant | Active volumes (LOW/HIGH) |
| --- | ---: | --- | ---: |
| LEV2 | 0 | placement-uv-1289 | 1 / 1 |
| LEV2 | 4 | placement-uv-1329 | 1 / 1 |
| LEV2 | 22 | placement-uv-1309 | 1 / 1 |
| LEV5 | 26 | placement-uv-687 | 3 / 3 |
| LEV5 | 39 | placement-uv-1834 | 1 / 1 |
| LEV5 | 40 | placement-uv-1927 | 1 / 1 |
| LEV10 | 13 | placement-uv-1008 | 2 / 2 |
| LEV13 | 22 | placement-uv-395 | 4 / 4 |
| LEV13 | 33 | placement-uv-1590 | 1 / 1 |
| LEV13 | 34 | placement-uv-1598 | 1 / 1 |
| LEV20 | 22 | placement-uv-838 | 1 / 1 |
| LEV20 | 23 | placement-uv-846 | 1 / 1 |

This checks own-library asset compatibility in both qualities, not arbitrary
placement positions. Cross-library texture limits still apply. LEV3 model 27
has seven zero-count records in both qualities; all five currently supported
LEV3 model types (19, 27, 29, 30, 31) lack active authored collision. LEV3 model
11 has eight records, five geometrically enabled volumes and four active after
placement configuration filtering; it remains locked because of its group and
attached effects. Test changes and archive export use the same compiled
collision resources and spatial membership table, so exporting model 27 does
not turn its disabled records into solid geometry.

The data does not establish why artists disabled a particular record. Decorative
pass-through geometry, avoiding snagging, shared collision elsewhere, performance
or runtime damage behavior are possible explanations, not verified intent.
A future per-placement switch could disable existing collision using type 5,
with cloned settings to avoid changing another instance sharing the template.
Enabling valid retained shapes is different from constructing missing shapes:
zero counts do not specify the intended face ranges or volume topology. Making
model 27 solid would require authoring/generating suitable simplified collision,
not merely changing a boolean. No collision-editing switch is implemented here.

### LEV2 tree pass-through reproduction

The 2026-10-25 report `analysis/scenery-car-obstacles-20261025-v1.json` addresses
the model-0 report using read-only LOW/HIGH LEV2. Each quality runs one Expert
car for 120 ticks, places an obstacle on the baseline tick-50 racing line at
terrain height, and starts fresh races with either model 0 or model 4 at that
same location. Both obstacles retain their original collision bytes and are
registered in the edited spatial list. Model 0 produces zero model contacts;
model 4 produces 191 and changes the trajectory by over 3,000 source units.
This is reconstructed-runtime evidence, not an original-process run.

Model 0's shape references five faces of a pyramid, including base face 8.
The base normal is `(0,-256,0)` at local Y=0, while the apex is at Y=-320.
Consequently the apex lies on the excluded side of the base half-space. For a
horizontal sphere above the base with center height greater than its radius,
424040 rejects the base plane: positive separation and zero normal approach.
The report compares 21 height/radius cases in each quality against the complete
retained 424040 instructions and primitive helpers; all match the missed
contacts. These interpreted-instruction matches do not establish original
whole-process behavior. No authored normal is flipped and no collider is
silently invented. The broader physics goal remains paused.

`tests/scenery-collision-info.test.mjs` covers per-instance settings, disabled
geometry and unknown metadata using synthetic fixtures. The headless Edge tool
`tools/check-model-library-collision-viewer.mjs` checks enabled, disabled and
locked examples, combined search/filter behavior, clearing stale details, and
idle modal DOM stability. It does not launch the original game.
The 2026-10-25 shape-overlay check also verifies GL-rendered cyan pixels,
independent mesh/wire/normal switches, optional disabled markers, clearing old
overlay buffers and zero idle DOM mutations. Screenshots and results are in
`analysis/model-library-shapes-browser-20261025-v2/`.

## Validation and remaining native checkpoint

- `tests/scenery-editor.test.mjs` and `tests/track-editor-project.test.mjs` cover
  native widths, locked objects, deletion identities, collision/configuration
  preservation, cross-library remapping, atomic errors, source hashes and
  combined pickup/scenery compilation. Their fixtures are synthetic.
- `tools/validate-scenery-editor.mjs NEW_REPORT.json [INSTALLATION]` inventories
  all 18 LOW/HIGH pairs, proves no-edit byte identity, reparses changed scenes,
  exercises move/yaw/delete/duplicate where eligible, and runs a representative
  LEV2-to-LEV18 import through 120 reconstructed racing ticks.
- `tools/check-scenery-editor-viewer.mjs LAUNCHER NEW_DIRECTORY [INSTALLATION]`
  exercises real headless Edge controls, library preview/terrain placement,
  combined/legacy projects, bad donor hashes, export cancellation, independent
  ZIP CRC/IDX/compiled-resource comparisons, unchanged original archives, and
  a fresh three-car race. Twenty idle editing frames produce zero DOM mutations.
  Screenshots and the report are retained in the caller-selected new directory.

These are format, source-runtime and browser checks. Scenery export still needs
separate original-process LOW/HIGH acceptance, particularly cross-library
rendering/LOD behavior and car contacts at moved/new locations with clearance at
deleted/old locations. No running-game compatibility or full physics parity is
claimed. The viewer and export README identify this limitation explicitly.
The paused physics reconstruction has not been resumed.
