# Redux physics fidelity goal

Target: **Rollcage Redux 1.3.8.0**, x86, SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. The goal is faithful physics against this executable, including physical interactions. Completion requires original-process evidence; matching JavaScript and interpreted instructions alone is insufficient.

The Track Viewer remains **Super experimental**. LEV16/17 remain excluded. Existing source, installed files and retained evidence are preserved. New capture runs use exclusive output paths.

## Work and acceptance

| Area | Required evidence | Current status |
| --- | --- | --- |
| Gravity and initialization | Exact shipped data, writers and reached startup state | Corrected to native normal `0x10000`, including the verified configuration selector. Original process confirms 65536. Other startup defaults still need systematic comparison. |
| Clock | Outer timer/scheduling, logical tick and HUD conversion | Corrected to recovered nominal 30 ticks/s; exact wrapped native timer and integer catch-up tail verified. Uninterrupted original cadence/render gating remains open. |
| Numerical environment | Original x87 control/status, MXCSR, entry registers and inputs | Native startup is PC53, renderer/race entry PC24, nearest-even in both captures. Exact PC24 attachment arithmetic is connected; other reached operations still require context audit. |
| Controlled vehicle replay | Native state before/after each ordered stage, exact first divergence | Ten native frames match610 source stage comparisons. Three complete three-frame windows also match independent and carried replay: launch228..230, moving288..290, and terrain-contact348..350. All six cars move in the latter windows; each moving/contact frame compares4,880,872 declared bytes. Native AI/post-physics changes and caller ABI inputs remain explicitly supplied producers, not a closed source-only trajectory. |
| Forces and damping | Live shared-memory producers and consumers | Live recovered globals/body caches connected. Native class-two deferred effects can now publish their actual force events. Other event producers remain open. |
| Track and car collision | Terrain, surfaces, walls, ceilings, inverted driving, pairs | Whole frames348..350 match13/9/7 source responses. Selected native cases directly match two wheel-body/border7 events and four car-chassis/car-chassis events (swept and penetration), plus each complete declared frame state. Chassis-wall/ceiling/inverted and broader car-pair profile/condition coverage remain open. |
| Moving/destructible world | Full object construction, scripts, registry and pending effects | Ordinary and nonordinary placement construction, native scripted motion, lights/attachments, class-one/two contacts, type-four damage, destruction queue and fragment physics lifecycle connected. Moving ordinary meshes render from native poses. Render visibility attachment-effect queue production, animated UVs, deforming/fragment/particle rendering and native scenario comparisons remain open. |
| Deforming terrain | Actual494c80 startup,494f60 gates and live geometry consumers | A standalone component now matches retained instructions over six animated LOW/HIGH LEV4/14/18 variants and binds live cell forms/surface flags. It is not connected to Racing test: the original physical camera/controller lifecycle owns animation eligibility, and simply forcing its flag would be incorrect. The current viewer also omits the phase-zero constructor on those tracks. |
| Weapons and recovery | Original producers, collision/force effects, transitions | Partial recovered routines; controlled native scenarios and complete runtime remain open. |
| Coverage | Seven ordinary vehicles; 18 racing levels in LOW/HIGH; physical scenario matrix | All 252 track/type combinations pass 300 reconstructed ticks; all seven LOW/LEV1 types also match the browser bundle for 300 ticks each. All 36 variants separately pass the destruction/600-tick check. Native scenario matrix and longer all-track lap coverage remain open. |

## Evidence policy

The subsequent recovery prepass capture matches three original-process pairs,
4,880,872 semantic bytes per pair, the end-record EAX and preserved registers:
`analysis/physics-native-recovery-prepass-v2-20261022/`. Its separate state audit
records clocks 228–230, 18 grounded participant observations and **zero rejection
or state32 transitions**. This establishes those ordinary prepass paths; it is
not native respawn evidence. The previous unsuccessful attempt is retained as
potentially affected by user input and contributes no recovery pairs. See
[post-frame replay](native-post-frame-replay.md).

Source radial-force and active-effect stack behavior now matches strict retained
instruction fixtures, including surviving shape-cache locals and sparse ASLR
memory. The complete captured-frame adapter uses those implementations with
actual parent registers, sound coverage and optional observed TLS. Executed
synthetic fixtures validate immediate/buffered FS:[0] capture separately from
game behavior. The native positive car-pair frame still matches after the new
binding. Original-process radial-force/active-emission and actual respawn
transitions remain required; see [active-effect binding](native-active-effect-binding.md).

