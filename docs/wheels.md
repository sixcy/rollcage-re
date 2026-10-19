# Recovered wheel arithmetic

This stage extends the shared body arithmetic with wheel probes, hit-result conversion, suspension impulses, slip correction and wheel spin. It applies to the selected Redux 1.3.8.0 executable. Descriptive names are inferred from static code. Terrain/model queries and candidate acceptance are now connected using recovered vehicle geometry; see [connected contacts](vehicle-contacts.md). Complete vehicle frame scheduling and response remain open.

`src/wheel-physics.mjs` contains the reference implementation. `src/fixed-integer.mjs` now also contains the native overflow-aware vector length and signed-short matrix transform. Source units and fixed-point scales are preserved; physical unit conversions have not been established.

## Runtime layouts

The constructor initializes four 28-byte wheel descriptors at vehicle `+0x180`, four 76-byte contact records at `+0x1f0`, and four 200-byte wheel states at `+0x324`.

Descriptor positions are three signed Q8 shorts at `+0/+2/+4`; local probe directions are signed Q8 shorts at `+8/+10/+12`. The record also has a tag at `+0x10`. The probe builder consumes these after the contact-side preparation stage has set the descriptor's vertical components. `prepareWheelContactSides` now reproduces those side attempts, with the combined hit selector supplied by its caller.

| Contact offset | Role / representation |
| --- | --- |
| `0x00` | Probe direction: three signed Q12 words. |
| `0x0c` | Velocity at the probe origin, Q16. |
| `0x18` | Probe-origin lever arm from the body, Q16. |
| `0x24` | Velocity at the selected suspension/contact point, Q16. |
| `0x30` | Selected hit point relative to the body, Q16. |
| `0x3c` | Surface normal, Q16. |
| `0x48` | Suspension distance, Q16. |

Important wheel-state fields: byte `+0` contains the contact flag (bit 0); vectors at `+4`, `+0x10`, `+0x1c` and `+0x28` receive the suspension stage's support projection, slip vector, relative hit and lever arm. `+0x34` is the drive direction. `+0x40` receives the contact normal; `+0x58` is wheel spin; `+0x78` accumulates wheel angle; `+0x7c` retains slip speed; and `+0x80` receives suspension distance. Other fields are retained raw by the decoder and remain uninterpreted here.

## Probe and contact conversion

The native short-vector transform (`0x4334b0`) multiplies signed Q12 matrix shorts by signed input shorts, accumulates 32-bit integer products, then shifts once by 12. It does not round each product separately. Descriptor positions transform into a Q8 lever arm, then shift left by 8 for Q16 body arithmetic. Probe-origin velocity is angular velocity crossed with the lever arm, plus linear velocity.

The ray origin is `(bodyPosition + leverArm) >> 8`. Probe direction is the transformed descriptor direction, and its Q8 ray delta is `directionQ12 * 44 >> 4`: a 44-source-unit probe. A supplied native hit result contains flags, Q16 fraction, Q8 point and Q16 normal. No-hit flags yield no contact. On a zero-fraction overlap, the native path uses the probe origin instead of the returned point. Distance is hit fraction times 44 in Q16. The suspension-point local position is descriptor position plus descriptor direction times distance, truncated/wrapped to signed shorts before transformation. Its velocity again uses angular cross linear motion.

`buildWheelProbe` and `resolveWheelContact` reproduce these calculations. `src/terrain-candidates.mjs` and `src/terrain-query.mjs` now provide the spatial terrain candidate stage and zero-radius terrain hit selection; see `docs/collision-data.md`. Placed-model contacts remain separate.

`prepareWheelContactSides` ports `0x488910` / `0x488f00`. It takes the absolute vertical position/direction from the first wheel descriptor and applies a common sign to all four. The remembered side byte is tried first; only four misses trigger a second attempt with the opposite sign. Any nonnegative wheel distance stops the attempts and stores that side. Two failed attempts preserve the remembered byte, while the descriptors retain the second attempt's sign. Misses clear the entire wheel flag byte and set distance to -1; hits OR in bit 0. Stale normal/contact caches survive misses, while probe vectors are refreshed. A batch callback supplies four selected terrain/model hits; a surface resolver maps nonnegative cell references to caller-owned metadata instead of native pointer values. Placed-model selection is still outside this wrapper.

Four added fixtures cover first-side success, successful retry, partial contact and two failed attempts, including flag and stale-cache behavior. Installed-data probes check 364 synthetic bodies with alternating remembered sides: 246 contact the first side, 79 succeed on retry and 39 miss both, totaling 1,928 additional rays. These side-stage checks are fixtures/corpus probes; the independent x86 comparison currently covers the terrain query and suspension, not this wrapper.

The installed-data probe now supplies `readTerrainSurface` as its metadata resolver. It resolves the cell packet's index into the GFXM `+0x110` sixteen-byte table, retaining category and grip reduction from descriptor `+12`. Across those side attempts, 989 final contact surfaces resolve with bounded references. See `docs/model-collision.md` for layouts and all-active-cell validation. Common capacity preparation and the registered-cell special surface classifier are now ported in `src/wheel-drive.mjs`; see [drive preparation](wheel-drive.md). The complete wheel drive update remains open.

## Suspension

