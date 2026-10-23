# Bounded owned worker lookup observation

The optional `services-worker` profile extends `services-active` with one
read-only lookup-entry site at native `4a79f0`. The earlier V12/V13 profiles,
their 52 site descriptors, caller229 guards, and frame-thread scope remain
unchanged. This profile prepares evidence; it does not reconstruct the full
worker interleaving or substitute observed manager writes into a source replay.

Prepare only:

```powershell
node tools/prepare-native-recovery-worker-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE
```

The library API is `createNativeRecoveryWorkerCaptureConfig(root, output)`;
`prepareNativeRecoveryWorkerCapture(root, output, filename)` writes a new
configuration exclusively. Only the root capture owner launches the original
game after configuration review and ValidateOnly. The checker is:

```powershell
node tools/check-native-recovery-worker-capture.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
```

`ownedWorkerObservation` declares one breakpoint ID, `maxSnapshots:1`, and a
fixed four-byte global-root TID source: relocated `714b08` → manager → `+824`
worker object → `+24` stored TID. The helper admits the site only after the
existing guarded caller229 activation, inside an active pending parent, when
the actual exception TID equals this source and has a live owned CREATE_THREAD
handle. Main process creation is insufficient. Missing, main-thread, or unowned
source identity fails closed. Outside the frame, or after the single snapshot,
the helper does not read the TID source. A different actual hit TID executes
normally without advancing matching/capture counters. Admission is recorded
explicitly before the displaced original instruction executes.

The buffered snapshot uses role `worker-once`, retains its actual worker TID,
and counts within the unchanged 115 nested / 350 total / 128MiB pending / 90s
bounds. It never qualifies the parent selection event. The existing 52 sites
still require the pending main thread. If the parent is discarded, the one-shot
is not retried or represented as an observation of a later parent. No snapshot
count is projected. The site continues through the existing owned breakpoint
restore/step/rearm and queued/repeated-deferral machinery; it is not removed
while another thread may have a queued breakpoint event.

The snapshot captures eight bytes at entry ESP (actual return word and requested
ID), the actual 716-byte x86 context, and the existing manager/lock graph,
80-byte worker object and 64h-byte manager vtable. It adds no ESI pointer chase.
The checker validates raw context registers, phase4 and the parent's actual
clock, manager and worker pointer provenance, worker self/manager backlinks,
stored TID, worker `4a3790`, poll callback `4a94a0`, interval20, manager table
slot48h=`4a79f0` and slot60h=`4b12d0`. It links the admission to its actual owned
exception, active parent and preceding live CREATE_THREAD event. Stored TID or
an earlier scope skip alone cannot qualify.

Retained target-hash-checked instructions establish the lookup entry and these
immediate virtual-call return boundaries:

| Return word | Immediate caller |
| --- | --- |
| `4b1304` | manager gain, CALL `4b1301` |
| `4a7ca1` | manager frequency, CALL `4a7c9e` |
| `4a7635` | source factory, CALL `4a7632` |
| `4adc00` | sample stream, CALL `4adbfd` |

Evidence files are `11733-audio-sample-backend-4a79f0.json`,
`12339-audio-selection-4b12d0-assembly.json`,
`11601-audio-sample-factory-4a7460.json`,
`12361-audio-spatial-4a7c10-assembly.json`, and
`11745-audio-waveform-child-4adbd0.json`, under
`analysis/native-simulation/results`. Unknown return words are preserved and
reported as unclassified, not replaced with a known caller. This identifies an
immediate caller only; the outer callback execution remains a separate proof.
Reports retain `sourceReplayComplete:false` and `fullConcurrencyProved:false`.

Validation: `node --test tests/native-recovery-worker-observation.test.mjs`
covers exact legacy configuration preservation, pure C# policy compilation and
gate matrices, synthetic ownership/admission/activation and context/blob tamper
rejection, all four return classifications, unmapped incoming ESI, and retained
clean original V12/V13 compatibility. The initial synthetic checks are not a
native worker runtime observation. This component's preparer/checker never
launches the original game. The previously Defender-rejected
`native-deferred-breakpoint` fixture was neither rerun nor modified. The C#
policy checks run direct PowerShell commands without execution-policy or other
security-setting changes.

