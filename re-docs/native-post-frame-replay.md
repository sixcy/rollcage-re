# Captured native post-frame recovery

The tools bind existing post-frame algorithms to captured native memory. They
do not initialize a race, invent routes, choose a replacement pose, supply
obstruction results or launch the game. Target SHA-256 is
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

## Native boundaries

| Stage | Entry | Normal pre-RET observer(s) | Caller / return address |
| --- | --- | --- | --- |
| Vehicle rejection prepass | `47e180` | `47e234` | `47ccff` / `47cd04` |
| Full rejected-body recovery | `47ccc0` | `47d02d` | `45101c` / `451021` |
| Placement/obstruction query | `47d040` | `47d42a`, `47d434` | `47cf11` / `47cf16` |
| Pose/progression application | `47d440` | `47d6ed`, `47d703` | `47cf37` / `47cf3c` |

The prepass saves EDI unconditionally at entry ESP minus 4. It saves ESI at
minus 8 only when the captured participant count is nonzero; the zero-count
path leaves that older stack word intact. Entry and pre-RET ESP are identical.
EAX ends at the actual relocated participant-array address plus captured count
times `30c`. This is pointer arithmetic, not a game success/failure result.
EBX, EBP, ESI, EDI and ESP are preserved. Volatile ECX/EDX/EFLAGS and private
saved-register stack bytes are not modeled by the source comparison.

The full parent has no asserted source EAX return contract. Its quaternion is
at parent ESP minus 24 and query output at minus 44. Nested query entry is
parent minus 120, apply entry minus 124, and vehicle ring/type33 entry minus 104.
Query ECX is body, EDX is position, with stack arguments quaternion, rotation,
mode and output pointer. Apply uses ECX body, EDX position, followed by
quaternion, rotation, route, index and terrain result. Both child exits must
be observed when capturing them independently.

Retained native-simulation records establish these boundaries:

- `109-post-frame-vehicle-check-assembly.json`, Evidence
  `ev_1634d8e82ddf8042a5c4e87c630efad2e1a73cd968c241cc34fb1e3b3f199727`.
- `098-post-frame-body-states-assembly.json`, Evidence
  `ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa`.
- `100-respawn-position-query-assembly.json`, Evidence
  `ev_17f2b2691024a81de4fec16bd0b415ed91dd7952e5ad9c550cf77bb7457c1487`.
- `102-respawn-apply-assembly.json`, Evidence
  `ev_c329f2472b4fcb32cbb31106e54ad1db5a35f1ebfd0bf6b7df7d74fabfca2c76`.
- `310-race-step-parent-assembly.json`, Evidence
  `ev_d15324804cfcb1308ec6f86f28c7350a908d9cee745a7616dd8619f94cd3053f`.

## Executable bindings

`tools/lib/native-post-frame-replay.mjs` exports
`replayNativeVehiclePrepass(snapshot, options)`. It reuses the complete native
frame manifest and captured geometry, checks actual entry/caller identities,
then executes existing `checkRawPostFrameVehicles` over explicit aliases.
`tools/check-native-prepass-replay.mjs` pairs only genuine prepass boundaries,
checks the active-phase observer and matching-hit window, compares every
declared semantic byte and read-only invariant, and checks EAX plus preserved
registers. Capture preparation and process execution remain separate tools.

The independent full-parent binding is
`tools/lib/native-recovery-context.mjs`:

```js
const bound = bindCapturedNativeRecovery(snapshot, options);
const result = runRawPostFrameBodyStates(bound.runtime);
// Or use the ABI/coverage wrapper:
const replay = replayNativeRecoveryParent(snapshot, options);
// tools/lib/native-recovery-parent-replay.mjs
```

The context provides actual body-arena/clone views, native geometry/model
identities, shared pools and live checkpoint progression. It derives
checkpoint backing from actual ID rows instead of taking an unbounded memory
tail or projecting installed resources. The parent wrapper additionally
observes native route groups/points, the one-point previous-neighbor case,
checkpoint records and reached controller fields, and adds these to semantic
comparison coverage alongside core and geometry spans.

The full parent additionally requires the explicit module spans exported as
`nativeRecoveryGlobalRegions`:

| Preferred native address | Length | Purpose |
| --- | ---: | --- |
| `70eb00` | `44a8` | Route globals, metric workspace, private candidates and complete `70f130` clone through `712fa7` |
| `849940` | 36 | Controller retirement slots |
| `903520` | 4 | Active type33 retirement clock |
| `919000` | 4 | Retirement particle color |
| `919020` | 288 | Twenty-four position rows used by effect dispatch |

These spans receive explicit actual-address aliases. The native candidate
workflow can overwrite the clone after 64 entries; this alias is preserved.
`raw-respawn-query.mjs` now resolves its known literal clone/arena addresses
before publishing pointer values and obtains saved shape-record pointers via
the strict native ownership contract. Heap pointers remain opaque native
identities. Sparse/high-address tests compare every mapped byte and would fail
on the old backing-buffer subtraction or canonical-address pointer stores.

## Full-parent capture preparation and null pointers

`tools/prepare-native-recovery-capture.mjs` builds a configuration in memory
through `createNativeRecoveryCaptureConfig`; only the separate preparation
function/CLI writes a new configuration file. Preparation never launches the
target. It preserves the full-frame hidden bootstrap, replaces just the
observer boundaries with `47ccc0` / `47d02d`, adds the five recovery spans
above, and observes one to three complete calls with an explicit matching-hit
window. The default declared stack observation is 4096 bytes below entry ESP;
this remains an observation bound rather than a proof of every descendant's
maximum stack depth.

The additional descendant roots are producer-derived:

| Preferred address | Observation | Producer |
| --- | --- | --- |
| `909060` | Six static `4c`-byte participant controls; fixed 456 bytes | `47ea40`, beginning at `47f004` |
| `9092a0` | Readable region containing the route-group table | `44cb0c` |
| `9092a4` | Readable region containing the route-point base | `44cb15` |
| `9092b0` | Readable region containing checkpoint records | `44cb84` |
| `9092d0` | Readable region containing checkpoint ID rows | `44cb91` |
| `[91f6a0]` | Exactly eight profile bytes | `41ebb0`, selecting original `5eae0c` or `5eae14` |

Loader `44c472..44c48c` forms group/point bases from authored offsets plus
the loaded file base; the point-base observation does not depend on following
an arbitrary group's pointer. Each readable-region observation is one actual
`VirtualQueryEx` commit region. Replay still requires all count/ID-derived
route/checkpoint bytes and fails on missing coverage. Capturing a commit
region does not establish the file's allocation capacity.

Some zero/sentinel values are legitimate before recovery: `70eb18` is an
excluded-point identity, clone candidate pointers can remain uninitialized,
and participant `record+18` can be `12345678`. The configuration captures
their owning storage without dereferencing these values. Empty group0 has
count zero and is skipped by the parent's route search; its pointer is not
used as a capture root. The runtime point-base publication is used instead.
Conditional audio handles and arbitrary authored controllers are likewise
not blindly chased. A reached missing descendant remains a replay failure.
The profile root is initialized by the constructed vehicles before the
supported six-participant phase4 observation; null there fails rather than
silently fabricating profile data. The inherited full-frame roots retain
their existing strict nonnull/readable requirements.

The preparer validates original parent/child CALL/RET evidence plus loader,
startup and profile producer instructions against the target SHA. Additional
retained producer records are `732-world-resource-loader-assembly.json`
(`ev_f5eddfe878790ed034b165f848b3f30c76f84c3a9ca63310c4a967679e949ff6`),
`2457-autonomous-initializer-dispatch-assembly.json`
(`ev_c39a69909451efe663de2dd317d58d4a778c39999a2060dea599e1d088aa0884`),
and `1879-contact-profile-initializer-assembly.json`.

## Opt-in selection at real respawn application

The baseline remains `selection: 'all'`. The preparer also accepts:

```js
createNativeRecoveryCaptureConfig(root, newOutput, {
  selection: 'first-respawn-application', skipFrames: 0,
  maxCandidateFrames: 1200, maxApplicationSnapshots: 64,
});
```

This selects one complete parent call which reaches actual `47d440`, rather
than changing rejection state or supplying a pose. The existing bounded host
observer retains the full parent entry, all unfiltered application entries,
and parent exit. It discards candidates with no application. The default
candidate bound is 1,200; supported explicit bounds are 1–10,000, with the
inherited 90-second wall-clock limit. The host-buffer bound is 128 MiB.

