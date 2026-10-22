# Physical interaction integration

The Racing test drives one constructed vehicle through terrain and native
ordinary/scripted placements, with recovered damage, destruction, attachments and
physical fragment pools/stages connected. It does **not** establish Redux
equivalence for physical interactions. This audit distinguishes those working
source connections from remaining runtime and presentation gaps. No original
process was launched for this work.

## Current support and missing contracts

| Interaction | Recovered implementation | Racing test boundary |
| --- | --- | --- |
| Car to car | Body-pair candidate/events and collision response; actual `41e080` vehicle filter, scoring and recovery | One participant only. Construct all participants, publish the native physical lists and spatial groups, retain the same body identities, and register native filters with their real entry-stack runtimes. Collision physics already accepts multiple bodies; do not replace it with steering separation. |
| Class 1 placed models | `48ec50` break, fragment emission, spatial removal, attachment release | Connected through raw query defaults, original `48e800` bank and `48edb0` aging. Installed LOW/LEV1 exercises real fragment/particle/debris emission. |
| Class 2 placed models | `4142a0` break; `413fc0` damage; `414060` deferred effects | Connected using loader-created pending rows (`920800`, count `9207e4`), object `+19b`, actual attachments/lights and live effect globals. |
| Class 4 destructible models | `421da0` damage, `415190` destruction queue, `415230` two-stage preparation/update | Connected using original group/count/chain/configuration producers and original destruction/fragment constructors. Type-4 shape damage also applies to other placed classes. Installed LEV13 damage completes its linked destruction lifecycle. Collapsing meshes are not animated in the viewer. |
| Moving/scripted scenery | Authored construction `429c90`, startup `429d60`, update `429f30`, raw runner `476550`, release `46e4e0`, filters `40fcb0/40fdb0/40fe30/46e470` | Connected using original list/templates/scripts, native callback contexts and live attachment queue. Modeled objects render native poses/retirement/shrink. See [scripted-world evidence](scripted-world-runtime.md); type20 UV changes and render-produced attachment-effect submission remain open. |
| Physical world fragments | `480760` constructor, `480bf0` activation, `4810b0` impact callback, `480e90` maintenance | Connected: original 36-body registry/templates, shared physics identity/filter and actual maintenance. Native activator selects slots 0..27; no invented producer fills tail slots 28..35. The viewer does not draw these bodies. |
| Attached lights/particles | Authored attachment construction `44ee60`, transform/update `44f050`, release `44ef90` | Connected for ordinary placements: actual points/handles/tables, lights and queue drain immediately after physics; `44f990/44f3a0` maintain persistent/attachment effects later. Particle drawing remains absent. |
| Radial impulse/damping | `47b020` / `47b280` and active vehicle effect `482730` | Live effect globals and target cache fields were missing from the solo frame context. The adapter below supplies them; it does not generate explosion events. Shield/controller allocation and effect emission still need their native producer and call stack. |

The ordinary-placement phase is extracted from `loadRuntimeRaceTrack`, retaining
its linked configuration and registry writes. Native raw callbacks now operate
on those constructor outputs. Complete original race startup/render submission
and original-process trajectory equivalence remain separate work.

## Live effect state adapter

`createPhysicsInteractionRuntime({memory})` in
`src/physics-interaction-runtime.mjs` exposes `bodyEffectImpulse`,
`bodyEffectDamping`, `worldEffectState` and `bindBody(body)`.

- Pass the three state objects into the existing `stepSimulationFrame` context.
  Origins, strengths, pending row counts and time-scale state are read from
  native memory on each use. The world origin uses signed high words, matching
  `413fc0`, rather than rounding the Q16 coordinates.
- Call `bindBody` on the shared vehicle body before exposing it to the frame.
  It binds `+674/+680` direction vectors and `+6b8/+6ba` counters to native
  storage; in-place direction reduction writes through immediately. Binding
  preserves object identity and rejects detached storage or conflicting owners.
