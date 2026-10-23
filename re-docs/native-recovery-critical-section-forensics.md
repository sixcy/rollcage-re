# Recovery audio critical-section observations

The read-only V8 audit is retained in
[native-recovery-critical-section-forensics-v8-20261023.json](../analysis/native-recovery-critical-section-forensics-v8-20261023.json).
Every original snapshot/context blob was hash-checked by `loadPhysicsCapture`.
The audit changes no game/source/verifier state and launches no game or device probe.

All three groups belong to main TID4756 at logical clock228 within the same
controlled recovery parent. Enter, GetCurrentThreadId-return and Leave-return
observations have the same native ESP for their respective group. The live
lock register resolves the same manager-relative object: mixer/factory `+854h`,
playback `+874h`. Each GetCurrentThreadId result is4756. The actual imported
target is `770441f0`; the factory's single-step event2762 reaches that target
between events2761 and2763. These are observations from this closed process,
not reusable addresses for another launch.

| Group | Snapshot ordinals | Debug-event ordinals | Post-Enter to post-GetTID byte changes |
| --- | --- | --- | --- |
| Mixer |287,288,289|2511,2513,2515| None |
| Factory |292,293,294|2761,2763,2765| Offset4: `fe`→`fa` |
| Playback |298,299,300|2807,2809,2817| None |

The factory's32-byte window changes only the native critical-section
LockCount DWORD at `+4`: `fffffffe`→`fffffffa` (−2→−6). Native RecursionCount
at `+8` remains1 and OwningThread at `+0c` remains4756. All other bytes remain
identical, including the game's wrapper depth/thread DWORDs at `+18/+1c`,
which are still0/0 before the native INC/store instructions execute.

Microsoft documents the modern LockCount encoding: its low two bits describe
lock/wake status, while the complemented remaining bits describe waiting
threads. Both observed values retain the locked/no-woken-thread status. Their
decoded waiter count changes0→1. The exact field interpretation is Windows-
version dependent; see [Displaying a Critical Section](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/displaying-a-critical-section).

The raw trace independently records background mixer TID20500. It performs144
frame-thread-suppressed mixer observations within the retained parent. Near the
factory interval, it reaches the mixer post-Leave site at2759 and steps its
epilogue at2760; main enters its factory critical section at2761, calls the observed
GetCurrentThreadId target at2762, returns at2763, and reaches the post-Leave
site at2765. Background mixer entry/return observations then occur at2769 and
2772. Those events also cause a genuine main-thread append-call re-deferral
chain at2770/2773, closed by one actual re-trap at2775.

The factory post-Leave snapshot already contains native/game-wrapper ownership
by20500 and wrapper depth1. The mixer post-Leave snapshot shows the same new
owner; playback's post-Leave snapshot is unlocked with owner/depth0. A
post-Leave observation therefore cannot generally be treated as an unchanged
or unlocked object owned solely by the sampled main thread. Windows allows
other threads to acquire a released section and does not promise FIFO order:
[Critical Section Objects](https://learn.microsoft.com/en-us/windows/win32/sync/critical-section-objects).

This evidence is consistent with concurrent contention rather than a wrong
service-site ABI or a main-thread write to game-owned wrapper state. The exact
waiter increment inside Windows is not instrumented, so its writer/timing is
not independently isolated. In particular, the delta must not be attributed
to GetCurrentThreadId or injected as that function's source behavior. Retain
the full pre/post bytes and label this a concurrent/unattributed transition.
Other opaque-field changes remain separate evidence gaps. This audit does not
close the complete source factory, platform-service or audio-parent replay.
