# Connected vehicle physics parent

`tools/verify-simulation-vehicle-connected-instructions.mjs` compares the actual `4749e0` parent and its reached game callees with `stepSimulationFrame`. Its default run uses 80 constructed worlds, each retained for eight successive frames, with one or two populated vehicles. Approaching vehicles generate genuine pair events; wheel answers come from the actual frame candidates and terrain queries.

The comparison uses Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. It admits retained procedure assemblies, original literal/table bytes, and the byte-checked `41e080` Listing. The report records their evidence IDs. Only the compiler cookie equality check is an external service. This is interpreted native evidence over constructed inputs, not an observation of the original process.

## Raw wheel bridge

`src/raw-vehicle-contacts.mjs` exports:

- `updateRawVehicleContacts(bodyAddress, runtime)`: actual `488910`, including its `488f00` preparation and `488e20` terrain/model selection.
- `buildRawWheelProbe(bodyAddress, descriptorAddress, contactAddress, queryAddress, runtime)`: `4890a0`.
- `resolveRawWheelContact(bodyAddress, descriptorAddress, fraction, queryAddress, outputAddress, contactAddress, runtime)`: `488bf0` and `488d20`.
- `writeRawWheelAngularProbe(firstAddress, secondAddress, outputAddress, runtime)`: sequential `488820` cross-product stores, including input/output aliases.

The runtime supplies `{memory, views, grid, scratchBase, roundingMode}`. `scratchBase` is the entry ESP of the function being called. The `488910` bridge consumes the existing candidate arena through body `+154/+15c` and `+158/+15e`; it does not build an independent wheel candidate array. `wheelRuntime` selects this bridge in `updateVehicleWheelFrame`. Terrain and model work delegates to the actual raw query implementations.

For full-parent entry ESP `S`, the wheel/contact, drive, and traction-force entries are `S-56`. `488910` locals begin at its entry minus 124. Those addresses matter because query output, fractions, helper locals, and later calls reuse native stack storage.

All four terrain probes execute before the four model probes. The terrain limit is `0x1010000`; the model limit is 65536. A model result whose unsigned time is at least the terrain fraction restores only the flags, retaining other model-mutated payload. Missing contacts preserve stale normal fields, set the distance to -1, and clear the wheel flag byte. A successful hit sets bit 0 while retaining other bits. Body `+64f` changes only after a successful orientation attempt; two misses preserve its previous byte. Material lookup follows the native resource pointer rather than a replacement material result.

New probe evidence is retained as requests `1540`–`1547`: `488bf0`, `4890a0`, `488d20`, and `488820`, alongside the existing parent/contact evidence. Their assembly evidence IDs are `ev_ce437165948687fe4fcfa01e3521e4c97afb3f265d12ab08f2f8b16190e72ff4`, `ev_fc49be06823249be99f91e71988159bf411b355eadf76af2078707259abae434`, `ev_809ab050bac7a20e6ea8d4553b608ad5ef1b2b8dc05a1f088e5d97ed2070e053`, and `ev_3d8717e5441a0b57847421de6b3b164794867928490c89cbccabed8ded37d406`.

## Shared state found by the connected comparison

The full comparison exposed writes that isolated numerical checks did not consume. Optional native-state hooks now publish the original packed and floating rotation caches, unextrapolated shape-transform outputs, and root/normalization globals. The floating matrix is nine binary32 stores at `91cdc0` with 16-byte row stride; its padding remains untouched. Shape transforms preserve the native packed source DWORDs, including padding.

Pair contact storage shares the preceding static-query stack record. A nonpenetrating pair hit can retain its scalar. The `475630` call also saves the filtered event delta with `PUSH EBP` at `S-40`; the following refresh can read that same word as stale contact storage. The source adapter preserves this producer and reuse through `beforeInvalidate`, rather than replacing the scalar with a chosen constant. Both initial and refreshed pair queries use their actual stack locations and live auxiliary-vector aliases.

Vehicle preparation views now expose byte aliases `+64f/+654/+655` and signed speed `+664` directly in the common memory buffer. No copied synchronization step is involved.

## Validation and limits

The final report is [simulation-vehicle-full-parent-instruction-check.json](../analysis/simulation-vehicle-full-parent-instruction-check.json): 640 calls, 9,810 reached instructions and 39,500,587 instruction steps, with every byte from `10000h` through the end of the 10 MiB memory buffer compared after every frame. No differing addresses are excluded. The run generated 123 processed contacts (43 pair, 80 static), 3,302 wheel contacts, 166 actual `41e080` collision-filter calls, 423 rear-particle emissions, 2,240 debris emissions, and 14 skid segments.

Fixtures vary mass, inertia, upright/yaw/inverted orientation, steering, drive input, material category and effect quality. Complete particle/debris pools allow actual allocation and spatial registration. An explicit matching external clock advances 17 units per frame. `tools/lib/simulation-vehicle-fixtures.mjs` builds coherent views and registrations over the same raw memory; its setup is declared synthetic upstream input.

Five focused tests cover sequential cross-product aliasing, actual wheel hits, missed-side/stale-normal behavior, live preparation fields, and a 32-call connected native comparison. The 44 directly affected Node tests pass. Rechecks also pass: ordinary full parent 240 fixtures; shape cache 2,500; sphere collision 8,000; body-pair query 4,000; vehicle assists 3,000.

This does not establish the native `41dbb0` vehicle constructor or model/controller/profile/input setup lifecycle. Those pointers and parameters remain explicit fixture producers. The vehicle cases here use terrain; the separate model-contact oracle covers model classes and effects, but does not prove all vehicle/model combinations. Outer race-loop input scheduling, special vehicle modes and all callback alias combinations remain beyond this report. Persistent physics frames and reached effects are verified; a complete playable game is not claimed.
