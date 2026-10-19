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
- A few demos in .html like [the level-one scene viewer](analysis/level1-objects/viewer.html), usually in `analysis/` directory

What can we make of it? For now, nothing much. But, after a while, when Mr AI will have done his diligent work, this could be the basis to build tools to modify the game data or even the game itself.

### Related Work

I know there are some people who are taking the approach of rewriting each game function one by one. This is much cleaner but also takes a lot more time. I genuinely have no idea of what the end result is going to be or how maintainable/modifiable my naive REA approach is going to produce. I do have hopes on the matter; it's "just" language translation after all, and LLMs excel at that. But I do not want this to undermine the work of others.

Let's be clear on that: this repository is cheap. Zero work involved. It's literally cheating our way out.

But something is better than nothing - and, perhaps, this repository will give a preliminary step until the more structured approaches emerge.

With all this being said.. Let's move on to the AI slop.

## The AI "slop" (now it's not me writing anymore, but rather, Mr AI)

Working reference components include the archive reader, GT20 decompressor, filename lookup, BTP textures, GFXM primary models and textured SEGM track geometry. This is not yet a rebuilt game.

Open [the level-one scene viewer](analysis/level1-objects/viewer.html) locally in a browser. Its geometry and textures are embedded, so it needs no server or network connection. Drag to orbit, scroll to zoom, select a terrain sector, or toggle objects. The [preview](analysis/level1-objects/preview.png) shows 16 track sectors and 114 ordinary model instances: 32,851 triangles using 19 texture pages. The [OBJ](analysis/level1-objects/scene.obj), adjacent MTL and PNG textures can be imported into a 3D editor. Effects, special objects and gameplay remain to be reconstructed. The earlier [terrain-only viewer](analysis/level1-scene/viewer.html) is retained for comparison.

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

The recovered filename table names 340 resources. Texture validation covers all 84 BTP files and 2,096 active PC texture pages. Geometry validation covers all 84 GFXM files, 3,460 primary model records and 1,496 scene sectors. Placement validation covers 7,692 records, including 5,172 ordinary model instances and their materials. Forty scene packs have PC textures available; forty HIGH packs need another image decoder. Run `node --test` for the 140 focused tests. See [asset format notes](docs/asset-formats.md) for evidence, layouts and remaining limits.

The first [shared physics routines](docs/physics.md) now cover body initialization, fixed-point math, momentum/velocity conversion, force accumulation, inertia and fractional-frame advancement. Complete vehicle behavior remains to be reconstructed. Reproduce the retained arithmetic probes with:

```powershell
node tools/recover-trig-table.mjs sqrt
node tools/recover-body-template.mjs
node tools/probe-body-physics.mjs
```

These probes use a verified original body template with declared synthetic inputs. They do not run the game or establish runtime equivalence.

The [wheel arithmetic port](docs/wheels.md) adds probe transforms, contact conversion, suspension, traction correction and spin. Run `node tools/verify-suspension-instructions.mjs` for an independent comparison against interpreted retained x86 instructions: all 2,000 four-wheel fixtures match, including every byte in the compared vehicle region. The report is `analysis/suspension-instruction-check.json`.

The [collision code](docs/collision-data.md) recovers spatial lookup, height layers, fallback search, collision regions, normal tables, candidate screening and the zero-radius terrain query used by wheels. `node tools/verify-terrain-query-instructions.mjs` compares that query with retained x86 instructions on 4,000 synthetic rays, all matching. `node tools/probe-terrain-wheel-contacts.mjs` exercises candidate selection, four wheel rays, contact conversion and suspension on all 80 level packs: 14,544 queries, including 364 sampled instruction comparisons, pass. It also checks remembered-side preparation and retries on 364 synthetic bodies. These are synthetic placements on installed data, not a driving simulation or original-process comparison. Sphere/edge response, destruction effects and complete drive/event orchestration remain open.

The [model-collision and surface readers](docs/model-collision.md) validate 4,400 authored shapes in 1,236 `MODC` models, including collision-only faces/vertices, plus settings for all 5,172 ordinary placements. Terrain surface categories and grip-reduction fields resolve for all 817,040 active cells and now accompany the connected wheel probe's contacts.