## Retained original V14

The root capture owner subsequently ran clean original-process V14:
`analysis/native-physics-local/startup-20261022/controlled-recovery-worker-v14-20261023`.
The hash-verified checker report is
`analysis/physics-native-controlled-recovery-worker-v14-20261023/report.json`.
The retained regression independently loads the actual blobs and reruns the
complete sound/activation/worker selector.

The actual total is 330 snapshots, with 98 selected buffered rows:
before1 + event1 + ordinary nested94 + worker-once1 + after1. The native parent
counter is therefore 95 nested observations, without subtraction or projection.
There were 3334 debug events; completion was 44263ms, cleanup 44314ms, owned
termination succeeded, and all tracked threads were quiescent. The selected
buffer held 117881980 bytes, below the unchanged 128MiB bound. All 32 actual
deferred breakpoint events are represented once in the 27 replay records'
validated deferral chains. This is actual queued/repeated-deferral execution
evidence from the original game, without rerunning the rejected native fixture.

Worker snapshot274/debug-event2478 belongs to PID29304/TID34972; its owned
CREATE_THREAD event is366 at trace record805. The parent thread is34612. With
actual image base `6e0000`, the observed return word `791304` resolves to
preferred `4b1304`: the immediate manager-gain caller. The actual requested
mixer ID is1. The retained context has ESI=`173017c8`; that source's 9a8-byte
extent is **not captured** in this worker snapshot. The worker TID/object and
manager backlinks, vtable identities, raw CPU context, entry stack, phase4 and
parent clock independently match. The policy admitted one snapshot; 60 later
hits were skipped under its one-snapshot bound.

Two retained tests cover this original result and corrupt raw context, entry
stack, TID/object blobs, admission identity, worker backlink, clock, and creation
provenance. `node --test tests/native-recovery-worker-observation.test.mjs`
passes 10 tests. The full worker parent and interleaving remain unproved;
`sourceReplayComplete:false` and `fullConcurrencyProved:false` remain deliberate.

## Optional caller-gated source-input profile

The separately approved optional single
`ownedWorkerObservation.entryReturnRva` now gates the one-shot source-input
profile. Existing absence/default configuration bytes stay exactly unchanged,
with `maxSnapshots:1`. The new gain profile fixes
`entryReturnRva:'0xb1304'`. The helper also accepts the independently proved
frequency return `'0xa7ca1'`, but this preparer does not select it. This is a
relocated **return RVA**, not a guessed heap/source address. No list, extra
all-thread sites, extra snapshots or extra budget is added.

The helper first proves active guarded parent and live manager-owned worker
identity. It then reads the actual return DWORD at the stopped raw-context ESP,
before resolving or reading any declared ESI-based snapshot range. A mismatched
return emits a read-only caller-skip record without advancing matching/capture
counters or consuming the one-shot; raw trap hits remain actual evidence and
all original instructions still execute. Only matching return plus the existing
phase predicate can reach the buffered snapshot read. The separate
`owned-worker-entry-return-checked` record retains the real four bytes, ESP,
expected relocated return, debug-event/PID/TID provenance and flags showing
that the check precedes range resolution and consumes no counters/one-shot.
Admission proof repeats these fields. The checker requires the preceding actual
check record and compares it against the eight-byte entry stack, raw context
and declared policy.

Only the explicit gain-caller profile adds
`{id:'recovery-worker-source',baseRegister:'esi',length:0x9a8}` and
`{id:'recovery-worker-source-vtable',baseRegister:'esi',dereferenceOffsets:['0'],length:0x88}`.
Any ESI-rooted range on the owned worker breakpoint (including shared ranges)
requires a declared known gain/frequency gate in helper validation. Retained
gain instructions load ESI from the
actual source argument at `4b12f2`, then push `[ESI+438]` at `4b12fb` before the
lookup CALL `4b1301`. Frequency retains ESI from its source argument at
`4a7c14`; its lookup return is `4a7ca1`. The checker must additionally require
source+438 to equal the actual entry requested ID. It validates source span
identity against raw-context ESI, original source class `5d3f60`, and all34
vtable DWORDs from shipped read_bytes evidence11714, before describing these
bytes as a source input. Heap pointers remain their actual unsigned values;
none is normalized as a code address. The report preserves spatial byte+45e,
effect-object pointer+9a0, gain bits and opaque waveform/decoder/voice pointers;
none is cleared, chased or supplied as a substitute result.

