# Rollcage source reconstruction

## Foreword (this section is written by me, a human)

Getting, one day, a reverse engineered Rollcage has been an unreachable dream. Unreachable because of the sheer amount of work required for such an effort.

Recently, I saw news of REA - Reverse Engineer Anything (https://github.com/morluto/rea/tree/main) and how people are using it to do all kind of things : complete decompilation, game mashups, game porting to other consoles..

The world of proprietary software is fracturing as we speak. I do not know if it is a good or a bad thing.

But I know one thing for sure: a completely reverse-engineered Rollcage is now reachable.

So I've set up REA, installed Ghidra, installed Codex, set it up to use GPT-6.1-Sol, and up we go..

The only prompt I gave it was:
> This project contains a shortcut to Rollcage directory, containing Rollcage video game. I want you to use REA to decompile Rollcage into C source files. The goal is to be able to make modifications to the sources and recompile them to get a modified version of Rollcage.

And the agent has been figuring things out and generating reverse-engineering details ever since..

### What this repository is

I am just dumping in there the results of the agent-powered reverse engineering. I must insist: **nothing** is done by me. The AI is doing everything. My only job is to press Continue and answer clarification questions.

I will be updating the repo regularly after each Codex session (that ends whenever I am out of AI Credits, basically).

This repository **is not** Rollcage source code or a recreation of it.

So, what will you actually find in there?
- A bunch of .md files describing what the AI found
- A lot of JavaScript excerpts that specify the game algorithms ; unit tests to validate them
- A few demos in .html like [the Track Viewer](docs/track-viewer.html), with publishable pages in `docs/`

What can we make of it? For now, nothing much. But, after a while, when Mr AI will have done his diligent work, this could be the basis to build tools to modify the game data or even the game itself.

### Related Work

I know there are some people who are taking the approach of rewriting each game function one by one. This is much cleaner but also takes a lot more time. I genuinely have no idea of what the end result is going to be or how maintainable/modifiable my naive REA approach is going to produce. I do have hopes on the matter; it's "just" language translation after all, and LLMs excel at that. But I do not want this to undermine the work of others.

Let's be clear on that: this repository is cheap. Zero work involved. It's literally cheating our way out.

But something is better than nothing - and, perhaps, this repository will give a preliminary step until the more structured approaches emerge.

With all this being said.. Let's move on to the AI slop.

## The AI "slop" (now it's not me writing anymore, but rather, Mr AI)

Working reference components include the archive reader, GT20 decompressor, filename lookup, BTP textures, GFXM primary models and textured SEGM track geometry. This is not yet a rebuilt game.

Open the [interactive track viewer](docs/track-viewer.html) locally in a desktop browser, then select `ROLLCAGE.IMG` and `ROLLCAGE.IDX` from either game's `IDXData` folder. The page identifies the supplied archives automatically and reads the selected environment in memory; it needs no server, network connection, or prior extraction, and writes no game files. Its menu offers LOW and HIGH versions of Rollcage's 20 PC BLP tracks and all 66 Stage II environments: 20 race, 25 scramble, 10 training, 5 deathmatch, 5 pursuit, and 1 football. Select another matching file pair to switch games. BL6 variants are not supported. The [website directory](docs/README.md) contains the static site entry point and viewer for GitHub Pages publishing.

In **Orbit & pan**, left-drag rotates, right-drag or Shift-left-drag pans, and the wheel zooms. Click the view to use arrow keys to rotate, WASD to pan, and +/− to zoom. In **Fly-in**, click the view for mouse-look, use WASD to move, Q/E to move down/up, Shift to move faster, and the wheel to adjust speed. Escape releases the mouse; drag-to-look is available if mouse capture is unavailable. Fly-in allows passing through geometry. Reset returns to an overview of the selected track. Terrain sectors, objects, textures, preview lighting, and smoothing can be selected independently.

Click **Download track** to save the loaded track as a ZIP containing `scene.obj`, `scene.mtl`, `scene.json`, PNG textures, and import instructions. Extract all files into the same folder, import `scene.obj` into Blender, and switch to Material Preview to see the textures. Downloads include the complete terrain and ordinary objects, regardless of sector selection or display toggles. Camera movement does not change the exported geometry. Packaging runs entirely in the standalone page, with no server or downloaded dependencies. ZIP filenames include the game identity.

The standalone page contains the shared recovered readers and browser controls, with no game assets embedded. After changing its sources, regenerate it with `node tools/build-track-viewer.mjs`. Run `node --test tests/track-viewer.test.mjs` for focused checks. With an existing REA installation supplying Playwright, `node tools/check-track-viewer.mjs '<installed-REA-launcher>' [installation-directory] [new-report-directory]` checks the page in Edge, compares browser geometry and RGBA texture hashes against the Node readers for all 40 packs, exercises controls and loading recovery, and saves a screenshot and report. It downloads no dependencies and refuses to overwrite a report directory.

The general Track Viewer replaces the earlier level-one preview directories. Select LOW / LEV1 to view the same 16 sectors and 114 ordinary model instances, or use Download track to obtain its OBJ, materials and textures. Native evidence and current browser-check reports remain under `analysis/`.

Stage II uses separate placement and model-material readers with the shared archive, terrain, texture, renderer, and exporter components. Its track labels come from the native menu; `.BLP`/`.BTP` names are extraction aliases, not recovered original filenames. See [Stage II format notes](re-docs/stage2-formats.md) for evidence and limitations.

For **Firebugs**, select a ZIP containing the PS1 disc's `.CUE` and referenced data `.BIN` in the same Track Viewer. The disc is processed locally; audio BINs are skipped. Automatic identification targets the supplied Europe disc, including renamed or repacked copies. Choose Firebugs explicitly to attempt another release with unverified compatibility. Firebugs uses its own disc, texture and scene readers with the shared viewer and OBJ export controls. Track labels retain resource IDs where original names have not been established.

The supplied Europe disc exposes 33 environments, including variants and duplicates. See [Firebugs format notes](re-docs/firebugs-formats.md) for native evidence and remaining limits. List the environments before exporting a numeric track resource ID to a new directory:

```powershell
node tools/list-firebugs-tracks.mjs 'Firebugs.zip'
node tools/validate-firebugs.mjs 'Firebugs.zip' firebugs-validation.json
node tools/export-scene.mjs --game firebugs <track-id> firebugs-track-scene 'Firebugs.zip'
```

Exports contain OBJ, MTL, PNG textures, a JSON manifest and a standalone viewer. The manifest records disc identity, resource references, verification status and reconstruction limits. Firebugs ZIP input supports stored or deflated members and a CUE data track in MODE2/2352 layout; other disc layouts may be rejected.

Use `--game stage2` for Stage II command-line extraction and export. Numeric IDs support every archive resource; named aliases currently cover its 66 environment pairs. Existing commands continue to default to Rollcage. Outputs require new filenames or directories:

```powershell
node tools/extract-resource.mjs --game stage2 80 stage2-lev01.blp
node tools/export-scene.mjs --game stage2 'LEV01.BLP' stage2-lev01-scene
node tools/validate-track-game.mjs stage2
node tools/check-track-games.mjs '<installed-REA-launcher>'
```

The Stage II installation path may be supplied as the final positional argument to extraction and scene export. The validation command accepts `[installation-directory] [new-report-directory]` after its game ID. The browser check uses both default installations and accepts an optional new report directory after the launcher. These tools download no dependencies, open installed game files read-only, and retain reports without overwriting earlier evidence.

See [RESEARCH.md](RESEARCH.md) for target hashes, recovered function addresses, evidence and remaining questions.

The reference tools use Node.js with no downloaded dependencies. Run from this directory:

```powershell
node --test
node tools/validate-archive.mjs
node tools/extract-resource.mjs 19 output.bmp
node tools/extract-resource.mjs 8 strings.txt
node tools/extract-resource.mjs 'LOW/LEV1.BLP' level1.blp
node tools/validate-btp.mjs
node tools/validate-gfxm.mjs
node tools/validate-scenes.mjs
node tools/validate-placements.mjs
node tools/validate-spatial-index.mjs
node tools/validate-collision-grid.mjs
node tools/validate-model-collision.mjs
node tools/validate-model-links.mjs
node tools/validate-terrain-surfaces.mjs
node tools/export-btp.mjs 'LOW/LEV1.BTP' level1-textures.png
node tools/export-gfxm.mjs 'FE.BLP' 6 car.obj
node tools/preview-models.mjs 'FE.BLP' models.png
node tools/export-scene.mjs 'LOW/LEV1.BLP' level1-scene
```

Extraction requires a new output filename; scene export requires a new directory. Both refuse to overwrite existing output. The default installation directory is `C:\Program Files (x86)\Psygnosis\Rollcage`; extraction, validation and scene export accept an optional final installation-directory argument. The installed game files are opened read-only. Archive validation records decoded hashes without writing every payload to disk.

Current validation covers all 344 resources and all 174 decoded bitmap structures. Small decoded samples are in `analysis/resource-019.bmp` and `analysis/resource-008.strings.txt`.

The recovered filename table names 340 resources. Texture validation covers all 84 BTP files and 2,096 active PC texture pages. Geometry validation covers all 84 GFXM files, 3,460 primary model records and 1,496 scene sectors. Placement validation covers 7,692 records, including 5,172 ordinary model instances and their materials. Forty scene packs have PC textures available; forty HIGH packs need another image decoder. Run `node --test` for the regression suite. See [asset format notes](re-docs/asset-formats.md) for evidence, layouts and remaining limits.

The first [shared physics routines](re-docs/physics.md) now cover body initialization, fixed-point math, momentum/velocity conversion, force accumulation, inertia and fractional-frame advancement. Complete vehicle behavior remains to be reconstructed. Reproduce the retained arithmetic probes with:

```powershell
node tools/recover-trig-table.mjs sqrt
node tools/recover-body-template.mjs
node tools/probe-body-physics.mjs
```

These probes use a verified original body template with declared synthetic inputs. They do not run the game or establish runtime equivalence.

The [wheel arithmetic port](re-docs/wheels.md) adds probe transforms, contact conversion, suspension, traction correction and spin. Run `node tools/verify-suspension-instructions.mjs` for an independent comparison against interpreted retained x86 instructions: all 2,000 four-wheel fixtures match, including every byte in the compared vehicle region. The report is `analysis/suspension-instruction-check.json`.

The [collision code](re-docs/collision-data.md) recovers spatial lookup, height layers, fallback search, collision regions, normal tables, candidate screening and the zero-radius terrain query used by wheels. `node tools/verify-terrain-query-instructions.mjs` compares that query with retained x86 instructions on 4,000 synthetic rays, all matching. `node tools/probe-terrain-wheel-contacts.mjs` exercises candidate selection, four wheel rays, contact conversion and suspension on all 80 level packs: 14,544 queries, including 364 sampled instruction comparisons, pass. It also checks remembered-side preparation and retries on 364 synthetic bodies. These are synthetic placements on installed data, not a driving simulation or original-process comparison. Sphere/edge response, destruction effects and complete drive/event orchestration remain open.

The [model-collision and surface readers](re-docs/model-collision.md) validate 4,400 authored shapes in 1,236 `MODC` models, including collision-only faces/vertices, plus settings for all 5,172 ordinary placements. Terrain surface categories and grip-reduction fields resolve for all 817,040 active cells and now accompany the connected wheel probe's contacts.

The [model ray queries](re-docs/model-queries.md) add original yaw transforms, zero-radius model hits and the four-wheel terrain/model selector. Instruction comparisons pass 4,000 shape fixtures, 3,000 placed-object fixtures and 2,000 selector fixtures, with declared limits on destruction effects. Installed-data probes add 9,888 shape queries and 3,588 placed-object queries. Static spatial lists resolve all 26,108 placement references.

The [connected vehicle contacts](re-docs/vehicle-contacts.md) now use recovered wheel geometry and body radius, original model candidate screening, terrain/model selection and side retries. `node tools/probe-vehicle-contacts.mjs` passes 7,188 synthetic body states across all 80 levels, including 1,044 model contacts and 719 sampled candidate instruction comparisons. Another 3,000 synthetic candidate fixtures and the retained wheel initializer match interpreted x86. Damage effects, sphere collision response and complete drive/frame orchestration remain open.

[Drive preparation](re-docs/wheel-drive.md) recovers common capacity, alignment/counter state and the registered-cell surface mode. Retained-instruction checks pass 4,000 preparation fixtures, 4,000 traction/spin fixtures and 7,169 classifier fixtures. Traction effects are explicitly omitted from that isolated arithmetic comparison.

[The connected wheel path](re-docs/wheel-frame.md) adds steering directions, the per-wheel drive caller with explicit effect callbacks and traction-force application. Further instruction checks pass 3,000 direction fixtures, 3,000 drive fixtures and 2,000 force batches. `node tools/probe-vehicle-contacts.mjs --drive` exercises all 80 levels with recovered configuration tables and declared controls: 8,860 active wheel corrections pass through momentum accumulation, including 360 sampled drive instruction matches. This is a static reconstruction exercise; complete collision response, effects and vehicle/frame scheduling remain open.

[The vehicle frame stage](re-docs/vehicle-frame.md) now connects rest/air assists, special-state forces, level track-basis lookup and body-derivative refresh in native multi-vehicle order. `node tools/probe-vehicle-frame.mjs` passes 1,220 synthetic batches /3,636 vehicles across all 80 levels. Track-basis validation covers every one of the 817,040 active cells, with sampled instruction comparisons. This installed-data probe ends at derivative refresh.

[Collision scheduling and static response](re-docs/collision-events.md) cover the native event heap/free pool, callback rejection and body promotion, event invalidation, pose/frame-clock advancement and static normal impulses. Independent retained-instruction checks pass 14,403 insertions, 4,797 invalidations, 3,000 callback fixtures, 9,500 advancement checks and 5,000 static-contact fixtures. Reproduce these checks with:

```powershell
node tools/verify-collision-events-instructions.mjs
node tools/verify-body-advancement-instructions.mjs
node tools/verify-collision-response-instructions.mjs
```

[Body-pair response and full numeric dispatch](re-docs/collision-response.md) add sliding, penetration correction, damping, native frame initialization and runtime spatial body lists. Instruction checks pass 5,000 pair fixtures, 6,000 dispatcher fixtures and 57,600 spatial-list operations. `node tools/probe-collision-response.mjs` connects these components in 3,660 declared collision scenarios /4,880 bodies across all 80 level packs, using authored contact points and normals. All pass, including 121 spatial reinsertions. This earlier probe supplies synthetic event times and body profiles; the subsequent pair-detection probe below computes its events.

[Body collision detection and candidate generation](re-docs/body-pair-detection.md) compute pair contacts from the original five-sphere vehicle geometry and connect registration, caches, native grouping, event creation, response and candidate regeneration. `node tools/probe-body-pair-detection.mjs` passes 3,660 synthetic two-vehicle scenarios across all 80 level packs: 2,440 initial events and 3,660 regenerated events are computed and processed, with 327 spatial reinsertions. Vehicle profiles and runtime allocation are declared inputs.

[Terrain and model sphere geometry](re-docs/static-sphere-contacts.md) now connect actual static detection, contact merging, response and registration. `node tools/probe-static-sphere-contacts.mjs` passes 4,332 scenarios across all 80 levels, with 10,556 computed events and 9,796 stored contacts. `node tools/probe-model-sphere-shapes.mjs` checks all 4,400 authored collision shapes with 9,888 queries and 2,848 native instruction comparisons. All 40 retained-instruction tools pass. Effects/removal callbacks remain explicit boundaries, and full frame preparation, attachments and multi-frame driving remain unfinished.

[Connected consecutive frames](re-docs/simulation-frame.md) combine ordinary preparation, retained-contact friction, native candidate construction, wheel physics, body derivatives, static/pair collision detection, response and final movement. `node tools/probe-simulation-frames.mjs` passes9,760 frames /19,520 vehicle updates across all80 packs, with19,145 processed events,5,703 retained contacts consumed and24,089 actual attachment writes. Rejected contacts now execute native47cc20 completion rather than an assumed deletion. World-record updates, impulse/damping effects, active-vehicle effects and scripted release have recovered references; the corpus declares an empty world table and synthetic attachment points. Inputs remain supplied state, without captured original-process trajectories.

[Post-frame body states](re-docs/post-frame-body-states.md), the [vehicle prepass](re-docs/post-frame-vehicle-check.md), [respawn placement queries](re-docs/respawn-query.md), [terrain candidate fill](re-docs/respawn-terrain-candidates.md) and [respawn application](re-docs/respawn-apply.md) extend the lifecycle path. The frame adapter can run physics, attachments and body-state processing in recovered order with explicit runtime/query/emission contracts. Placement probes pass3,660 supplied positions across all80 packs. A separate connected post-frame probe runs1,620 body resets and25,920 actual [respawn particles](re-docs/respawn-effects.md), preserving fallback orientations and the final register value consumed by the next effect. [Authored routes](re-docs/respawn-routes.md) cover15,160 points; [checkpoint progression](re-docs/respawn-progress.md) and [lap timing](re-docs/lap-timing.md) add numeric race-state references and1,080 installed-data progression checks. Runtime producers, broader race-completion callbacks and the surrounding tick remain unfinished.

Other previews: [front-end models](analysis/fe-models.png), [level-one textures](analysis/level1-textures.png), [level-one model library](analysis/level1-models.png). [A car OBJ](analysis/car-model-6.obj) retains local model coordinates and has no material mapping yet. The separate scene exporter assembles the sector grids with their base textures.

The REA helper `tools/rea-session.mjs` drives the public MCP interface with one persistent Ghidra analysis session. Its optional second argument selects an investigation subdirectory under `analysis`. On restart it preserves existing replies; new open/import requests restore the target and ledger. Initial requests and responses are under `analysis/requests` and `analysis/results`; subsequent investigations are under `analysis/asset-formats`, `analysis/scene` and `analysis/native-simulation`. REA/Ghidra tooling is needed to extend native-code analysis, but not to run reconstructed asset tools. The checkpoint-progress export retains459 Evidence records in `analysis/native-simulation/checkpoint-progress-evidence-bundle.json`, with zero ledger unknowns; earlier exports and individual immutable replies remain retained. `analysis/native-evidence-index.json` hashes those replies.
