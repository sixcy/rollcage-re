# Final-substep lights and surface feedback

The two final-stage calls in450e50 have separate roles. `44d960` advances dynamic colored lights and their terrain registry on every substep, with queue/age maintenance enabled only when ECX is zero. `42b530` derives two device feedback effects from terrain/material and signed vehicle speed on the final substep. Neither routine samples new input or drives replay.

## Dynamic lights

`src/dynamic-light-state.mjs` exports `updateDynamicLights(intermediateSubstep, {memory, scratchBase, handlers})` for the complete44d960 parent. `scratchBase` is native entry ESP. Zero performs final-substep maintenance; any nonzero argument skips that maintenance while still advancing light colors and attachments.

The runtime pool uses64-byte slots at80f520, count80f20c and forward search index80f214. Slot zero is the sentinel. The native allocation scan ends at8106e0; exhausted allocation returns zero. Its high-water update increments the old count by one when the selected free index is at or beyond it; it does not substitute `selected+1`. The retained focused test covers this distinction. Actual48ef30 storage/reset,48eeb0 attenuation and44e220 authored constructors now produce the pool ownership, sector band tables and search index; see [dynamic light construction](dynamic-light-construction.md). Loaded-map metadata and underlying arena/heap storage remain explicit upstream inputs.

The final-substep branch decrements nonzero refresh words, ages the three-bit dirty-range lifetimes and removes expired dirty entries using reverse traversal/tail replacement. It consumes the exact36-byte queued records at8106e0, copying live position/color/mode/variant/lifetime/payload fields through actual allocation before clearing810920. `appendBodyPositionEffect`436410 and `appendRawBodyFlash`436490 are existing actual producers; the instruction checker executes both before selected final-substep cases, then consumes the resulting queue through44d960. Five queued position/attachment records per body are produced separately by [body attachments](body-attachments.md), whose type1 output writes90b688 in eight-byte records.

The first pass handles all native type branches: palette animation1, deterministic fade2, RNG fade3, body-follow5/7, vehicle pulse8, and unchanged unknown/inactive types. Expired last slots contract the count once. RGB field writes preserve or replace the native upper color byte according to each branch. Type3 uses the cached seed until an explicitly refreshing path reloads it. Type8 uses the original yaw table and signed body fields, writes the complete integer/float renderer scratch, transforms the authored short offset through actual4334b0, and moves the light through actual44d8a0.

The second pass handles type1 scripted bodies or queued short positions. Scripted position integration and subsequent registration execute after the real scripted-body call. Queued positions preserve the actual stack layout: X is held separately, Y and Z occupy distinct native locals, and the outside flag cannot overwrite a fabricated contiguous vector. A four-byte mode argument remains pushed during44d230; this explains why the apparently shifted `[ESP+1c]` load for44d5b0 reads the loop index, not the saved slot pointer. The implementation and oracle exercise real cross-cell registration with that index.

Actual helper exports are:

| Export | Native entry |
| --- | --- |
| `allocateDynamicLight(positionAddress, colorAddress, mode, runtime)` |44d7a0 |
| `removeDynamicLightRanges(index, runtime)` |44d6a0 |
| `insertDynamicLightRanges(index, rangesAddress, runtime)` |44d5b0 |
| `updateDynamicLightPosition(index, positionAddress, runtime)` |44d8a0 |
| `updateVehicleDynamicLight(lightAddress, index, runtime)` |44df50 |

Registration stores up to four authored ranges and selects the first empty of eight cells in each16-row band. Full bands silently omit the new entry. Removal deletes only the first matching ID per band, appends a dirty range up to capacity64 and suppresses only a duplicate of the most recently appended value. Existing actual4286e0/4746f0 spatial selection and44d230 range expansion are reused; terrain rows/leaves/bounds/segments remain caller-owned mapped inputs.

Attached scripted bodies now call actual `stepRawScriptedMotion`476550 by default, including reached script release/effects and spatial updates; [the raw bridge](raw-scripted-motion.md) and [constructors](dynamic-light-construction.md) document their ownership. Optional `handlers.call476550({memory, ecx: bodyAddress, args: [], scratchBase})` remains a caller override for focused tests. The original light instruction checker below deliberately keeps that override as a mutation contract; the separate connected script/light checker exercises the actual default without game mocks. Full map loading and platform/render consumers remain broader runtime requirements.

## Surface feedback

`src/vehicle-surface-feedback.mjs` exports `updateVehicleSurfaceFeedback({memory, scratchBase, handlers})` for42b530. It uses the signed record byte258, so only2..127 are eligible. For each eligible record it decodes the body's packed11c terrain reference using signed row/column components. References outside the current terrain band use the average of four live material codes at198/1b4/1d0/1ec, with26 for null pointers; references inside the band select26 directly. It retains the factor's integer division and signed668 speed, then constructs two clamped float32 descriptors with types3 and4.

The first descriptor scales `min(signedSpeed*50,10000)`; the second reloads the record's body and signed speed after the first effect callback, uses the cached factor and a wrapping integer product/arithmetic shift. Device ID25c is read again for each effect. The actual407380 cache/create/update parent is the default, with the native20-byte by-value descriptor and exact nested entry ESP. The haptic constants initializer already maps the original scale/±1 bytes. Optional `call407380` is a focused caller override; the default contains no remaining game mock.

Required reached library services are the existing [vehicle haptic interfaces](vehicle-sound-controls-and-haptics.md): standard map operations/operator delete and device manager/effect virtual methods. The source issues no physical feedback or OS calls. Caller-owned settings/session/records/body/material/terrain/device/cache storage and their upstream producers remain explicit.

## Validation

`node tools/verify-dynamic-light-state-instructions.mjs`: **1,521 retained instructions**, **3,000 mixed parent/helper fixtures**, **2,157,190 interpreted steps**, PASS. There are1,000 complete44d960 calls and250 producer chains, each running both actual436410 and436490 first. All eleven watched actual entries execute;245 reached scripted-body calls are explicit mutation contracts and3,408 compiler-cookie checks are asserted. Full pool/queue/registry-band/body/dirty/RNG/renderer scratch bytes and script ordering compare. Cases cover exhausted pools, palette wrap, all native types, dirty age/capacity, full bands, same/cross-cell moves and queued versus attached sources. Ten focused light tests pass.

`node tools/verify-vehicle-surface-feedback-instructions.mjs`: **322 retained instructions**, **4,000 fixtures × 2 persistent calls =8,000 parent calls**, **1,560,913 interpreted steps**, PASS. The actual cache executes10,292 effect calls with9,684 descriptor deliveries,4,855 creates and4,829 updates. No game mock is admitted. Library/device contracts compare complete descriptor bytes, order and cache/body/session/record storage, including body/device replacement across effects. Five focused feedback tests pass.

Reports: `analysis/dynamic-light-state-instruction-check.json`, `analysis/vehicle-surface-feedback-instruction-check.json`. Main new evidence1160..1185; previous terrain/queue/haptic evidence is listed by ID in the reports. These are interpreted shipped instructions over synthetic caller-owned inputs, not original-process, hardware or rendered-light observations. Totals overlap reused terrain/haptic/queue helpers and must not be added as unique reconstruction coverage.