Prepare only:

```powershell
node tools/prepare-native-recovery-worker-source-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE
```

The library API is `createNativeRecoveryWorkerSourceCaptureConfig(root,output)`;
the existing worker checker also handles this new explicit profile. The
selected source is observed at the manager-gain lookup entry before its later
use, **not at the whole native gain function entry/exit**. No source-function
output comparison or complete interleaving is claimed.

Pure C# policy tests cover both known single gates, mismatches preserving the
unconsumed one-shot, wrong worker/caller paths before an unreadable ESI resolver,
and validation rejecting ESI reads without a known gate. A source-code ordering
assertion covers the runtime gate's position before snapshot reads. Synthetic
posthoc tests retain high opaque ESI pointers and nonzero spatial/effect fields,
reject missing ranges, altered source438/vtable/context and missing/misordered
or counter-consuming gate records. These are policy/synthetic proofs, not a new
original-process source-input observation. V12/V13/V14 retained regressions
remain unchanged. Only the root capture owner may decide a subsequent original
run after freeze, review and ValidateOnly; no native capture was launched for
this extension.

## Retained original V15 source input

The root subsequently completed clean original-process V15 in
`analysis/native-physics-local/startup-20261022/controlled-recovery-worker-source-v15-20261023`.
The positive report is
`analysis/physics-native-controlled-recovery-worker-source-v15-20261023/report.json`.
The retained regression independently reloads the original target-hash-checked
capture and range/context hashes, reruns the complete selector, and checks the
actual gate/thread/source evidence.

Worker snapshot242/debug2420 belongs to PID6952/TID38080; parent TID39612.
The actual owned CREATE_THREAD is event370 at trace record811. The gate is
trace record5887, followed by post-read admission5888; buffered snapshot
publication is record8800. The gate records the stopped ESP=`0efbfaf0` and four
bytes `04137900`, matching the captured eight-byte entry stack and raw CPU
context. Actual return=`791304` relocates to preferred `4b1304`, manager-gain,
with requested mixer ID1. The gate's before-snapshot-range flag, its actual
position before post-read admission, and the tested helper implementation's
ordering establish the host capture sequence; the trace does not independently
timestamp individual ReadProcessMemory calls.

The actual ESI source is395396120 (`17914418` hex), length2472 (`9a8` hex).
Its original SHA256 is
`22229183b75094ae438e7ef9d8c4a7795f1c5fe90b6f78bb2b204f7c81262a67`.
Source+438 equals the entry ID1, and all34 vtable DWORDs match the retained
shipped table under actual ASLR. Raw observed fields are:

| Source field | Actual unsigned value |
| --- | ---: |
| spatial byte+45e | 0 |
| effect pointer+9a0 | 0 |
| decoder pointer+968 | 0 |
| waveform pointer+964 | 283116728 |
| voice pointer+97c | 300204608 |
| gain bits+43c | 1064960500 |
| gain bits+494 | 1065353216 |

This first selected input lies in the current nonspatial/effect-free branch
domain. It is not evidence that all24 worker sources share that domain. No
flag was cleared, and waveform/voice contents are absent from this worker
snapshot. Later snapshots cannot supply those missing input pointees. Paired
native function/service observations are still needed for a function-output
comparison; this remains a source-input boundary only, with
`sourceReplayComplete:false` and `fullConcurrencyProved:false`.

V15 has330 total snapshots and95 nested observations (94 ordinary main-thread
plus one worker), complete44292ms/events3585 and successful owned cleanup44351ms.
The selected buffer is63931472 bytes and tracked threads are quiescent. The
retained tests reject changed gate identity/order, raw ESI context, source
span/mixer identity, vtable slots, and spatial/effect/source bytes by the genuine
blob hashes. Both V14/default preparation and the gain-source profile remain
frozen; this checkpoint changes only regression evidence and this note.
