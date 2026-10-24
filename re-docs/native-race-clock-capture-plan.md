# Warm native race-clock observation contract

This is a separate capture purpose, not the parent/weather observer. The
recovered clock source and 341-case proof are in
[the timing checkpoint](native-race-step-clock-checkpoint.md). No native launch
is authorized by a prepared configuration alone: implement, independently
review and test this exact transport before running the already authorized
physics experiment. Preserve existing launcher, thread-freeze and cleanup code.

## Fixed policy and selection

Top-level option `raceClockObservation`, capability
`scoped-race-step-clock-v1`, exact policy:

```json
{"entryBreakpointId":"native-race-clock-entry","counterCallBreakpointId":"native-race-clock-counter-call","counterReturnBreakpointId":"native-race-clock-counter-return","returnBreakpointId":"native-race-clock-return","minimumLogicalClock":288,"stackBytesBefore":512,"stackBytesAfter":28,"maxCounterPairs":1,"maxSnapshots":4}
```

Use exactly the three original hidden-idle startup breakpoints/actions plus:

| ID | Preferred site | Original instruction bytes |
| --- | --- | --- |
|native-race-clock-entry|441c70|83ec08|
|native-race-clock-counter-call|489d11|ffd6|
|native-race-clock-counter-return|489d13|8b442418|
|native-race-clock-return|450df0|8b35 followed by actual module-base+2e6b4c DWORD|

The return site is **before** MOV ESI,[6e6b4c], not MOV EDI,EAX (which is
450df6). Its operand is a PE-relocated fixed image address. Validate original
bytes/counters before arming deferred sites; do not compare the unrelocated
six-byte return instruction under ASLR.

Only entry is initially armed. Other three sites stay cold until the selected
main-thread entry snapshot is fully published. Activate all three at that same
stopped debug event, before resuming. Foreign thread hits are counter-neutral
for purpose matching/capture and must be skipped before their stack/graph reads.
Reject nested/reordered/duplicate selected-thread endpoints.

At entry require actual caller [C]=module+50df0 and ordinary outer caller
[C+24]=module+40cd5, phase4 from the actual nonnull session root5ecb1c,
logical90a548>=288, nonzero delivered6e66f8, initialized6e6c8c=1, positive
frequency7135a4 and nonnull QPC/QPF IAT words. C must be DWORD aligned with
nonwrapping [C-512,C+28). Before selection, a nonmatching owned main-thread
entry is an observation skip, never a game-state write. Capture actual incoming
EBX/EBP/ESI/EDI, raw x87 CW/SW and MXCSR. No phase, input, clock or result is
forced. Startup remains the original six guarded launcher/graphics/device writes.

Overall limits: 90,000ms, 1,000,000 events, **seven snapshots** (three startup
plus four purpose), 7 fixed code sites, no global ordinary ranges, no arbitrary
filters/skips/services or additional observation purposes. The original security,
isolated paths, hidden-window/foreground, TEB/context and stop diagnostics remain.

## Exact input rows at every purpose snapshot

All rows have source `race-clock-observation`; the following preferred operands
resolve through the actual module base. No readable-region/allocation guesses:

| ID | Preferred operand | Bytes |
| --- | --- | ---: |
|race-clock-origin|6e66b0|8|
|race-clock-streak|6e66e4|4|
|race-clock-delivered|6e66f8|4|
|race-clock-network|6eafe0|4|
|race-clock-enabled|6e6c8c|4|
|race-clock-frequency-origin|7135a4|16|
|race-clock-qpc-import|56e0fc|4|
|race-clock-qpf-import|56e114|4|
|race-clock-scale|5dc6e0|8|
|race-clock-conversion-tables|56f6a0|130|
|race-clock-logical|90a548|4|
|race-clock-sample|6e675c|4|
|race-clock-session-root|5ecb1c|4|

Dynamic exact rows: `race-clock-session-phase` at actual session+57c, 4 bytes;
`race-clock-stack` at latched C-512, **540 bytes** through C+28. The additional
20 bytes beyond the earlier source-checkpoint proposal prove the outer caller
and preserve its saved words; they supply no game result. Only the generic
thread-SEH row may be added by the existing TEB observation mechanism.

## Typed endpoint state and publication

Latch original entry identity and immutable original input hex. Let
T=C-16, timer EBP=T-4, F=alignDown(T-4,8)-32. Counter call has ESP F-4,
EIP module+89d11, EBP T-4, ESI equal original QPC IAT, EAX F+24 and
[F-4]=F+24. Counter return has ESP F, EIP module+89d13. Both retain timer
caller [T]=module+41cb0, entry caller [C], outer caller [C+24] and original
module/root/frequency/IAT/clock identity. Validate same nonvolatiles across the
QPC pair, including timer EBP/ESI and entry EBX/EDI. QPC EAX is the actual uint32
BOOL, not forced1; output is exactly8 real bytes at F+24. No other service
outcome or next snapshot enters source.

At final return require EIP module+50df0, ESP C+4, EAX1..3, all four original
nonvolatiles and live caller/outer words unchanged. Only delivered/streak and
owned stack may change in this warm timing interval. Original raw x87/SSE
controls must remain unchanged; keep observed status separate from claims of
full numerical-state parity. If the API changes numerical state needed by
source, retain the evidence and report the unsupported service effect.

Emit a `race-clock-admitted` proof for every purpose snapshot, before its
snapshot publication/range resolution, carrying role entry/counter-call/
counter-return/return; PID, TID, owned main TID, module base; exact current and
latched entry debug/snapshot ordinals; C/T/F/output/caller/outer/logical/delivery/
session identities; original nonvolatiles and numerical/input hex; one-shot
observation index1..4; guards-before-range-read and before-original-instruction.
The snapshot contains the identical `raceClockObservation` proof annotation.
Commit state only after full snapshot publication. Emit deferred-installation
and activation records for all three cold sites; activation follows entry
snapshot publication in the same stopped event. No game instruction runs in
between. Capability/policy must appear in the capture header.

Completion `raceClockObservation` must prove selectedSnapshots4, counterPairs1,
counterSnapshots2, final selected return/result and entry/activation/return
events/ordinals. Incomplete groups fail instead of claiming completion.
Use the existing mandatory owned-process shutdown/freeze/diagnostics unchanged.

The C# and independent JavaScript implementations will agree on exact proof
field names before integration. Reject rehashed/tampered ranges, late activation,
changed caller/stack/roots/controls, wrong TID/events, count overruns, missing
endpoints and phase actions or game-memory interventions in this interval.

## Source replay boundary

Construct sparse memory from original entry only, with explicit fixed-global
aliases and actual stack/pointer addresses. Run genuine `runNativeRaceStepClock`
and supply just the authenticated counter pair after checking live preimage,
caller, registers and pushed/output addresses. Native counter and final rows
are comparisons; they never refresh game state. Compare every declared semantic
region, source-produced return subset and supported numerical controls. Keep
sticky exception/private-ABI limits explicit. One warm call cannot prove outer
cadence, subsequent parent ticks, cold QPF branches or the broader physics goal.
