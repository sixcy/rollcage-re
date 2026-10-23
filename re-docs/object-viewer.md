# Standalone 3D Object Viewer

Open `docs/object-viewer.html` locally, or follow the link from the website
landing page or Track Viewer. Select the same IMG/IDX files or Firebugs disc
ZIP used by the Track Viewer. Processing stays in the browser; the generated
HTML embeds source code only, with no game assets or external requests.

Choose a track resource as the model library, then select or search a model.
Rollcage defaults to Complete cars with all seven native vehicle types. The
Show selector also exposes individual vehicle parts, scenery or all models.
Orbit/pan, fly-in, fit, turntable, texture filtering and lighting are
display controls. They do not change the exported mesh. Material variants are
kept separate. Unavailable entries explain missing material/object context and
cannot export a substitute mesh. Original model numbers remain visible.

The selected model downloads as a ZIP containing `object.obj`, `object.mtl`,
referenced `texture-*.png` images, `manifest.json` and Blender import guidance.
Coordinates use X,-Y,-Z, preserving source units and handedness. Individual
models retain local coordinates. Complete cars bake the actual neutral body
and four-wheel constructor/render transforms into five distinct OBJ groups.
The recorded part transforms are provenance, not additional transforms to
apply after import. Track placements are not included.

Rollcage supports assembled primary bodies/four wheels, ordinary scenery and
separately selected body, wheel and linked vehicle parts through the recovered
embedded-material reader. Native41caf0 and subsequent41d2b0 supply the actual
wheel positions and rotations. The original neutral template rotation is
preserved. Separate linked animated geometry, runtime effects and LODs remain
outside the static car assembly; their original draw transform is unresolved.
Stage II
and Firebugs support ordinary scenery; special constructors and vehicle
material setup remain unresolved. Firebugs retains palette/page identities and
cutout alpha; original PS1 blending, lighting and animation are not reproduced.
See [catalog evidence](object-catalog.md) and [export validation](object-viewer-export.md).

The current installed-data catalog check loads all 2,372 supported model/context
and assembly entries across 139 resources, including 280 assemblies and
duplicated models across tracks; these are not 2,372 unique assets. Another
2,023 entries retain explicit unsupported contexts. Exact Node/bundled-byte
comparisons cover 1,055 selected scenes. Actual headless Edge checks all three games, representative models,
camera/search/focus, desktop/mobile layouts, unavailable-model gating and real
downloads with decoded PNG pixel comparison. This is static reconstruction
and browser consistency evidence, not original-process visual equivalence.
The final [assembled-car browser report](../analysis/object-viewer-assembled-browser-20261023/report.json)
records all three games with no page errors or external HTTP requests.
All seven installed car exports independently verify the five baked part
meshes, aggregate bounds, UVs/materials, PNG pixels and assembly metadata.
The earlier individual-model/browser reports remain retained.

Build with `node tools/build-object-viewer.mjs`. The browser checker
`tools/check-object-viewer.mjs` uses an already installed Playwright launcher
and local Edge; it downloads no dependencies and launches no game. Reports
use new output directories. The initial browser harness timeout is retained
separately; its selection expectation was corrected without changing model
decoding.