- First-effect direction scratch aliases `91d45c/91d460`. Second-effect outputs
  alias all six DWORDs at `91cd60..74`. The adapter preserves stale values until
  the recovered routines write them.
- Pending rows are bounded by the 50-record region initialized by `47eb38`.
  Invalid live counts fail explicitly, rather than treating later globals as
  model records. Zero pending rows are a legitimate empty state.
- Keep `effectFlags` from `createPhysicsRuntimeViews`; the scheduler owns their
  clear point after the external-world stage. No additional clearing belongs
  in this adapter.

The adapter creates no model, fragment or weapon pools. It selects no gravity,
time scale, rounding policy, seed or damage strength. An active vehicle still
requires the actual `482730` consumer and emitter; absent wiring fails when the
branch is reached. The raw consumer is already implemented by
`applyRawActiveVehicleEffect` and preserves state identity across sound calls.
The structured variant's narrower callback contract must not be represented as
a complete equivalent when callbacks can replace pointers.

## Weapon interaction matrix

`47be20` dispatches the signed slot types below. All have recovered source
implementations; none is enabled in Racing test by this state adapter.

| Slot type | Recovered physical path | Required state before integration |
| --- | --- | --- |
| 0 | Ground projectile launch/flight/collision | Native projectile pools, route/material state, shape filters and owner links |
| 1 | Homing projectile launch/guidance/collision | Same pools plus live targets and guidance records |
| 2 | Satellite projectile launch/flight/collision | Master/child body identities, native circular spatial/physical lists |
| 3 | Terrain wave | Authoritative terrain vertices, affected sector/row state and contact scoring |
| 4 | Race launch impulse/boost state | Native launch counters and input edges, with `48d7c0` threshold state retained across the participant loop |
| 5 | Time effect | `811180/184/188/18c`, exempt body identity, recovery policy and ordered fade updates |
| 6 | Vehicle contact effect/shield | Original `4820f0` directional lookup, `482590` controllers and `482680` activation |
| 7 | Wormhole transport | Constructed wormhole bodies, target/owner links, transport destination and dynamics copying |

Projectile impact `46bcd0` applies the shield consumer or an RNG angular kick,
zeroes linear momentum/velocity and publishes radial effect globals. It is not
equivalent to an arbitrary immediate velocity multiplier. Likewise, time
effects must retain per-body exemptions through gravity, shape preparation and
advancement. Use `runRaceUpdate` ordering: object/deformation passes precede
physics; attachments and post-frame states follow; `48d7c0` then updates
weapons, with destruction/fragment passes later in the tick. Do not inject new
forces before physics merely because the viewer renders once per frame.

## Validation and remaining evidence

The six new adapter tests cover shared body identity, live origins and strengths,
in-place/fallback direction writes, all damping outputs, nonzero time-scale
gating, live model row counts and signed origins, explicit active-vehicle
failure, detached storage and conflicting ownership. With the existing impulse,
damping, world-record, physics-view, simulation-frame and raw-model-query tests,
the focused command passes **54 tests**:

```powershell
node --test tests/physics-interaction-runtime.test.mjs tests/body-effect-impulse.test.mjs tests/body-effect-damping.test.mjs tests/world-effect-records.test.mjs tests/physics-runtime-views.test.mjs tests/simulation-frame.test.mjs tests/raw-model-sphere-query.test.mjs
```

This changes storage composition only; no recovered arithmetic was altered.
Underlying instruction-comparison tools include
`verify-body-effect-impulse-instructions`, `verify-body-effect-damping-instructions`,
`verify-world-effect-records-instructions`, `verify-raw-model-sphere-query-instructions`,
`verify-placed-object-damage-instructions`, `verify-vehicle-collision-filter-instructions`
and `verify-projectile-collisions-instructions` (all `.mjs` under `tools`).
Their retained interpreted-instruction matches remain distinct from runtime
evidence.

