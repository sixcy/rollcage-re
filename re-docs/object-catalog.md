# Object, vehicle-part and neutral car catalog

`src/object-catalog.mjs` provides the same lazy model-selection boundary in Node
and the standalone browser for Rollcage, Rollcage Stage II and Firebugs. It uses
the existing recovered geometry/material/texture readers. No installed assets
are embedded in the source or generated HTML.

## Shared API

`listObjectResources(archive, game, identifiedTracks)` returns frozen descriptors
with string `id`, label and original resource indices. `game` accepts an existing
game descriptor or its ID. Supplying already identified tracks avoids rescanning
the Firebugs disc. Resource selection is independent of racing paths, so the
object catalog also includes Rollcage LEV16/17.

`loadObjectCollection(archive, game, resource)` reads only the selected pair or
triplet and returns `{entries, load, counts, source, limits}`. PC resources use
their actual GFXM/BTP pair; Firebugs uses GFXM/VRAM/BTX. The synchronous
`decodeObjectCollection(geometry, texture, {game,resource,btxData})` is the shared
byte-level boundary. Input buffers are copied before lazy selection.

Each entry has a stable string ID derived from game, resource, model index and
material context, plus label, model offset, vertex/face counts, kind, status,
material variant, representative placement indices and native vehicle-type
indices where applicable. Unsupported entries retain an explicit reason.
The catalog does not infer missing textures from another model or resource.

`collection.load(entryOrId)` accepts its own entry object or stable ID. It returns
`obj`, `groups`, `textures`, `bounds`, vertex/triangle/quad counts and model-local
`meshes`, plus JSON-only `entry/source/limits` metadata. This is compatible with
the existing `Renderer.setScene` and the object exporter. Only selected material
pages are decoded, with a per-collection texture cache. GPU groups use the same
eight-float position/UV/normal layout as the Track Viewer. Coordinates are
converted to X,-Y,-Z for display/OBJ; original model-local coordinates and
source units remain available in `meshes`.

## Supported contexts

Rollcage ordinary type-zero placements with flag400 provide primary model
materials through the actual per-instance UV start. Distinct UV starts remain
distinct entries; identical model/context pairs collect their placement indices.
The isolated model retains its local geometry rather than its track placement.

Rollcage vehicle parts use the same embedded packet reader as
`solo-car-mesh.mjs`. The original41dbb0 body selectors at5eadc4 and linked-model
selectors at5ead50 come from the existing target-bound construction table;
ordinary wheel geometry comes from resource metadata+16. All seven native
types are inventoried. Body, wheel and linked meshes remain separate entries. A linked model
shows its authored primary geometry, without running48e310 deformation.

Each Rollcage resource also lists seven `vehicle-assembled` entries first,
with stable IDs `<resourceId>:car:<zero-based-type>`. Their friendly labels are
"Complete car / type1..7"; the precise supported scope is the primary body and
four wheels. `src/object-car-assembly.mjs` builds these through the actual
recovered construction/render functions, independently of routes and race
sessions. All40 resources, including LOW/HIGH LEV16/17, have these entries.

`createObjectCarAssemblyRuntime(geometryBytes,type)` privately copies and
relocates the real GFXM, registers the actual spatial map, runs428100/474160
pool constructors, selects body/wheel models with41dbb0's authored selectors,
then executes4741c0,4798d0,428270,488220 and41caf0. The only adapter is bounded
CRT allocation into cleared private memory. No physics, geometry or renderer
service result is fabricated. The original mutable5eab18 template is reset
from retained executable bytes for each assembly. Its neutral quaternion is
`[0,0,65536,0]`, yielding `diag(-4096,4096,-4096)` in the original convention;
the preview retains that actual orientation rather than replacing it with an
identity matrix. No race spawn/controller/audio/renderer bootstrap is run.

Crucially,41caf0 prepares each wheel **before** installing its authored offsets.
The helper subsequently executes actual41d2b0 to obtain the intended neutral
pose. Positions come from authored5eac40 values transformed through the real
body matrix; wheel matrices come from original432680 phase-table arithmetic,
433400 and4334b0. It does not mirror wheels or guess a scale. See
[wheel constructor evidence](vehicle-wheel-construction.md) and
[render arithmetic evidence](wheel-render-state.md). Constructor evidence1531
is `ev_33c24b3dcc5ff1de35a891abf1fef5135b47f7d5a9c2e9c4f5d071a699c81ea0`;
original offset evidence2501 is
`ev_b93bc30a710f52b9d1f17ef0f83fb192ef7e2acbfb833c385122feee37d2b54b`.

`buildObjectCarAssembly(bytes,type)` returns `{meshes,assembly}`. Five meshes
have distinct `index:0..4`, original `modelIndex`, and `part:'body'|'wheel-1'..`.
`assembly.parts` stores the same identities plus `positionQ16`, row-major
`rotationQ12`, and `scale:1`. Source vertices are baked as
`sum(rotationQ12[row*3+lane]*vertex[lane])/4096+positionQ16[row]/65536`.
This neutral pose has only exact0/±4096 matrix entries. Existing
`buildSceneExport` applies X,-Y,-Z, generates the five distinct `object_0..4`
OBJ groups and transforms display normals from the baked triangles. Materials
and decoded textures remain the genuine embedded body/wheel packets. Catalog
loads include this JSON-only `assembly` metadata and retain the existing scene
schema. `counts.assembledCars` counts these separately from `vehicleParts`.

