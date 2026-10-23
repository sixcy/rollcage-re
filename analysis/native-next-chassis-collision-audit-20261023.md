# Next original-process chassis collision scope

Read-only audit on 2026-10-23. No game launch, REA setup, preparation/config
write, or source/tool/test/documentation change. This new analysis note is
the only file added by this task. Installed files remain read-only.

## Existing actual coverage

- `analysis/physics-native-selected-collision-20261022/report.json` compares
  two complete native dispatcher records and complete frame state at clock
  348. Both bodies are type 4 physical cameras, contacting terrain border
  type 7. The ownership correction is independently proved in
  `re-docs/native-camera-body-identity.md`; these are not wheel bodies or
  chassis-wall events.
- `analysis/physics-native-selected-body-pair-20261022/report.json` compares
  four kind-0 records, actual type 3 + type 3 chassis pairs, including swept
  and penetration classes. Two static records in that frame are outside
  its declared native-event subset.
- `tools/prepare-native-force-frame-capture.mjs` observes `47b020` from
  `47a90e`, return `47a913`, at physics entry ESP minus 96. Its positive
  `analysis/physics-native-selected-force-v2-20261022/report.json` supplies
  actual force-entry inputs and complete-frame output equality. An entry
  can still return through native radius/direction gates; it does not
  independently prove an isolated force-output write or a wall collision.

## Exact reusable observer contract

Retained `278-physics-frame-assembly.json` places queue reset at `474a46`,
initial event construction at `474a4b`, filtering at `474ac7`, response
dispatch at `474ad5`, and dispatcher return at `474ada`. At `474bb0` entry:

| Observation | Exact descriptor / meaning |
| --- | --- |
| Event | `{baseRegister:'ecx',length:104}` |
| Caller | `{baseRegister:'esp',length:4}`; value actual `474ada` |
| Delta | signed native EDX |
| Parent stack | dispatcher ESP equals physics entry ESP minus 28 |
| Pool root | `{rva:'0x502ba8',length:4}` |
| Pool capacity | `{rva:'0x502ba4',length:4}`; record stride 104 |
| Event fields | kind+0, bodies+4/+8, point+2c, normal+38, cell+44, class+54, tag+58 |

`tools/prepare-native-event-frame-capture.mjs` already supports a complete
fixed-clock frame, first collision, and first kind-0 body-pair frame.
`tools/check-native-event-frame-replay.mjs` checks exact ordered raw event
bytes/address/delta and complete final frame state separately. The current
kind-0 predicate is exactly four zero bytes at ECX. There is no existing
compound "kind 1, chassis type 3, actual border 6/7" selector. A first
collision latch can still stop on another camera event; it is not a chassis
coverage guarantee.

Native border proof must match the event cell and plane normal to the
actual candidate record, then establish terrain type 6/7 and body type 3.
`tools/lib/native-frame-event-trace.mjs` already performs this classification
when model query count is zero. A horizontal normal alone does not prove a
border; merged/edge normals remain explicitly unresolved. Model-query cases
need their actual model producer provenance instead.

## Concrete next action: source preflight of a bounded force input

The next useful action is an **offline source preflight**, before another
native run. Use one retained actual entry with full native registration and
geometry (prefer the selected border capture), and clone its bytes. For a
participant body reached through actual `909300 + index*30c`, leave its
position, quaternion, matrix, momenta, spatial links and shape ownership
unchanged. Try a small declared set of signed force increments in the
12-byte accumulator at body+74. Derive directions from actual candidate
border normals, rather than assuming world X/Z. Run genuine ordinary
preparation, candidate generation, queries and response through the normal
source replay, then require a type-3/type-6-or-7 dispatch and complete
bounded source execution. Record the exact chosen input, arithmetic,
candidate plane, original input bytes and resulting source event stream.

This preflight was **not performed by this audit**. No winning force vector,
border proximity, or guaranteed source/native contact is asserted. If the
captured chassis is too far from an admissible border, retain that failure
and use a later naturally observed entry; do not move it beside a wall.
Newly reached geometry, effect/audio state or collision callback gaps must
remain explicit missing inputs/dependencies.