After rebuilding the viewer, the full suite passes 2,069 tests without failures
or skips (`analysis/physics-fidelity-tests-20261022-forces-recovery.txt`), and
the headless browser check matches 150 ticks and Racing test controls/moving
meshes (`analysis/physics-viewer-forces-recovery-20261022/`). Later force-parent
and recovery-parent observer checks also pass their focused tests; the full
suite result predates any subsequently added capture diagnostics. The first
dedicated force capture stopped at an unavailable explicit region before any
force/frame snapshots were published. Its failed report remains
`analysis/physics-native-force-attempt-20261022.json`; it contributes no physics
fidelity evidence. All 171 installed/copied originals retain their hashes.

The revised force capture is positive:
`analysis/physics-native-selected-force-v2-20261022/` matches all 12 ordered
original `47b020` entry inputs and the complete `4749e0` frame's 4,951,966
semantic bytes/native return. Native clock 513 selects HIGH/LEV5 with vehicle
selectors `[6,2,3,5,0,1]`; all six cars translate. Eight calls have accepted
nonzero capped inputs, including chassis/type3 and wheel/type4 bodies; four
fail the distance gate. Strength is 16 throughout. This includes the observed
SEH head, security cookie and full 64-byte active-effect lookup table. There
are 24 wheel queries/21 hits, 30 missed body-terrain queries and five missed
model queries; no collision responses run in this frame. No sound dispatcher
is reached. Entry-only observations do not isolate each call's output or prove
the active-controller branch, and they do not identify which weapon produced
the shared force event. All 171 installed/copied original hashes remain
unchanged (`analysis/physics-native-force-v2-source-verification-20261022.json`).
The retained original-process force regression independently repeats this
complete comparison.

The complete post-frame parent now also has three exact original-process
pairs (`analysis/physics-native-recovery-parent-20261022/`): 4,903,040 declared
bytes per pair plus preserved EBX/EBP/ESI/EDI/ESP. The parent has no EAX return
contract. At clocks 228–230 on HIGH/LEV2, all respawn/retirement counts remain
zero. The compared extra coverage includes 17,908 bytes of recovery globals
and 4,260 bytes of native route/checkpoint structures. This is ordinary parent
coverage, not a native respawn/query/apply result. The eight-byte profile table
is captured separately and must not be counted as part of this declared-byte
comparison. All 171 installed/copied originals retain their hashes
(`analysis/physics-native-recovery-parent-source-verification-20261022.json`).

The source retirement burst also resolves its literal position-ring pointer
to the actual captured module address before publishing it to the emitter;
opaque heap pointers and coordinate values remain unchanged. Sparse ASLR and
ordinary-address retained-instruction tests cover this correction. The viewer
was rebuilt afterward; its final 150-tick browser/control/moving-mesh check is
`analysis/physics-viewer-forces-recovery-final-20261022/`.

The final regression run for this checkpoint is terminal exit0: all 2,087
tests pass, with no failures or skips
(`analysis/physics-fidelity-tests-20261022-forces-recovery-final.txt`). This
includes the retained positive native-force frame, new observer/diagnostic
contracts, recovery bindings and source pointer corrections. It does not turn
unreached native scenarios into runtime coverage.

Capture manifests identify the executable, copied installation hashes, module bases, configuration, interventions, register/FPU context, explicit pointer chains and ordered state ranges. Raw memory never receives inferred pointer rewrites. Snapshot fixtures and interpreted-instruction cases are labelled separately from original-process runs.

Compare fixed-point and discrete fields exactly. Floating-point comparisons default to exact representation; any tolerance must be declared before comparison and justified by the recovered numerical environment. Find the earliest differing stage and field, preserve it, and fix its producer. Do not adjust a tolerance or vehicle statistic to hide divergence.

Debugger pauses affect elapsed wall time. A breakpoint trace can establish numerical state and call order; original cadence needs separate timer/scheduler evidence. UI lap times and native timer fields must not be equated until that relationship is established.

