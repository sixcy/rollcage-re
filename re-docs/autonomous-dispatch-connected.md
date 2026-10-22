# Connected autonomous dispatch and control reference

`tools/verify-autonomous-dispatch-connected-instructions.mjs` compares complete `410220` and its reconstructed game callees through persistent raw-memory ticks. It reuses `createConnectedPlannerFixture` and the exported, bounded `loadConnectedPlannerInstructionSet` from the full planner comparison, then adds explicit dispatch/profile/weapon/recovery/control instruction lists. Duplicate instruction addresses must contain identical instructions. Original jump/data bytes are loaded from retained replies; shipped threshold/yaw/digital tables are initialized explicitly.

Each case runs this declared sequence twelve times:

1. Advance the caller-owned clock and copy current controls to previous controls.
2. Actual `410220`: scheduled `41f900`, pickup preparation/shared-frame event walk, recovery/connectivity/special modes, phase-zero `421430`, then actual `4103f0` weapon decisions.
3. Actual `431750` route speed/steering.
4. Actual autonomous-mode `42a6e0`, including `42a870` digital-axis smoothing.
5. Actual `42a9a0` handling input fields.
6. Actual `443d90` next-tick speed and timer/glyph production.

The five native outer calls per tick are compared after the entire sequence; the two initial caller-owned clock/control updates are the same on both sides. Body positions and velocities remain explicit fixture inputs. This does not insert a movement model or claim complete simulation-frame reconstruction.

The supplied world contains six native racer records,36 registered bodies, model radii, yaw/packed obstacle planes, authored routes/links, pickup/object/marker associations and event rows. The autonomous body uses native mode8 with a null physical controller and packet pointer, legitimately selecting its reconstructed digital path. Physical packet producers, replay branches, body/registry constructors, collision/physics execution, weapon spawning/damage and installed-world instantiation are outside this check. All reached game algorithms are actual; the only admitted external services are compiler cookie equality and an unreachable compiler range-failure trap.

## Validation

`node tools/verify-autonomous-dispatch-connected-instructions.mjs` passes **240 memory cases ×12 ticks =2,880 dispatcher ticks**, with **14,400 outer native calls**, **11,523 unique retained instructions** and **27,662,347 interpreted instruction steps**. It checks full bodies/session/record/model/source storage, candidate/target/nearby/forecast/graph tables, private RNG, original handling tables and final root scratch globals after every tick. No game calls are mocked.

Recorded actual visits include:

| Entry | Calls |
| --- | ---: |
| Scheduled profile `41f900` | 162 |
| Shared frame `4355c0` | 2,392 |
| Planner `421430` | 258 |
| Weapon policy `4103f0` | 258 |
| Common connectivity/stuck/random planners | 1,529 each |
| Mode20 `430ae0` | 209 |
| Mode40 `430970` | 240 |
| Reverse mode80 `47ffb0` | 88 |
| Mode200 `430930` | 570 |
| Power-slide modes1/2 `4311e0` | 172 |
| Route controller `431750` | 2,880 |
| Steering `431520` | 1,805 |
| Input/digital/handling/motion producers | 2,880 each |

All six item decision functions are reached: IDs0/1/2/3/4/7 receive16/17/20/19/20/39 calls respectively. Private RNG changes in all240 cases;126 cases disable the supplied shared-frame event. The report records all initial/tick mode frequencies and produced controls, including2,591 throttle,3 brake,904 steering,12 first-slot and6 second-slot button ticks. Special target types1/2/4/5 occur291/14/124/8 times in the observed post-tick body state; this check does not claim an exhaustive target/branch corpus.

`node --test tests/autonomous-dispatch-connected.test.mjs` passes **four focused tests** for persistent control output while positions/velocities stay caller-owned, actual shared-event deactivation and phase-zero inventory timers, mode200 completion across ticks, and reverse-recovery timeout followed by common planning. The earlier four planner-connected tests also pass after factoring its instruction loader.

Report: `analysis/autonomous-dispatch-connected-instruction-check.json`. Its evidence list identifies every retained input used to construct the instruction union. No new native queries or original-process execution were needed. Instruction/fixture totals overlap the separately documented helper/planner checks and must not be added as unique function coverage or execution captures.
