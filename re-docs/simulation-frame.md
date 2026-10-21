# Connected consecutive simulation frames

`src/simulation-frame.mjs` composes recovered frame stages through `stepSimulationFrame(physicalGroup, vehicles, context)`. Caller storage persists across calls: bodies, wheel and drive state, shape records, shared candidate arena, candidate groups, event records and query/contact scratch. The adapter connects frame reset, ordinary preparation and prior-contact friction, terrain/model candidate construction, candidate groups, wheel and vehicle stages, derivative refresh, initial static/body-pair events, response and candidate regeneration, then final advancement. Gameplay world updates, effects, lifecycle and queued attachment execution remain caller boundaries.

`node tools/probe-simulation-frames.mjs` runs eight consecutive frames per covered sector in every installed level pack. Optional arguments are `gamePath maxResources frames`, with frame count2–16. For example, `node tools/probe-simulation-frames.mjs 'C:\Program Files (x86)\Psygnosis\Rollcage' 1 8` runs the first valid pack. The full report is `analysis/simulation-frame-probes.json`.

Each scenario creates two vehicles above the middle covered cell, separated64 units in X, with opposite1-unit Z momentum. Initial conditions are explicit: common flags `0x1803` and exact special flags `0x1c03`, actual five-sphere descriptors and wheel-extended aggregate radius, unit mass/inverse mass, recovered inertia, gravity `0x4000`, contact friction32768, zero drag, zero drive input, steering0/512, route0 and nearest-even conversion. Initial orientation is identity; quaternion integration remains enabled. Special preparation `speed664` is declared0 and retained because its gameplay producer is unported. Pool allocation order and spatial registration are explicit. This corpus run uses ordinary time; isolated instruction checks cover special time scaling.

All80 packs pass, covering1,220 scenarios,9,760 consecutive frame steps and19,520 vehicle-frame updates:

| Observation | Count |
| --- | ---: |
| Initial events | 8,730 |
| Regenerated events | 17,187 |
| Processed events | 19,149 |
| Invalidated events | 6,768 |
| Terrain queries / hits | 182,190 /34,339 |
| Model queries / hits | 19,165 /4,276 |
| Aggregate contact stores | 10,935 |
| Friction preparations / consumed shape contacts | 3,755 /5,707 |
| Wheel contact observations | 29,996 |
| Spatial reinsertions | 1,036 |

Each frame checks that generated events equal processed plus invalidated events and that the queue finishes empty. It verifies frame clocks65536, signed body values, unchanged shape IDs/counts, runtime registration and complete doubly linked spatial lists without cycles or duplicates. Before preparation, it counts selected contact records retained from the preceding frame; the recovered preparation stage must consume exactly that count. Each scenario removes both bodies afterward and verifies empty spatial lists.

Persistent state is exercised throughout:16,980 moving position transitions and10,134 changed wheel-angle transitions after the initial frame,19,520 cooldown decays, and5,740 changes to the retained special airborne byte. These count changes between consecutive states; they are reconstruction observations rather than captured game trajectories.

The external world callback is explicitly inert, with9,760 calls. Effects and destruction callbacks are also inert. The probe records216 lifecycle removal requests while retaining those fixture bodies so later frame checks can run; native post-removal behavior is not reconstructed. It retains and counts24,313 attachment queue entries without executing them. No scripted bodies, gameplay input/progression producer, original process execution or complete race equivalence is claimed. This is a connected installed-data integration probe; retained-instruction comparisons establish each recovered component separately.

The context supplies `environment:{data,grid,modelContext}`, shape `records`, `queue`, `candidateArena:{entries,startOffset}`, reusable `candidateGroups`, `effectFlags:{first,second}`, signed `gravityQ16`, `selectionCounter`, declared `roundingMode`, `staticScratch:{contact,tag}` and `queryOutput`. `spatialStateFor(body)` maps the body's registered runtime bucket to its parsed static node; it must preserve prior registration rather than reselecting the midpoint. Optional `timeOptionsFor(body)` is consulted per numeric operation, and `vehiclePreparationStateFor(body)` supplies exact-flags special state. Scripted bodies require `scriptOptionsFor(body)` with explicit native bytecode and spawn data as needed. Its per-body handlers can override shared handlers. The connected level probe contains ordinary vehicles only; a focused test exercises scripted kinematic motion across two frames.

Required `handlers.externalWorld` represents413fc0. Remaining handlers cover spatial insertion/removal, attachment queue, lifecycle, ordinary effects, wheel effects and model effects on reached paths. Actual contact storage always uses the recovered aggregate mapping. Candidate consumers read the final shared arena, including native model-list overwrite aliases; model surface-reference writes return to the original shape record even if a later candidate is rejected. Vehicle terrain registration accepts both newly produced structured nearest vertices and retained packed integers, including cell0 and sentinel-1.

The adapter preserves475760's late read of physical count/list after wheel callbacks. A callback replacing that list changes the derivative pass. Eight focused adapter tests cover this mutation, packed terrain references, geometry-derived impact/rest, contact-marker clearing during regeneration, gravity across four frames, special time routing, effect/global ordering, required boundaries and scripted kinematic progress. `node --test` passes263 tests in total. All46 component instruction tools also pass; the adapter itself is integration-tested, not claimed as one complete original-process or monolithic instruction replay.
