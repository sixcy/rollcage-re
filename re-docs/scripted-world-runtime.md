# Scripted world construction and physics

The Racing test now constructs every installed ordinary and nonordinary BTP
placement on the 36 supported Rollcage LOW/HIGH variants. LEV16/17 remain
excluded. Scripted physical scenery uses the original constructors, startup,
bytecode, collision callbacks and shared physics lists. This is source/runtime
integration backed by retained-instruction comparisons; no original game was
launched for this work, and original-process trajectory equivalence is unproved.

## Installed input classification

`tools/audit-solo-nonordinary-world.mjs` reads installed BLP/BTP data and the
retained original `44c2b0` / `429c90` dispatch tables. Its immutable output is
`analysis/solo-nonordinary-world-inputs-20261022.json`:

| Authored type | All 36 variants | Original loader role |
| --- | ---: | --- |
| 2 | 50 | `4901d0` render particle, plus bounded position registry |
| 13 | 1,080 | Colored `4901d0` render particle sharing attachment numbering |
| 24 | 124 | `429c90` authored object constructor/list producer |

Type24's subtype selects the following actual body types. Counts include both
LOW and HIGH variants, not distinct object designs:

| Native body type | Count | Construction/startup behavior |
| --- | ---: | --- |
| 20 | 36 | Scripted kinematic model and global UV controller; physically listed without collision shapes |
| 25 | 58 | Scripted model with one shape plus aggregate; contact releases script control, later contact retires it |
| 35 | 14 | Scripted model with its own one-shape descriptor; contact emits effects and retires it |
| 24 | 6 | Optional-route kinematic model; all installed instances have nonzero routes |
| 31 | 4 | Scripted model; contact starts its existing age/shrink/spatial-removal controller |
| 32 | 4 | Empty, nonphysical debris emitter; native model field remains `ffffffff` |
| 29 | 2 | Four-shape scripted model; native release and later collision filter |

Each supported track has a type20 object. LEV8 contains type35 models and two
type32 emitters per variant; LEV11 also has type35. LEV13 has the type29 object
whose authored path includes action3 debris emission. LEV14/18 have type31
objects, and LEV15 has optional-route type24 models. The maximum authored list
has ten objects, below the original sixteen-pointer allocation; the maximum
physical authored count is eight. These are static constructor/startup
classifications, not native runtime observations. Per-placement identities,
scripts, speeds/actions, positions, models and source hashes are retained in
the inventory.

## Exact construction and native state

`constructTrackNonordinaryObject` extracts the existing `44cc53..44ccb7` and
`44cfc2..44d0b7` sections from the full loader. It retains the original parent
frame, registers, child entry ESP, stack arguments, live index reloads and
shared attachment counter. The full loader still invokes that same code;
there is no parallel approximation of object construction.

`initializeSoloAuthoredObjectList` supplies `47eb38`'s 64-byte list and initial
count/controller/effect-list state, plus original constructor/startup/update
tables. Call it once on a fresh race image. With `includeNonordinary: true`,
`constructSoloWorldPlacements` executes all original placement branches in
authored order. It returns actual authored body identities/storage separately
from ordinary parsed collision mappings. The body registry and spatial map
contain those same pointers. Type32's absent model is preserved rather than
being replaced by a dummy mesh or body.

The session preserves the relevant original startup order: placements, authored
lights, physical/contact fragment banks, debris, particles, `429d60` activation,
then the vehicle. The activation producer supplies exact shape descriptors,
physical/effect-list entries, script pointers (`+134`), offset/timers (`+138`,
`+13a`, `+13c`, `+13e`) and restart spawn byte (`+13f`). Scripts come from
relocated `9092b4`; restart positions come from original header `+a8`.

`stepSimulationFrame`'s explicit `nativeScripted` contract requires the same
memory/views and the actual `4749e0` entry minus24 bytes. It calls existing
`stepRawScriptedMotion`, retaining raw pointer reloads and native release/debris
children. It does not copy bytecode into the structured scripted-body path.
`429f30` updates object controllers before progress/physics, as in `450e50`.

`createRawAttachmentQueue` binds `902040` / `6e6ba0`. Dynamic/kinematic
advancement appends the actual body pointer; subsequent `44f050` consumes that
same queue and resets only its count. Duplicate and retained slots are not
deduplicated or copied. Its storage guard is mapped-memory extent, not an
invented native gameplay capacity.