Completion needs original-process captures with initial shared state, clocks,
FPU context and ordered stage snapshots for car contact, each placed class,
scripted release, fragment splitting and each physical weapon mode. Compare
the first divergent state producer or arithmetic operation. Do not infer
faithfulness from complete laps, an empty effect bank or unused zero-filled
globals.

## Normal-gravity Racing test recovery trace

The recovered normal gravity (`65536`, replacing the earlier `16384` viewer
assumption) changes the deterministic LOW/LEV1 trajectory. The strict existing
requirement for three recovery-free laps remains a failed regression; browser/
Node agreement does not convert that failure into success.

`tools/trace-physics-recovery.mjs` runs the installed-data JavaScript session
without executing the original process or altering AI/physical arithmetic. It
retains 120 ticks before/after each recovery and consumes the optional immutable
`onDebugFrame` observer added to `createSession` by the session integration.
It also records nearby authored model metadata as candidates, not contact
attribution. All reports use exclusive creation:

```powershell
node tools/trace-physics-recovery.mjs 'C:/Program Files (x86)/Psygnosis/Rollcage' analysis/physics-recovery-diagnosis-20261022.json 10000
```

The named report retains a fresh 10,000-tick session with 30,000 stage
observations, bounded to incident windows. Earlier snapshot-only and debug-only
reports remain in `analysis/physics-recovery-20261022.json` and
`analysis/physics-recovery-debug-20261022.json`.

| Tick | Before / after recovery | Exact observed trigger |
| --- | --- | --- |
| 3499 | Route 1, point 18, checkpoint 4 -> route 1, point 20, checkpoint 4; position `(-1565.43,129.71,5626.27)` -> `(-1589,180,5275)` | Body state `+128` changes 0 -> 32 inside physics, before post-frame checks; one event, two model hits, no terrain hit. |
| 8736 | Previous completed frame route 8, point 2, checkpoint 2; AI selects route 1, point 25 before physics; recovery places route 7, point 1 at `(-5165,0,5181)` | Same 0 -> 32 transition inside physics before post-frame checks; one event, two model hits, no terrain hit. |

The state producer is the static rejection path:
`474bb0` classification 16 -> `47cc20` (`completeRejectedCollisionBody`) ->
`47ccc0` respawn dispatch. Both vehicle prepass alternatives are ruled out:
all four wheel flags equal 1, record `+248` equals zero, and neither car Y value
exceeds its sector height plus 512 threshold. At the first incident, speed is 7
and Y is 129 against a threshold of 772; at the second, speed is 9 and Y is
-17 against a threshold of 792. No forced viewer trajectory correction was
introduced.

Both incidents are beside the same authored scenery kind: model 10, class 2,
two shapes with configuration type 1. First-nearest placement 51 is at
`(-1544,180,5572)`, approximately 77 units from the car; second-nearest incident
placement 2 is at `(-5151,0,4998)`, approximately 72 units away. The existing
class-two sphere branch returns `0x240` even when its break callback is
suppressed. Native `4142a0` instead removes the model's spatial membership,
sets class 5 and updates its pending row. Suppressing that producer leaves a
persistent damping obstacle. The first incident shows repeated model contacts
and very low speed for roughly 50 preceding ticks.

This makes omitted class-two destruction a concrete common candidate, not a
proven sole cause: the observer does not identify the exact contacted placement
or the internal contact-merge failure. `448570` can reject missing selected
contacts, cancelling normals or zero normal alignment. The next discriminating
observation is an immutable placed-model contact record (placement/class/shape,
time and query type) and the merge rejection branch, followed by the same
scenario in the original process. Restore the actual loader-created pending
rows and raw model callbacks before changing handling; changing gravity back,
softening collision response or weakening the zero-recovery assertion would
hide the missing interaction.

## Reusable native placement construction

