# Local Rollcage tools

Open [Track Viewer](track-viewer.html) or [Object Viewer](object-viewer.html). Select your own IMG/IDX pair, or the supported Firebugs disc ZIP. Data stays local; no assets are bundled or uploaded.

The viewer supports Rollcage LOW/HIGH, 66 Stage II environments and 33 Firebugs environments. Rollcage Racing test has 1–6 Expert cars (default 3), weapons/pickups and selected-car telemetry. It remains super experimental; LEV16/17 racing is unverified. Editing includes terrain, surfaces, pickups, existing race layout and coherent scenery/effect transforms on all 20 levels, with operation-specific restrictions. Projects use version 4 and keep older versions readable.

[What changed](changelog/index.html) · [Research status](../re-docs/reconstruction-status.md) · [Editor validation](../re-docs/editor-validation-matrix.md) · [Terrain editor](../re-docs/terrain-editor.md) · [Scenery editor](../re-docs/scenery-editor.md)

Build with `node tools/build-track-viewer.mjs` and `node tools/build-object-viewer.mjs`. The docs directory is the GitHub Pages root; these pages also work locally.