## Recovered physical callbacks

Fresh public REA/Ghidra evidence is retained/exported in
`analysis/scripted-world-filters-elevated-20261022/`. The initial sandbox-blocked
attempt is preserved separately. Both sessions are closed; no executable was
run. New `race-object-collision-filters.mjs` implements:

- `40fcb0`: first contact clears scripted control, swap-removes targeting-list
  ownership through `48abc0`, advances original RNG and writes torque. Later
  contact emits actual effects and removes spatial/physical ownership,
  attachments and authored route-group participation.
- `40fdb0`: clears its filter, unregisters physical ownership and starts type31
  state2 with age0. Its existing `429fa0` update subsequently contracts the
  matrix and removes spatial ownership. Targeting removal retains native
  captured-count and one-past behavior.
- `40fe30`: actual effect emission, attachment release, spatial/physical
  removal, a second native attachment release and group-counter consumption.
- `48abc0`: exact targeting-list swap removal, including native absent-body
  behavior. `412520` decrements only the first matched group row and its
  immediately adjacent same-body row, preserving other duplicates/zero counts.

The filter registry also binds existing `46e4e0` scripted release and `46e470`
later contact routines. All bindings receive coherent body/event views and the
real callback stack (`4749e0` entry minus52). No accepted/rejected contact
answers or game effect callbacks are substituted.

## Presentation and remaining boundaries

`assets.worldObjects` contains locally decoded original model packets/textures
and placement/model identities. Immutable `snapshot.worldObjects` records expose
native position, matrix, body type and visibility. The renderer applies the
same established handedness conversion as the car, retaining native scale
during type31 shrink. Retired bodies disappear; object visibility toggles,
filtering, reset, track replacement and context loss own all allocated buffers
and textures. Nothing uploads or embeds the user's game assets.

Type20's UV controller runs, but the independent viewer uses its initial
embedded UVs. Pure type2/13 particles, debris and physical fragments are not
drawn. Ordinary destruction retains its authored mesh during collapse until
completion rather than consuming changing native vertices. The render-produced
`902f00` / `6e6b1c` attachment-effect queue still lacks its original visibility
submission producer; its recovered consumer runs on the actual queue. Complete
GPU/startup/draw submission, pickups, weapons and other cars remain separate
contracts.

## Verification

- `analysis/track-runtime-nonordinary-extraction-20261022.json`: full loader
  comparison passes240 fixtures/480 operations, 26,797,554 interpreted steps,
  7,200 reached instructions, every mapped byte above10000h, all56 live parent
  locals and ordered services/uploads. Original full-parent semantics remain.
- `analysis/race-object-collision-filters-20261022.json`: 240 fixtures/1,200
  operations, 8,773,680 steps and1,258 reached instructions. All mapped bytes
  match through real retirement/effect/pool children and empty sound guards.
- `analysis/native-scripted-frames-20261022.json`: whole `4749e0` frames with
  velocity, curve and facing scripts plus live attachment queues match retained
  x86 in240 fixtures/720 persistent frames, 5,067,360 steps and3,172 instructions.
- Installed tests construct all LEV1 dynamic models/particles, LEV8 type35 and
  actual type32 emitters, and LEV13 route action3 debris. Frame, callback,
  attachment-queue, snapshot/reset and renderer tests cover their boundaries.
- `analysis/solo-scripted-world-36tracks-20261022.json`: all36 variants run600
  ticks. `analysis/solo-scripted-world-252cases-20261022.json`: all252
  track/vehicle cases run300 ticks and reset; all seven LOW/LEV1 vehicle types
  additionally match fresh bundled-browser state at every tick.
- `analysis/solo-scripted-world-10000ticks-20261022.json`: LOW/LEV1 matches Node
  and bundled browser over10,000 ticks, completes12 laps and has zero recoveries.
  The strict first-three-laps no-recovery assertion remains unchanged.
- `analysis/physics-viewer-scripted-world-20261022/`: actual Edge draws all five
  LOW/LEV1 moving world objects, checks the Objects toggle independently of the
  car, performs track-change cleanup and compares150 native-pose snapshots with
  Node. No page, network or WebGL errors; screenshot retained.

Instruction fixtures and installed-data integration demonstrate these declared
producer/state connections. They do not establish original-process trajectories
or a complete rebuilt Rollcage Redux runtime.