`tools/prepare-native-physics-capture.mjs` creates a new workspace copy and verifies each installed source before/after copying. The Windows helper launches only its owned child, bounds runtime/events/snapshots, records temporary INT3 patches and declared writes, and terminates that child on completion/error. Documents redirection and registry write denial protect persistence while being explicit platform interventions; their effect on startup must be observed. These are research tools, not browser physics code.

Related details: [current Racing test](solo-practice.md), [physical interactions](physics-interactions.md). This ledger records outstanding acceptance criteria; it does not declare completion.

Current verification: all 1,978 tests pass with no failures/skips (`analysis/physics-fidelity-tests-20261022-native-frame.txt`), including exact generated-page consistency and native frame geometry/vehicle/capture bindings. The prior stale generated-page failure remains retained in `analysis/physics-fidelity-tests-20261022-scripted-terrain.txt`. Earlier full Edge regressions cover all 40 static variants and the 36 allowed Racing test variants; the current rebuilt page passes the focused moving-world/control/150-tick parity check (`analysis/physics-viewer-native-frame-20261022/`). LOW/LEV1 completes 12 laps in 10,000 matching reconstructed Node/browser ticks with zero recoveries, including scripted world state (`analysis/solo-scripted-world-10000ticks-20261022.json`). These are separate scopes; neither source/browser consistency nor one native frame substitutes for continuous native gameplay trajectories or the remaining scenario matrix.

The subsequent source/geometry/sequence/observer revision passes all2,004 tests, with no failures/skips (`analysis/physics-fidelity-tests-20261022-native-sequences-events.txt`). The rebuilt page also passes150 Node/browser parity ticks and Racing test controls/moving meshes (`analysis/physics-viewer-native-events-20261022/`). Additional event-trace/ABI/order/immutability checks pass against the retained inputs. This full-suite run predates the planned host pending-frame capture extension; it must not be cited as runtime proof for that extension.

The later full suite passes all2,027 tests, with no failures/skips (`analysis/physics-fidelity-tests-20261022-selected-collisions.txt`), including the pending-frame helper, selected border proof and native identity diagnostics. The subsequently retained car-pair regression passes in the focused event/pairing suite. Executed pending/unfiltered and pending/filtered synthetic fixtures are separate runtime evidence for host selection (`analysis/native-capture-pending-verified-20261022/`, `analysis/native-capture-pending-filtered-verified-20261022/`); they contain no game code.

Whole-frame evidence is `analysis/physics-native-full-frame-20261022-reviewed/`: an original active phase4 entry/preRET pair, six cars,15 physical bodies (three scripted),24 successful wheel contacts,32 separate missed body terrain queries, zero dispatched body events, and exact native return plus4,533,386 declared semantic bytes. This includes the complete4,443,040-byte body arena, shared pools and scratch; read-only spans also retain native entry/exit invariance. The first replay failure exposed eager vehicle-only state binding for nonvehicle bodies; the selector now runs only inside native41d9a0's exact flags branch after effect clearing. The failed report remains retained. All171 installed files and copied originals retain their hashes. The hidden capture closed after46.229 seconds. Continuous frames, broader impacts/effects/recovery and complete callgraph stack/ABI proof remain open; see [whole-frame replay work](native-physics-frame-replay-plan.md).

The first complete frame is stationary at launch, not moving-car evidence. Later expanded comparisons include every validated geometry span, including late collision reads and exact declared render vertex copies, after subtracting already-covered core spans. `analysis/physics-native-three-frames-expanded-20261022/` matches clocks228..230 (4,885,396 bytes/frame); staggered launch timers allow some cars to start during these frames. `analysis/physics-native-moving-frames-20261022/` matches288..290, all six moving/translating,24 wheel contacts and no processed body events each. `analysis/physics-native-turn-frames-20261022/` matches348..350, all six moving,13/9/7 source-dispatched events and exact resulting declared state. The latter windows compare4,880,872 bytes/frame; geometry extents differ between captures, not between independent/carried methods. No model queries occur in these windows; examine collision normals before assigning wall/ceiling scenarios. Installed/copied originals retain all171 hashes (`analysis/physics-native-moving-source-verification-20261022.json`, `analysis/physics-native-turn-source-verification-20261022.json`).

