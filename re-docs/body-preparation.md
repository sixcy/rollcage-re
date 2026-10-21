# Ordinary body preparation and stored-contact friction

`src/body-preparation.mjs` reconstructs **0x47a8e0**, the ordinary-body branch of the physics frame. `src/body-contact-friction.mjs` supplies contact consumption **0x4285d0**, friction **0x47a080**, and target-length scaling helpers **0x492430/0x492340**. The exact-vehicle force branch uses recovered **0x41d9a0** in `src/vehicle-preparation-force.mjs`.

The retained native evidence is under `analysis/native-simulation/results`:

| Files | Evidence / purpose |
| --- | --- |
| `050-ordinary-preparation-assembly.json` | `ev_eb342035831190185c71bdf4ee40fa6c1dcc4040d17d38ca8de4b6140d4e8e4d`: full ordinary parent. |
| `055-environment-response-assembly.json` | `ev_a65d741bc8d70e16b1b497f045b3862d9421aab4d5300ccfd6ea1d54e3259d8f`: contact flag consumption and radius. |
| `056-contact-friction-assembly.json` | `ev_a0a949269347efcab655784e347da64a24d4813fa7b288ac9e64e3d707c3b192`: friction solver. |
| `059-contact-linear-input-assembly.json` | Contact-point velocity, force projection and force/torque accumulation. |
| `060-contact-friction-scale-assembly.json`, `061-contact-friction-large-scale-assembly.json` | Both native vector scaling paths. |
| `063-special-vehicle-force-assembly.json`, `064-apply-body-forces-assembly.json` | Exact vehicle branch and accumulator consumption. |

## Frame order and effects

Call `prepareOrdinaryBody(body,{records,gravityQ16,effectFlags,timeOptions,specialVehicleState,handlers})`. Gravity and the two mutable effect flags are explicit caller inputs. The order is:

1. Check effect flag `first`, then `second`. Each must equal **1**. For each active gate, bit **0x20000** is consumed to skip that one effect; otherwise types **17, 21, 25** are exempt. Invoke the appropriate supplied effect callback for other bodies.
2. Clear the stopped bit in `collisionFlags` if any existing linear velocity component is nonzero.
3. If flag **0x1000** is set, add gravity unless the ordinary body is stopped. Ordinary gravity is mass-scaled and optionally time-scaled for types **3, 7, 21** when nonexempt.
4. Consume individual shape contact flags and derive the aggregate radius when contacts were found. If the coefficient at **+0xb4** is nonzero, compute and accumulate stored-contact friction.
5. Apply accumulated force and torque to momentum using the recovered overflow guard, clear those accumulators, then refresh and limit linear velocity. Angular velocity is refreshed by the later derived-state stage.

The two callbacks are `handlers.applyEffect91cd90(body)` (native effect **0x47b020**) and `handlers.applyEffect9153d0(body)` (**0x47b280**). Their internals remain an explicit boundary. Callback mutations matter: the first can enable the second gate or change the type/exemption used by it. The protection bit can suppress the first and leave the second eligible. The parent does not clear the global flags; the frame scheduler clears them after its external-world stage.

Only exact flags **0x1c03** select the vehicle branch: signed-short drag uses the arithmetic-shifted integer velocity, followed by `applyVehiclePreparationForce`. That helper adds gravity directly, tracks remembered contact side and a six-call airborne window, and applies its recovered speed-dependent force. Additional flag bits select the ordinary branch. The caller supplies all wheel bytes, side bytes, counter and `speed664`; this module does not infer their producers.

## Contact consumption and friction

The signed byte count at **+0x10c** and explicit collision IDs identify the 72-byte shape records. Consumption scans individual IDs backward, counts flag **0x100**, and clears each entire **+0x44** flag word. Repeated IDs can therefore contribute only once. Zero and signed-negative counts consume nothing. With any selected contact, aggregate **+0x3c** is overwritten from its stored **+0x20** point and current body position using the native shifts and lookup root; otherwise that radius remains stale. The aggregate's other bytes survive.

The friction accumulator computes contact-point velocity from the stored lever and angular velocity, adds linear velocity, splits its tangent against the stored normal, and projects the current accumulated force onto that normal. The solver uses this normal-force magnitude, friction coefficient and contact count. It preserves native fixed-width arithmetic, lookup-root approximation, target-length scaling and the unusual rule that a cap greater than the speed/radius ratio becomes **twice that ratio**.

When the ratio is below **16**—including a zero stored radius—the primary friction outputs clear. Angular momentum and angular velocity are cleared only if every angular-momentum component has absolute value strictly below **10,000**. Linear momentum and velocity clear only if every momentum component is strictly below **70**. Independent spin damping and tangential drag still execute afterward; they can produce nonzero outputs when those strict thresholds were not met. The tangential drag uses coefficient **0xed8** independently of +0xb4 within the solver. The ordinary parent skips the entire solver when +0xb4 is zero, while still consuming contact flags and refreshing radius.

The target-length helper has a second path above **0xb40000** component magnitude: it truncates to integer units before its root lookup and clamps that root. Preserve this approximation; an analytic unit-vector normalization changes results. The accumulated linear/torque increments are applied this frame, and cached contact point/normal bytes remain available for later phases.

## Validation and limits

```powershell
node tools/verify-body-contact-friction-instructions.mjs
node tools/verify-body-preparation-instructions.mjs
node --test tests/body-contact-friction.test.mjs tests/body-preparation.test.mjs
```

The friction checker passes **861 retained instructions**, **5,000 fixtures**, **15,000 checks** and **6,926,712 interpreted steps**, including **10,932 consumed contacts** and **2,500 large-vector scaling cases**. Full body/cache bytes, input/output vectors and returns are compared; there are no helper stubs.

The complete ordinary-preparation checker passes **1,652 instructions**, **5,000 fixtures** and **4,268,163 interpreted steps**, covering **1,997 effect calls**, **3,347 consumed contacts** and **550 exact-vehicle bodies**. All **16,384 body bytes**, full cache pool, effect-call order/inputs and effect globals are compared. Only the two effect routines are state-mutating mocks. Reports are `analysis/body-contact-friction-instruction-check.json` and `analysis/body-preparation-instruction-check.json`.

Sixteen focused tests additionally cover flag consumption, aliased IDs, strict stopping thresholds, separate drag/spin outputs, torque direction, cap behavior, live effect changes, stopped gravity, eligible time scaling, exact vehicle flags and current-frame friction accumulation. Randomized instruction fixtures declare valid lookup-root and division domains; they do not establish behavior for invalid memory or singular division. Original executable execution is outside these checks.