Why force+74 instead of velocity+68: native `479ed0` adds force to momentum
body+40 and clears the accumulator; native `479b30` then derives velocity
body+68 through inverse mass and its vector speed limiter. The recovered
`47a8e0` parent also applies gravity/drag, contact friction, and exact-flag
`1c03` vehicle force `41d9a0` first. Writing velocity alone is overwritten
or makes the pre-existing momentum/velocity relation inconsistent. A force
input lets genuine game code produce the new momentum and velocity. It is
still a declared experimental input, not proof of a natural weapon/input
producer.

The source preflight must use all actual body fields: pose+34, momentum+40,
angular momentum+4c, quaternion+58, velocity+68, force+74, torque+80,
inverse inertia+9c, mass/inverse mass+a8/+ac, matrix+c4, derived inertia+e4,
frame/cache/state+108..128, shape IDs around+140, callback+148, candidate
pointers/counts+154..15e, and vehicle wheel/contact/speed/control state.
The actual source/runtime views already expose these fields; no synthetic
body constructor or empty spatial bucket should replace them.

## What existing phase actions can and cannot do

`MemoryWrite` in `tools/lib/native-physics-debugger.cs` admits an explicit
RVA/register/pointer chain, fixed replacement bytes, and exact original-byte
guards. It does not calculate a force from live geometry or call the native
registration/pose algorithms. Guards are checked before each actual write,
and every write is retained as an intervention. This is sufficient for a
previously source-proved literal force vector, with matching input guards;
it is not a general controlled scenario constructor.

A plausible future guarded call site is retained parent `451012`, the CALL
to `4749e0` (RVA `0x51012`). A separate **unfiltered** action breakpoint there
can resolve the car with `{rva:'0x509300',dereferenceOffsets:['0'],
offset:'0x74'}` and write only the selected force bytes. Capture its actual
pre-write common header (180h bytes), phase, clock and participant root.
Record no-op exact guards for the chosen pose/orientation/flags and original
force. The subsequent physics-entry snapshot then observes the real
post-input state. Validate that all other header bytes, especially spatial
links and pose, are unchanged. Heap addresses must come from current native
roots, never copied between processes. The raw hit and phase/clock guards
must be proved for this site/run; the recovery experiment's different
`45101c` hit 229 is not automatically reusable.

The helper explicitly prohibits phase actions on pending observer sites and
on filtered breakpoints. Existing controlled recovery uses a separate
unfiltered caller for exactly this reason. Do not attach force writes to
the filtered `native-frame-before` or dispatcher observer. A new narrowly
declared profile and intervention-aware validator are required before a
controlled force experiment; the existing event preparer is not already
such a profile. Avoid a generic phase-action whitelist bypass.

Once preflight succeeds, retain a complete targeted frame and all direct
dispatcher entries at its proved clock. Require at least one actual
chassis/border event, exact event byte/address/delta parity, and full frame
outputs. Camera-only hits, an empty stream, failed guards, partial captures,
or source-only forecasts do not close the missing runtime scenario.

## Ceiling and inverted driving remain separate

Changing body+34 or matrix+c4 alone would leave the original spatial bucket
links, quaternion, inverse inertia, shape caches, contact state and wheel
history inconsistent. Native spatial membership is at body+4/+6 and the
tagged bucket pointer+0c; `479d20` and the genuine removal/reinsertion paths
own movement updates. Existing literal phase writes cannot invoke those
algorithms. Therefore no current action safely manufactures an inverted
ceiling start by a few pose writes.

After chassis/border coverage, select genuine upside-down/ceiling motion
through an authored track route or a complete proven native pose producer.
Classify it with actual quaternion/matrix and wheel-side state plus the
contact plane/geometry and event stream. A ceiling-shaped render mesh, a
normal sign, reversed gravity, or a downward/upward impulse by itself is
insufficient. Keep wheels contacting a surface, chassis impacting a surface,
inverted orientation, and sustained inverted driving as distinct claims.

References: `re-docs/native-frame-event-targets.md`,
`re-docs/collision-data.md`, `re-docs/static-sphere-contacts.md`,
`re-docs/physics-runtime-views.md`, and
`re-docs/vehicle-preparation-force.md`; implementation anchors
`src/body-preparation.mjs`, `src/body-physics.mjs`,
`src/terrain-candidates.mjs`, `src/static-collision-candidates.mjs`.