Carried-source reports are `analysis/native-frame-sequence-three-compact-20261022/`, `analysis/native-frame-sequence-moving-union-20261022/` and `analysis/native-frame-sequence-turn-compact-20261022/`. Each preserves source physics output across three frames, supplies only observed native after-to-next-before changes and declared ABI refreshes, and compares before subsequent patches. Respectively384,352/402,302/82,276 external changed bytes and8,200 ABI bytes are supplied per window, with zero overwritten source-divergence bytes. Every snapshot must fully cover the fixed first observed address union; moving free-list roots and VirtualQuery boundaries are recorded rather than mistaken for allocation identity. This validates connected physics with supplied external producers, not reconstructed AI/input/rendering or uninterrupted gameplay. See [sequence replay](native-frame-sequence.md).

The optional frozen dispatch observer records each live source dispatcher input and output without exposing writable body/event references. With observation enabled, the terrain-contact window still matches every declared final byte; `analysis/native-frame-dispatch-turn-20261022.json` records29 responses, all static terrain involving car/type3 or wheel/type4 bodies, with swept/penetration classifications.26 contacts match a declared type0/3 terrain candidate plane; three merged/edge normals remain unclassified. No body-pair or type6/7 border event is established. A separate original-process attempt observing474bb0 only at clock348 reached zero events in its paired frame (`analysis/physics-native-direct-event-frame-20261022/`), although all4,885,396 declared bytes and six moving cars match. It supplies no positive native event-stream proof; fixed-clock collision selection is insufficient across runs. A bounded host-side pending-entry/event latch is the next capture-tool requirement. The reached active-controller force branch has a separate [stack and sound binding obligation](native-active-effect-binding.md); it remains an explicit unsupported error when reached, never an inert success.

That host-side latch is now implemented and executed synthetically (`analysis/native-capture-pending-verified-20261022/`): first candidate discarded without publishing snapshots; second retained with its actual event and matching return. Its subsequent original-process report `analysis/physics-native-selected-collision-20261022/` is positive: clock348, two ordered474bb0 entry records, all104 bytes plus exact ECX/event-slot address and signedEDX delta match, and all4,885,396 final semantic bytes/native return match. Both calls are swept static contacts involving a type4 wheel body and the same declared type7 terrain-border plane (deltas766 and32768). This establishes that reached wheel-border response path, not a car-chassis wall or car-pair impact. The frame has19 physical bodies,35 body-terrain queries/two hits,22/24 wheel-query hits and one regenerated event. All171 installed/copied original hashes remain unchanged (`analysis/physics-native-selected-collision-source-verification-20261022.json`).

Native scenario identity is now recovered independently from the exact43b0e0 selection producer and41dbb0 participant constructor. `analysis/native-frame-identities-20261022.json` records selected HIGH/LEV3 for the launch and selected-border captures, and HIGH/LEV2 for the moving/terrain-contact windows, plus their actual six selected car types. These are different native scenarios; equal clocks do not imply the same track or cars. The selected resource path is producer-derived; the filename buffer is not in these captures and an independent loaded-asset fingerprint remains unestablished.

The selected body-pair case is HIGH/LEV5, clock359/counter131, six moving participants with native vehicle selectors `[6,3,1,5,0,2]`. `analysis/physics-native-selected-body-pair-20261022/` and the independent recheck match all4,951,894 declared final bytes/native return and four directly observed kind0 records, actual event addresses and signedEDX deltas `[29696,0,4864,0]`. Both bodies in every observed pair have the actual type3 car-chassis kind; flags `[1,2,1,2]` cover swept and penetration responses. The host observer counts six total dispatcher calls, agreeing with source; four pair records are retained, while two kind1 terrain record bytes are explicitly outside this substream comparison. The complete frame includes14 bodies/two scripted,24 wheel contacts,57 body-terrain queries/two hits, two stored static contacts and three regenerated events. This is one positive native car-pair scenario, not all vehicle combinations or impact conditions. Its separate identity ledger and unchanged171 installed/copied hashes are `analysis/native-frame-identity-body-pair-20261022.json` and `analysis/physics-native-selected-body-pair-source-verification-20261022.json`.

