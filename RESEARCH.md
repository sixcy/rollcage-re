# Rollcage Redux reconstruction

Target: `C:\Program Files (x86)\Psygnosis\Rollcage\Direct3D\Rollcage Redux.exe`, version 1.3.8.0.
SHA-256: `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

The goal is a source reconstruction. Recovered pseudocode and inferred names are analysis inputs, not original source. Begin with the archive loader and decompressor, then build asset readers and map the game systems. Each reconstructed component needs checks against the installed artifacts.

## Installation

The workspace shortcut resolves to `C:\Program Files (x86)\Psygnosis\Rollcage`.
The installation also contains `Rollcage Player.exe`; do not substitute it for the selected Redux build. Its resource inventory is retained separately in `analysis/player-pe-resources.evidence.json`.

Ghidra 12.1.4 is installed at `C:\Users\Cyril\Documents\ghidra_12.1.4_PUBLIC`.
The full JDK is at `C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot`.
REA 6.7.0 doctor passed with these supplied as process-local `GHIDRA_INSTALL_DIR` and `JAVA_HOME` outside the Codex shell sandbox. The connected MCP server does not currently inherit these variables. No persistent client configuration has been changed. Use the public REA CLI with these variables for native analysis until the server is reconfigured/restarted.

## Archive observations

Run `tools/Inspect-RollcageArchive.ps1` to regenerate `analysis/archive-summary.json` and `analysis/archive-entries.csv`. This is direct static inspection using PowerShell, separate from REA Evidence. The summary records hashes for both archives and executables.

`IDXData/Rollcage.idx` is 5,504 bytes and contains 344 records of 16 bytes, with little-endian 32-bit fields:

| Record offset | Observation |
| --- | --- |
| +0 | Offset into `Rollcage.img`. |
| +4 | Stored byte count; every offset plus this count equals the next entry offset. |
| +8 | Decoded byte count, confirmed by the loader and complete decode validation. |
| +12 | Signed 16-bit extra allocation count. Values 0, 3, 5 and 7 occur. |
| +14 | Signed 16-bit next-entry link; zero terminates the chain. All installed links are zero. |

All records together cover the 81,752,396-byte image exactly with no gaps or overlaps. Their decoded sizes sum to 276,444,484 bytes. `analysis/archive-entries.csv` and `archive-summary.json` preserve the initial inspection names `IndexField8` and `Flags`; the executable resolves their meaning as described above.

343 entries start with `GT20`. In every such entry, header +4 matches index +8, header +8 matches the index's packed +12 word, and header +12 is zero. The decoder reads its first control word at `input + 16 + header[12]`. The field at +12 therefore specifies bytes to skip before the control stream. The decompressor itself does not consult header +8.

Extra allocation counts: 3 => 310 entries; 7 => 29; 5 => 4; 0 => 1. The original loader allocates decoded size plus this signed 16-bit count plus 7, and stages compressed input near the end of the allocation on a 4-byte boundary. The reconstructed reader uses separate buffers.

Entry 18 (zero-based), image offset 2,526,432, is the sole extra-allocation-0 entry. Stored and decoded lengths both equal 1,447,790. It begins `10/29/98 V3.1   Magic: ba402391 PC Sound Effect File` and contains names including `SFX_ENGINE1`, `SFX_TURBO`, `SFX_SKID_TARMAC`, and `SFX_MISSILE_LAUNCH`. This identifies a sound-bank candidate; its record layout and sample encoding have not been decoded.

The four extra-allocation-5 entries are 19, 20, 196 and 284. All decode to structurally valid BMP files.

## Recovered code

Names below are inferred descriptive names; addresses are Ghidra observations for this exact build.

| Address | Observed behavior | Retained result |
| --- | --- | --- |
| `0x440690` | Startup path resolution; calls archive initialization with `0x158` (344) entries. | `analysis/results/006-analyze-img-loader.json` |
| `0x401000` | Builds IMG/IDX filenames, allocates and reads the index, and opens the image. | `analysis/results/007-pseudo-archive-init.json` |
| `0x4010e0` | Opens/closes the image stream and resets its tracked position on open. | `analysis/results/008-pseudo-archive-next.json` |
| `0x401140` | Returns index base plus signed resource ID times 16. | `analysis/results/011-pseudo-index-reader.json` |
| `0x401160` | Selects the linked entry nearest the tracked file position; reads and optionally decompresses it. | `analysis/results/013-pseudo-resource-load.json` |
| `0x401380` | GT20 decoder with literal and overlapping back-reference tokens. | `analysis/results/014-pseudo-decompress-wrapper.json` |
| `0x439090` | Loads resource 8 and preprocesses its control characters and `~~` string terminators. | `analysis/results/016-pseudo-resource-consumer.json` |

`0x401160` has observed callers at `0x42b800`, `0x439090`, `0x43bd70`, `0x447ba0`, `0x447ca0`, `0x44c2b0`, and `0x484b80` (`analysis/results/015-resource-load-callers.json`). These are the next useful seeds for resource-to-subsystem mapping.

## Working reconstruction and validation

`src/gt20.mjs` reconstructs the codec. `src/archive.mjs` reconstructs index decoding, duplicate-chain selection, stored reads and optional decompression. Both add bounds checks. They are JavaScript reference implementations; there is no rebuilt game executable yet.

The decoder reads interleaved little-endian 32-bit control words, least-significant bit first. A zero bit selects a literal; `10` selects a short-distance match with two more length bits; `11` selects a packed 16-bit match with optional extended distance/length or an end marker. Overlapping matches copy forward byte by byte. A control-word refill can occur between a short-match offset and its length bits, so data/control ordering matters.

`node tools/validate-archive.mjs` decodes all 344 resources, including the uncompressed sound bank. All 343 compressed entries consume their entire stored ranges, stop at the GT20 end marker, and produce exactly their declared decoded sizes. The report is `analysis/decoded-archive.json` and includes per-resource decoded hashes and initial bytes.

Decoded content: 84 `GFXM` resources, 84 `BTP ` resources, 174 BMP files, one multilingual string file, and one sound bank. All 174 BMP files pass independent file-size, header, dimensions, encoding and pixel-range checks. Subsequent work recovered the BTP PC texture tables and GFXM primary models as described below. Sound records remain undecoded.

This validation checks the installed archive and decoded BMP structures. It does not establish byte-for-byte equivalence against execution of the original decoder, nor reconstruct rendering, physics, input, audio playback or race logic.

## Asset format milestone

The investigation under `analysis/asset-formats` recovered 340 resource names from a table at `0x5eb600` (file offset 2,008,576), confirmed against a complete Ghidra memory read. `src/resource-names.mjs` reproduces ASCII filename matching, including underscore/path aliases. `analysis/resource-catalog.json` combines those names with the archive inventory.

`src/btp.mjs` reads every BTP PC texture table and converts indexed pixels to RGBA. `analysis/btp-catalog.json` inventories 3,130 slots, of which 2,096 are active, across 84 files. The remaining slots have zero dimensions and are skipped by the native uploader. Texture/palette bounds pass throughout. PNG export produces readable track surfaces, sky panels, HUD elements and scenery; previews are `analysis/level1-textures.png` and `analysis/fe-textures.png`.

`src/gfxm.mjs` reads primary MODL/MODC models from every GFXM file. `analysis/gfxm-catalog.json` records 3,460 primary model records, 212,906 vertices, 156,238 triangles and 92,278 quads, with all array and index checks passing. Records may repeat across resource packs. Wireframe previews show recognizable cars and front-end objects. A car model is exported as `analysis/car-model-6.obj`.

The subsequent placement investigation confirms primary-model draw corner order and recovers per-instance materials. Standalone primary models still need instance context for UV selection, and auxiliary variants remain outside the exporter. Sector grids use a separate rendering path. Detailed layouts and evidence references are in `docs/asset-formats.md`.

## Textured track milestone

The investigation under `analysis/scene` traced sector packet updates at `0x48d130`, grid lighting at `0x48f2d0` and coordinate submission at `0x489e40`. Together these establish primary grid dimensions, signed vertex coordinates, the UV-record lookup, corner rotation controlled by a vertex flag, and both triangle orders. `0x407ee0` builds texel-center coordinate tables. This is static evidence from the selected executable; the game was not executed.

`src/scene.mjs` and `src/scene-export.mjs` reconstruct the static finest-grid base pass. `analysis/scene-catalog.json` validates bounded arrays and UV records in all 84 GFXM files: 1,496 sectors, 1,155,548 grid vertices and 1,067,936 quads. Forty scene packs also have every referenced base texture page available in the paired PC BTP table. Forty HIGH packs have geometry but need their other image representation decoded. Four front-end packs have no sector grids. Counts include repeated content across packs.

`tools/export-scene.mjs` exports OBJ/MTL, source-color PNGs, a manifest and a self-contained WebGL viewer. `analysis/level1-scene` contains resource 30 (`LOW/LEV1.BLP`) with BTP resource 31: 16 sectors, 14,883 vertices and 27,840 triangles using three texture pages. Their stored coordinates already join into a coherent circuit. Export changes Y's sign for a Y-up presentation and retains source units. This includes static terrain/track grids; placed models, animation, overlays, original lighting, visibility/LOD and simulation remain outside this exporter.

All 18 focused tests pass. `analysis/level1-scene/browser-check.json` records a successful headless Edge check: all three textures loaded, sector selection/reset and display controls worked, orbit/zoom changed the rendered image, no script/WebGL errors occurred and no HTTP requests were made. `preview.png` was visually inspected and shows connected roads, ramps and embankments with aligned base textures. This validates our viewer, not rendering equivalence to the original game. Complete native Evidence and the provider-neutral snapshot are retained in `analysis/scene/evidence-bundle.json` and `redux.snapshot.json`.

## Placed model milestone

The paired BTP resources also hold 56-byte placement records. Loader assembly confirms byte `+3` selects a GFXM model, signed shorts at `+8/+10/+12` supply position, and `+14/+16/+18` supply rotation inputs. Ordinary type-zero objects use UV-index starts at `+40/+42/+44` for their primary and auxiliary variants. The renderer at `0x46c7c0` follows those indices into GFXM material descriptors and places source face corners in order 1,3,2,4. `0x46d0e0` uses the same topology/material path with different lighting. This resolves the previous model winding uncertainty.

`src/fixed-math.mjs` reconstructs the loader's fixed-point quaternion initialization and Q12 matrix calculation. The 202-entry cosine table was recovered at `0x575228` and verified byte-for-byte between Ghidra memory and the selected executable. `src/placements.mjs`, `src/model-materials.mjs` and `src/placed-meshes.mjs` reconstruct ordinary objects at their loader-initialized poses. Animated UV descriptors resolve to their serialized frame, including the native redirect and corner permutations; animation stepping is separate.

`analysis/placement-catalog.json` validates all 84 packs: 7,692 placement records, including 5,172 type-zero model instances, 100 type-2 records, 2,160 type-13 records and 260 type-24 records. The ordinary objects contribute 142,744 faces / 276,424 triangles; 1,884 faces reference animated UV descriptors. Every referenced array, model, material and animation record is bounded. All ordinary placements in this corpus have at most one nonzero rotation input. Forty HIGH packs still lack PC texture pages, as already observed for terrain. Counts include repeated content across packs.

`analysis/level1-objects` combines the 16 level-one sectors with 114 ordinary objects: 18,050 vertices, 32,851 triangles and 19 texture pages. A browser check confirms all images load and controls work without script/WebGL errors or HTTP requests. Visual inspection shows textured buildings, signs and surrounding rocks alongside the track. Five type-2 and five type-24 records in this level are inventoried but not instantiated by the exporter. Runtime behavior, lighting and animation equivalence remain unverified. The focused test suite has 22 passing tests. Added native evidence is exported to `analysis/scene/instances-evidence-bundle.json`; complete individual replies remain under `analysis/scene/results`.

## Shared physics arithmetic milestone

`src/fixed-integer.mjs` and `src/body-physics.mjs` reconstruct the first shared body routines: initial configuration, accumulated increments, linear velocity and its vector speed limit, world inverse inertia, angular velocity, quaternion derivative, normalization and fractional-frame advancement. Assembly establishes a common body at object `+0x34`. The recovered arithmetic keeps signed 32-bit wrapping, 64-bit intermediate products and the original lookup quantization. These routines are shared by vehicles and other physical objects; they do not constitute the wheel/contact solver or a complete vehicle simulation.

The 192-entry root lookup at `0x5eb290` is verified against both Ghidra memory and original PE bytes. `analysis/body-template.json` retains the verified 128-byte initializer at `0x5eab18`; vehicle-constructor assembly passes that address after updating its spawn position. The template has mass/inverse mass 65,536 and principal inverse inertia `[21671,17762,31930]`. Later vehicle setup can alter the initialized state.

All 30 focused tests pass. `analysis/body-physics-probe.json` records 1,000 stationary steps without drift, 120 constant-velocity half-frame steps matching analytic displacement, and 1,000 angular-motion quarter-frame steps with finite normalized orientation. Those sequences use declared synthetic inputs and the recovered immutable template, not a captured original-game trace. Static evidence, state layouts, supported arithmetic domains and unresolved stages are documented in `docs/physics.md`. The added evidence ledger is `analysis/scene/physics-evidence-bundle.json`.

The constructor's callback at `0x41e080` is a collision-handler candidate rather than the expected main update. Ghidra decodes instructions there but reports no containing function; that boundary remains unresolved. Separately, `0x4749e0` exposes frame orchestration and collision event processing, `0x479d20` advances a body fraction, and `0x47ab30` orchestrates wheel/drive force stages. These provide the next simulation seeds without guessing a new physics model.

## Wheel arithmetic milestone

`src/wheel-physics.mjs` reconstructs descriptor/contact/state decoding, native short-coordinate probe transforms, supplied-hit contact conversion, suspension impulses/cache writes, grip correction and wheel spin. The suspension stage retains the native coefficient sequence and unilateral clamp; it contributes to linear/angular momentum. Contact selection remains supplied at the module boundary because the native terrain/model query, broad phase and side selection have not yet been ported. Skid sound/particle bookkeeping is also omitted. See `docs/wheels.md` for scales, field layouts and evidence.

All 36 focused tests pass. `tools/verify-suspension-instructions.mjs` independently interprets the retained 375 instructions of `0x488370`, with its two pure callees modeled separately, and compares the complete 1,792-byte vehicle region against the structured port for 2,000 deterministic four-wheel fixtures. All 8,000 wheel slots match, including rotated directions and fractional inputs. This is stronger arithmetic evidence than fixture tests alone, but not original-process execution or whole-game equivalence. The report is `analysis/suspension-instruction-check.json`; new native evidence is exported to `analysis/scene/wheel-evidence-bundle.json`.

The remaining contact boundary now has clear seeds: `0x4287f0` builds candidate lists, `0x4286e0` selects spatial nodes, `0x428aa0` contributes terrain candidates, `0x424ff0` selects terrain hits and `0x423ab0` checks placed models. The 12-byte records initially probed at GFXM `+0x68` are spatial/runtime nodes, not ordinary object placements.

## Collision-data milestone

`src/spatial-index.mjs` reconstructs the 256-row x/z map, one-based map indices, height continuations and the native outside-search order. `src/collision-grid.mjs` decodes zone-region groups, packed normal tables, active planar/split cells and border references. `docs/collision-data.md` records exact fields, native anchors and remaining query stages.

All 84 GFXM files validate: 80 level packs have spatial data, totaling 96,348 nodes and 63,400 mapped x/z cells. Every one of the 1,155,548 terrain vertices resolves through the bounded lookup, including 151,196 outside fallbacks and 373,508 height-layer advances. Collision references validate 447,564 packed normals, 261,380 region records, 817,040 covered cells, 912,488 cell forms and 57,192 nonempty covered border references. Counts include repeated content across packs. Reports are `analysis/spatial-index-catalog.json` and `analysis/collision-grid-catalog.json`.

Collision regions exclude some rendered cells. Their normal fields can contain unused out-of-table values; 25,779 such codes occur outside coverage. The parser retains them without interpreting or masking them into active planes. This was checked against the native rectangle traversal rather than treating all rendering triangles as collision geometry. All 45 focused tests pass; new evidence is exported to `analysis/scene/collision-data-evidence-bundle.json`.

The wheel query is still supplied externally at this checkpoint. The next step is the native candidate builder's distance/plane screening followed by the terrain hit selector, preserving polygon types, adjacency and overlap behavior. Placed-model hits and complete event response remain open.

## Terrain wheel-query milestone

`src/terrain-candidates.mjs` ports terrain candidate screening and `src/terrain-query.mjs` ports `0x424ff0`'s zero-radius path used by wheel probes. Candidate screening retains midpoint/radius calculation, region order, quantized distances, normal caching, nearest-corner rules, previous-call duplicates, border append order and the 64-entry cap. Downstream inspection corrected the right-wall candidate base to its top vertex; the left wall uses the bottom vertex.

The ray query preserves wrapped fixed-point division, quantized hit points, polygon types, plane reuse, overlap/tolerance flags, candidate order and adjacent-cell/visited-edge traversal. `tools/verify-terrain-query-instructions.mjs` matches all 4,000 synthetic fixtures against bounded interpretation of 974 retained x86 instructions and original switch-table bytes, including both wall types and all three hit classifications. It compares the returned fraction and all 36 result bytes; no original process runs. Report: `analysis/terrain-ray-instruction-check.json`.

`tools/probe-terrain-wheel-contacts.mjs` connects candidate generation, wheel rays, contact conversion and suspension on all 80 level packs using explicit synthetic inputs. Its 3,636 positions yield 14,544 queries, with 364 sampled retained-instruction comparisons all matching. All 57 focused tests pass. Details and limitations are in `docs/collision-data.md`; Evidence is retained in `analysis/scene/terrain-ray-evidence-bundle.json`. Sphere/edge contacts, placed-model hits, complete wheel-side selection, drive capacity and event response remain incomplete.

The wheel-side wrapper is also ported as `prepareWheelContactSides`: remembered side first, opposite-side retry only after all four wheels miss, original flag/cache behavior and caller-supplied batch hit selection. Four more focused tests bring the suite to 61. Installed-data probes cover 364 synthetic bodies / 1,928 additional rays, including 79 successful retries. This wrapper has fixture/corpus checks, rather than the independent instruction comparisons used for the ray query and suspension. New evidence is exported to `analysis/scene/wheel-sides-evidence-bundle.json`; the remaining combined terrain/model selector and native surface metadata are still open.

## Model collision data and surface milestone

`src/model-collision.mjs` reads the `MODC` shape table, first-auxiliary stored face pool, nine-byte lookup records, edge records and referenced primary vertices. Collision data includes entries after rendered face/vertex counts: validation finds 3,248 extra faces and 856 extra vertices. The reader preserves these entries rather than substituting the visible geometry. All 84 resources validate, with 1,236 supported models, 4,400 shapes, 17,256 referenced lookup records and 31,264 edges. Per-placement collision configurations, class bytes and quantized yaw resolve for all 5,172 ordinary objects. `MODL` collision interpretation remains outside this reader. The actual placed-model query is not yet ported.

`src/terrain-surfaces.mjs` resolves native cell references to the sixteen-byte UV/surface descriptors and decodes category plus five-bit grip reduction from their final word. All 817,040 active terrain cells in 80 level packs resolve. The connected wheel probe now retains actual terrain metadata for 989 final contacts from its side-attempt fixtures. Eight added tests bring the suite to 69. Reports are `analysis/model-collision-catalog.json` and `analysis/terrain-surface-catalog.json`; complete layouts/evidence/limits are in `docs/model-collision.md`. New native evidence is retained through result `195` and exported to `analysis/scene/model-collision-evidence-bundle.json`.

## Model ray-query milestone

`src/model-query.mjs` ports the zero-radius `0x424040` path and `0x424a40` containment; `src/model-transforms.mjs` uses a verified original 321-short yaw lookup. `src/placed-model-query.mjs` adds the outer placed-object geometry query and four-wheel terrain/model selector. The code preserves native early exits, inclusive model limits, class/tag filtering, yaw quantization, fraction/hit-point rounding, candidate order and the selector's shared-buffer writes. Breakable type-4 hits require an explicit object-state/effect handler; damage behavior is not silently treated as reconstructed.

Independent bounded interpretation matches 4,000 shape fixtures (950 retained instructions), 3,000 placed-object fixtures (1,362 instructions, declared inert damage state) and 2,000 selector fixtures (72 instructions with mocked callee results). Installed-data probes cover 9,888 shape rays / 2,472 instruction comparisons and 3,588 placed-object rays / 449 instruction comparisons, all matching. These are static-instruction checks with declared inputs, not a running original game. Details are in `docs/model-queries.md`; the suite has 85 passing tests.

`src/model-links.mjs` also resolves all 26,108 static placement references across 17,432 populated spatial-node lists in 80 level packs. The per-frame model candidate screen/lifecycle still needs to be connected, alongside nonzero-radius contacts, destruction effects and complete drive/event orchestration. New evidence is exported to `analysis/scene/model-query-evidence-bundle.json`.

## Next reconstruction steps

1. Recover special placement types and animation stepping. Type-24 construction goes through `0x429c90`; type-2 and type-13 use `0x4901d0`. Their effects are excluded from the current static export.
2. Decode HIGH-pack image data, auxiliary model variants and secondary sector passes when needed.
3. Connect spatial placement lists and body-radius model screens to the recovered terrain/model wheel selector and actual vehicle configuration. Recover sphere/edge contacts, destruction effects and complete drive-input/capacity computation in `0x41c080`, then collision event dispatch at `0x474bb0`. Recover the unrecognized callback boundary at `0x41e080` when its full behavior is needed.
4. Recover localization lookup and sound-bank records when those subsystems are needed.
