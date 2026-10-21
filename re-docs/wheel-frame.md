# Connected wheel drive and forces

`src/wheel-drive.mjs` ports steering-direction preparation `0x41d680`, the complete per-wheel drive caller `0x41c080` with explicit effect hooks, and its common capacity/classifier helpers. `src/wheel-forces.mjs` adds traction correction, torque damping and momentum accumulation from `0x499ff0` /`0x499e90`. Together with contacts and suspension, these form a connected numeric wheel path. [The vehicle frame stage](vehicle-frame.md) now adds post-wheel assists, special-state forces and derivative refresh. Pose integration, collision response and complete race scheduling remain separate.

## Native stage order

Frame routine `0x47ab30` runs each of the first four stages over all vehicles before advancing to the next stage. It then applies wheel corrections globally, followed by additional per-vehicle stages. Preserve this ordering when reconstructing a complete multi-vehicle frame.

| Order | Native routine | Current boundary |
| --- | --- | --- |
| 1 | `0x41d680` | Prepare front steering and rear drive directions. Ported numeric outputs. |
| 2 | `0x488910` | Wheel contacts and remembered-side attempts. Connected to terrain/model queries. |
| 3 | `0x488370` | Suspension impulses and caches. Ported. |
| 4 | `0x41c080` | Drive preparation, spin resistance, traction and effect dispatch. Ported with explicit effect callbacks. |
| 5 | `0x499e90` | Apply adjusted traction/torque to each body, then call surface-particle routine `0x42c590`. Numeric accumulation ported; particles remain external. |
| 6 | `0x47ac50` | Rest clamp: low momentum and wheel spin handling. Ported. |
| 7 | `0x47ada0` | Delayed airborne angular damping. Ported. |
| 8 | `0x47ae30` | Airborne orientation assistance. Ported. |
| 9 | `0x41e510` | Special-state transitions/forces. Ported with explicit event hook and recovered track basis. |

The earlier drive probe processes isolated declared bodies. The newer frame probe uses batches of up to three vehicles and preserves this stage order, while effect implementations, collisions and race behavior remain outside its scope.

## Steering directions and constructor values

`prepareWheelDriveDirections(body, wheels, steeringAngleQ16, {reverseSteering})` uses the verified original cosine lookup. Front local direction is `[cos(angle-pi/2),0,cos(angle)]` with the native angle constant `0x19220`, shifted/wrapped to Q12 shorts before the integer matrix transform. Reverse steering negates the input angle. Rear direction comes directly from body rotation entries 2,5,8. Both directions retain the component threshold, optional >>3 reduction, native length lookup and reciprocal-then-product normalization. Separate vector copies fill all four wheels. Native render scratch globals are not shared by the structured implementation.

`node tools/verify-wheel-directions-instructions.mjs` matches 3,000 synthetic cases against all 457 retained preparation/math instructions, comparing the full 1,792-byte vehicle region. Cases include steering reversal, orthogonal/diagonal rotations and wide signed-short matrices. The native scratch conversions also execute in the bounded interpreter; only the security-cookie check is stubbed.

`readVehicleDriveConfiguration(variant, {specialMode})` reads seven supported ordinary rows at `0x5eacd0`, or the special row at `0x5ead40`. `recover-vehicle-contact-template.mjs` verifies all 128 bytes against the selected PE and Ghidra, recording file offset 2,006,224 in `src/vehicle-contact-template.json`. It returns constructor defaults and per-row rear drive, capacity offset, spin threshold and retained `field3d00`. Controls and later tuning can change these values; the reader does not recreate the whole constructor or its allocations.

`initializeWheelForceCoefficients(body, state)` recovers the two numeric coefficient writes in `0x41caf0`: squared Q16 descriptor distance times body mass -> wheel +0xbc (`torqueScaleQ16`), and reciprocal of its native Q16 root -> +0xc0 (`correctionScaleQ16`). Render-object allocation, wheel mesh construction and other initializer fields remain outside this function.

## Drive caller and effect boundary

`updateWheelDrive(body, state, drive, context, options)` preserves opposite-wheel contact gating (`index ^1`), front/rear drive terms, spin clamps, drive-shift adjustment, control scaling, resistance, airborne updates and traction calls. The special-mode 3/2 numerator affects only the branch that divides by spin after the threshold is reached. It does not scale the unchanged low-spin base term. Signed wrapping and native absolute-value behavior are retained.