Terrain-query evidence adds `analysis/physics-native-terrain-active-wheel-20261022/`: 32 exact queries recorded only when the actual native race phase was4, including 24 successful wheel contacts and eight body-sphere misses. The separate active body batch adds sixteen exact misses. Entry/exit identity, real candidate/vertex bytes, numerical context and complete declared mutable spans are checked; source replay fails on uncaptured memory. Earlier33 miss queries had no race-phase observation and do not establish active racing. No whole-frame or whole-trajectory conclusion follows from these leaf checks.

## Controlled recovery and visible checkpoint, 23 October

A bounded natural-recovery search completed815 discarded parent candidates without a selected application (`analysis/physics-native-selected-recovery-v2-search-20261022.json`). This establishes no positive natural trigger. A separate guarded run explicitly supplied only first-body state32 at clock228; the three accompanying no-op writes asserted the clock, active phase and body flags. It supplied no route, pose or obstruction answer. The original and source parents reached one matching application entry, including the actual pointers, body header, position, quaternion, rotation, route and index (`analysis/physics-native-controlled-recovery-20261022/report.json`). The source then stopped at an unsupported sound allocation service, so the complete parent report remains failed.

The independent prefix checker compares every predeclared frame/recovery global span at that native application boundary: all34,546 bytes and the application inputs match (`analysis/physics-native-controlled-recovery-prefix-20261022/report.json`). The later sound error remains in the report with `sourceComplete:false` and `fullParentOutputCompared:false`. This is controlled-input prefix evidence, not a natural recovery or full-parent output proof. A deliberately changed observed global byte makes the regression fail despite identical application inputs. Literal recovery-position pointers now resolve through the actual module base; the sparse-ASLR test exercises the real parent, frozen observation and identical observed/unobserved output.

The Track Viewer now exposes single-frame stepping, an explicit Test recovery request through the real post-frame routine and a visibility-only physics HUD with current counters and four actual contact flags. Its progress note retains the super experimental warning and open timing/weapons/respawn-effect boundaries. Actual Edge checks cover controls, recovery/reset, narrow layout, unavailable-track gating and150-tick Node/browser parity (`analysis/physics-viewer-visible-progress-responsive-20261023/`). These visible controls add no native trajectory claim. The broader physics goal remains active.

The combined checkpoint regression exits0 with all2,115 tests passing and no failures/skips (`analysis/physics-fidelity-tests-20261023-visible-progress.txt`), including generated-page consistency. This does not change the incomplete full-parent sound/effect result above.

## Six-car Expert viewer integration

At the user's request, Racing test now constructs six original car types0..5 at distinct authored grid slots. Participant count6 and all selected native types are published before construction and AI initialization. The roster-wide450e50 stage order is preserved: all dispatch calls precede all route-control calls, then all input conversions, one shared progression/physics world and all post-frame speed/wheel updates. Car-pair collision responses therefore operate on the same actual shared body/spatial/event state, rather than independent simulations. Lap and recovery state are tracked separately for all six cars; follow, HUD and the test recovery control identify car1. Reset rebuilds the complete roster and scenery.

Expert is native session+585 value2, established by the ordered Easy/Hard/Expert menu resource and43da60 producer.410060 supplies it to5ea4d8 before41ebb0 profile initialization. The viewer explicitly chooses that difficulty without pretending to run frontend unlock progression. Exact native packed-profile rows and their Expert transforms are checked for all six cars. Existing source callers retain single-car/Hard defaults; array options are copied and reset preserves their values.

Installed-data coverage is36 allowed tracks×300 ticks, with real car-pair dispatches, distinct constructor/model identities, moving poses, reset and source-byte preservation (`analysis/solo-roster-six-expert-36tracks-debugfix-20261023.json`). The LOW/LEV1 long window reaches3,000 ticks and laps `[4,5,4,5,4,4]` with no recoveries,304 car-chassis pair responses/eight distinct pairs. Initial150 ticks match the fresh browser ByteBuffer bundle. Actual headless Edge checks six GPU car submissions, Expert labels, controls/recovery/reset, mobile layout and unavailable-track cleanup (`analysis/physics-viewer-six-expert-final-20261023/`). This adds no claim of uninterrupted native AI trajectories, completed laps on every track or full scenario fidelity.

The complete combined suite passes2,121 tests, no failures/skips (`analysis/physics-fidelity-tests-20261023-six-expert.txt`). The separate4,000-tick default single-car regression still matches the bundled browser every tick, completes five laps with no recoveries and keeps the strict first-three-laps zero-recovery check (`analysis/solo-roster-legacy-single-regression-20261023.json`).

