# Physics frame scheduler

`src/physics-frame.mjs` reconstructs the entire orchestration routine at **0x4749e0**. It binds the existing recovered collision-event processor to explicit stage callbacks, allowing the concrete frame adapter to supply the recovered body, vehicle, candidate and collision stages without changing their native order.

Evidence: `analysis/scene/results/278-physics-frame-assembly.json`, Evidence `ev_af519c4d443ad65b6ae8066d61eea98c1f5242aa2835d3fbe2e8fa35a296c87a`.

Call `runPhysicsFrame(physicalGroup, stages)` with `physicalGroup = {bodies, count}` (`count` defaults to the array length), a collision event `queue`, mutable `effectFlags = {first, second}`, and these callbacks:

| Order | Stage | Native anchor |
| --- | --- | --- |
| 1 | `begin()` | 0x46e9b0 |
| 2 | `stepScripted(body,index)` for flag 0x2000; otherwise `prepareOrdinary(body,index)` | 0x476550 / 0x47a8e0 |
| 3 | `externalWorld()` | 0x413fc0 |
| 4 | Clear both effect flags | dwords 0x91cd90 / 0x9153d0 |
| 5 | `collectCandidates()` | 0x4287f0 |
| 6 | `updateGroups()` | 0x46ea80 |
| 7 | `updateVehicles()` | 0x475760 |
| 8 | `queue.reset()` | 0x440510 |
| 9 | `buildInitialEvents(queue)` | 0x427870 |
| 10 | Recovered queue loop using `respond(event,delta,queue)` and `refresh(first,second,queue)` | 0x474bb0 / 0x427910 |
| 11 | `finish()` | 0x475450 |

The preparation count and array pointer are captured **after** `begin`. Mutating the group count or replacing its array during preparation does not change the captured traversal. Each subsequent entry and its flags are read when reached, so replacing a later entry in the captured array or modifying its flags affects that iteration. The source checks the count against unsigned-word storage and available array entries.

Both global effect flags remain visible through `externalWorld`. They are cleared immediately afterward, including values newly written by that callback. The queue reset happens after vehicle updates and before initial generation. It retains the native event-record storage behavior. The event processor returns slots before callbacks, invalidates contacts against original body references, refreshes surviving references and processes one negative-delta event before stopping. `finish` runs even with no events or after that negative-delta stop. See `re-docs/collision-events.md` for the detailed event semantics.

The result is `{nativeReturn:0, preparedBodies, scriptedBodies, ordinaryBodies, processedEvents}`. Counters are reconstruction observations; the native return value is zero. Required callbacks are validated before beginning the frame, while the physical traversal input is captured and checked afterward. This wrapper does not invent object lists, world updates, effects, collision results or controls.

Verification:

```powershell
node tools/verify-physics-frame-instructions.mjs
node --test tests/physics-frame.test.mjs
```

The retained-instruction checker executes the complete frame routine, queue reset, sift, filtering and invalidation: **315 instructions, 1,600 fixtures, 1,287,801 steps**. It compares complete body and event bytes, queue heap/free arrays, effect flags and the stage/callback sequence. Fixtures prepare **5,596 bodies**, exercise **1,200 captured-count/list mutation cases**, and process **3,556 events**, including **273 negative deltas**. Preparation, world, candidates, groups, vehicles, initial generation, response and finish are explicitly state-mutating mocks. The initial generation mock transfers predetermined event output; this checker makes no contact-geometry or concrete stage-implementation claim. Report: `analysis/physics-frame-instruction-check.json`.

Six focused tests also cover ordering, effect lifetime, live-array traversal, queue release/invalidation, negative deltas and required-stage validation. Original executable execution is outside this check; all native instructions run in the bounded interpreter.
