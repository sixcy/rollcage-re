# Vehicle contact-color controller

`src/vehicle-contact-colors.mjs` reconstructs the `482990` byte-wave/color update and its actual `4820f0`, `482590` and `482680` producers. The session parent `47ea40` publishes the selected model at `713184`, calls the topology constructor, then constructs six controllers at `8495e0` with `8c`-byte stride (`47ed7e..47eda0`, retained2457). The vehicle constructor later associates participant bodies with these controllers. This is a bounded closed branch of the unfinished `48d7c0` weapon-stage graph.

Shared-memory exports:

- `initializeVehicleContactColorTopology(runtime)` reads the native model root and uses the explicit CRT service `runtime.handlers.allocate(size,runtime)` for adjacency and directional lookup storage.
- `initializeVehicleContactColorController(owner,runtime)` allocates the two renderer-record arrays and the color tail. It deliberately preserves status/timer fields the native constructor does not initialize.
- `activateVehicleContactColors(record,runtime)` claims the first free controller when the body has the `ffffffff` sentinel, then initializes its active state and invokes the actual effect/sound dispatcher. It returns native EAX0/1. The exhausted-pool guard is conditional on native network flags; no invented fallback is supplied for the invalid pointer path outside that guard.
- `updateVehicleContactColors(record,runtime)` advances the signed-byte wave in two passes, then computes colors through actual `407190` (`scaleWormholeColor`). The separate existing `applyRawActiveVehicleEffect` (`482730`) injects impacts using the constructed directional lookup.

The topology producer reads one-based triangle bytes, appends neighbors in authored order and removes duplicates. Its row stride is eight bytes although the allocation reserves 32 bytes per vertex; there is no inferred row-capacity clamp. Direction selection normalizes 64 grid directions and model normal vectors using binary32 operations and explicit x87 conversion rounding. The model root and count reloads around allocation and triangle processing follow the retained instructions.

The update preserves signed byte reads, WORD staging at `713100`, velocity damping toward zero, a native packed-color comparison that differs from an ordinary per-channel clamp, and the distinct RNG stream at `5ec958`. Color destinations can overlap controller bytes, scratch words or the RNG state. Pointer and value captures preserve the resulting order.

Validation:

- `node tools/verify-vehicle-contact-colors-instructions.mjs`: 4,000 mixed fixtures plus256 persistent ticks,4,256 calls,279 reached instructions,10,749,543 steps; all mapped bytes at/above `10000h` compare after each call. Includes output overlap into wave/velocity/pointer/scratch/RNG storage.
- `node tools/verify-vehicle-contact-color-construction-instructions.mjs`:120 topology fixtures,1,200 activation boundaries and24 full topology→controller→activation→actual impact→32-tick wave sequences;2,184 calls,1,021 reached instructions,12,308,600 steps. All mapped bytes compare. Only CRT allocation/memset and compiler-cookie services are supplied. Actual sound dispatch executes against an explicitly empty bank; populated audio device behavior is covered separately by sound-module checks.
- Ten focused module tests plus two narrow interpreter tests pass. The interpreter change only admits XMM5/XMM6 in the already supported scalar move/copy/arithmetic forms required by `4820f0`; unsupported registers and vector forms remain rejected.

Reports are `analysis/vehicle-contact-colors-instruction-check.json` and `analysis/vehicle-contact-color-construction-instruction-check.json`. The model, texture storage, session and allocator inputs in these checks are synthetic. No installed files were changed and no original process was executed. The selected model's complete asset/session-loading chain and render consumers of these arrays remain outside this bounded result; the original session call sites establish their ownership.

Evidence for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

- `482990`:3213, `ev_d4ea05b0b85b3f0b553bbbedd69223406b3769beec67ee2395db85f3f727e679`.
- `4820f0`:3255, `ev_8f1aa1e084c8d98e0de76441084c6167c3eb523f2c8eab571bced976473604c7`.
- `482590`:3263, `ev_36a241bc0843f9a4880b0e80f7be9782e1450c9c111baeb4396e20b617e58c8a`.
- `482680`:3257, `ev_5694c8ebae0e76ee886bc972ce8eff82aa0e2755efd058fb799642edc0df7f8e`.
- `407190`:3221, `ev_1fb27ddc5d57181c8b1a7c17a8cad4879539a92317cf669aca2e5328cc7eedc2`; implementation is reused from `wormhole-visuals.mjs`.