**Linked animation remains unresolved in assembled scenes.** The original
41dbb0 unconditionally constructs it at41de73 via48dc60, and47e240 also creates
it for the six selection presentation cars. Its48dd10 authored vertex
translation,48dda0 selected-vertex state,48e670 material initialization and
48e310 per-frame changes are recovered, but the retained evidence does not
include its original draw/attachment transform. It cannot be classified as
optional or safely attached by guessing a sixth pose. The separate linked-model
entry remains available, and `assembly.scope` explicitly excludes it, runtime
animation and LODs. The friendly complete-car label means the five established
static render parts, not an exhaustive recreation of the original car display.

Stage II uses the existing model-owned primary material stream and its supported
inline/ordinary paths, only when an ordinary placement establishes the context.
Firebugs likewise uses its recovered primary key stream, CLUT/TPAGE addressing
and retained VRAM decode for ordinary scenery. No Stage II/Firebugs vehicle or
special-constructor texture context is guessed.

Models without one of these contexts stay visible in the inventory as
unsupported. Special placements are counted; their constructor behavior,
secondary/LOD geometry, overlays, runtime material/UV changes and original
lighting remain outside this static selection. Firebugs semitransparency is
represented with the existing cutout-alpha approximation. Flat display normals
are reconstructed from the selected triangle geometry.

## Validation

`node --test tests/object-catalog.test.mjs` passes four focused tests covering
all three material/texture families, local coordinates and face winding,
Rollcage material variants and vehicle parts, unsupported special contexts,
missing material pages, foreign-entry/resource rejection, lazy resource reads,
source-byte preservation and bundled ByteBuffer equality.

`node --test tests/object-car-assembly.test.mjs` passes four additional tests:
invalid inputs; all seven types and both LOW/HIGH LEV16/17 (35 assemblies) with
full bundled helper equality; seven installed model states through actual
41caf0 then41d2b0 matching retained x86 across every mapped byte above10000h
(the declared stack is below it); and all seven assembled model identities /
wheel transforms compared against actual source `createSession` construction
snapshots at their native spawn poses. This last test copies the actual body
pose into the isolated assembly and runs the genuine wheel render parent,
rather than assuming a spawn orientation or position. No game is launched.

The installed checker is:

```
node tools/check-object-catalog.mjs <new-report.json> <Firebugs-disc.zip>
```

It refuses an existing report filename, reads installed PC archives and the
provided disc read-only, loads every supported object, checks finite bounds,
GPU-buffer sizes and referenced texture pages, compares every catalog against
the bundled browser implementation, and compares selected complete scenes
including decoded texture hashes. It launches no game or browser process.

[Installed report](../analysis/object-catalog-installed-v2-20261023.json):

| Game | Resources | Models | Supported entries/scenes | Unsupported entries | Bundled scenes |
| --- | ---: | ---: | ---: | ---: | ---: |
|Rollcage|40|1678|1218|460|640|
|Rollcage Stage II|66|1767|495|1272|111|
|Firebugs|33|670|379|291|64|

All2092 supported scenes load; all815 selected complete bundled scenes match.
Rollcage contributes600 vehicle-part entries,15 contexts in each resource.
These totals count per-resource/material identities, not unique globally
deduplicated game objects. The report contains hashes/counts, not mesh or pixel
payloads. Actual browser UI/WebGL and download checks are separate validation.

The subsequent [assembled installed report](../analysis/object-catalog-assembled-installed-20261023.json)
checks all139 resources, all2372 supported scenes and1055 selected bundled
scenes, including every one of280 assembled Rollcage cars (seven per resource)
with five distinct GPU part identities. Rollcage now has1498 supported entries,
600 individual vehicle-part entries and280 assemblies;460 unsupported entries
are retained. Stage II and Firebugs totals above are unchanged. Full assembly
metadata, OBJ/groups/bounds and decoded texture hashes match the browser bundle.
This supersedes the earlier counts for the current catalog without replacing
the earlier report. Separate exporter tests independently verify all seven
first-resource assemblies against original individual vertices, face UVs and
all PNG pixels; actual browser/WebGL checks are owned by the viewer integration.

The first checker report is preserved as
`analysis/object-catalog-installed-20261023.json`. It records rejection caused
by applying the game identification sentinel flags to every resource. Those
flags legitimately vary within both PC games, so the catalog now relies on the
identified game/resource relationship and the actual format readers. The
corrected report uses a fresh filename rather than overwriting that evidence.

This is source/asset-decoder consistency, not original-process rendering
equivalence. Existing format evidence remains in the geometry, model-material,
Stage II and Firebugs reconstruction notes; no new native game was executed.
