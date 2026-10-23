# Source-carried prephysics and physics

The V4 original-process capture now closes one continuous source execution
from `450e50` entry through `4749e0` preRET. It executes the six-car AI/route
sweeps, genuine audio methods, input/auxiliary/handling conversions, linked
controls, deformation, authored objects, checkpoint/rank progress, handling
scale and the complete existing physics implementation. The physics call
consumes the preceding source output directly. No native intermediate memory
or output registers are supplied to resume execution.

## Actual evidence

[`native-control-physics-v4-reviewed-20261023/report.json`](../analysis/native-control-physics-v4-reviewed-20261023/report.json)
matches all **4,984,964 declared semantic bytes** (**4,984,832 unique**, with
132 bytes of overlapping geometry/header observations), all **720 protected control
bytes**, **28 parent caller/save bytes** and the physics EAX return. The AI
checkpoint independently matches4,984,232 bytes. Seven derived physics entry
registers also match; EAX/EDX/status are omitted from that derivation.

The native run records logical clock288, six mode8 cars with selectors
`[6,5,0,4,2,1]`, phase4 and the recovered filename selection HIGH/LEV5. The
selection is not an independently captured immutable asset fingerprint.
Physics prepares/finishes14 bodies, including2 scripted bodies and all six
vehicles, with24 successful wheel queries; all six cars actually change position. This particular call has no
queued collision responses and does not extend the collision scenario matrix.

The separate [native delta audit](../analysis/native-control-v4-stage-change-audit-20261023.json)
counts180 unique semantic bytes changed by the AI sweep,131 by the rest of
the prephysics prefix and3,640 by physics. Parent entry to physics preRET has
3,948 changed unique bytes; intermediate scratch overwrites explain why this
is not the sum of the three stage counts. Thus the broad memory comparison
includes both changed outputs and unchanged state; its size is not branch
coverage. The720 protected control bytes overlap the semantic arena, while
the28 parent ABI bytes are checked separately.

The observer records seven snapshots: three existing startup policies,
parent entry, after-AI, physics entry and physics preRET. Original physics
entry/exit have the same thread, ESP, logical clock, caller word and parent
saves. All four observed race boundaries require PC24/nearest-even with
masked exceptions and FTZ/DAZ disabled; floating status flags remain unclaimed.
`4749e0` restores ECX/EBX/EBP/ESI/EDI and returns EAX0 as in retained
instructions. Cleanup at45.458s terminates the owned process. Both installation
hash checks match all171 original/copied manifest files. Raw snapshots and
all earlier V1..V3 missing-input failures remain retained.

## Source and capture boundaries

`tools/prepare-native-control-capture.mjs` accepts an optional final
`--include-physics-exit`. Its default remains the historical prephysics
profile. The option moves the terminal hit bound to actual `474b1e` and adds
one snapshot per declared frame, preserving the90-second bound and existing
startup policy. Pairing verifies the additional boundary and restored ABI;
an undeclared, missing, mistimed or corrupted exit is rejected.

`tools/lib/native-control-physics.mjs` accepts only the original parent entry
snapshot. It runs `replayNativeControlPrefix`, then derives the required
physics registers from the actual source loop/reload/restoration trace and
live cookie. The [register audit](native-control-audio.md) distinguishes this
completed source trace from earlier conditional before-only candidates.

The physics manifest, used arena extent, body lists and views are rebuilt
from carried source bytes. The same mutable source memory remains in use;
rebuilding coverage is not a native state refresh. All previously admitted
semantic comparison spans remain protected. Since the child ESP is20 bytes
below the parent, the observed24,576-byte parent scratch window supplies a
24,556-byte physics scratch window. No extra deep bytes are invented from the
later native snapshots. Private scratch outside the explicit parent saves
remains ABI input; full CPU/CRT ABI equivalence is not claimed.

The newly observed input packets are actual module-owned sampled state,
not host keyboard polling or zero controls. Separate sparse/ASLR packet
source corrections and their retained-instruction scope are documented in
[native-input-packet-memory.md](native-input-packet-memory.md).

```powershell
node tools/prepare-native-control-capture.mjs ISOLATED_ROOT NEW_CAPTURE NEW_CONFIG 1 24576 60 --include-physics-exit
node tools/check-native-control-physics.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
node --test tests/native-control-physics.test.mjs tests/native-control-prefix-v4.test.mjs tests/native-control-capture.test.mjs tests/native-control-physics-registers.test.mjs
```

The retained regression executes the actual joined call, protects all final
comparison spans, checks all six car movements, refuses physics-entry state
as an exit substitute, and detects after-only position/control corruption
without altering the computed source or original snapshots.

## Remaining goal

This is one recorded call, not the entire outer tick or a source-only race.
Postphysics attachment/recovery/feedback/wheel/camera/world/render producers,
the next clock/input decision, startup/context completeness, broader native
wall/ceiling/inverted/contact scenarios, active weapons, natural recovery and
audio worker/effect interleaving remain required by the unchanged
[physics fidelity goal](physics-fidelity.md).
