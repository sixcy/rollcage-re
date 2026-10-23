# Background audio producer: next source and input scope

The next missing producer is the game's managed audio update, rather than a
GetCurrentThreadId side effect. Retained code establishes a route from the
thread startup to the locked manager consumer and per-source mixer lookups.
It does **not** yet establish that V12's observed owner 3700 took that route:
its thread object and original lookup caller frames were not captured.

This read-only audit changed no runtime source, tests, capture profile or
canonical notes and launched no game. Its machine-readable evidence index is
`analysis/native-audio-background-producer-plan-20261023.json`; all ten retained
records identify the unchanged Redux target SHA256.

## Static route and missing runtime association

| Stage | Retained behavior |
| --- | --- |
| 4a5d50h | Constructs an 80-byte ManagedPollThread; publishes manager+824h. |
| 4a33c0h | `_beginthreadex` receives start address 4a3320h and the thread object; writes its TID at object+24h. |
| 4a3320h -> 4a38c0h | Thread entry loads its argument as ECX and calls the actual managed loop. |
| 4a38c0h | Waits on stop/wake handles; invokes object+34h with object+38h after a wake. |
| 4a3790h | Computes time through the real stopwatch, then invokes object+44h with object+48h. |
| 4a94a0h -> 4a6600h | Loads the manager argument into ECX and tail-jumps to the substantial manager update. |
| 4a6600h -> 4a6b60h | Holds manager+854h while invoking the source consumer at 4a6a53h. |
| 4a6b60h -> 4b12d0h | Calls manager virtual+60h at 4a7229h or 4a72f3h. The retained manager vtable resolves it to 4b12d0h. |
| 4b12d0h -> 4a79f0h | Gain mixer lookup at CALL 4b1301h, returning to 4b1304h. |
| 4a7c10h -> 4a79f0h | Frequency mixer lookup at CALL 4a7c9eh, returning to 4a7ca1h. The nonspatial 4b12d0h branch calls 4a7c10h at 4b192bh. |

Startup explicitly stores worker 4a3790h, self argument, poll callback 4a94a0h,
manager argument and interval word 20 at thread+34h/+38h/+44h/+48h/+4ch.
The thread-start route is static evidence; a startup thread-entry snapshot is
not required merely to execute one observed existing worker tick, but would
be required to claim that original start was observed.

V12's manager is 086cda28h and its manager+824h pointer is 086dfa28h. The 80-byte
object at that address is unavailable in the retained before/during/after
snapshots. Therefore stored TID+24h cannot yet be compared with 3700. The trace
records 3700's creation event and 379 excluded lookup/debugger observations,
but lacks its register/caller context. Do not infer the exact caller from the
lookup count: frequency and gain can both look up a mixer during one source
update, and multiple ticks can occur during the observed interval.

Useful positive records include 12214/12215 for the thread entry, 12240 for
the managed loop, 12195 for the tick, 12231 for the manager thunk, 12234 for
4a6600h, 12289 for 4a6b60h, and 12339/12361 for the two source-parameter
functions. Failed procedure requests such as 12197/12199 are not code evidence.
The full 144-byte manager vtable is retained in 9120, Evidence
`ev_5f7acc7a9b1100ce71ca77cade0d68917172bcb8796f6717d3ec811638ed4e52`.
Its slot 60h is 4b12d0h; the existing runtime profile observes only the first 4ch
bytes of that table, so a future runtime association needs at least 64h bytes.

## Concrete source work

No implementation of 4a6600h, 4a6b60h, 4b12d0h or 4a7c10h was found in `src/`.
Existing startup, thread destruction, mixer hierarchy, source controls,
playback-state, stream-polling, spatial-listener and retirement ports provide
children; they do not implement this consumer.

The smallest useful next algorithm is 4a7c10h: derive source frequency and
sample rate, run the actual mixer lookup and getter, preserve its guarded
comparison/float32 stores at source+988h, and issue the genuine voice setters.
Its inputs include manager, source, force byte, XMM2, optional decoder or
waveform format, mixer effective-rate getter and exact image constants. Known
COM calls are voice+68h at 4a7d41h and voice+70h at 4a7d59h. The former has
three DWORD arguments and the latter two; their results remain real external
interfaces. Decoder-null and waveform-backed handling can be a bounded first
domain, not a substitution for a populated decoder child.

Next is 4b12d0h's explicit nonspatial/reverb-free branch. It performs the gain
lookup, effective-gain getter, float32 gain cube/cache at source+984h and
voice+30h SetVolume, then the real 4a7c10h child. The source+45eh spatial flag
and virtual+50h effect query must select that branch naturally. Spatial and
reverb branches reach additional game children and X3DAudioCalculate; they
must remain explicit until implemented and supplied with original inputs.

