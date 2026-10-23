# Optional recovery playback binding observations

`services-bindings` is an opt-in extension of `services-deferred`. It prepares
46 nested sites (the existing 24 plus 22), retains the controlled caller229
guarded input and host arming, and requires pending-frame thread scope. It
does not launch a process. Existing `services` and `services-deferred`
configuration output remains unchanged. Bounds stay90 seconds,350 snapshots,
115 nested snapshots and128MiB pending memory.

```powershell
node tools/prepare-native-recovery-sound-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE services-bindings
```

The programmatic option is `includeBindingSites: true`, together with
`includeAllocations`, `includeVectorStorage`, `includeServiceSites` and
`deferObservationsUntilControlledCaller`, all true. Malformed or weakened
profile configurations fail validation. New raw results still require the
original-process capture and strict posthoc selection; synthetic tests do not
establish a new native match.

The observations fill specific missing inputs:

| Sites | Observed evidence |
| --- | --- |
|4058e1/4058e7 | Actual playback string allocation request, native stack chain, fresh string metadata, returned EAX and allocation preimage before game construction |
|4a2290 | Actual incoming logger ECX and playback caller return4ada62; ECX is never dereferenced or synthesized |
|4a3b1e/4a3b24 | Both native FindFirstFileW queries, two stack arguments, caller UTF16 path,592-byte WIN32_FIND_DATAW preimage/output and actual HANDLE |
|4a3b2a/4a3b30 | FindClose argument HANDLE linked to its real FindFirst return and actual BOOL |
|4a3c06/4a3c0c | CreateFileW seven arguments, path, caller frame/file record and actual HANDLE |
|4a3c16/1c,4a3c23/29,4a3c3f/45 | Conditional GetLastError, Sleep and retry CreateFileW observations, only when reached |
|4a7807/4a780d | GetFileSizeEx arguments,8-byte output preimage/output and actual BOOL |
|4a2b2c/32,4a789d/4a78a3 | Cleanup/outer CloseHandle arguments, file-record location and actual BOOL |
|4a7a26 | Each reached mixer lookup receiver80-byte input, actual virtual slot0, vector slot and requested ID |

The manager graph additionally observes the actual backend vtable slot0 via
manager+81c. It supplies no backend/voice implementation or guessed COM output.
Manager+910/+914 and reached mixer+48 remain actual opaque engine/voice inputs.

For playback, derive S=dispatchEntry-20 and F=alignDown(S-4,8)-38h.
The formatter entry is F-10h; its4096-byte buffer starts F-1010h. Assignment
entry is F-101ch, grow entry F-1034h, and allocator CALL/RET ESP is F-1064h.
Thus ESP+54h contains the actual formatted buffer. Only these two new shared
allocator sites use an observation predicate on the literal `Playing ` prefix
(`506c6179696e6720`). They separately capture and verify the actual session
phase4 bytes, clock228 and frame TID. Other sites retain the phase4 predicate.
The prefix reduces irrelevant path-string allocation observations; it does
not change any original game instruction or service result. Posthoc selection
also proves all private return addresses, original source-name argument,
fresh string metadata, callee-saved registers and the logger's resulting
string metadata.

The debugger's existing readable-region mode observes the real VirtualQuery
region containing returned EAX, bounded at64MiB. The selector then requires
the actual requested span[EAX,EAX+n) to be covered, and reports only that
exact allocation preimage separately from containing-region size. Region
size is never treated as allocation capacity. Reaching the existing memory,
snapshot or time cap remains an explicit failure; bounds are not extended.

For the two FindFirst calls, let M be the proved4a7710 entry and I the
proved4a7460 entry. Resolver entries are M-444h-408h and I-830h-408h.
For each resolver entry R, path frame P=alignDown(R-4,8)-c08h,
FindEBP=P-8, and Find frame Q=alignDown(FindEBP,8)-a50h.
CALL ESP=Q-8; return ESP=Q; path=Q+650h; output=Q.
Captured Find EBP/saved resolver EBP prove return4a7fd6 and outer/inner
resolver returns4a77bb/4a7559. Saved values beyond this chain are not blindly
chased: the outer manager does not establish EBP and the inner factory uses
EBP as the constructed source pointer.

The selector also associates CreateFileW with the outer factory's exact
aligned file-open frame and caller4a77f1, and size/close calls with the
outer frame/file record. Mixer observations require the actual inner lookup
frame, manager EBX, vector slots advancing four bytes, native requested ID
in stack/EBP and actual4a92e0 getter slot. Earlier visited IDs must fail the
comparison; the final visited ID must match. No game-child getter result is
used as a seed.

