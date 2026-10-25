# Lossless static-model texture imports

Updated 2026-10-25. This extends ordinary static-model imports between Rollcage libraries. Animated, scripted, destructible and unknown packed material imports retain their earlier restrictions. Installed archives remain read-only; exports append changed resources to a copy.

## Texture page addressing

The old importer treated the material word's low six bits as the entire texture ID. The original game has a 512-entry logical texture map at `0x6e1620`: initializer `407ee0` and teardown `408270` iterate `0x200` entries. Native producers already reconstructed in `race-textures.mjs`, `track-backdrop-construction.mjs` and `race-hud-fonts.mjs` pack the higher three ID bits into word bits 8–10. The shared codec now uses:

```js
id = (word & 0x3f) | ((word >>> 2) & 0x1c0);
word = (previousWord & 0xf8c0) | (id & 0x3f) | ((id & 0x1c0) << 2);
```

Thus ID64 is `0x100`, not zero, and ID73 is `0x109`. Bits6/7 and11–15 remain packet flags. Static imports accept the observed ordinary bit6 marker and reject unsupported packed modes; the encoder itself preserves every flag. ID63 remains reserved and is never allocated or reused.

`src/texture-page-word.mjs` owns the codec. Terrain, ordinary placed meshes and material previews use the same effective ID. Stage II's scene adapter explicitly retains its previous six-bit interpretation; this work does not claim the Rollcage native encoding for Stage II.

Supporting retained evidence:

- `analysis/scene/results/046-pseudo-texture-bind.json`, evidence `ev_acf197598736bc67d1ab1dcaf12cb5b604cfe8d2d4f1374705b01c8199d381bc`.
- `analysis/scene/results/049-pseudo-texture-page-bind.json`, evidence `ev_5a721dfd68dde1fa906707c97f26273dcdf752ef9f693cf6b061889f10713bdf`.
- Native producer arithmetic retained alongside addresses in the race/backdrop/HUD source modules.

The retained executable matches SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. REA reported no active session and unavailable local Ghidra configuration during this delivery; the analysis reuses retained evidence rather than claiming a new decompilation.

## Allocation and runtime headroom

The importer reuses an exact existing texture only when width, height, descriptor mode, transparency, indexed pixels and all1024 palette bytes match. Otherwise it fills a compatible empty descriptor or appends a new descriptor, palette and indexed image. Existing active textures are neither overwritten nor rescaled. Original descriptor bytes and resource data remain prefixes; no unused nonempty texture is reclaimed speculatively.

The 512 slots also hold textures created at startup. The allocation guard reserves28 runtime IDs, derived from original installed assets and native producers:

| Producer | Reserved IDs | Evidence |
| --- | ---: | --- |
| Clouds | 2 | `4130c0` |
| Current rain/snow image | 1 | `401b70` / `401be0` |
| HUD fonts | 11 | Fixed112-glyph passes,46×50 and16×100 cells, shelf packing in `439150` / `44fbc0`; includes the shared partial page |
| Timewarp image | 1 | `4900a0` / `409bd0` startup image producers |
| Procedural target | 1 | Same startup producers |
| Icesheet tiles | 12 | Original1024×640 image tiled into256-square pieces |

The native producers advance shared highest-ID counter `0x91ce98`. `analysis/race-installed-textures-probe.json` retains the external image dimensions and hashes. These are original-asset bounds: larger user-replaced external bitmaps require another budget. The guard additionally accounts for skipping reserved ID63 when the authored prefix ends before it. An authored descriptor count484 fits;485 does not. This is a guard derived for the original startup assets, not evidence that every track with484 textures has been run.

Transparent-black textures use a single contiguous interval in BTP header bytes32/33. New transparent textures may establish an empty interval or extend an interval that reaches the current descriptor end. A non-tail existing interval produces `transparent-range`; the importer does not silently alter existing transparency or reindex all track references. Native map overflow produces `texture-capacity`. Both fail atomically.