Before this steering, the independent native query capture failed during startup at a peer-thread suspension, with no recovery-leaf snapshots. Its owned child was terminated; the cause is not classified as a proven thread-exit race. The failed raw trace and explicit no-evidence report remain preserved (`analysis/physics-native-controlled-recovery-query-startup-failure-20261023.json`). All171 installed/copied original hashes still match (`analysis/physics-native-controlled-recovery-query-attempt-source-after-20261023.json`). The prepared apply capture has not been launched. Native captures remain stopped while the roster is verified.

## Follow camera presentation and selected cars

The user observed a blurred/doubled car only while following it in motion. The source exposed a concrete pacing mismatch: car poses advanced at30Hz while camera translation eased on each RAF. The viewer now interpolates the two latest completed poses for all thirty car parts and modeled scenery; the follow camera takes the identical displayed position, with separate smooth heading. This is display-only, with a one-tick presentation delay and no physics writes. Pause/step/reset use the exact latest pose; recovery and visibility changes snap instead of interpolating discontinuities. Quaternion interpolation retains scale and short-arc rotation; fast-wheel phase aliasing remains a known visual boundary. This is not original render-scheduler fidelity.

Car to follow selects any existing racer while running or paused. It changes follow focus, HUD and explicit recovery target, preserving the roster and scheduling. Reset keeps focus; loading another track resets it. Actual Edge exercises all six paused selections with an unchanged complete physics snapshot, selected-only recovery, running selection and60 real RAF samples. Fifty consecutive same-tick sample pairs show different rendered poses while every raw physics field stays identical; camera translation equals the displayed selected pose throughout (`analysis/physics-viewer-follow-selector-final-20261023/`). Node/browser150-tick full-roster parity and existing exclusions/controls still pass.

In parallel, `src/native-recovery-audio-call.mjs` now publishes the real47ccc0→484bb0 stack boundary, including the surviving ring ECX, seven arguments, caller registers and relocated return. Twelve retained caller cases and four full emitter/absent-bank stack comparisons pass. The actual populated adaptive channel remains an explicit unsupported allocation/source-service dependency; the incomplete parent has not been relabeled a match or changed to an empty bank. This component is not yet used by the raw parent. See [sound dependencies](native-recovery-sound.md).

The new terrain component composes the real constructor/update without inventing controller handles or animation flags. Installed comparisons match all mapped bytes above10000h under PC24. A real source camera constructor supplies its own eligibility flag in a separate synthetic case; live collision forms and surface classification then change correctly. This does not close the camera lifecycle, dirty-range/palette presentation or native terrain scenario evidence. See [terrain component](solo-terrain-runtime.md).

This combined checkpoint exits0 with2,135 passing tests and no failures/skips (`analysis/physics-fidelity-tests-20261023-follow-selector.txt`), including exact generated-page consistency. Original-game captures were not launched during these camera/selector/component changes. Full fidelity remains incomplete.

## Native capture interaction and display policy

The user reported that earlier runs displayed the launcher and took the screen, and that they pressed Start. Those runs must not be described as unattended. The local directory named `attract-capture` actually records frontend ECX3/EDX1, configuration mode3/selector1, session mode9/attract0 and first body execution mode10. Six participants do not prove six AI controls. Its original race-entry numerical context is valid; its external input history is incomplete. Retained selected fields: `analysis/physics-native-race-entry-20261022/report.json`.

The capture setup now uses the original Skip Launcher and Skip Movies settings, clears the game's fullscreen flag after `408060`, verifies D3D Windowed/refresh before `512a30`, and applies explicit hidden/no-activation and owned-window foreground-query adapters. Unsupported modal calls abort capture. The guarded boundary probe reaches the device boundary without launcher input, with Windowed1 and refresh0. The subsequent hidden idle run reaches six native AI participants and the first physics call without any user input; see `analysis/physics-native-hidden-device-20261022/` and `analysis/physics-native-hidden-idle-20261022/`. Terminal cleanup freezes owned threads before unpatching and terminating its child. The user should not press Start or drive for subsequent runs unless explicitly asked. All 171 installed source hashes remain unchanged after this run (`analysis/physics-native-source-check-20261022-final/report.json`).