The [model ray queries](docs/model-queries.md) add original yaw transforms, zero-radius model hits and the four-wheel terrain/model selector. Instruction comparisons pass 4,000 shape fixtures, 3,000 placed-object fixtures and 2,000 selector fixtures, with declared limits on destruction effects. Installed-data probes add 9,888 shape queries and 3,588 placed-object queries. Static spatial lists resolve all 26,108 placement references.

The [connected vehicle contacts](docs/vehicle-contacts.md) now use recovered wheel geometry and body radius, original model candidate screening, terrain/model selection and side retries. `node tools/probe-vehicle-contacts.mjs` passes 7,188 synthetic body states across all 80 levels, including 1,044 model contacts and 719 sampled candidate instruction comparisons. Another 3,000 synthetic candidate fixtures and the retained wheel initializer match interpreted x86. Damage effects, sphere collision response and complete drive/frame orchestration remain open.

[Drive preparation](docs/wheel-drive.md) recovers common capacity, alignment/counter state and the registered-cell surface mode. Retained-instruction checks pass 4,000 preparation fixtures, 4,000 traction/spin fixtures and 7,169 classifier fixtures. Traction effects are explicitly omitted from that isolated arithmetic comparison.

[The connected wheel path](docs/wheel-frame.md) adds steering directions, the per-wheel drive caller with explicit effect callbacks and traction-force application. Further instruction checks pass 3,000 direction fixtures, 3,000 drive fixtures and 2,000 force batches. `node tools/probe-vehicle-contacts.mjs --drive` exercises all 80 levels with recovered configuration tables and declared controls: 8,860 active wheel corrections pass through momentum accumulation, including 360 sampled drive instruction matches. This is a static reconstruction exercise; complete collision response, effects and vehicle/frame scheduling remain open.

[The vehicle frame stage](docs/vehicle-frame.md) now connects rest/air assists, special-state forces, level track-basis lookup and body-derivative refresh in native multi-vehicle order. `node tools/probe-vehicle-frame.mjs` passes 1,220 synthetic batches /3,636 vehicles across all 80 levels. Track-basis validation covers every one of the 817,040 active cells, with sampled instruction comparisons. This installed-data probe ends at derivative refresh.

[Collision scheduling and static response](docs/collision-events.md) cover the native event heap/free pool, callback rejection and body promotion, event invalidation, pose/frame-clock advancement and static normal impulses. Independent retained-instruction checks pass 14,403 insertions, 4,797 invalidations, 3,000 callback fixtures, 9,500 advancement checks and 5,000 static-contact fixtures. Reproduce these checks with:

```powershell
node tools/verify-collision-events-instructions.mjs
node tools/verify-body-advancement-instructions.mjs
node tools/verify-collision-response-instructions.mjs
```

[Body-pair response and full numeric dispatch](docs/collision-response.md) now add sliding, penetration correction, damping, native frame initialization and runtime spatial body lists. New instruction checks pass 5,000 pair fixtures, 6,000 dispatcher fixtures and 57,600 spatial-list operations. `node tools/probe-collision-response.mjs` connects these components in 3,660 declared collision scenarios /4,880 bodies across all 80 level packs, using authored contact points and normals. All pass, including 121 spatial reinsertions. Event times and body profiles are synthetic; contact detection, candidate regeneration, full body preparation and lifecycle/effect implementations remain necessary for a rebuilt game.

Other previews: [front-end models](analysis/fe-models.png), [level-one textures](analysis/level1-textures.png), [level-one model library](analysis/level1-models.png). [A car OBJ](analysis/car-model-6.obj) retains local model coordinates and has no material mapping yet. The separate scene exporter assembles the sector grids with their base textures.

The REA helper `tools/rea-session.mjs` drives the public MCP interface with one persistent Ghidra analysis session. Its optional second argument selects a fresh investigation subdirectory under `analysis`. Initial requests and responses are under `analysis/requests` and `analysis/results`; subsequent investigations are under `analysis/asset-formats` and `analysis/scene`. REA/Ghidra tooling is needed to extend native-code analysis, but not to run the reconstructed asset tools.
