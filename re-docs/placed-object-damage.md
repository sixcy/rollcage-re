# Placed-model damage and connected raw sphere queries

`src/placed-object-damage.mjs` reconstructs `421da0`, `480900`, `415190`,
`41a5d0`, `417720` and `41a570`, using retained evidence `1203..1214` in
`analysis/native-simulation/results`. The routines consume explicit shared native
memory and entry ESP (`scratchBase`). The damage API is
`damagePlacedObject(object, body, shapeSlot, velocityAddress, runtime)`.

`421da0` first checks configuration type4, then follows `+1b0` links to the tail's
byte `+198`. It measures the signed high shorts of the supplied Q16 velocity
using the original root table. Types12/17 use mass×64; other bodies use the sum
of two separately shifted mass terms. A signed wrapped comparison against the
configuration's high nibble decides destruction. Successful destruction clears
that nibble, disables the live configuration, marks its word bit and emits
debris. It reloads the linked tail after the emitter returns. Heavy bodies also
visit all tail model configurations and force the tail count to zero. The
insufficient-damage branch preserves the existing configuration unchanged.

`480900` shifts the supplied velocity in place by9 on each invocation. Multiple
destroyed shapes therefore repeatedly shrink the same vector. It transforms the
shape center with the raw Q12 rotation matrix, publishes original packed matrix
and float transform globals, emits two bursts around the packed shape height,
and advances the24-entry source-position ring. Defaults execute actual
`484bb0`→sound dispatch, `435f20` particles and `475a10` debris with real
allocation/spatial/RNG/color routines. The otherwise unused fifth sound argument
retains the native incremented cursor. The local center's fourth short is stale
and remains part of the observed DWORD copied to shared transform scratch.

`415190` appends `+19c` linked placements to the64-entry destruction queue. Its
counter/cursor bytes are published after traversing the chain, preserving byte
wrap. Session byte`+58c==2` skips the camera stage. Otherwise `41a5d0` may activate
destruction-camera globals when the observer count and signed timer allow it.
`417720` selects the smallest unsigned distance-to-desired-radius score among
eligible observer records, using actual `4176b0` spatial-sector containment from
`track-deformation.mjs`. With no match its fallback offset is `[-50,-200,-50]`
world units. `41a570` retains unsigned initial clamping/division and signed final
duration clamps. Runtime observer/placement/resource constructors remain supplied
inputs.

`tools/verify-placed-object-damage-instructions.mjs` executes all six native
entries with their real descendants:600 fixtures each,3,600 calls,6,811,279
interpreted steps,150 damage successes,5,060 particle emits,22,213 debris emits
and1,651 sector-containment calls. Full affected object/body/query/pool/spatial/
RNG/ring/queue/camera/transform bytes match. Only compiler-cookie validation is
external; an explicitly absent sound bank takes the real sound rejection branch.

`src/raw-model-sphere-query.mjs` binds `423ab0` to these helpers and existing
geometry references. It takes `(bodyAddress, recordAddress, outputAddress,
parameter, {memory, views, scratchBase, roundingMode, handlers})`. Candidate model
geometry comes from the explicit native-pointer mapping already required by
`createPhysicsRuntimeViews`; configuration/class/yaw/state bytes and full Q16
placement positions are read live from memory. The four rotated cache fields
are written/restored in place per candidate; surface-reference writes survive.
The local32-byte shape output, constructed vertex shorts, cross/root globals,
rotated result and temporary damage velocity use native storage at their actual
stages. Optional hooks keep existing pure geometry callers compatible.

The raw query verifier passes1,200 fixtures under four bounds/rounding modes,
including fractional placement positions and93 output/probe aliases. It compares
the complete query/output/local-output, model/candidate/object, effect pools and
shared math globals:849 hits,1,697 damage calls,2,924 particle emits,42,032 debris
emits and24,861,952 interpreted steps. The connected `4749e0` parent check also
reaches these defaults; see [simulation-frame-connected.md](simulation-frame-connected.md).

The raw adapter now also defaults class1 (`48ec50`), class2 (`4142a0`) and the
additional class4 action (`44ef90`) to actual implementations. The earlier
verifiers described here retain their class0/5 scope; the broader special-class
query/full-parent comparisons are documented in
[model-contact-effects.md](model-contact-effects.md). Pure structured query
callers still supply explicit effect handlers, and raw overrides remain possible.
These are constructed native-memory instruction comparisons, not original-process
runtime evidence or a claim that resource/race constructors are reconstructed.