The ordinary placed-body section `44ccbc..44cfb7` is now extracted into
`constructTrackPlacedObject` in `src/track-placed-object-construction.mjs`.
`loadRuntimeRaceTrack` calls this same helper. This is a JavaScript extraction
of an owned parent section, not a newly invented native function: the original
parent frame `F`, parent runtime and child register/stack context remain
distinct. Allocation, quaternion/attachment calls, linked group state, pending
rows and spatial insertion retain the original order and return-address stores.

`constructSoloWorldPlacements(runtime)` in `src/solo-world-runtime.mjs` invokes
that section after the viewer's existing pack relocation. Its inputs are:

- Shared `memory`, an explicit native `scratchBase`, `modelContext` parsed from
  the original BLP/BTP, and a mapped original BTP `textureAddress`.
- Call `initializeSoloWorldConstants(memory)` once for the new image. It copies
  the retained 202-DWORD cosine table at `575228`; the previous solo numeric
  package did not include it. Even zero authored angles need its cosine entry
  for a valid quaternion and attachment transform.
- `geometry: relocated.geometry` and
  `configurationBase: relocated.auxiliary` from `relocateRaceTrackPointers`.
  The latter is the shape-configuration base, not the destruction-group table.
- The existing native body arena/cursor, constructor registry and spatial map,
  already-published pack roots and material pointers, and original arithmetic
  image constants. The pending class-two registry must be fresh.
- `services.libraryCall` implementing ordinary `allocate`, `memset` and `free`.
  No GPU, bitmap decoder, renderer singleton or platform service is required.

The composition prepares the original loader-frame inputs, builds every type-0
ordinary placement, fixes its serialized placement references and releases the
temporary object map. Other authored placement types are returned explicitly
as `skippedPlacements`; dynamic objects and independent presentation particles
remain separate work. The body arena is not rewound. Existing car/body pointers
keep their identities if construction occurs after them.

Returned `modelContext` settings read native class, yaw, configuration words,
remaining group state and positions. `candidateMapping` maps those same parsed
shape identities to the constructor's actual object pointers. The exact Q16
position is exposed separately as `positionQ16`; raw queries must consume the
native position when fractions matter. `worldEffectState` aliases the real
pending class-two rows. `objectForPlacement`, `constructedBodies` and
`attachmentCount` expose native identities and counts without reconstructing
independent body copies.

An installed LOW/LEV1 test constructs **114 ordinary objects, 14 pending
class-two rows and 39 attachment particles**, using only those three CRT memory
services after relocation. It then invokes actual `4142a0` on placement 51:
native class/configuration become 5 and pending row `+9` becomes 1, immediately
visible through the bound parsed context. The ten other authored rows are
explicitly outside this ordinary-only fixture; the all-placement bridge now
constructs those rows too. Six focused tests pass,
covering pointer identity, changed configuration pointers, raw position widths,
detached-input failures, full-loader class 1/2/4 construction and installed data.

The extraction also passes the complete existing native loader comparison:
**240 fixtures, 480 operations, 26,797,554 interpreted steps and 7,200 reached
instructions**. Every mapped byte above `10000h`, all 56 retained parent-local
bytes and ordered service/upload calls agree. Retained report:
`analysis/track-runtime-placement-extraction-20261022.json`. These are synthetic
instruction matches plus installed-data source execution, not original-process
trajectory evidence.

Effect startup dependencies (now connected in the Racing test):

- Every LOW/LEV1 class-two placement has a type-1 light and type-2 particle
  attachment. The phase constructs particles and copies light IDs, while native
  `48ef30` / `44e220` construct the corresponding light storage/ranges later.
  Run `initializeDynamicLightStorage` and `initializeAuthoredDynamicLights`
  before interpreting attachment release as complete.
- Use actual raw model-query defaults: its class-two branch clears the WORD
  at pending row `+6` before breaking. Calling only the break child misses that
  producer. Bind `nativeModels` to the same physics views/memory, rather than
  supplying overrides that suppress its native effects.
