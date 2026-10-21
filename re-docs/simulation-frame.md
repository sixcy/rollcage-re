# Connected consecutive simulation frames

`src/simulation-frame.mjs` composes recovered frame stages through `stepSimulationFrame(physicalGroup, vehicles, context)`. Caller storage persists across calls: bodies, wheel and drive state, shape records, shared candidate arena, candidate groups, event records and query/contact scratch. The adapter connects frame reset, ordinary preparation and prior-contact friction, terrain/model candidate construction, candidate groups, wheel and vehicle stages, derivative refresh, initial static/body-pair events, response and candidate regeneration, then final advancement. Recovered world-record updates, impulse/damping effects, active-vehicle effects and scripted release are available through explicit runtime inputs. Spatial registration and reached emissions remain caller contracts.

`node tools/probe-simulation-frames.mjs` runs eight consecutive frames per covered sector in every installed level pack. Optional arguments are `gamePath maxResources frames`, with frame count2–16. For example, `node tools/probe-simulation-frames.mjs 'C:\Program Files (x86)\Psygnosis\Rollcage' 1 8` runs the first valid pack. The full report is `analysis/simulation-frame-probes.json`.

Each scenario creates two vehicles above the middle covered cell, separated64 units in X, with opposite1-unit Z momentum. Initial conditions are explicit: common flags `0x1803` and exact special flags `0x1c03`, actual five-sphere descriptors and wheel-extended aggregate radius, unit mass/inverse mass, recovered inertia, gravity `0x4000`, contact friction32768, zero drag, zero drive input, steering0/512, route0 and nearest-even conversion. Initial orientation is identity; quaternion integration remains enabled. Special preparation `speed664` is declared0 and retained because its gameplay producer is unported. Pool allocation order and spatial registration are explicit. This corpus run uses ordinary time; isolated instruction checks cover special time scaling.

All80 packs pass, covering1,220 scenarios,9,760 consecutive frame steps and19,520 vehicle-frame updates:

| Observation | Count |
| --- | ---: |
| Initial events | 8,734 |
| Regenerated events | 17,179 |
| Processed events | 19,145 |
| Invalidated events | 6,768 |
| Terrain queries / hits | 182,110 /34,307 |
| Model queries / hits | 19,165 /4,276 |
| Aggregate contact stores | 10,927 |
| Friction preparations / consumed shape contacts | 3,751 /5,703 |
| Wheel contact observations | 29,984 |
| Spatial reinsertions | 1,032 |
| Rejected contacts completed by47cc20 | 224 |
| Actual attachment target writes | 24,089 |

Each frame checks that generated events equal processed plus invalidated events and that the queue finishes empty. It verifies frame clocks65536, signed body values, unchanged shape IDs/counts, runtime registration and complete doubly linked spatial lists without cycles or duplicates. Before preparation, it counts selected contact records retained from the preceding frame; the recovered preparation stage must consume exactly that count. Each scenario removes both bodies afterward and verifies empty spatial lists.

Persistent state is exercised throughout:16,756 moving position transitions and10,126 changed wheel-angle transitions after the initial frame,19,520 cooldown decays, and5,736 changes to the retained special airborne byte. These count changes between consecutive states; they are reconstruction observations rather than captured game trajectories.

The recovered world-record pass413fc0 runs9,760 times with an explicitly empty table and zero effect flags. Class16 executes actual47cc20: ordinary bodies finish their clock and become state32 without deletion or final pose movement. The dispatcher's historical `removeBody` name does not mean destruction. Actual44f050 attachment execution follows physics through `stepPhysicsAndAttachments`: one declared synthetic local-origin point per body, type1 handles1000/1001, explicit matrix padding0 and retained native queue storage. All24,089 target writes must equal the completed body position high words; queue count clears while entries remain reusable. Authored runtime attachment-point producers remain unresolved. Reached wheel/model emissions remain inert. This corpus ends after attachments and does not execute post-frame47ccc0, scripted bodies, gameplay input/progression producers or a complete race. Earlier inert-rejection and unprocessed-attachment baselines remain under distinct report filenames.

The context supplies `environment:{data,grid,modelContext}`, shape `records`, `queue`, `candidateArena:{entries,startOffset}`, reusable `candidateGroups`, `effectFlags:{first,second}`, signed `gravityQ16`, `selectionCounter`, declared `roundingMode`, `staticScratch:{contact,tag}` and `queryOutput`. `spatialStateFor(body)` maps the body's registered runtime bucket to its parsed static node; it must preserve prior registration rather than reselecting the midpoint. Optional `timeOptionsFor(body)` is consulted per numeric operation, and `vehiclePreparationStateFor(body)` supplies exact-flags special state. Scripted bodies require `scriptOptionsFor(body)` with explicit native bytecode and spawn data as needed. Its per-body handlers can override shared handlers. The connected level probe contains ordinary vehicles only; a focused test exercises scripted kinematic motion across two frames.

`worldEffectState` supplies actual413fc0 inputs; explicit `handlers.externalWorld` can override it. Ordinary impulse/damping effects use `bodyEffectImpulse`/`bodyEffectDamping`; active targets use `activeVehicleEffectFor(body)`, and VM release can use `scriptedReleaseState`. Reached emissions remain explicit. Attachments require `handlers.attachmentQueue:{entries,count}` and `context.attachments`. Actual contact storage uses recovered aggregate mapping. Candidate consumers read the final shared arena, including native model-list overwrite aliases; model surface-reference writes return to the original shape record even if a later candidate is rejected. Vehicle terrain registration accepts both structured nearest vertices and retained packed integers, including cell0 and sentinel-1.

The adapter preserves475760's late read of physical count/list after wheel callbacks. A callback replacing that list changes the derivative pass. Run `node --test tests/simulation-frame.test.mjs` for integration checks, and the relevant component instruction tools for arithmetic/caller verification. The adapter is not a complete original-process or monolithic instruction replay.

## Post-frame composition

`stepPhysicsAttachmentsAndBodyStates` connects three consecutive450e50 calls: physics4749e0, attachments44f050, then body-state dispatch47ccc0. It requires `context.postFrame` before physics begins. That context supplies routes, mutable route globals, reached retirement/query/apply/emission contracts, and either `handlers.prepass` or explicit `vehicleCheck:{runtime,sectorHeights,vehicleStateFor}`. The latter binds actual47e180. See [vehicle prepass](post-frame-vehicle-check.md), [body states](post-frame-body-states.md), [placement queries](respawn-query.md) and [respawn application](respawn-apply.md).

Query/apply remain explicit adapter contracts: full raw copied body storage, runtime progression producers and the emitter's leaked ECX register cannot be derived from a partial object. No default acceptance result or invented ECX is supplied. One integration test uses actual respawn application and spatial reinsertion; another runs actual vehicle prepass/type4 handling. Both verify that attachments already contain the completed pre-respawn pose. The three-stage composition ends before the remaining surrounding race-tick calls.