Retained instruction authority is checked against the shipped Redux SHA256
in `verifyNativeRecoverySoundBindingEvidence()`:3663/3703 string routines,
9295 playback,9311 formatter,12172 logger,11607 existence query,11592 path
resolver,11595 open,11598 close,9126/11601 outer/inner factories,
11733 mixer lookup,9128 mixer allocation,12185 mixer stores and12250 getter.
The preparer verifies the site instructions and stack-adjustment boundaries.

`bindingObservations.sourceReplayComplete` stays false. These records preserve
original service inputs, outputs and native volatile registers. They do not
apply external deltas, replace source behavior, or claim full recovery/audio
replay. Earlier V8 remains independent retained evidence; the input-affected
V7 capture remains unsuitable as clean fidelity evidence and is not reused
as a new observation.

Initial implementation validation:18 focused tests passed across binding preparation/selection,
legacy sound preparation and retained sound lineage, plus the actual owned
native observer-activation fixtures. Binding positives are explicitly
synthetic. Negatives reject changed prefix/offset/phase/clock/TID, private
stack returns, allocator coverage, substituted file outputs, native stdcall
cleanup, query resolver chain and mixer vector iteration. No original game
was launched for this implementation.

## Retained original V9

Root subsequently ran the prepared profile in the original game and closed
the owned process after44.161 seconds. Retained raw evidence is
`analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v9-20261023`;
the independent selector report is
`analysis/physics-native-controlled-recovery-sound-v9-20261023/report.json`.
The completed capture has323 snapshots,88 nested observations and zero
owned breakpoint deferrals. Its loaded memory/context blobs pass their
recorded hashes, and parent activation/caller/thread/clock/stack lineage and
binding observation checks pass. This is controlled original-process
evidence, not a synthetic replacement or natural rejection trigger.

The actual allocation request was32 bytes for20 formatted characters:
`Playing SFX_PINKPURP`, followed by NUL. The actual allocated32-byte preimage
was `0df0adba` repeated eight times. The containing readable region was
1449984 bytes, independently distinguished from the32-byte request. Logger
ECX was zero. A binding-only check now requires this trace register to equal
DWORD172 of the separately retained716-byte x86 CONTEXT. It does not infer
ECX from the string pointer or demand zero in other captures.

Both expected outer/inner FindFirst queries, both corresponding FindClose
calls, CreateFileW, GetFileSizeEx and both close sites were actually reached.
FindClose and the size/close operations returned true; CreateFileW returned
the actual handle3472. Error/Sleep/retry sites were not reached. Both592-byte
Find data buffers and the8-byte file-size buffer retain their own native
preimage and output, without guessing or validating an OS answer as source
behavior. The mixer loop visited IDs0 and1 with requested ID1, preserving
the exact receiver/vector/virtual-slot inputs.

The retained V9 regression checks these observed outcomes and still requires
`sourceReplayComplete: false`. Nine in-memory corruption cases reject
changed allocation request, allocation return/private chain, allocation
coverage, logger ECX/context disagreement, file output pointer/preimage
association and file-service ESP. A separate temporary negative loader
fixture uses the real retained Find output descriptor/hash with one altered
byte; blob hash validation rejects it. Original capture files stay read-only.
This tests preservation of the observed OS bytes, not a guessed expectation
for their arbitrary contents.

After the context check,15 focused tests passed across binding, legacy sound
capture and retained original sound regressions, with zero skips. The two
new original V9 tests run when its local evidence directory is available.
The native helper, existing profiles, capture bounds and source audio
implementation remain unchanged by this regression work. Captured service
outputs and logger registers still need the separate external-service replay
and volatile-register binding work before a complete recovery playback match
can be claimed.

## Optional channel-vector allocation profile

`services-channel` adds four independently missing vector-service sites to
`services-bindings`, for50 nested site declarations. Its programmatic option
is `includeChannelSites: true`, together with all existing binding-profile
options. `includeChannelSites: false` or omission preserves the V9 profile
byte-for-byte. No helper extension is required, and all original90s/350/115/
128MiB bounds, caller229 guarded arming and frame-thread scope remain exact.
The four new sites keep the existing actual phase4 capture predicate.

V9 establishes why this observation is missing: owner+4/+8/+c begin all zero
and end at `[106dd700,106dd704,106dd704]`. The later playback allocation
region includes106dd700 already containing wrapper106dd6d8. That later
initialized output must not supply a channel allocation input. V9 has no
breakpoint inside40f060..40f0d5 and therefore does not independently observe
the original channel allocation pointer/preimage at the service boundary.