- Class-one fragments require `48e800`'s fragment bank plus particle/debris
  pools and real spatial registration. Class-two deferred effects require
  `414060` in its native tick position, with the same initialized effect pools,
  terrain ranges, light state and shared effect globals.
- Class-four destruction also needs original template bytes, `480760`'s
  physical fragment registry, the `5ea4dc=255` image state and the later
  `415230` / `480e90` stages. The phase itself does not initialize or run those
  systems. The solo destruction bridge now supplies these producers and stages.

The read-only installed input inventory
`analysis/solo-world-inputs-20261022.json` covers all **36 LOW/HIGH variants**
after excluding LEV16/17. Maximum pending class-two count is 49, fitting the
native 50-row region; maximum ordinary-placement count is 163. Class four
appears on LOW/HIGH LEV13. Original placement data also includes linked groups
and up to 77 type-2 attachments, so replacing this constructor with a class-byte
or configuration-only patch would omit observable native state.

## Live destruction integration

`initializeSoloWorldDestruction(runtime)` restores the original template/image
state and calls actual `480760`, then `48e800`. It requires the already-relocated
pack/model/material tables, spatial map, common body arena, shape pools and an
explicit CRT allocator. The particle/debris pools and authored light storage
remain independently initialized prerequisites. It returns only the 36 actual
fragment identities/common-body byte spans plus the real `4810b0` filter, so the
physics factory composes them with vehicle/respawn views without pretending they
have a vehicle/controller allocation.

The three previous raw-query overrides are removed. `onClass4Break` specifically
means attachment release (`44ef90`); `onObjectContact` is the general `421da0`
configuration-type-4 damage producer. Damage/queue/destruction are not class-byte
patches. The session drains attachments after physics and keeps the native
relative lifecycle order: debris, `414060`, particles, `48edb0`, `415230`,
`480e90`, persistent emitters and attachment effects. The surrounding full
`450e50` graph and exact original allocation order remain outside this adapter.

Class 1/2 removal hides the corresponding authored group. Class 5 also denotes
an active collapse, so groups with live destruction controllers remain visible
until completion. Their displayed mesh retains its authored geometry during
collapse; rendering does not yet consume the mutated model vertex/rotation data.
Physical fragments and emitted particles run their recovered state transitions
without being drawn. Reset reconstructs the same initial scene.

Validation:

- Four new tests exercise installed LOW/LEV1 class-1 fragment/particle/debris
  emission and aging, installed LEV13 type-4 damage through linked destruction
  completion, and native fragment activation/filter/retirement through shared
  physics identities. The installed impacts are controlled source inputs, not
  original-process samples. All 56 focused tests pass.
- `analysis/solo-world-destruction-instruction-check-20261022.json`: 64 fixtures,
  3,424 constructor/queue/preparation/update operations, 8,458,418 interpreted
  steps and 3,929 reached instructions match retained x86, comparing mapped
  data after each operation. Native arithmetic implementations were reused.
- `analysis/solo-world-destruction-sessions-20261022.json`: all 36 supported
  variants initialize and run 600 ticks. This short smoke check does not prove
  lap completion on those tracks. Its introductory method string predates the
  checker wording update; the executed runtime includes the destruction stages.
- `analysis/solo-destruction-10000ticks-current-20261022.json`: LOW/LEV1 completes 12 laps
  with zero recoveries and exact Node/bundled-browser state over 10,000 ticks.
  The strict first-three-laps zero-recovery assertion is unchanged. Its method
  and limits correctly identify the enabled destruction runtime. The earlier
  `analysis/solo-destruction-10000ticks-20261022.json` run has the same measured
  state/trajectory hashes but its text predates the checker wording update;
  its bytes are retained unchanged.
- `analysis/physics-viewer-destruction-20261022/`: real Edge start/pause/reset,
  150-tick Node/browser parity, experimental notice/exclusion checks and a
  screenshot pass, with no page, network or WebGL errors.
