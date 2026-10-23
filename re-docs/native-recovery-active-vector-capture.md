# Optional active-vector allocation and worker identity capture

`services-active` extends `services-playback` without adding breakpoint sites
or changing any game intervention. Programmatic preparation uses the complete
playback options plus `includeActiveVectorEvidence:true`. Omission/false leaves
the V12 profile byte-for-byte unchanged. It keeps52 deferred sites, guarded
caller229 activation, main pending-frame thread scope and the existing90s,
350 snapshots,115 nested observations and128MiB pending-buffer bounds.
Preparation does not launch a process.

At the existing operatorNew return40f085, the original four-byte channel
allocation observation remains. An additional bounded readable-region
transport observes the actual VirtualQuery region containing EAX, at most
16MiB. This is transport, not an inferred allocation size. The selector uses
the real native request `[ESP]`, EBX*4, the active-vector header and exact
factory caller stack to extract only `[EAX,EAX+requestedBytes)`, at most
64KiB. The containing region size and bytes outside that exact span never
supply an allocation capacity or source input. Bounds fail closed.

The motivating V12 case starts with94 used/capacity pointers in376 bytes.
Native growth chooses141 slots and requests564 bytes. Its shared channel
observations captured only four bytes, leaving560 genuine preimage bytes
missing. A later initialized active array and guessed BAADF00Dh fill are
explicitly unsuitable substitutes. V12 remains unchanged and the new profile
does not retroactively repair it.

For the actual4a7460 factory entry I, F=I-830h. The active append's reserve
allocator CALL/return ESP is F-40; memmove CALL/return ESP is F-52. Selection
requires manager+834's original header, full old used/capacity bounds,
native capacity growth, return40f085 and saved caller returns40ec0b/4a76ad,
source input slot F+20, source/manager/backend/lock identities and actual
same-thread observation order. Memmove arguments must be the actual new
pointer, original array and original used bytes. The original four-byte
destination observations link allocation/copy prefixes. Later publication
is checked only as output; it never initializes the allocation preimage.

If an actual run has spare active capacity, a separate `no-growth-needed`
result requires independently observed before/after headers: unchanged
begin/capacity, end+4 and the real source pointer at the appended slot. It
also requires no relevant growth observation inside that factory interval.
This branch reports `allocation:null`. Missing transport when growth is
required is an error, never grounds for choosing the no-growth branch.
The `allocation-growth` result instead reports its exact observed request
and preimage. This profile currently requires a nonnull allocated active
header; missing/empty dependencies are not replaced.

The manager graph additionally captures the genuine80-byte object pointed
to by manager+824. Manager's vtable is extended from4ch to exactly64h bytes,
covering slot+60h (4b12d0), without implying a slot at+64h. Worker object
checks bind stored TID+24, worker4a3790 at+34, self argument+38, poll callback
4a94a0 at+44, manager argument+48 and20ms interval+4c, as initialized by
retained9115/12193 and consumed by12195. The actual vtable/class fields and
all pointers are relocated to the observed process.

`loadPhysicsCapture` additively preserves `nativeThreadRecords`. It retains
owned DEBUG_EVENT lifecycle codes2/3/4/5 and actual host frame-thread scope
skips. Every preserved row carries original trace order and corresponding
debug event PID/TID/ordinal provenance anchored to `owned-process`. Scope
records omit PID in the original helper trace; their explicit provenance
comes from the matching current owned exception DEBUG_EVENT, not the stored
TID in memory. Foreign PID, mismatched TID/order, advanced counters or skipped
original instructions fail validation. Association requires a matching live
owned create-thread or actual scope-skip record before the memory snapshot;
an exited thread/process or stored TID alone is insufficient.

Retained V12 already supplies435 such thread records: worker3700 has an
actual owned create-thread event368, trace row806, PID27100. That observation
does not supply the missing worker object's80 bytes. Neither object callback
identity nor observed TID association proves the exact worker lookup caller
return word. Reports therefore retain `callerPathProved:false`,
`fullConcurrencyProved:false` and `sourceReplayComplete:false`. No background
snapshot policy, native thread scheduling or service result is changed.

`verifyNativeRecoveryActiveVectorEvidence` checks target-bound retained
3874/11601/9115/12193/12195/12339 instructions. Eight focused tests cover
unchanged V12 configuration/bounds, genuine exact564-byte synthetic slicing,
no-growth proof, ownership/lifecycle/scope provenance, missing/forged worker
data, request/header/caller/transport failures and a64KiB overflow. The old
V9/V11/V12 regressions stay positive; V12's larger preimage stays explicitly
missing.40 combined capture/loader tests passed with zero skips at preparation.
The new allocation/worker-object positives were synthetic at that stage;
the subsequent original V13 evidence is distinguished below. No game or
native helper was launched or modified by this worker.

## Clean original V13: no growth required

Root's fresh original-process V13 capture completed at46.930 seconds and
closed its owned game at46.987 seconds. It has329 snapshots,94 nested
observations and one selected controlled parent. The171 installed/copied
originals match their manifest hashes before and after. Retained raw evidence
is `analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v13-20261023`;
the [sound observation report](../analysis/physics-native-controlled-recovery-sound-v13-20261023/report.json)
passes lineage and the new identity/no-growth checks.

This actual run takes `mode:no-growth-needed`. Independent factory entry/
leave headers show97 initial entries in capacity141, unchanged begin and
capacity, end+4 and the real newly created source in slot97. There is no
relevant allocation/copy observation in that exact native factory interval.
The report therefore has `allocation:null`, not a substituted or inferred
564-byte input. V12's different growth case and560 missing preimage bytes
remain unresolved by V13. Exact larger-allocation slicing still has synthetic
positive coverage only; this favorable run does not establish that branch's
new original-process preimage.

The genuine80-byte worker object records TID32368. Its class, worker4a3790,
self argument, callback4a94a0, manager argument and20ms interval match the
retained initialization/consumption instructions. The actual manager vtable
has slot+60h targeting4b12d0. Worker32368 independently appears in an owned
create-thread DEBUG_EVENT371 at trace row811 for PID10788. Those are actual
OS debugger identities and source-object observations; the exact worker
lookup caller return word remains unobserved. Both worker association and
top-level evidence retain `callerPathProved:false`/
`fullConcurrencyProved:false`; the observation checker retains
`sourceReplayComplete:false`.

The separately scoped connected-parent CLI also reports a successful
semantic/source/playback match for this V13 trajectory:
[parent attempt](../analysis/physics-native-controlled-recovery-parent-audio-v13-attempt-20261023/report.json)
has `matched:true`, `sourceComplete:true`, `playbackComplete:true` and
`fullPrivateAbiMatched:false`. This single favorable schedule is not a
concurrency closure or a full private CPU/CRT ABI match. The earlier V12
concurrency failure remains preserved; neither its manager transitions nor
later initialized vector data are replaced to obtain this result. Root
audits the connected-parent claim separately from these capture observations.

A retained V13 regression reloads the complete hash-verified capture,
reruns parent/activation/thread/clock selection, independently checks the
before/after header and appended slot, and verifies the original lifecycle
record against the worker object's TID. Eight corruption cases reject
changed header end/capacity, appended source, worker TID/callback, manager
virtual target, removed worker debug evidence and foreign process provenance.
All nine active-vector tests pass; the combined capture/loader set has41
passes with zero skips. Production profile, helper and source code stay
frozen. This regression work performs no capture or game launch.