The outer implementation required to explain the actual game-wrapper writes
is still 4a6600h/4a6b60h. In particular, 4a66e5h/4a66e8h increment/store the
manager+854h wrapper depth/owner. The update also holds +894h, takes +874h,
processes queues and vectors, updates time, mixer ramps/hierarchy, source
states and selection. Existing audio sorting only implements at most 32
candidates. V12 has 94 active entries, but its exact candidate count was not
captured; a larger sort branch is a conditional gap, not a proven V12 event.

A single source leaf will not close the background consumer. A subsequent
single-tick worker adapter should execute the real game algorithms against
shared memory, with observed QPC/events/locking/COM boundaries and declared
interleaving. It must not turn a waiter observation into a game depth/owner
or manager/vector answer.

## Minimal next identity and worker observations

First, observe the thread object at the ordinary controlled parent boundary:

```json
{"rva":"0x314b08","dereferenceOffsets":["0","0x824"],"length":80}
```

Validate its TID+24h, handle+20h, worker/self+34h/+38h and callback/manager
+44h/+48h against the observed thread and manager. Capture the manager vtable
through slot 60h. The existing allocated object extent is established by
startup's original 80-byte allocation, not a containing heap-region guess.

For the first eligible worker mixer lookup, an actual 4a79f0h entry snapshot
needs eight bytes at ESP (return and mixer ID), raw context, manager/lock bytes and the thread
object. Its return word distinguishes 4b1304h, 4a7ca1h, factory 4a7635h,
stream 4adc00h and other callers. Do not unconditionally chase ESI as a source
at this generic entry: some callers carry another object there.

After identifying the caller, observe the actual 4b1301h or 4a7c9eh site with
the proven source in ESI, its 9a8h bytes, manager, mixer header/storage and
reached mixer objects/vtables. Function-entry/preRET pairs for 4a7c10h or
4b12d0h then provide input/output comparisons. For 4a7c10h retain XMM2 and the
numerical context; the known 4b192bh caller loads 1.0 into XMM2, which can be
independently checked rather than assumed for other callers. Voice interfaces
need only their actual pointer/vtable and declared call/output spans.

The current deferred nested policy supports only `frame-thread` and excludes
these worker observations by design. A separately declared, bounded worker
policy with thread-object/caller proof is needed. Enabling all old sites for
all threads would collect hundreds of observations and exceed the existing
budget. No such policy was prepared in this audit.

## Exact 564-byte active-vector allocation preimage

The independent main-thread gap is fixed by observing the allocator output,
not the later vector. At 40f07fh/40f085h native ESP still points to the original
requested byte count. Cross-check it with preserved EBX*4, allocator result
EAX, vector header EDI and its original begin/end/capacity. For the active
factory append, native call ESP is inner 4a7460h entry - 858h; the caller chain
contains 4a76adh/40ec0bh. This separates it from the later owner-channel 4-byte
allocation at the same shared instruction sites.

V12 requested 564 bytes, copied 376 old bytes and appended one pointer. Only
four allocator-return bytes were captured; the other 560 are unavailable.
The old array 109bfd00h is subsequently reused for the owner-channel 4-byte
allocation, so its later BAADF00Dh bytes cannot be merged into parent input.

The existing helper can capture a bounded readable region containing returned
EAX at 40f085h. Posthoc validation can then slice **exactly the original
requested bytes** after checking count, root, wrap/overflow, readable coverage,
caller and vector identity. A containing region is transport, not allocation
capacity. A proposed conservative region limit is 16 MiB and requested-span
limit 64 KiB, while preserving the 128 MiB pending budget. If either bound fails,
report it; do not raise the budget automatically or infer the missing tail.
Only one selected active allocation needs that region; source bytes for the
376-byte memmove are already captured in the old vector storage. Its output
can be computed by genuine CRT semantics and compared separately.

Current `MemoryRange` supports fixed length, readable region and vector
storage, not length-from-register/stack. A future exact reader could instead
read `[ESP]`/EBX*4 and copy precisely 564 bytes with the checks above, but that
would be a new tested helper contract. It was not implemented or configured
here. Faking a vector header to obtain that dynamic length is not acceptable.

This plan preserves the current strict failure and its explicit limitations.
The next proof must identify and run an actual worker producer and obtain the
larger allocation's original preimage; a favorable thread schedule is not a
replacement for either.
