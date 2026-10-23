# Native AI/input prefix: explicit boundary and dependencies

The prephysics closure is the actual `450e50` entry through its `4749e0`
physics entry. The new helper executes the existing recovered AI, audio,
input, world-object, progress and handling routines. It does not substitute
captured AI outputs or construct a replacement race/controller.

The initial six-car AI/route checkpoint matches4,906,636 semantic bytes
at clock288, including720 explicitly protected control bytes. Its audio-input
failure, and V3's later stored-packet failure, remain retained historical
evidence. V4 now observes the real six packet buffers and matches the complete
prephysics prefix at4,984,964 listed bytes (4,984,832 unique),720 protected
control bytes and28 parent ABI bytes. Its separate [joined replay](native-control-physics.md)
carries that source state through physics and matches the same final coverage.
The postphysics parent tail and a source-only trajectory remain open.

## Original target and caller ABI

Target SHA-256:
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
Retained `310-race-step-parent-assembly.json`, evidence
`ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`,
establishes the two separate AI sweeps and every following call. At parent
entry `U`, `EDX` supplies the iteration and `[U+4]` the total iterations.
The four saved registers occupy `U-4..U-16`. Direct callees enter at `S=U-20`.

| Stage | Native return site |
| --- | --- |
| `410220` autonomous dispatch, each mode8 participant | `450ec0` |
| `431750` route/speed/steering, each mode8 participant | `450f00` |
| `485300` vehicle sound/haptics, all participants | `450f39` |
| `42a6e0` input, then `42be80` auxiliary input, per participant | `450f69`, `450f70` |
| `49bbc0` linked controls | `450f8d` |
| `42a9a0` axes to handling, all participants | `450fa7` |
| `494f60` terrain deformation, `429f30` authored objects | `450fbe`, `450fc3` |
| Authored coordinate restoration | inlined parent writes |
| `449640` progress/ranking, `420500` handling scale | `45100d`, `451012` |
| `4749e0` physics entry, where this replay stops | `[S]=451017` |

The helper publishes actual relocated direct-call return addresses and the
captured parent saves. `449640` is an older source adapter taking its local
ESP, `S-44h`, after `SUB38h` and three saves. Retained199 and126 establish its
`449d40` child at `S-48h`, the `417210` output vectors at `S-60h`/`S-54h`,
and that basis call's return at `S-bch`. These are actual shared-stack
locations, not fresh scratch allocations. The basis answer is computed by
`populateRawVehicleTrackBasis` from live captured terrain and route data.

Private descendant register/stack equivalence is not assumed. In particular,
the existing `485300` source interface needs an actual virtual audio-call
binding; a source method receiving the outer ESP cannot safely write an
invented child argument slot. Reached missing audio/completion services fail.

## Why existing physics pairs cannot prove this prefix

The existing sequence hook executes after `4749e0` and before remaining
external patches. The genuine next AI sweep occurs after later wheel updates,
the rest of the race parent, `47f370`, and the conditional clock increment.
For example, `41d2b0` updates steering state `648` after the existing drive
slice. Running AI immediately after physics would use an earlier clock and
potentially stale producer state. Neither copying expected AI state nor
incrementing the clock speculatively repairs this boundary.

The separately paired `450e50 ->4749e0` observer establishes a correct
same-clock input boundary first. Even a successful prefix comparison would
leave the intervening postphysics and outer-loop closure open.

## Observed failure and required native inputs

The immutable report
[`native-frame-control-input-audit-20261023/report.json`](../analysis/native-frame-control-input-audit-20261023/report.json)
uses the original `drive-feedback-v1-20261023` snapshot at clock288,
module base `6e0000`. The six participants have mode8 and phase bytes
`[1,2,3,4,5,0]`. A genuine `410220 ->420020` source call reaches the first
missing profile7 shift: preferred `5705cc`, actual `8505cc`, four bytes.
The complete required shift table is `5705b0`, eight DWORDs. No initializer,
retained table-byte copy or guessed shift is supplied. The source RNG advances
before this failure; the diagnostic runs on its own copied captured memory.

The diagnostic is explicitly labelled mis-scheduled: native AI had already
run before the captured physics boundary. Its `matched:false`, zero compared
frames and missing-input record are dependency evidence only.

## Correctly scheduled original AI checkpoint

Root's original `control-prefix-v1-20261023` capture observes parent entry,
`450f18` after both AI sweeps, and physics entry. It is HIGH/LEV2 with actual
session vehicle types `[6,3,4,1,0,2]`, stable across allthree boundaries.
It is a different native scenario from the earlier drive-input diagnostic.

The first strict input-preflight report failed on the missing four-byte
authored-body list at `10edfee8`. Input checks now occur when their stage is
reached, so that later `429f30` requirement cannot prevent the earlier AI
checkpoint. This preserves the later dependency instead of supplying a list.
[`native-frame-control-prefix-v1-ordered-inputs-20261023/report.json`](../analysis/native-frame-control-prefix-v1-ordered-inputs-20261023/report.json)
then retained an exact three-byte difference in shared square-root scratch.

Retained `238-steering-velocity-axis-assembly.json` proves
`430dbb ->41c9c0`; `227-autonomous-vector-length-assembly.json` proves its
`41ca46 ->41ca60` call. Scene evidence `221-fixed-sqrt-assembly.json`,
`ev_cac63f72ecb0b6b3158cfe65e9ab38bbc707c38a118b916a001bca069967e861`,
proves the actual stores: `41ca75` publishes absolute input at `91d45c`,
`41ca7b` publishes zero at `91d460`, and `41ca8f` publishes the final leading
zero count. The source velocity helper had omitted these side effects.