`0x488370` processes four contact flags. For each active wheel it computes compression from a rest distance of `0x240000` (36 source units), combines contact motion through the retained fixed-point coefficient sequence, and clamps the resulting scalar to `[-40000,0]`. Its impulse follows the probe direction; torque is lever arm crossed with that impulse. All wheel impulses are summed into body momentum/angular momentum. Inactive wheels leave their cached fields untouched.

The same routine derives a tangent slip vector and copies the hit/lever/normal/distance caches. Its support-projection cache follows the original arithmetic literally, including multiplying the impulse by its dot product with the contact normal. No alternative physical model or floating-point spring approximation is substituted.

## Traction and spin

`0x41c720` measures slip with the native vector-length helper. A nonnegative surface-reduction field lowers the supplied grip capacity by a signed integer fraction of 32. Below the resulting threshold, the correction is negative slip divided by eight, truncated toward zero. Above it, slip direction is scaled to the effective capacity. The reported skid threshold is `0x30000` after surface reduction. The drive-stage computation that supplies grip capacity and throttle/braking inputs remains to be ported.

`0x41c870` changes wheel spin using the drive input and the correction projected onto the drive direction. A spin update that crosses zero is clamped to zero. The resulting spin advances the wheel-angle accumulator, with optional special-time context. The port omits the original skid sound/particle bookkeeping performed by `0x483b90`; it retains arithmetic outputs and the skid decision.

## Evidence and checks

Complete REA records are under `analysis/scene/results`, with the checkpoint ledger exported to `analysis/scene/wheel-evidence-bundle.json`.

| Native anchor | Result |
| --- | --- |
| `0x488910` | `137-wheel-contact-preparation.json`: four-wheel contact-side attempts and stage ordering. |
| `0x488370` | `118-wheel-contact-force.json`, `138-wheel-suspension-assembly.json`: suspension, cache writes and momentum sums. Evidence `ev_5e93944fbd9aa147b6993c484a14f758c6d0806092b5afa55974410d323489a3`. |
| `0x488820` | `139-wheel-torque-from-force.json`: fixed-point cross product. |
| `0x488bf0` | `141-wheel-track-query.json`: converts a chosen query hit, fraction and surface reference. |
| `0x488f00`, `0x488e20` | `142-wheel-track-sides.json`, `143-wheel-track-selector.json`: side preparation and terrain/model hit selection. |
| `0x488d20`, `0x4890a0` | `145-wheel-contact-velocity.json`, `146-wheel-probe-transform.json`, `153-wheel-velocity-assembly.json`: probe/contact-point transforms and velocities. |
| `0x41c720`, `0x41c870` | `140-wheel-traction.json`, `144-wheel-traction-assembly.json`, `147-wheel-force-application.json`: traction and spin. |
| `0x41c9c0`, `0x4334b0` | `149-vector-length-q16.json`, `152-vector-length-assembly.json`, `154-vector-matrix-transform.json`: primitive arithmetic. |
| `0x424ff0`, `0x423ab0` | `150-terrain-contact-query.json`, `151-model-contact-query.json`: terrain and placed-model queries. Both zero-radius paths are now ported; see `docs/model-queries.md` for model evidence and checks. |
| `0x4287f0`, `0x4286e0` | `155-contact-candidate-build.json`, `156-spatial-node-select.json`: broad-phase candidate generation and spatial-grid lookup. |

All 36 focused tests pass, including six wheel tests covering buffer bounds, short-coordinate wrapping, angular point velocity, probe scale, suspension clamp/torque/tangent projection, inactive contacts, balanced wheel impulses, grip transitions and spin reversal/time scaling.

`tools/verify-suspension-instructions.mjs` supplies a stronger independent arithmetic check. Its bounded interpreter consumes the retained 375 x86 instructions for `0x488370`, with only its two pure arithmetic callees modeled separately. It compares the entire 1,792-byte vehicle region against the structured port for 2,000 deterministic four-wheel fixtures (8,000 wheel slots). Fixtures vary contact flags, principal/rotated directions, signs, fractional probe/contact velocities, lever arms and distances. All fixtures match exactly; the report is `analysis/suspension-instruction-check.json`. This is interpretation of retained static instructions, not a native original-game run or proof of complete simulation equivalence. Probe selection, traction and spin currently have focused fixture checks rather than this independent instruction comparison.

## Next reconstruction boundary

The candidate stage and zero-radius terrain query are connected by `tools/probe-terrain-wheel-contacts.mjs`. Its synthetic placements exercise 14,544 wheel rays on all 80 level packs, including 364 successful comparisons with retained x86 instructions, plus the side-attempt probes described above. Terrain query details and limitations are in `docs/collision-data.md`.

The subsequent model query port adds `queryPlacedModelRay` and `selectWheelHits`, with original yaw, class/tag filtering, model fractions and shared-buffer selector behavior; see `docs/model-queries.md`. `src/vehicle-contacts.mjs` supplies candidates and the original wheel layout/radius, connects both queries to side preparation and resolves surface metadata. Its installed-data probe covers 7,188 synthetic body states and 1,044 model contacts across all 80 levels; breakable effects remain explicitly inert. [The connected wheel path](wheel-frame.md) adds steering preparation, the drive caller with explicit effect hooks and traction-force application. [The vehicle frame stage](vehicle-frame.md) adds post-wheel assists and derivative refresh. Collision response and complete race/event orchestration remain open. The suite has 112 passing tests.
