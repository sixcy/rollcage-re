# First complete recorded parent update

The active Redux physics goal now has one original-process match from the
selected `450e50` entry through its actual return to caller `450e38`. This is
one recorded six-car update, with declared semantic memory and the known
return register subset. Continuous racing and the full objective remain open.

Target SHA-256 is
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The earlier [final-tick plan](native-parent-final-tick-plan.md) is historical;
its missing light-band/listener/master inputs and final endpoint are now
observed for this case.

## Original observation and source result

- [Original FinalV2 capture](../analysis/native-parent-final-stock-capture-v2-20261024/trace.jsonl):
  22 snapshots at 18 sites, bounded to 90 seconds. Actual run closed after
  48.270 seconds, with the owned game terminated. No game runs were needed
  for the subsequent replay fixes.
- [Independent raw audit](../analysis/native-parent-final-stock-independent-audit-v2-20261024.json):
  7,645 binary blobs / 416,133,625 bytes and 70 thread contexts verified.
  Both original/copy installations and the user's edited installation/mirror
  retained all 688 audited file identities.
- [Reviewed source replay](../analysis/native-parent-final-stock-reviewed-replay-v2-20261024/report.json):
  `matched`, `sourceComplete` and `completeParentTickMatched` are true for
  this one update. There are zero differing bytes at every declared boundary.
- [Independent source audit](../analysis/native-parent-final-stock-independent-source-reviewed-audit-v2-20261024.json)
  reviews the input/result boundary and explicit coverage limits separately.

| Boundary | Distinct declared bytes matched |
| --- | ---: |
| Attachments, recovery, drive and auxiliary, each | 5,104,645 |
| Cameras and weather/world effects, each | 5,104,878 |
| Parent return | 5,107,238 |

The returned subset is EAX=1, EDI=1, ESI=EBP=EBX=0,
ESP=`0116fbe4`, EIP=`00780e38`. Original parent entry ESP is `0116fbe0`.
Both independent 32-bit clocks, `90a548` and `6e675c`, advance from 288
to 289. The 28-byte parent stack comparison includes live saved words,
return target and argument. Source executes its own epilogue and consumes
those live words; it does not restore captured entry values over changed state.

All game-state/storage bytes originate at parent entry and are carried through
source execution. Three authenticated external CRT cast outcomes and one
eight-byte QPC outcome/BOOL enter only at their reached typed service
boundaries. Native intermediate/return game bytes supply comparisons only.

Final input observation includes 24 sector headers and an actual 2,272-byte
light-band allocation, one used 80-byte listener wrapper, active pose inputs
and the manager's four-byte master-level field. The light allocation, listener
destinations and master-level field enter semantic comparison only when their
genuine source stages are reached. These are observed case dimensions, not
universal track sizes or allocation capacities.

## Corrections exposed by this recording

The actual module base `00730000` puts a real image-data pointer at `0091cdb0`,
numerically overlapping preferred renderer scratch. Fixed module operands in
`[91cd60,91d360)` now use explicit observed routes; values read from pointers
remain actual addresses. Whole scratch views resolve their start once, then
use actual start plus length across the exclusive boundary. No generic pointer
rebasing or broadened alias permission is used.

The late attachment emitter also reads the original alternate mesh word
`919140`. Its four bytes were already in original-entry transport and now have
an exact declaration. Both emitters preserve the original unconditional MOV
and memory-source CMOV reads, including the false-condition read and the
different active-byte/mesh publication orders. Strict sparse/alias tests cover
these obligations; the older lazy CMOV instruction interpreter alone would
not prove a false-condition memory read.

Dynamic lights read the queued position/dirty record for live kind-one lights
without a scripted body even when no attachment handle was queued. Admission
now derives those exact eight-byte records from the observed live pool;
uncaptured records still grant no bytes. Replay memory also supports the
two-byte big-endian packet read used by genuine `42b330`, retaining strict
span and alias bounds.

The earlier [V8 replay](../analysis/native-parent-rtti-stock-final-compatible-replay-v8-20261024/report.json)
still passes through world effects. Its expanded comparison is 5,109,442
distinct bytes: 21 previously uncompared light records plus one mesh word add
172 bytes. That older recording still has no final-return endpoint.

## Validation and remaining requirements

The combined focused run passed 96 tests without skips, including the actual
FinalV2 integration regression, both synthetic epilogues and counter wrapping,
corrupt provenance/stack/input rejection, raw pointer versus fixed-global
aliases, false-condition mesh reads and old V8 replay. Worker checks additionally
cover the affected physical/camera/startup source modules. Attachment arithmetic
still matches 6,400 interpreted calls across 1,600 fixtures; this is separate
from the original-process result above.

The rebuilt [Track Viewer](../docs/track-viewer.html) reports the new checkpoint.
Headless Edge checks pass for genuine pickup placement, zero idle DOM mutations
over 20 render frames, mouse-opened Camera selection and retained drafts,
reset/duplicate behavior and restarting a clean three-car test.

This recording has no new control sound-creation events and cannot establish
active combat, all recovery effects, background audio interleaving or private
callee CPU/CRT ABI. Natural walls/ceilings/inverted driving, broader cars and
tracks, moving/destructible scenery, weapon-force scenarios and startup/context
coverage still require the original goal's independent native comparisons.

The next continuous tick also needs real outer producers. This recording's
total-iteration argument is one: `450d60` returns to `440cd5` after the selected
parent, rather than immediately entering a sibling substep. The next parent
therefore requires the intervening outer frame/gates, a fresh clock query and
the true conversion/scheduling chain. `6e66f8` is the delivered-step counter,
separate from the two counters matched here. The retained `568c41` helper
converts to a 64-bit result; `441cd0` consumes its low DWORD. Treating it as a
standalone double-to-unsigned32 conversion would be incorrect.

The failed FinalV1 startup capture is preserved. It stopped on a peer-thread
suspension denial before any selected parent and terminated its owned game;
it supplies no physics result. The unchanged helper succeeded in FinalV2.
Neither recording proves the cause of that one startup denial.
