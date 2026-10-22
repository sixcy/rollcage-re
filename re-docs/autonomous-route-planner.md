# Autonomous route candidate planning

`src/autonomous-route-planner.mjs` reconstructs Redux1.3.8.0's421430 scoring/selection parent. `autonomous-dispatch.mjs` calls it by default during phase-zero common planning. All named game callees now have actual defaults; optional handlers remain for isolated interface checks.

The parent resets the20-row52-byte candidate table, updates the nearest competitor, finds the current route point and builds directional/link-derived candidates. It computes normalized point/tangent alignments, bend preference, nearby-body/obstacle lists and opponent-derived targets. It then accumulates authored restrictions, distance and segment costs, predicted-position costs, obstacle penalties, pickup/object/marker alternatives, event/mode/entry bias and authored group bias. Descending strict-maximum selection gives the highest-index row a tie; when none qualifies, row19 is consumed even if empty or disabled.

Normal selections write body6c0/6c2 and optional6c4 mode. Special selections write6c9 type,6cc..6d4 Q16 target and type-specific6ca/6cb timer state. Score+44 and extra-score+48 remain separate until final comparison. Scratch storage uses native entry ESP and preserves overlapping locals and short-coordinate truncation.

Implemented dependencies:

- [Candidate builder](autonomous-candidate-builder.md):4210b0/421260 and actual directional walkers.
- [Profile plan](autonomous-profile-plan.md):434960 nearest registered competitor.
- [Candidate modifiers](autonomous-candidate-modifiers.md):reset/link/alignment/bend/mode/event/entry scores.
- [Nearby objects](autonomous-nearby-objects.md):411e70/4125a0 lists and distances.
- [Opponent candidates](autonomous-opponent-candidates.md):492d80 and target/lane/collision helpers.
- [Candidate costs](autonomous-candidate-costs.md):position, route-segment and authored model/plane obstacle costs.
- [Special candidates](autonomous-special-candidates.md):pickup, object and marker producers with actual cost defaults.

Retained parent assembly345 has693 instructions. `tools/verify-autonomous-route-planner-instructions.mjs` checks1800 synthetic parent fixtures using actual reset/nearest/walk/link/entry helpers and14 explicitly state-mutating builder/cost/modifier contracts. Its1645 retained instructions and19219967 steps establish parent argument/order/storage behavior; the overrides are not proof of the complete candidate feature.

`tools/verify-autonomous-route-planner-connected-instructions.mjs` separately executes800 cases using6135 unique retained instructions and actual connected defaults, matching115112724 steps. Only compiler cookie/range interfaces are external; no game decisions are mocked. All800 cases have populated nearby-body lists and700 populated obstacle lists. Real position/body-distance/obstacle/packed-plane helpers are visited22992/729585/7003/18630 times. Candidate types1..5 all occur; winners include115 avoidance targets,4 follow targets,3 pickup targets,373 object targets and305 ordinary route points. Four focused connected tests establish actual avoidance/follow/special production and selected target fields. The report compares complete declared body/registry/route/model/session/source, candidate/target/forecast/nearby and graph-queue storage; root helper scratch globals are outside this connected comparison, with owned writes covered separately by cost/special checkers.

Raw body/session/route/registry/event/model inputs remain explicit supplied memory. Their native constructors, full race initialization, complete450e50 tick wiring, vehicle audio, weapon activation/projectile/damage lifetimes and broader race/session behavior are not established by the route planner. Static instruction agreement does not claim original-process driving trajectories or whole-AI completion. StageII/Firebugs routing semantics are separate targets.

The [installed route-planner probe](autonomous-route-planner-probe.md) additionally runs9720 cases across80 usable packs and540 nonempty route groups. It preserves authored XYZ/flags/links/direction, uses explicit constructed runtime worlds, selects all five special-target types and checks native tie/fallback/output invariants and unchanged resource hashes. This extends authored-data integration coverage; it does not reconstruct constructors or capture gameplay.
