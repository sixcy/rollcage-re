# Independent warm-clock transport verification

The prepared-only tool is `tools/prepare-native-race-clock-capture.mjs`.
It accepts an isolated root, a new capture directory and a new configuration
filename. It preserves the three established startup observations and six
guarded startup writes. Four empty ordinary-range purpose sites request the
separate `scoped-race-step-clock-v1` host transport. Preparing does not copy or
launch an installation. Existing output/configuration paths are refused.

`tools/lib/native-race-clock-capture.mjs` independently validates the exact
profile and loaded raw trace. It requires all seven raw716-byte contexts,
control/integer/segment/floating/extended context flags, hashes and summary
agreement; actual stopped-thread selector/FS-head evidence; the fifteen exact
purpose rows; immutable warm entry identities; the actual timer saves and
counter argument/return word; one owned thread and strictly ordered events;
three cold-site activations after entry publication in the same stop; four
proofs identical to snapshot annotations; and exact completion bounds.
Foreign/preselection skips must remain explicitly counter-neutral. Admission
is after bounded guard reads and buffering, before range-envelope publication;
the proof does not claim that no process-memory guard read occurred.

`createNativeRaceClockCounterBinding` accepts only the verifier's authenticated
proof object. At the genuine source QPC call it validates the physical source
frame, original fixed inputs, entire540-byte pre-call stack, output preimage,
source call metadata, original numerical state and nonvolatile registers.
Only the architectural four-byte CPU CALL return slot differs in phase from
the native before-CALL snapshot; that slot is independently checked. The
binding writes exactly eight observed output bytes and returns the observed
uint32 BOOL, including zero. Observer return values supply no answers. It
cannot be reused and does not copy private API stack residues or later game
outputs. A changed numerical state across the real API pair remains an
unsupported external effect.

The synthetic fixture lives in
`tests/fixtures/native-race-clock-capture-fixture.mjs`. All four endpoints come
from independently interpreted retained original instructions and original PE
HIGHLOW relocations; only synthetic Win32 QPC is supplied. It exercises both
stack alignments and preferred/relocated bases, and is explicitly not an
original-process capture. Whole-checker tests show both a complete synthetic
match and a deliberate private API spill that remains a failed comparison.
Neither fixture result proves original timing cadence or a second race tick.

Validation: `node --test tests/native-race-clock-capture.test.mjs
tests/native-race-clock-inputs.test.mjs tests/native-race-clock-replay.test.mjs
tests/native-race-step-clock.test.mjs` passed26 tests, zero failures/skips.
The eight capture tests include rehashed negative proof/context/row mutations,
late activation, wrong thread/frame/caller, incomplete completion, altered
startup policy, live source preimage failures, callback-answer rejection,
BOOL0, one-shot consumption and strict private-spill retention. No original
process was launched for these checks.

## Closed original V2 observation

The independently audited capture is
`analysis/native-race-clock-stock-capture-v2-20261024`; its immutable audit is
`analysis/native-race-clock-stock-independent-audit-v2-20261024.json` with a
read-only reproducer beside it. All179 referenced binary blobs match their
hashes and lengths, including50 stop-thread contexts and50 diagnostic stacks.
The exact seven-snapshot lifecycle, actual owned PID24632/main TID25500,
base5f0000, four purpose proofs, three deferred activations and terminated
owned-process cleanup were verified. Both roots of the stock171-file and
user-edited173-file manifests were independently rehashed:688 checks matched.

The first verifier attempt incorrectly required a module base on the two
register-rooted startup ranges. The original range writer publishes null on
those rows. The corrected verifier requires null for register roots and checks
their addresses against raw ECX/ESP, while keeping RVA module/address checks.
Four rehashed negative cases cover the distinction. The capture was retained
unchanged and no new game run was needed for this correction.

An independent source replay from the original entry consumes only the actual
QPC8B/BOOL result. Count1, all14 nonstack regions (202 bytes), seven known final
registers, CW/SW/MXCSR and scaled XMM0 bytes364..371 agree. The strict742-byte
comparison remains **failed**: QPC changed109 private stack bytes;105 survive as
final source/native differences. Every surviving difference lies in that
observed private-change set and retains the original source byte. Four private
bytes are subsequently overwritten by genuine source instructions. The raw
pair additionally changes three CPU return-slot bytes and eight output bytes,
with zero changes elsewhere. No private API residue was refreshed or masked.
This is one warm clock-call semantic result, not full private ABI equality,
wall-clock cadence or a second joined parent tick.
