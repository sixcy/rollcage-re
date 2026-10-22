# Weather update and resource producers

`src/weather-update.mjs` reconstructs the complete `496700` update parent and its reached weather algorithms. This is a JavaScript reference checked against retained x86 instructions, not original-process runtime evidence. The installed executable and assets remain read-only.

## Update graph

Call `updateWeather({memory, scratchBase, ...runtime})`, where `memory` is the shared native-address Buffer and `scratchBase` is native entry ESP for `496700`. The implementation preserves the six-row pointer traversal, live session reloads, shared body-pose backup/restore, signed packed bounds, RNG sequence, four fringe boxes, and native private-stack aliases. The rain/snow volumes are actual `496830`, `4969d0`, `496ff0`, `496e80`, and initialization `4963e0` in `weather-volumes.mjs`. The extra participant pose calls actual `41bf40`/`4167f0` and actual `4286e0` spatial lookup.

The complete screen-particle algorithms `498030` and `4979c0` are in `weather-screen.mjs`, including water drops, rain and snow, radial generation, viewport queries, float arithmetic, age/lifetime and the unsigned microsecond-to-millisecond conversion. Actual `489cd0` comes from `game-network-protocol.mjs`. Brightness, thunder and lightning are actual `498cc0`, `4975b0`, `497650` and `497730`; emitted sounds use the existing `484bb0`/sound-dispatch implementation.

The caller supplies actual memory producers and genuine external services:

- `services.platformCall(name,args,runtime)` implements QPF/QPC, with each function writing its native 64-bit output to the provided pointer.
- `handlers.sourceVolume(source,volume,runtime)` is the audio source virtual method, reached only for live rain channels rather than sentinel127.
- `soundRuntime` optionally selects the existing sound-dispatch runtime; otherwise the enclosing runtime is used.
- Viewport queries use actual Application/map/string algorithms. `handlers.dynamicCast` is the CRT RTTI boundary. Missing Application or map storage also needs CRT `allocate`, `free`, `registerExit`, and the synchronization/thread platform services documented by `application-bootstrap.mjs`.

The standalone update oracle uses synthetic, explicitly initialized bodies/controllers, terrain/spatial roots, weather rows and viewport records. This is a proof of the update graph, not a claim that the whole race/startup runtime creates those inputs yet.

## Viewport and Application

`weather-viewport.mjs` reconstructs `40ab70`/`407050`, width/height wrappers `40ac40`/`40acc0`, std::string assignment/growth, ordered map lookup/insertion and red-black balancing. Nonempty names create native100-byte records with the original default coordinates. Aliased output pointers retain native store order. `application-bootstrap.mjs` reconstructs `402d10`/`402a20`/`403430`, debugger singleton/constructor `4a2290`/`4a0e90`, debugger registration and vector growth. CRT allocation, RTTI, atexit, critical sections and thread ID remain external services.

## Bitmap and resource loading

`game-resource-files.mjs` contains actual `401000` IDX/IMG name construction and index loading, `4010e0` archive modes, `401160` duplicate-index selection and compressed staging, `401380` GT20 decoding, the original324-name normalization/table lookup,344-entry cache, file-open retry/basename policy, reads/close and zero/aligned allocation. Raw game code retains native unchecked-buffer semantics; safe archive convenience APIs remain separate.

`game-bitmap-images.mjs` contains actual `4895d0` BMP header/palette/pitch/allocation/vertical-flip code and `414dc0` fallback, including original path prefix, wide-filename conversion, GDI+ wrapper ownership, descriptor writes, negative source stride and row copies. Image decoding itself is the genuine GDI+ service boundary; all surrounding game policy is translated. File and allocator services are supplied through `services.platformCall` and `services.libraryCall`. The retained static original resource table/names, image literals and scalar constants are loaded by the instruction programs.

## Current verification

All comparisons include every mapped byte at or above `0x10000`; private stack is excluded from direct equality while its consumed effects are compared. No arbitrary legitimate stores are filtered.