The recovered fix gives `vectorLengthQ16` an optional native-state callback;
its default arithmetic remains unchanged. Steering, route and recovery callers
propagate that explicit option. The shared source factory
`createNativeFixedSqrtState` verifies actual memory aliases and performs the
stores in native order. The replay and Racing test runtimes explicitly bind
it. Default structured/small-buffer callers do not publish module globals.
The final native car's reduced velocity is `[8505,-160,-185131]`; the actual
Q16 squared sum is524074 (`7ff2a`), matching the native input and CLZ13.
The answer is computed from live input; it is never copied from the checkpoint.

[`native-frame-control-prefix-v1-native-root-state-20261023/report.json`](../analysis/native-frame-control-prefix-v1-native-root-state-20261023/report.json)
now retains both genuine six-call sweeps matching all4,906,636 declared bytes,
zero differences, and all720 owned control bytes. Audio subsequently reaches
its real unavailable source-call boundary. The overall report remains
`matched:false`, `sourceComplete:false`; the original failures are preserved.

The newer
[`native-frame-control-prefix-v1-bound-audio-20261023/report.json`](../analysis/native-frame-control-prefix-v1-bound-audio-20261023/report.json)
wires the actual audio ABI bridge. It retains the same exact AI match, executes
audio for participants0..2, and reaches participant3's existing surface-loop
source. Its `4861c5 ->4ad5f0` path requires the uncaptured waveform rate at
`08953a04` (actual waveform pointer `089539f8`, offset12). This is an input
coverage failure, not a replacement/null source or a completed audio proof.
Native participant3's surface slot is nonnull; the other five surface slots,
and all six boost/special slots, are the native127 sentinel in this capture.

`nativeFrameControlInputRegions` exports source-known image observations:
AI thresholds/profile tables, digital axis tables, shared AI clock/counts,
20 candidate rows and special targets, 20-slot route queues, 64 visited words,
36 fragment distances/indices, selected/network input gates, deformation,
authored-object and coordinate-restoration roots, plus actual audio table
extents and six native audio/horn records. Only observed bytes receive aliases.
Compatible image aliases merge without extending through unobserved gaps.

The obstacle registry uses an explicit 50-row observation (600 registry bytes,
200 distance bytes, 50 index bytes). `44cf99` appends unchecked: **50 is not a
recovered native capacity**. Replay rejects an actual obstacle count above50.
The polygon pointer pool has a separately recovered60-entry producer bound.
The fragment registry has36 eight-byte rows, matching its fixed native loop.

Variable semantic backing is checked using actual pointers/counts: route
groups and points, checkpoint IDs and their maximum referenced record,
GFXM event/marker/authored-target rows, fragment registry, deformation rows,
authored-body list, and coordinate-restoration rows. Event rows are mutable.
No installed-resource offsets are projected into native memory.

## Comparison and validation

`replayNativeControlPrefix` never executes physics. The CLI compares every
declared semantic core/image/body/geometry/variable/audio region against the
independent native physics-entry snapshot. Complete AI/control/handling spans
are compared even when unchanged. Seven actual parent ABI DWORDs are checked
separately; all other private scratch remains explicit ABI input.

The narrowly authorized `42be80` source correction resolves its source-known
`909300` record-base literal and incoming record to actual owned addresses
before comparison. The selected offset is arithmetic and does not dereference
an invalid selected slot. It preserves opaque heap identities. Three relocated
tests cover selected/default-selected actions, nonselected exclusion, canonical
alias callers and invalid selected values. The existing interpreted-instruction oracle still passes6000
parent fixtures plus2000 direct helper fixtures (14,865,561 instructions).
Those are interpreted/synthetic results, not new original-process evidence.

```powershell
node --test tests/native-frame-control-continuation.test.mjs tests/native-frame-control-prefix-comparison.test.mjs tests/vehicle-auxiliary-input-native-address.test.mjs
node --test tests/autonomous-native-length-state.test.mjs
node tools/check-native-frame-control-prefix.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
node tools/check-native-frame-control-prefix.mjs analysis/native-physics-local/startup-20261022/drive-feedback-v1-20261023 NEW_DIAGNOSTIC_DIRECTORY --dependency-probe
```

The sixteen focused tests include target/call-boundary checks, observed-only alias
admission, a constructed zero-participant parent, refusal to reinterpret a
physics boundary as parent entry, the retained actual missing-input case,
and corruption of unchanged owned bytes and saved parent ABI. The constructed
empty parent validates orchestration only; it is not six-car AI parity.
The four length-state tests additionally execute the retained length/root and
complete velocity helper children without mocked calls, compare ordered shared
stores and both velocity outputs, cover zero/negative/minimum-int publications,
and check the actual six-car native AI state. The original ten small-buffer
steering tests also remain passing.

An optional read-only `onBeforeStage` observer runs once before the first
`485300` delegation. If a capture contains the independently paired `450f18`
checkpoint, the CLI compares the current complete semantic/owned spans there.
That intermediate result is retained even when genuine audio subsequently
fails. Its observer return value is ignored: an intermediate match cannot
skip the audio stage or set `sourceComplete` for the unfinished prefix.

`tests/solo-native-fixed-state.test.mjs` separately observes200 installed
LOW/LEV1 ticks with six Expert cars. All199 admitted last-car route samples
have nonzero inputs and match independent retained `41c9c0 ->41ca60`
execution. The frozen debug records expose only `nativeSqrtInputQ16` and
`nativeSqrtLeadingZeros`; the test supplies no physics decision or returned
answer. Native/ByteBuffer roster, reset and recovery parity tests remain passing.

Old motion/drive sequence defaults and all retained reports remain unchanged.