The exact application entry is parent ESP minus 124, returning to `47cf3c`.
The byte-arena admission uses actual `6e6b40` and used-byte cursor `70dcf4`,
with record width one. This is an observer domain, not a body count. Replay
separately proves 128-byte body alignment, complete common-header coverage,
state32, and membership in the captured live 96-pointer physical list.
Same-thread, parent ESP/caller, matching-hit window, candidate identity,
event order and every observed call count must agree through terminal
selection. Arbitrary pending policies, filters and gameplay writes fail.

Every application event includes all native core globals and the five
recovery-global spans, plus these exact inputs:

| Input | Native location | Bytes |
| --- | --- | ---: |
| Common body header | ECX | `180` hex |
| Live physical list | `[902bc0]` | 384 |
| Actual pack header | `[90b98c]` | `a0` hex |
| Caller | ESP | 4 |
| Caller plus five arguments | ESP | 24 |
| Position | EDX | 12 |
| Quaternion | `[ESP+4]` | 16 |
| Rotation | `[ESP+8]` | 18 |
| Selected route header | `[ESP+12]` | 12 |

The selected route is validated against the **actual pack's** count `+46`
and group pointer `+60`. A regression relocates the pack to separate heap
storage while preferred `909286` contains zero, so a coincidentally equal
static publication cannot substitute for the native producer. The ordered
source `onRecoveryApply` records compare body/header, entry ESP, all input
pointers and bytes, route index and terrain result. The observer is read-only
and its return value is ignored. Known literal position storage is resolved
to its actual module address before its pointer is published; heap identities
are preserved.

Selected parent boundaries additionally capture the actual sound bank commit
region, sound43 owner through `[6f2414]` plus slot `ac`, its proven `490`-byte
extent, and compiler cookie. The potentially null channel vector is not
blindly dereferenced. Reached missing audio descendants still fail; capturing
an application entry alone does not establish emission or complete parent
success. An ordered matching input stream is retained separately if source
replay later fails, with `sourceComplete: false` and the parent still failed.

[The baseline recheck](../analysis/physics-native-recovery-parent-policy-recheck-20261022/report.json)
continues to match all three saved ordinary parent calls at 4,903,040 bytes
each under the extended checker. It is separate from a positive selected
capture. Original baseline reports remain unchanged.

## Separate controlled state32 input

[The bounded natural selection search](../analysis/physics-native-selected-recovery-v2-search-20261022.json)
reached its 90-second limit after 815 discarded parent candidates and zero
application entries. It supplies no positive recovery fidelity claim. A
separate preparer, `tools/prepare-controlled-native-recovery-capture.mjs`,
therefore exposes `createControlledNativeRecoveryCaptureConfig` and
`prepareControlledNativeRecoveryCapture` for a declared input experiment:

```powershell
node tools/prepare-controlled-native-recovery-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE
```

The new configuration uses the selected full-parent observer with skip0 and
captures thread environment. An additional **unfiltered** breakpoint at the
actual `45101c` caller observes only three four-byte scalar roots: clock,
session pointer and first participant body pointer. No heap descendant is
followed by those caller-range descriptors. At raw hit 229 only, the existing
guarded-write mechanism performs exactly these ordered operations:

| Target | Required original | Replacement | Role |
| --- | --- | --- | --- |
| `90a548` | 228 | 228 | Clock assertion; no-op |
| `[5ecb1c]+57c` | 4 | 4 | Active-phase assertion; no-op |
| `[909300]` | `1c03` hex | `1c03` hex | Ordinary vehicle flags assertion; no-op |
| `[909300]+128` | 0 | 32 | Declared rejected-state input |

The first three writes are recorded assertions: their original and replacement
bytes must be equal. The helper checks each guard before writing; if a later
guard fails, the preceding operations were no-ops. The caller limit and
clock expectation are fixed by the retained ordinary capture's first active
parent at raw hit229 / clock228. This is an explicit condition to verify,
not a guarantee that every startup will reach the same state. Failure aborts
the attempt. The maximum snapshot count is 350 and the inherited hard
duration/event bounds remain in force.