For A=the proved40db20 selector frame, append entry is A-8, capacity-grow/
reserve entry A-24, and operatorNew CALL40f07f/return40f085 ESP=A-40.
Actual arguments/registers must show a four-byte request and one-element
capacity. The newly returned EAX supplies the observed four-byte allocation
preimage; it is never replaced with the post-append vector pointer or bytes.
CALL40f0a2/return40f0a8 then have ESP=A-52 and arguments `[newPointer,0,0]`.
Both observations capture the same four-byte destination, and selection
requires it to match the allocation preimage exactly. The original vector
header stays all zero until the later native reserve stores; delete is
skipped on this empty-old-storage branch.

Each new site captures the actual EDI vector header12 and an84-byte stack
span starting ESP-4. The span includes input slot A+24 even at the deeper
memmove call. Selection proves the saved append/growth return words40dcba/
40ec0b, input/wrapper/vector identities, one-element count, allocator return
40f085, zero-length memmove arguments and return40f0a8, and actual observed
ordering inside the already proved append CALL/return. The selector supports
only this original empty owner-vector branch and fails closed for other
growth, missing observations or mismatched bytes. A successful report still
sets `sourceReplayComplete: false`.

Instruction evidence11109/3852/3874 proves40ebc0 pushes and capacity CALL,
40edc0's tail jump into40f060, and the allocator/copy/register/publication
boundaries. The new configuration/selector tests are synthetic observations,
not an original-process channel allocation match. They cover malformed
profile scope/phase/ranges, wrong request/count/return/private chain,
nonempty original vector, substituted allocation result/preimage,
changed copy destination and reordered/missing observations.18 focused
binding/legacy/retained tests pass with zero skips; retained V9 positives stay
green. No new game run or channel capture was performed by this worker.

## Independent clean channel capture, V11

The original-process V11 run completes in46.910 seconds with327 snapshots,
92 nested records and one selected controlled recovery parent. Owned cleanup
terminates the game at46.967 seconds. All171 installed/copied originals still
match their manifest hashes. The [lineage report](../analysis/physics-native-controlled-recovery-sound-v11-20261023/report.json)
verifies `channelVectorObservations`: the actual four-byte allocation contains
BAADF00Dh before append, and both sides of the genuine `[pointer,0,0]`
memmove retain exactly those bytes. All four observed private-stack sites,
their return words, original empty header and append order pass. This is
external-input evidence; the checker still reports `sourceReplayComplete:false`.

The independent constructor again matches3720 declared bytes/six registers,
and the source parent caller again matches28 argument bytes/seven registers.
A retained V11 regression reloads the original hash-verified data and rejects
changes to the allocation preimage or either memmove destination observation.
The ten binding tests pass with no skips.

The preceding V10 run is preserved separately as input-affected because the
user explicitly reported interference and requested a retry. It did reach a
complete327-snapshot parent at90.571 seconds, with cleanup at90.624 seconds;
input causality for its longer duration is unproved. It is excluded from clean
fidelity evidence ([record](../analysis/physics-native-controlled-recovery-sound-v10-input-affected-20261023.json)).

## Optional final playback memcpy observations

`services-playback` extends `services-channel` by exactly two read-only sites,
CALL4053d5 and return4053da, giving52 nested declarations. The programmatic
option is `includePlaybackSites: true` together with the existing complete
channel-profile options. Omitting it or setting it false preserves all
earlier profile configurations byte-for-byte; the generated50-site channel
policy also matches retained clean V11. The original90s/350/115/128MiB bounds,
guarded caller229 activation, input writes and frame-thread scope stay exact.

These are the final405310→568a48 memcpy CALL and its immediate return. For
the existing playback layout, CALL/return ESP=assignmentEntry-24=F-1034h.
Actual arguments must be `[observedAllocation, formattedBuffer,20]`.
The profile captures arguments12, the genuine32-byte destination before and
after copy, source21 including its terminator, ESI string metadata28 and an
exact4152-byte caller-chain span starting ESP-4. The source starts atESP+24h,
assignment return4a2b9b is atESP+18h, and formatter return4ada5a is at
ESP+1024h. These relationships are derived from native frames, not retained
absolute stack addresses.

Only these two added sites use a predicate on the actual source prefix
`Playing ` reached through `[ESP+4]`. Separate phase4 bytes and existing
clock observations are captured and checked against the actual session,
clock228 and selected frame TID. Changed prefix/pointer/phase/clock/thread
evidence fails validation. No native predicate, service answer or gameplay
instruction changes. The strict selector supports only the independently
proved fresh20-character/32-byte branch.

