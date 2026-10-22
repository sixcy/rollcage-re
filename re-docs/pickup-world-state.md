# Pickup construction, collection and respawning

`pickup-world-construction.mjs` and `pickup-world-state.mjs` reconstruct the pickup list/controller producers and the local `47b680` tick graph. This closes the corresponding bounded branch of the still unfinished `48d7c0` weapon-stage coordinator.

The construction exports are `initializePickupWorldTables(memory)`, `initializeWorldPickups(runtime)` (`47b580`), `initializePickupRespawnControllers(runtime)` (`431950`) and `initializePickupRenderRecords(body,runtime)` (`47c6c0`). Runtime supplies shared `memory`, native entry `scratchBase` and the ordinary CRT service `handlers.allocate(size,runtime)`. The actual common `4741c0`/`4798d0` body constructors and spatial removal are reused. The mode/option gate can publish a zero pickup count without allocating. The selected resource model and authored count are captured before allocation; controller construction runs as the native tail call with its own current roots.

Pickup objects reserve native554-byte base storage and controllers18c bytes, plus the model's actual expanded storage. Eight120-byte renderer descriptors retain the original texture copies, byte swaps, color writes and final RNG-load order. Queue initialization copies the original all-FF vector, including its separate low64-bit store. The source table initializer contains original body configurations from retained3298/3299 and the vector from3296; the checker independently matches these bytes with retained evidence.

The ordinary exports are `updateWorldPickups(runtime)` (`47b680`) and `updatePickupRespawnControllers(runtime)` (`4319f0`). Smaller exports expose `finalizePickupRespawn`, the four shared transition pairs (`43fa20/43fa80`), and physical-list swap removal (`46e940`). Collection rotates eligible pickups, checks empty vehicle slots, tests unsigned squared distance and preserves the native prediction quirk: X velocity shifted17 is added to all three distance axes. A successful collection removes spatial membership and calls the actual weighted award `47b920`.

Expiry queues a byte pickup index. Controllers consume it in order with a captured RNG seed, attach real script/spawn pointers, and join the physical list. Script opcode6 supplies the native controller timer/retirement states; the connected check executes actual `476550` opcode6/1 rather than writing those states as tick results. Completion positions the authored pickup, registers it spatially and emits16 actual `436920` particles. Repeated cycles exercise controller and oldest-particle reuse.

Validation:

- `node tools/verify-pickup-world-state-instructions.mjs`:1,800 mixed fixtures plus3,360 persistent ticks;5,160 calls,1,093 reached instructions,2,298,137 steps. Includes5,088 particle emissions,318 finalizations and72 weighted awards.
- `node tools/verify-pickup-world-construction-instructions.mjs`:360 constructor/renderer fixtures plus16 persistent360-tick sequences;7,864 calls,2,535 reached instructions,3,255,935 steps. These include96 actual finalizations,96 awards,1,536 particle emissions and1,728 scripted-body calls. Allocator-side pack-root changes and a renderer-body/RNG alias are included.
- Eight focused tests pass with `node --test tests/pickup-world-state.test.mjs`. The narrow interpreter `MOVQ` extension derives only the low64 bits of a known integer vector and still rejects unknown sources; two separate opcode tests pass.

Both comparisons check every mapped byte at/above `10000h` after every call. The only supplied services are CRT malloc/memset and compiler-cookie checking. The audio bank is explicitly empty and sessions are local/nonnetwork. Authored models, texture rows, script bytecode and session/arena storage are synthetic inputs; the original executable was not run. Reports are `analysis/pickup-world-state-instruction-check.json` and `analysis/pickup-world-construction-instruction-check.json`.

The additional `verify-weapon-network-connected-instructions.mjs` comparison runs actual terrain-wave launch packets and pickup-award packets through the recovered network router, peer sender, pending ring, accounting and performance clock. Six hundred successful nonhost sends match every mapped byte and the exact virtual-network/performance requests (1,174 reached instructions,568,879 steps). Genuine network objects and performance counters are supplied as explicit services; no real network was used. Host/local receiver, failed-peer retirement and blocking-wait branches remain separate work.

This connected comparison exposed a real producer dependency. Native `47b8af PUSH6` leaves the DWORD at collector-entryESP minus92. It becomes `47b920` packet `+8`, whose upper bits are deliberately retained. The source now writes that actual surviving argument at its producer point and uses the true router entryESP (collector frame minus84). Without it, synthetic stale high bytes leaked into the retained notification packet and its checksum. The test covers the consumed payload, not only the final awarded slot.

The distinct `47c4c0` presentation caller and its `490a90` drawing chain were retained for ownership context, not translated here. Complete asset/session loading remains a separate parent scope.

Key retained assembly, all for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

- 3209 (`47b680`), `ev_116e9bdbdf1d7132e1eeaaa6407755631dcde70caa3cfd709527f558ef57c066`.
- 3225 (`4319f0`), `ev_edcbfa09a9371cfc9afa6563490757448e6eb48894a9cd7005c20441589c1d62`.
- 3247 (`47caf0`), `ev_fb05ed4acb94a7b36d997b4ee64b44d22aa94526ccc7c9211dda4c2f51b7691d`.
- 3285 (`47b580`), `ev_3d5b87ed05470f4c1ab4168f2988634c8183e547dcc2ae30c88e47476956b391`.
- 3287 (`431950`), `ev_511822e3d6478d2d446a64363129dd2973839a9cab93c985e5f008b65e2428be`.
- 3291 (`47c6c0`), `ev_71ffc6351cfabc2f7c3f70c11f9b2f3ae5ebeae699bd752c1b6c52304421303a`.