The parent's entry snapshot is taken **after** this write, so source replay
receives the same supplied native state32 input. No pose, route, obstruction
answer, query result or application response is supplied. The checker must
verify the exact configuration, all 229 sequential caller observations, all
four actual intervention records and addresses, the first post-write parent,
state32 already present in its captured memory, and exactly one application
of the controlled first body. It then uses authority
`controlled-native-recovery-input`, never a natural-trigger label. The three
no-op intervention records are required evidence, not ignorable duplicates.

Immediate unfiltered native snapshots publish `hit` without `rawHit` or
`matchingHit`; the verifier respects that actual schema. Exact unfiltered
configuration plus sequential hits proves their counter domain. Optional
counter fields, if present, must agree. Module identity is derived from
captured range metadata; an absent top-level module base is not fabricated.
Tests exercise that schema and reject contradictory counters/base, missing
guards, earlier writes and a falsely reset source-entry state. Preparation
and tests do not launch the executable or establish a positive native result.

## Controlled parent prefix and independent leaf composition

[The first controlled parent report](../analysis/physics-native-controlled-recovery-20261022/report.json)
records all four exact guards and one native application entry at clock228.
Every field of the ordered source/native application input record matches,
including the actual body/header, stack, pose, quaternion, rotation, selected
route/index and terrain argument. Its `applicationComparison.matched` is true
with one native and one source call. The **complete parent remains failed**:
source replay later requires the sound dispatch `allocate` service, and the
input comparison explicitly reports `sourceComplete: false`. This is positive
controlled application-entry evidence, not final native parent-output
agreement. The
[post-run integrity report](../analysis/physics-native-controlled-recovery-source-verification-after-20261022.json)
matches all 171 installed/copied files.

`tools/prepare-controlled-native-recovery-leaf-capture.mjs` separately composes
the existing observer-only query/application preparer with the same caller229
guards, captured thread environment and maximum350 snapshots:

```powershell
node tools/prepare-controlled-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE query
node tools/prepare-controlled-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE apply
```

The two invocations require different fresh output/configuration paths. The
library API is `createControlledNativeRecoveryLeafCaptureConfig` with
`{stage: 'query'}` or `{stage: 'apply'}`. This composition retains each leaf's
complete native input ranges, both preRET alternatives and first-matching-call
policy. It has no pending parent selector. The baseline leaf preparer remains
observer-only by default.

The shared provenance helpers take explicit `{scope: 'parent' | 'query' |
'apply'}`; omitted scope retains the parent policy. The leaf checker labels a
controlled result only after proving the four actual interventions and that
the first body is in state32 **before** the leaf observation. It also proves
clock228, same caller thread and actual stack/pointer ABI. If `C` is ESP at
the external `45101c` caller, parent ESP is `C-4`, query entry is parent minus
120 and apply entry is parent minus124. Both receive position at actual
`70eb0c`, quaternion at parent minus24 and rotation at body plus`c4`. Query
uses mode1 and its output slot at parent minus44; apply route/index must lie
in the actual captured pack's group table. Caller counter/base fields follow
the genuine immediate unfiltered schema described above.

Native leaf output, query acceptance and output word, complete declared
semantic memory, preserved registers and actual return branch are checked by
the existing standalone leaf replay. No answer is copied from source into
the native run. Independent query/application agreement is a separate result
from the controlled parent input-prefix observation and its unresolved sound
service.

## Verification and remaining runtime evidence

```powershell
node --test tests/native-post-frame-replay.test.mjs tests/native-recovery-context.test.mjs tests/native-recovery-capture.test.mjs tests/native-recovery-preparer.test.mjs tests/native-controlled-recovery.test.mjs tests/native-controlled-recovery-leaf.test.mjs tests/native-recovery-leaf-capture.test.mjs tests/native-recovery-leaf-replay.test.mjs tests/raw-respawn-query.test.mjs
node tools/check-native-prepass-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
node tools/check-native-recovery-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY
```

