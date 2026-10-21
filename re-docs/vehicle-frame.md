# Vehicle assists and frame stage

`src/vehicle-frame.mjs` connects the recovered wheel routines, post-wheel assists, special-state forces and physical-body derivative refresh. `src/vehicle-assists.mjs`, `src/vehicle-special.mjs` and `src/track-basis.mjs` supply the new numeric stages. This does not advance body positions or process collision events; it reconstructs the stage observed at `0x475760` and its vehicle caller `0x47ab30`.

## API and native order

`updateVehiclePhysicsStage(vehicles, bodies, environment, handlers)` runs the wheel/post-wheel stage, then refreshes derived state for every physical body whose flag 0x8000 is clear. The physical-body list can include nonvehicles. `updateVehicleWheelFrame` performs only the vehicle stage; `runVehicleWheelStages` exposes its scheduling boundaries for independent checks.

Each vehicle supplies `body`, `state`, `drive`, explicit steering/reversal, its registered cell reference, optional spatial registration, drive context and track progression context. Environment supplies the decoded level data, collision grid and model context. Callers own controls, registration, timers and object lifetimes. The wrapper does not infer runtime registration from a synthetic position.

The first four passes process the whole vehicle list: steering directions, contacts, suspension, then drive. Next all traction forces are accumulated, followed by all surface-particle calls. Finally each vehicle runs rest clamp, air-spin damping, orientation assistance and special-state processing in that order. The native tail retains the current vehicle pointer across those four calls. Afterward `0x475760` refreshes derivatives over the physical-body list.

Effects remain explicit handlers: traction effects, emission constructors, surface particles, breakable contacts and the special transition event. The special routine's track basis defaults to the recovered level-data reader. Empty vehicle fields still pass through the global-force scheduling boundary. The helpers do not fabricate native pointers.

## Rest and airborne assists

`clampVehicleAtRest` ports `0x47ac50`. With drive multiplier zero, all four wheel flag **bytes** must be nonzero. This differs from testing their contact bits. It compares wrapped sums of native absolute momentum components to inclusive thresholds: 8,000 linear/angular with input byte zero, or 38,000 linear and 48,000 angular otherwise. A clamp zeroes both momenta, subtracts spin from each angle and clears spin. It preserves the native signed-overflow behavior rather than replacing the sums with floating-point magnitudes.

`dampAirborneSpin` ports `0x47ada0`. It requires abs(rotation[5]<<4) >=60,000, abs(angularMomentumY) >=8,000,000 and no contact bits. Failed eligibility resets the byte counter at vehicle +0x66e. Eligible frames increment it as a byte; only a result above 30 clamps it to 30 and removes truncated-toward-zero momentumY/32. Thus 255 wraps to zero without damping.

`assistAirborneOrientation` ports `0x47ae30`. With no contact bits, it crosses the body's second rotation column with the nearest signed vertical direction. A measured cross length <=512 does nothing. Otherwise the normalized cross supplies half an impulse while every angular momentum component loses its arithmetic-shifted value >>7. With non-contact flag bytes such as 8, the rest clamp can run and orientation assistance can add angular momentum immediately afterward; that sequence is preserved.

`verify-vehicle-assists-instructions.mjs` interprets 452 retained assist/math instructions. Three thousand declared states are checked for each assist and their sequence: 12,000 comparisons of the entire 1,792-byte region, no helper stubs. Reports include threshold, flag-byte, signed-overflow and byte-wrap cases.

## Special-state routine

`updateVehicleSpecialState` ports `0x41e510`, using shared drive fields `capacityOverride` (+0x3d04) and `specialTimer` (+0x3d08). Initial state zero returns immediately. State 1 increments the signed timer, triggers event code 2 at timer 22, and transitions after 25 to state 2/timer zero. State 2 transitions after 40 to zero. The current call continues into basis/force processing after these transitions, including the call that clears state 2 to zero.