`inspectSceneryImport` returns per-quality compatibility, allocation actions/IDs, counts, headroom and a failure code/reason without returning resource bytes. The Model Library caches these checks per editor revision and shows both LOW/HIGH results. The placeable-only filter uses the same checks; position-dependent collision cell limits are still checked when placing on terrain.

## Validation and limits

- `tests/texture-page-word.test.mjs`: all512 IDs with preserved flags, reserved63 crossing, exact texture reuse/allocation, transparent interval restrictions and capacity failure atomicity. Existing scenery/assembly/scripted regression tests also pass.
- `analysis/static-model-texture-matrix-20261025-v6.json`: no-edit byte identity for all40 original quality/level resources; every primary terrain and ordinary placed primary-model face resolves to an existing nonempty texture. The HIGH corpus already uses effective IDs above63, up to76.
- The same report checks285 eligible donor/destination level pairs,196 compatible in both qualities. This samples one deterministic ordinary donor per eligible library; it is asset preflight, not exhaustive placement or native race proof.
- LEV3/model19, placement/template42, now imports into LEV1 losslessly: LOW appends ID44, descriptor count44→45; HIGH appends IDs72/73, descriptor count72→74. Every original decoded image remains unchanged and donor images compare byte-for-byte after RGBA decoding. Both compiled qualities complete90 reconstructed ticks with three cars.
- `analysis/static-import-browser-20261025-v6/report.json`: actual headless Edge controls preview and place that model into HIGH/LEV1, preserve donor fingerprints through project reload, reject a changed donor hash, export a real ZIP independently checked against source compilation, and start Test changes with three cars. Original IMG prefix, source archives and original decoded textures remain unchanged. Twenty idle frames have zero DOM mutations and the Camera menu remains usable.

Native fixtures are prepared by `tools/prepare-native-static-import-validation.mjs` in separate copied installations. They freeze observer source, policy and expected byte spans before capture. The bounded observer reads the full logical map, imported material words, live BTP count, texture handles, and per-ID texel lookup pointers at constructor completion and the first race tick. This adds no texture or physics memory writes. Existing declared startup instrumentation selects the staged resource and reaches the bounded observation points.

`tools/check-native-static-import-validation.mjs` independently verifies the captured map and texel values, invokes the existing constructor/collision/source-file audit, and preserves its report. Both original-process captures passed: `analysis/native-static-import-low-acceptance-20261025-v6.json` verifies logical ID44; `analysis/native-static-import-high-acceptance-20261025-v6.json` verifies logical IDs72/73 and words329/265/264. Each checks constructor and first tick, expected half-texel lookup values, imported material words and unchanged171 source files. These checks establish native import initialization and addressability, not pixel-perfect GPU rendering or complete-race fidelity.

Reproduce source/browser validation:

```powershell
node --test tests/texture-page-word.test.mjs tests/scenery-editor.test.mjs tests/scenery-assemblies.test.mjs tests/scripted-scenery-editor.test.mjs
node tools/validate-static-model-textures.mjs NEW_REPORT.json analysis/pickup-editor-native-baseline-20261024/installation
node tools/build-track-viewer.mjs
node tools/check-static-import-editor-viewer.mjs INSTALLED_REA_PACKAGE_JSON NEW_BROWSER_DIRECTORY analysis/pickup-editor-native-baseline-20261024/installation
```

Native capture wrappers launch the game and require the parent's coordinated desktop capture workflow; fixture preparation and policy validation alone do not launch it.

Final integration rechecks are `analysis/static-model-texture-matrix-20261025-v7.json` and `analysis/static-import-browser-20261025-v7/report.json`. Combined all40 v6 projects additionally exercise imports after new-road spatial relocation. Material-table extent must follow actual indexed UV consumers rather than the relocated spatial pointer at`+0xac`; UV alignment padding is not an extra material key. The synthetic regression and `analysis/editor-v6-combined-20261025-v1.json` cover that interaction while keeping genuine material-key overflow guarded.
