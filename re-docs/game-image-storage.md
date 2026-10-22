# Native game image storage and formats

`src/game-image-storage.mjs` and `src/game-image-format.mjs` reconstruct the storage and numeric helpers reached by texture construction `408680`. They are used by the ongoing weather startup reconstruction. These modules are JavaScript references checked against retained Redux instructions; they do not execute the original executable.

## Implemented algorithms

Storage includes pixel-image construction `4bc8b0`, color-transform defaults `4bcb70`, metadata construction `4c4750` with its actual empty-literal wide-string constructors, image clearing `4c1af0`, format/palette/image allocation `4c18e0`, metadata release `4bcbe0`, image-list release `4bc2b0`, and pointer-vector append/growth/reserve `40ebc0`/`40edc0`/`40f060`.

Numeric format helpers include mask defaults `4c1830`, mask analysis `4c1eb0`, mask application `4c1f90`, packed1/2/3/4-byte reads/writes `4c20a0`/`4c2100`, RGBA access `4c2160`/`4c2270`, palette selection `4c23b0`/`4c41d0`, float access `4c2440`/`4c2570`, float-to-RGBA `4c1150`, and half conversion `4c17c0`/`4c9300`.

The palette metric uses clamped channel subtraction followed by signed-byte absolute values, including its counterintuitive early zero match. RGB565 expansion shifts missing bits without replicating the high bits into the low bits. Compressed-block types3..7 retain native zero reads and ignored writes. Float packing uses the original integer operations on scaled float bits. Half conversion preserves signed zero, subnormals, rounding, infinities and NaN payload policy.

## Memory and external services

Each raw helper takes `{memory,scratchBase,...runtime}`. `memory` is the shared native-address Buffer; `scratchBase` denotes that function's entry ESP. Allocation and release use `services.libraryCall(name,args,runtime)` with explicit `allocate`, `free`, `operatorNew`, `operatorDelete`, `operatorNewArray` and `operatorDeleteArray`. Metadata's empty strings still allocate/convert/free their actual temporary wide strings through `services.platformCall('MultiByteToWideChar',args,runtime)`.

Static original data must be loaded into the Buffer. Retained reads3885..3888 provide the65536-entry half expansion table at `578ee8`;3894 provides the exponent-bias table at `5b8ee8`;3895 provides the float-packing scale at `5dca48`. Failed requests3883/3884 are preserved as failures and are not used as evidence. Other scalar literals and switch tables are retained separately by the native instruction loader.

`4c1af0` copies uninitialized native local words into image fields. The implementation reads those bytes from the supplied stack, and its real parents publish the relevant constructor, argument, saved-register and arithmetic-call writes at their original points. The persistent oracle caught these dependencies; they are not filled from native end-state snapshots. `runtime.entryRegisters` supplies incoming register values where a later consumer reads saved-register bytes. Current connected image fixtures explicitly supply zero incoming general registers; constructor/list parents supply their own real live values for child calls. This is a raw ABI input contract, not an upstream register producer claim.

The original image metadata constructor uses a fixed empty literal at `56fe6b`. Its reached wide-string behavior is implemented exactly; this helper does not claim to reconstruct arbitrary nonempty `4066c0`/`40b710` operations. Allocation-failure reporting still reaches explicit `handlers.allocationFailure4a1fe0`; normal allocation succeeds in the current proofs. The game debug reporter is an open game boundary, not a platform service.

## Evidence and verification

Retained procedure assemblies3801/3803,3822..3840,3848..3882,3893 and the relevant original table reads support these modules. `tools/verify-game-image-format-instructions.mjs` matches2400 fixtures over12 entries:1,531,457 interpreted steps and1019 reached instructions. These cover types0/1/2/3/8, packed widths, default/custom masks, half and float access, representative signed-zero/infinity/NaN inputs and in-place aliases.

`tools/verify-game-image-storage-instructions.mjs` matches600 independent fixtures over nine entries plus80 persistent construction→allocation→write→read→release chains:1000 operations,262,896 interpreted steps and1039 reached instructions. The persistent chains currently use RGBA32 images and keep the same stack and allocator state throughout. All mapped bytes at or above `10000` are compared after every operation, including freed storage and stale mask fields. Ordered non-memory CRT/platform requests are compared for the leaf fixtures. Private stack is not directly compared; its consumed image writes are included.

Focused tests verify ownership across actual construction/allocation/access/release, aliased append after vector reallocation, RGB565 quantization, the native palette anomaly and half-conversion boundaries. Native instruction comparison is evidence of these retained instruction paths; it is not original-process runtime evidence or whole-renderer coverage.

## Connected conversion and texture graph

`4bcdb0` uncompressed conversion and `4bd770` row workers are now translated in `game-image-conversion.mjs` and `game-image-conversion-rows.mjs`. Native job captures, ownership/refcounts, vector moves, quota/affinity policy, row partitioning and await/destruction order are translated in `game-image-jobs.mjs` and `game-image-workers.mjs`. Genuine C++ STL async/future construction and virtual services remain explicit library boundaries with actual game worker callbacks.

`408680`, its separate `408c23` publication tail, padding, graphics-settings singleton, default mipmap construction, allocating image copies and resampling are now connected and verified. `weather-initialization.mjs` defaults successful `401b70`/`401be0` loading to the actual texture constructor. See [texture construction and startup](game-texture-construction.md) for APIs, producer stack dependencies, all proof domains, installed-JPG integration and remaining image/render work.

Compressed conversion `4c6c60`, image-copy rotation/compositing, allocation-failure debug reporting and general nonempty metadata constructor strings remain explicit game gaps outside this weather texture path. Float resampling is verified for finite colors; NaN arithmetic payload propagation is not certified. The original renderer allocation/upload interface is virtualized explicitly; no hardware-renderer or original-process execution is claimed.
