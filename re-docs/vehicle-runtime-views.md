# Coherent vehicle wheel runtime views

`src/vehicle-runtime-views.mjs` connects the structured wheel references to the recovered raw wheel effect routines. Its properties read and write the same supplied `Buffer`; it does not initialize native vehicle state or synchronize copied structures.

```js
const views = createVehicleRuntimeViews({
  memory,
  bodyAt: respawnRuntime.bodyAt,
  vehicleStateFor: respawnRuntime.vehicleStateFor,
  materialAddressFor: parsedSurface => suppliedMaterialAddresses.get(parsedSurface.offset),
});
const vehicle = views.vehicleFor(bodyAddress);
updateVehicleWheelFrame([vehicle], {
  data, grid, modelContext,
  effectRuntime: {views, driveScratchBase, forceScratchBase},
});
```

The caller supplies native storage, body addresses, pool/registry/configuration pointers and any mapping from parsed resource metadata to native material addresses. Unknown material addresses throw. `materialAt(address)` returns a live view of the material's packed flags/category/grip fields. An optional `materialAt` factory lets callers preserve an existing material object identity; its numeric fields are still bound to native bytes. This is a resource address mapping contract, not a substitute terrain or effect algorithm.

`bodyAt`, `stateFor`, `driveFor`, `driveContextFor`, `timeOptionsFor` and `vehicleFor` are the returned accessors. Supplied respawn body/state/wheel identities are retained and decorated. Existing nonconfigurable live accessors remain intact; copied `body.bytes` buffers are rejected. Existing nonconfigurable accessors must already alias this memory, as the supplied respawn views do. Native arrays retain fixed spans and support normal array reads, element writes and whole-property assignments.

## Storage and aliases

Descriptors are inline at body `+180h`, four 28-byte records; contacts are at `+1f0h`, four 76-byte records; wheels are at `+324h`, four 200-byte records; gates are at `+3dc8h`, six 28-byte records. All fields used by direction preparation, contact-side preparation, suspension, drive, wheel forces, assists and special-state forces have live native views. The complete wheel/effect field table is in [wheel effects](wheel-effects.md).

Descriptor `cellRef` is `+14h`, and `surface` follows the native pointer at `+18h`. Gate status and the six following DWORDs can be accessed both by named fields and the existing `payload` array. Wheel flags/spin created by `createRespawnRuntime.vehicleStateFor` remain the same accessors and objects after extension.

Drive configuration aliases the original body locations verified by `tools/verify-wheel-drive-instructions.mjs`: input byte `+64e`, counters `+658/+65a/+65c`, Q12 scale `+2f3a`, effect parameter `+668`, reduction `+6b0`, multiplier `+650`, capacity offset `+3cf8`, override `+3d04`, front/rear drive `+6a8/+3cf4`, spin threshold `+3cfc`, special timer `+3d08`. In particular, drive `effectParameter` and body `speed668` share one signed short; drive `multiplierQ16` and state `field650` share one DWORD. The remembered contact side, reverse-steering byte and body `+64f` also share storage.

The view includes common body dynamics parameters, quaternion derivative and inverse-inertia matrices. `state.bodyRadiusQ8` resolves the actual aggregate shape query: `[91e79c] + byte(body+145h)*48h +40h`. It does not recompute a radius from guessed shapes. `state.activeTag` reads body `+10c`, `wheelRangeQ8` reads `+320`, and the airborne counter reads `+66e`.

Drive context follows the current session pointer `[5ecb1c]` and configuration pointer `[5ecefc]`. Replacing those pointers changes subsequent reads. `vehicleFor` also exposes live steering and registered-cell references and re-reads special-time globals when its `timeOptions` property is accessed. Spatial registration, model context and active special-mode track context remain explicit caller inputs where reached.

## Native effect bindings and scratch

`effectHandlers({body,scratchBase,positionAddress,directionAddress})` returns the actual traction, rear-emission and surface-debris callbacks. `body` can be supplied once or obtained from callback arguments. `scratchBase` denotes the **effect callee's** entry ESP. Optional `tractionScratchBase`, `rearScratchBase` and `surfaceScratchBase` override it per routine.

Only the caller's two temporary rear-emission vectors are serialized to the supplied addresses. Body, wheel, contact, drive and gate state is never copied. The default path in `updateWheelDrive` accepts `{effectRuntime:{views,scratchBase:S}}`, where `S` is entry ESP of `41c080`, verifies body/state/drive identities, and derives:

| Native location | Address relative to `41c080` entry ESP |
| --- | --- |
| Parent frame after locals and four saved registers | `S-5ch` |
| `41c720` entry ESP | `S-74h` |
| `483b90` entry ESP | `S-90h` |
| `436630` entry ESP | `S-70h` |
| Temporary position vector | `S-18h` |
| Temporary direction vector | `S-24h` |

The whole wheel frame uses `environment.effectRuntime = {views,driveScratchBase:S,forceScratchBase:F}`. Its post-force surface default enters `42c590` at `F-48h`, derived from `499e90` locals/saved registers and CALL. Explicit effect callbacks continue to override the defaults. Storage and scratch must describe the caller's declared native layout; arbitrary saved-register stack remnants are not a general public output contract.

## Connected validation

`node tools/verify-vehicle-runtime-views-instructions.mjs` passes 1,200 fixtures comprising 1,800 actual suspension calls, 1,800 actual drive calls through the new source defaults, and 1,200 global force/surface calls. It interprets 3,279 unique retained instructions for 14,286,903 steps. Reached effects include 3,900 traction calls, 1,021 rear-emission attempts, 750 allocated rear particles and 3,842 surface debris records.

The checker executes actual `488370 → 41c080 → 483b90/436630`, then `499e90 → 42c590`, including all reached arithmetic, allocation, spatial and color callees. There are no mocked callees. It compares full vehicle regions and skid/particle/debris/free/active/spatial storage, RNG/frame globals and consumed renderer outputs. It excludes only the two unconsumed padding bytes copied from incidental helper-stack remnants. New independent `488820` cross-product assembly is retained as `analysis/native-simulation/results/870-wheel-runtime-cross-assembly.json`; other evidence is enumerated in `analysis/vehicle-runtime-views-instruction-check.json`.

`node --test tests/vehicle-runtime-views.test.mjs` passes six focused tests. They include actual contact selection and suspension feeding default drive effects, plus the ordinary vehicle frame selecting synthetic terrain contacts and producing both rear particles and surface debris without effect callbacks. Tests also check existing respawn identities, mapped material pointer writes, dynamic session pointer reloads and storage rejection. These are synthetic fixtures and static-instruction matches; installed runtime construction and original-process execution are not claimed.