Active wheels need an explicit `onTractionEffects` handler. It runs after measuring slip and before capacity reduction/correction and spin advancement, matching `0x483b90`'s call position. That native helper writes wheel +0xc4 even when its optional effects are disabled; it can also update effect state and call further routines. The port exposes the boundary rather than assuming no state changes. `solveWheelTraction`'s optional final callback supports this ordering.

Rear bookkeeping uses six 28-byte effect slots beginning at vehicle +0x3dc8. For wheel index `i`, the first slot is `i` and the second is `i+2`; the two streams overlap. Missing surfaces and categories 5/6/8/9 reset both statuses to 1. Other categories may call `onEmitEffect` with the selected packed color and `trunc(signedShort(effectParameter)/10)`, then may emit a skid record with color `0x704040` and parameter -1. The first emission requires the native float32 threshold 3.2 and a nonzero selected color. NaN follows the native unordered comparison path.

Emission position is body position plus wheel +0x28, the cached probe lever arm. It is not wheel +0x1c's selected relative hit. Both emissions share mutable position/vector arguments, so callback changes from the first call remain visible to the second. The callback owns record payload construction; the original `0x436630` routine remains unported.

`node tools/verify-wheel-drive-instructions.mjs` matches 3,000 fixtures against 851 retained caller/helper instructions: all 16,384 vehicle bytes and ordered callback arguments agree. Fixtures cover 5,996 active /6,004 airborne wheels and 1,291 emissions. The two effect callees use explicit deterministic mocks, including mutations of wheel state, effect payloads and shared vectors. This verifies dispatch and arithmetic under those modeled contracts, not the original effect implementations. The first comparison exposed the effect-position offset mistake; the port was corrected before validation.

## Traction forces

`correctWheelTraction(wheel, body)` first computes the lever-arm/correction cross product. Torques with measured length <=1,000 become zero without modifying the linear correction. Larger torques produce a scaled second cross-product adjustment to the correction. Vector rescaling preserves the native OR-of-absolute-components leading-zero reduction before root measurement.

The torque direction then passes through the body's world inverse-inertia matrix, and its measured response supplies the original damping denominator with wheel +0xbc. `applyWheelTractionForces(body, wheels)` sums corrected impulses only from active wheels into momentum/angular momentum, retaining wrapped sums. It does not overwrite the wheel's cached correction with its adjusted local copy.

`node tools/verify-wheel-forces-instructions.mjs` compares 675 retained instructions on 2,000 batches containing zero to four vehicles: 4,000 vehicles, 8,000 active wheels and 1,141 small/zero-torque cases. Every byte of each 2,048-byte vehicle region and the ordered post-force callbacks matches. Only `0x42c590` is modeled as an inert event; its particles and random-state changes remain unverified.

## Installed-data exercise

Run `node tools/probe-vehicle-contacts.mjs --drive`. This writes `analysis/vehicle-drive-probes.json`, preserving the earlier stationary contact report. It adds declared forward velocity, three control/steering profiles and four starting-spin profiles to the same 7,188 terrain/model-aimed positions across all 80 levels. Geometry, drive table rows and mass-derived coefficients are recovered; the positions and control states are synthetic.

All packs pass: 8,860 active wheel corrections reach body momentum, 23,017 nonzero drive inputs occur, 719 sampled model-candidate comparisons and 360 sampled drive comparisons match retained instructions. There are 1,044 model contacts. The probe declares surface mode zero, disabled traction-effect context and inert emission/destruction handlers. It advances neither body position nor race time and includes no collision response or post-force assists. Counts are coverage results, not valid spawn locations or observed game behavior.

All 112 focused tests pass. Reports: `wheel-directions-instruction-check.json`, `wheel-drive-instruction-check.json`, `wheel-forces-instruction-check.json`, and `vehicle-drive-probes.json` under `analysis`. Complete REA replies through `261` are exported in `analysis/scene/wheel-frame-evidence-bundle.json`; the subsequent frame-stage ledger and checks are documented in [vehicle-frame.md](vehicle-frame.md). The original executable has not been run or modified.