The basis provider returns tangent and normal vectors, or null. With more than one active wheel and summed normal length >0x8000, normalized wheel normals override the basis normal. State 1 applies normal times 0x400000. Other active-entry states use the reduced/normalized tangent, the body's forward column, dot/cross products and the native `(dot+0x11000)<<6` scalar/sign calculation. A reduced tangent length below 32 exits without damping. Applied impulses accumulate into the body's angular-increment vector (`torque`); linear/angular momentum each lose their arithmetic-shifted value >>3.

`verify-vehicle-special-instructions.mjs` matches 526 retained instructions on 4,000 fixtures, including all 16,384 vehicle bytes and event/provider order. The basis is supplied as explicit synthetic vectors and the event is a deterministic mutation callback. These checks verify the caller's arithmetic and contracts, not the original event implementation at `0x47d900`.

## Level track basis

`readVehicleTrackBasis(data, grid, registeredCell, context)` ports `0x417210`, its axis policy `0x44a1c0` and route sign `0x449cd0`. Context explicitly supplies mode, progression byte and route index. Negative registered references return null.

The default path chooses neighboring grid vertices along rows, handling the bottom boundary by looking backward. Mode 11/12 policies can choose horizontal neighbors with right-boundary handling, or force a direction based on sector/row/progression thresholds. The default sign comes from a wrapped signed dot product against the selected 20-byte route record's three signed shorts at +12/+14/+16. Those route records start at GFXM +0xa0. Tangent differences shift left 12; retain the native sign convention rather than changing it to a generic forward-facing vector.

The selected packet's u16 +2 indexes the existing collision normal table at GFXM +0x34. Packed signed ten-bit components expand to Q16 with <<8. Native `0x90b98c` points to a runtime global pack, not directly to the GFXM header: its member +0x1c resolves this collision normal table. Preserve that indirection distinction.

`verify-track-basis-instructions.mjs` matches all 262 retained basis/policy/sign instructions on 4,000 synthetic grids and contexts, with no helpers stubbed. Cases include bottom/right boundaries, mode-specific row thresholds, absent registrations and signed-short/dot wrapping. `validate-track-basis.mjs` then exercises all 817,040 covered installed cells plus 18,180 sampled policy queries in all 80 levels, with 399 sampled instruction matches and no failures. Route index zero and progression inputs are declared; runtime player progression has not been captured. There are 104 zero tangents, retained without guessing replacements.

## Scheduler and installed-data checks

`verify-vehicle-frame-order-instructions.mjs` matches the 78 scheduler instructions and 22 derivative-parent instructions for zero through sixteen vehicles/bodies. Every stage callee is an explicit event mock, so this verifies ordered calls, body pointers and the derivative flag guard. Callee numeric behavior is checked independently by the component verifiers.

`node tools/probe-vehicle-frame.mjs` exercises the connected code on all 80 level packs: 1,220 batches /3,636 synthetic vehicles. The three declared profiles are upright/stationary, a quarter X turn with airborne spin, and a quarter Z turn. They use recovered geometry/configuration/coefficients and explicit registered cells, progression, controls and special timers. Results: 7,232 wheel contacts, 20 rest clamps, 148 air-spin dampings, 196 orientation assists and 2,428 special-force applications. All 122 sampled basis instruction checks pass.

Destruction, emissions, particles and transition events are explicitly inert in this probe. Traction effects model only their disabled-context cache write. The probe verifies bounded integer outputs through derivative refresh; it does not step race time, advance pose, resolve collisions, or establish runtime equivalence. The first corpus attempt exceeded the interpreter's reserved normal-table region; widening that test allocation resolved it, and all packs then passed without source algorithm changes.

At this milestone, all 112 focused tests passed. Reports are `vehicle-assists-instruction-check.json`, `vehicle-special-instruction-check.json`, `track-basis-instruction-check.json`, `track-basis-catalog.json`, `vehicle-frame-order-instruction-check.json` and `vehicle-frame-probes.json` under `analysis`. REA replies through `272` are retained in `analysis/scene/vehicle-post-wheel-evidence-bundle.json`. Subsequent [collision work](collision-events.md) adds queueing, pose wrappers and static response separately; this corpus probe still stops at derivative refresh. Original files remain unchanged; the original executable has not been run.