Forty-seven focused tests pass. New prepass tests execute all retained leaf
instructions on height, slow, grounded, wrapped-counter and zero-count inputs.
New parent-context tests perform four constructed respawns through actual
nearest selection, raw query, application, progression and ring emission,
comparing every mapped byte above `10000h` against retained whole-parent
instructions at PC24/nearest. Only compiler-cookie verification is admitted
as a service. Binding itself leaves the input capture unchanged.

The separate parent checker requires observer IDs `native-recovery-before`
and `native-recovery-after` at RVAs `7ccc0` and `7d02d`, with the actual
`451021` caller return and identical entry/pre-RET ESP. It admits one to three
complete same-thread pairs, an explicit active-phase predicate and matching-hit
window, and declared ESP storage. Its tests reject a leaf/frame boundary,
wrong caller, changed session/thread/stack identity, injected parent actions
and incomplete windows. It compares the actual source parent result and
declared memory; volatile EAX is not interpreted as a success result.

These constructed-input instruction comparisons establish the covered source
branches separately from the original-process observation below. A native
prepass capture without an observed rejection does
not prove a respawn; positive native query/application/parent observations
remain necessary. Reached completion messages, networking and audio virtual
services must have real bindings or fail explicitly. Arbitrary missing
controller/route/checkpoint/effect storage fails instead of supplying fallback
state. Broader native stack-depth proof and every completion/retirement mode
remain separate from the covered fixtures.

## Original-process prepass observation

[The three-pair replay report](../analysis/physics-native-recovery-prepass-v2-20261022/report.json)
matches **4,880,872 semantic bytes per pair**, the native EAX end-record pointer,
and preserved registers at clocks 228, 229 and 230. These are genuine
`47e180` entry / `47e234` pre-RET observations from the `47ccff` caller, with
the capture's declared startup and observation interventions retained in the
report. The prepass replay and checker were unchanged during the capture.

[The captured-state audit](../analysis/physics-native-recovery-prepass-state-audit-20261022.json)
finds **zero rejection transitions across eighteen participant observations**.
Every body remained in state 0; each slow counter remained 0 and every wheel
had its grounded bit set. Heights were -489 or -490 against the selected
sector's rejection threshold of 53. Speeds were initially 0; the last pair
also contained speeds 120, 9 and 8. This observes the grounded slow-counter
reset and ordinary speed paths, with no changed rejection output. It does
not establish native state32 production, route choice, placement query or
respawn application. The separate complete-parent baseline follows below;
positive recovery branches remain runtime coverage targets.

## Original-process full-parent observation

[The complete-parent replay](../analysis/physics-native-recovery-parent-20261022/report.json)
matches **4,903,040 semantic bytes per pair** across three genuine
`47ccc0` / `47d02d` calls from `45101c`, at clocks 228–230. The selected
native identity is `HIGH/LEV2`, with constructor vehicle selectors
`[6,4,0,2,3,1]`; these fields remain stable within every pair. All preserved
register checks pass. The
[post-capture integrity check](../analysis/physics-native-recovery-parent-source-verification-20261022.json)
matches all 171 original installed/copied files.

[The immutable state/path audit](../analysis/physics-native-recovery-parent-state-audit-20261022.json)
decodes all fifteen physical bodies and six participants in each pair. Every
physical body remains in state 0 and all eighteen participant checks avoid
rejection. Thus the retained native state32 guards admit **zero nearest-route
searches, placement queries, respawn applications, rings or retirements**.
These path counts follow captured entry fields and retained branch guards;
they are not an instruction trace. The source report independently returns
zero respawned and zero retired bodies. No declared semantic byte changes
across these particular native parent calls.

The comparison includes 17,908 recovery-global bytes and 4,260 additional
route/checkpoint bytes beyond the 4,880,872-byte core/geometry baseline:
the nine route headers occupy 108 bytes, 222 non-header route points occupy
3,552 bytes, and 25 checkpoint ID groups plus records occupy 100 plus 500
bytes. These tables were captured and compared exactly, but recovery did
not traverse them in this window. The separately captured eight profile
bytes are invariant in all pairs; the main checker includes their four-byte
root, while the table bytes themselves are outside its semantic ledger.
The audit records that distinction explicitly.

This proves the real full-parent baseline and its native memory bindings.
Positive original-process rejection, nearest selection, query/application,
emission and retirement coverage remains open; constructed instruction
fixtures cover those source branches separately.