Selection links the genuine allocation preimage to the next observed
destination: growth's native405999 writes only byte0 NUL because old length0
and inline capacity15 skip retained-data copy/free. Memcpy must then change
exactly20 destination bytes to the actual source and preserve bytes20..31.
The later game terminator write4053e8 has not run at the post-memcpy
breakpoint; an already terminated output is rejected as that observation.
String metadata still has length0/capacity31 on both sides of memcpy.

Both contexts must be the retained716-byte x86 CONTEXT, with EAX/ECX/EDX
metadata equal to DWORD176/172/168. Returned ECX must independently equal the
later logger's actual context-backed ECX. The observed external memcpy
return is the producer; the logger value never supplies an earlier CRT seed.
Synthetic tests deliberately use a nonzero returned ECX different from both
the prior ECX and destination pointer, and also admit a genuine zero result.

`verifyNativeRecoverySoundPlaybackEvidence()` checks the allocator-growth
NUL path and exact16-instruction reached tail4053da..4053f1,
4a2b9b..4a2ba8 and4ada5a..4ada5d. That tail contains no ECX writer or further
external call before logger entry. Native capacity31 proves its inline
branch is not taken; the observed return chain proves both subsequent RET
targets. Evidence3663/3703/9311/9295 remains tied to the shipped executable
SHA256. No earlier memcpy return, fixture data-pointer convention or game
child output is substituted for this actual volatile outcome.

The new report field is `playbackCopyObservations`; it exposes the observed
copy inputs/output, preserved tail and returned raw volatile registers, and
retains `sourceReplayComplete:false`. Five new preparation/selection tests
cover positive copy/tail preservation, native instruction authority,
unchanged configuration bytes/bounds, malformed capture policy, context/
logger disagreement, allocation/private-chain substitution and changed
copy/source/string/tail bytes.24 focused tests pass with zero skips,
including the untouched original V9 and clean V11 regressions. These new
memcpy positives are synthetic until a fresh original-process capture.
This worker prepares and validates only; no game or native helper/source
implementation was launched or changed for this profile.

## Independent clean final-copy capture, V12

Root's original-process V12 capture completed at46.456 seconds and closed
the owned game at46.507 seconds, with333 snapshots,98 nested observations
and one selected parent. All171 installed/copied originals still match their
manifest hashes. Retained raw evidence is
`analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v12-20261023`;
the [lineage report](../analysis/physics-native-controlled-recovery-sound-v12-20261023/report.json)
verifies `playbackCopyObservations` in addition to the prior binding/channel
proofs. Source replay completeness remains explicitly false.

The proved final memcpy pair is at snapshot326/327. It receives the actual
32-byte allocation278658336, formatted source5499880 and count20, at native
ESP5499844. Before copy, only the original growth terminator has changed the
allocation preimage: byte0 is zero and its remaining BAADF00Dh bytes are
preserved. After copy, bytes0..19 contain `Playing SFX_PINKPURP`; bytes20..31
remain identical to the pre-copy tail. Byte20 is still nonzero, independently
confirming the observation precedes the game's own final terminator write.

Actual raw-context registers show ECX3331866503 before memcpy and ECX0
afterward. Returned EAX is278658336 and EDX20. Logger entry snapshot328 has
the same actual ECX0. The returned context hash is retained separately in
the proof. Thus the zero is an observed final CRT volatile outcome linked
through the native no-writer tail, not a value borrowed from the later
logger or invented for an earlier CRT call. These addresses/registers are
specific to this captured process and are never reused as future inputs.

The retained clean V12 regression reloads the full hash-verified capture,
repeats parent/activation/thread/clock/private-frame selection and compares
its copy proof with the retained report. Eleven in-memory corruption cases
reject raw/metadata ECX and EDX disagreement, substitution of the prior CRT
ECX as logger input, wrong copy count/return, changed growth preimage, source
bytes, premature NUL and modified tail. Three temporary negative loader
fixtures alter one original raw CONTEXT, destination or source blob byte
while retaining its native descriptor hash; all fail blob hash validation.
Those reduced negative fixtures are not presented as original captures.
Original evidence files remain read-only, and production profile/helper
code remains frozen.

All seven playback-copy tests pass with zero skips, including the two
retained-native V12 tests. The combined playback/binding/legacy/retained
sound set passes26 tests with zero skips. This regression work launches no
game and does not change source audio behavior. Binding the observed CRT
outcomes into the source implementation and proving the full recovery
parent remain separate work.
