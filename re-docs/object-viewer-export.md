# Selected object export

`tools/object-viewer/export-object.mjs` exports the selected scene returned
by `loadObjectCollection(...).load(entry)`. It shares the browser-safe object
catalog with the viewer. No installed asset is embedded into the exporter
or the standalone HTML; assets come from the user's selected archive.

```js
const {filename, blob, manifest} = await buildObjectDownload(scene);
```

The optional second argument accepts `{encodeTexturePNG}`. Browsers use the
existing canvas PNG encoder by default; Node tests inject `src/png.mjs`'s
lossless encoder. `buildObjectManifest(scene)` exposes the same manifest
without encoding images or creating a download.

Each ZIP contains `object.obj`, `object.mtl`, `manifest.json`, `README.txt`
and only the referenced `texture-<page>.png` files. All names are flat,
matching the existing ZIP writer's deliberate path restrictions. Extract
them into one folder. The exporter changes only OBJ's material-library
reference to `object.mtl`; vertex coordinates, winding, UVs and material
names remain the decoded scene's. MTL `page_<id>` names agree with OBJ,
and diffuse/alpha maps both reference the corresponding RGBA PNG.

The manifest preserves the selected entry's model slot, material variant,
placement/vehicle-type associations and resource provenance, plus source
coordinate conventions and reconstruction limits. Metadata is copied as
JSON, and raw mesh/texture/archive buffers are excluded. Texture dimensions,
alpha presence and exact exported filenames are explicit. Download names
are sanitized and bounded. Unsupported selections, missing referenced
textures, inconsistent counts, malformed RGBA/metadata or failed PNG
encoding stop the export rather than silently replacing assets. A failed
encoding does not discard or mutate the loaded selection.

The selection can be one local model/material variant or a catalog-provided
assembled Rollcage car. Individual body, wheel and linked-part entries
retain their original separate exports. The assembled selection contains
the recovered body and four wheel meshes in a neutral pose; transforms are
baked by the shared assembly loader, not inferred by this exporter.
Special unsupported constructors, original
lighting/blending, animation and game behavior remain outside the exported
static OBJ/MTL. Importers may need material transparency enabled to display
PNG alpha. Camera, grid, lighting and display toggles do not filter export.
Batch export is not part of this API.

For assembled entries the manifest kind is
`selected-static-vehicle-assembly`, with `meshCount:5` and a deep JSON copy of
`scene.assembly`. Each part retains its source model index, body/wheel name,
positionQ16, rotationQ12 and scale. Part indices0..4 map directly to OBJ
groups `object_0`..`object_4`. The exporter validates this linkage and rejects
missing wheels or mismatched identity/transform metadata. Geometry is already
in the recovered vehicle-local pose; applying metadata transforms again
would double-transform it. The README explicitly explains this distinction.
Part transforms describe source X,Y,Z; OBJ positions already include both
those transforms and the catalog's X,-Y,-Z display conversion.
Runtime steering, spinning wheels and suspension animation are not exported.

Validation uses an independent stored-ZIP reader with standard CRC checks,
parses PNG chunks/CRCs and losslessly decodes the injected host encoder's
pixels, verifies every OBJ material resolves to MTL/PNG, and checks source,
variant, bounds and geometry metadata. Synthetic tests cover alpha0/128/255,
unused texture exclusion, deterministic output, safe filenames, malformed
selections and encoder failure/retry. Installed read-only checks exercise:

| Game/resource | Model/variant | Triangles | PNGs | ZIP bytes |
| --- | --- | ---: | ---: | ---: |
| Rollcage30 |0 / placement-uv-106 |42 |2 |32995 |
| Rollcage30 |39 / embedded-vehicle-body |109 |1 |34138 |
| Rollcage30 |38 / embedded-vehicle-wheel |48 |2 |25474 |
| Rollcage30 |40 / embedded-vehicle-linked |9 |2 |28489 |
| Stage II80 |5 / ordinary-primary |168 |2 |36531 |
| Firebugs14 |0 / ordinary-primary |70 |2 |64009 |

The complete-car regression additionally exports all seven assembled types
from Rollcage resource30:

| Vehicle type | Vertices | Triangles | OBJ part groups | PNGs | ZIP bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
|0 |164 |301 |5 |3 |73194 |
|1 |170 |306 |5 |3 |74158 |
|2 |166 |304 |5 |4 |77668 |
|3 |167 |303 |5 |3 |61363 |
|4 |176 |310 |5 |5 |88300 |
|5 |171 |306 |5 |5 |85144 |
|6 |170 |309 |5 |4 |78003 |

For every car, the test independently reapplies the recorded row-major Q12
matrix and Q16 position to the original standalone body/wheel model vertices,
then compares the five baked parts, aggregate OBJ vertices/triangles/bounds,
all UVs, source face/material identities and every exported PNG pixel. All
four wheel instances must exist; a body-only export cannot pass by reporting
five parts in metadata. Assembly JSON and per-part model/transform identities
must exactly match the selected catalog scene. Synthetic tests also reject
missing wheels, incorrect group/model/name linkage and invalid transforms.

All ten exporter tests pass with no skips on this installation; the
combined exporter/catalog set has14 passes. Installed ZIPs are constructed
and checked in memory; source archives remain read-only. These are decoded
asset/export checks, not original-game runtime evidence. No game launches
are involved.