| Checker | Scope | Result |
| --- | --- | --- |
| `verify-weather-update-instructions.mjs` |48 persistent scenarios,384 full parents plus512 leaves |896 operations,33,729,256 steps,2143 reached instructions |
| `verify-weather-volumes-instructions.mjs` |600 fixtures across six entries, including surviving particles, wrap, shelter and audio virtual calls |7,831,427 steps,1051 reached |
| `verify-weather-screen-instructions.mjs` |600 fixtures across spawn/update and all three kinds |1,310,502 steps,1110 reached |
| `verify-weather-viewport-instructions.mjs` |120 persistent map/string scenarios, aliased outputs, width/height wrappers |1080 operations,876,669 steps,981 reached |
| `verify-application-bootstrap-instructions.mjs` |600 fixtures across seven entries, lazy/existing singleton and vector aliases |105,653 steps,450 reached |
| `verify-game-resource-instructions.mjs` |600 resource/decoder/cache/archive/allocation fixtures |138,520 steps,495 reached; ordered external requests match |
| `verify-game-bitmap-instructions.mjs` |240 BMP/GDI+/wide-name fixtures |1,581,027 steps,747 reached; ordered external requests match |
| `verify-weather-initialization-instructions.mjs` |120 fixtures over five constructor entries, actual failed-texture path |4,416,640 steps,1021 reached |
| `verify-game-image-format-instructions.mjs` |2400 mask/packed/float/half/palette fixtures including in-place inputs/outputs |1,531,457 steps,1019 reached |
| `verify-game-image-storage-instructions.mjs` |600 leaf fixtures plus80 persistent construct/allocate/write/read/release chains |1000 operations,262,896 steps,1039 reached |

Focused tests cover brightness timing, existing lightning while disabled, rejected extent RNG preservation, GT20 refill/overlap, cache cursor ownership, sharing-violation retry and GDI+ negative-stride/failed-image cleanup. The bounded instruction interpreter gained only reached `SETS`, `SETO`,32-bit `PUSHAD`/`POPAD`, forward `SCASB.REPNE`, and explicitly admitted scalar-XMM forms, each with focused regression tests.

## Remaining startup and render scope

Weather constructor `496290`, screen constructor `497ed0`, environment initializer `498bc0`, and rain/snow render-buffer constructors `496580`/`496640` are translated in `weather-initialization.mjs`. `4963e0` is separately translated and verified. Successful `401b70`/`401be0` loading now defaults to actual `constructGameTexture` (`408680`). The optional named handler still permits an explicit caller override; the connected proof uses the actual default.

`verify-weather-startup-connected-instructions.mjs` compares48 persistent image-library startup (`4bbf40`) then weather initialization scenarios:96 operations,64 actual texture uploads,716 actual pixel-worker callbacks,11,103,088 interpreted steps and4756 reached instructions. This covers all three weather modes, real worker-pool/gamma producers, successful bitmap decoding, conversion, padding, copying, resampling and default mipmaps. Every mapped byte at or above `10000h` is compared, along with captured STL tuples and child entry ESPs, renderer requests/full mip payloads, and ordered non-memory CRT/platform services. Pure memory/string CRT calls are folded into the memory comparison. The fixtures use synthetic GDI+ pixels and an explicit serialized async schedule. Sound is disabled by the real native policy.

The installed-JPG probe now feeds host GDI+ decoded `Raindrop1.jpg` and `Snowflake2.jpg` through the actual bitmap and complete game-side texture graph in both RGB565 and RGBA32. It checks every base pixel independently, dimensions/alpha at every mip level, and records all level hashes. See [texture construction and startup](game-texture-construction.md) and `analysis/weather-installed-texture-construction-probe.json`.

Rendering consumers `497110`/`497350` are retained separately and do not run from `496700`. These drawing routines, full renderer backends and coherent whole-application lifecycle remain broader project work. The startup proof is limited to the explicit CRT/Win32/GDI+/STL and renderer-interface contracts above; it does not execute the original game.
