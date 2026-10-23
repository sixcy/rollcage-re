# Connected recovery audio continuations and V12 concurrency boundary

The recovery parent now has explicit source continuations for the empty
adaptive sound-owner branch and selected-channel playback. The connected
original V12 attempt runs the real recovery parent into its populated sound
bank, wrapper allocation and real cached audio factory. It consumes 14 factory
external boundaries before stopping at an unresolved background producer.
There is no completed original channel/playback or full-parent match.

`tools/lib/native-recovery-channel-replay.mjs` exports
`createNativeRecoveryAdaptiveSoundBindings`. Its two callbacks match the root
integration boundaries:

- `selectAdaptiveSoundChannelOnStack` continues after the actual 40db20h
  prologue. It owns wrapper allocation, actual 40eb10h empty-callable copy,
  direct same-memory 4a7710h factory execution, real 40ebc0h pointer-vector
  append, source virtual04 and TLS restoration.
- `playSelectedNativeSoundOnStack` owns only the 40ea40h gain/rate/reverb/play
  remainder after a nonnull selector result.

Those later stages are implemented source continuations, not verified
connected original execution: V12 stops inside the factory before they run.
Reused, positional and populated-callable branches remain explicit errors.
The independent V9 cached factory result remains the stronger completed
factory-data checkpoint described in `native-audio-factory-v9-replay.md`.

## Original inputs and allocation lifetimes

Additional input spans are captured read-before-use cache paths, the winning
waveform count/format, precise mixer pointer/ID/voice fields, COM interface
inputs and immutable constructor literals. Root admission preserves matching
earlier bytes and adds only otherwise unavailable original inputs. Their
earlier initialization and complete concurrent producers are not inferred.

Allocation-capacity descriptors deliberately have `preimageBytes`, not an
ordinary input `bytes` property. The original parent already covers the four
known requested spans. Source adapters write the observed wrapper12,
source2472, channel4 or string32 preimage only when its exact allocator call
returns, after validating the ABI and lifetime. They never admit the containing
VirtualQuery region as allocation capacity or seed initialized game objects.

V12 demonstrates why this matters: the old live active-vector array at
109bfd00h is also the later four-byte owner-channel allocation address.
Main-thread factory growth copies 376 bytes from that live array before its
storage is reused. Writing the later BAADF00Dh channel preimage at parent entry
would corrupt an original active-vector input.

## Genuine external memcpy register result

The V12 pre-CALL4053d5h/post-CALL4053dah pair now records the external CRT
memcpy input, 32-byte destination preimage/output and actual return context.
It copies 20 bytes and preserves the remaining 12. Returned ECX is zero; this
is established at the CRT boundary rather than inferred from the later logger.
No game instruction writes ECX from 4053dah through the 405310h/4a2b40h tails
and the debugger call. Retained evidence is 3663
`ev_f8b9e2e30926ba63340507836022e2bc518f19daa95ad37949095ddebe7d889e`
and 9311 `ev_b8306d26d3aca369e3689ca69aefcb20ce49e1aa06f84a6869801ce3d643aad1`.

The formatter source now passes an explicit mutable `volatileRegisters` record
through its real string-assignment CRT contexts. A validated service may
publish the original return ECX there. Existing default fixtures retain their
previous convention when no register outcome is supplied. Independent
relocated-instruction tests cover ECX zero and a high-bit value, including the
actual debugger's saved word. This closes that external producer in the source
adapter; it does not establish execution past V12's earlier concurrency stop.

The pointer-vector ports also relocate only their proven native CALL return
stores. Independent preferred/ASLR instruction execution matches the complete
declared sparse append/growth frame, four-byte allocator preimage and genuine
zero-length memmove interface. Opaque pointer words remain unchanged.

## V12 timeline: main30484 and background3700

The retained forensic artifact is
`analysis/native-recovery-v12-audio-concurrency-forensics-final-20261023.json`.
It preserves exact lock bytes, event ordinals, active-vector headers,
allocation/copy observations, target evidence and thread-site counts.

| Snapshot | Main observation | Win32 lock state | Game wrapper |
| --- | --- | --- | --- |
| 303–307 | Mixer lookup | Main owns then releases | Returns depth0/owner0 |
| 308–309 | Main pre/post COM call | Background3700 owns | depth1/owner3700 |
| 310 | Main factory Enter returns | Main30484 owns; LockCount−2 | depth0/owner0 |
| 311 | GetCurrentThreadId returns | Main owns; LockCount−6 | depth0/owner0 |
| 312–315 | Main array allocation/copy | Main owns; one waiter | depth1/owner30484 |
| 316–317 | Main Leave/factory returns | Background3700 owns | depth1/owner3700 |

Only the LockCount field changes between 310 and 311: −2→−6 preserves the
ownership bits and adds a waiter. GetCurrentThreadId does not own that write.
The checked source therefore stops explicitly with `unbound-concurrency`.
No waiter workaround, native game-wrapper overwrite or post-Leave manager
answer is applied.

The background ownership after Leave is also a game-level producer, not
merely Win32 state. Retained 11733
`ev_eac9ff725da5b429d1f90e874490926ceef93a2ca4f26eb7938ffe308096eda4`
shows the game's separate depth increment and owner store at 4a7a0bh/4a7a0eh.
The trace records 379 observations on thread3700 excluded by the explicit
main-frame-thread scope: 76 mixer enters, 75 thread queries, 150 ID getters,
75 leaves and three debugger entries. Those original instructions executed;
only their snapshots were omitted. The outer worker caller, its full memory
inputs and update schedule remain unobserved. Thread creation is recorded at
debug-event ordinal368 without a usable start/caller context.

## Separate main-thread active-vector allocation gap

The active-vector relocation is explained by main-thread factory growth; it is
not attributed to the background merely because the final header is first
observed after Leave. Before growth it has 94 entries and no spare capacity.
Snapshots312/313 record an actual 564-byte allocation at 17079f00h. Snapshots
314/315 record `memmove(new,109bfd00h,376)`. After the append, its 95 entries
occupy a capacity of 141.

The optional channel observations captured only four destination bytes at
these shared allocation/copy sites. Thus 560 allocation-return preimage bytes
are missing. Neither the later completed array nor guessed BAADF00Dh fill is
a valid replacement. The source parent stops earlier at concurrency, so this
larger main allocation remains an independently identified next dependency.
Retained 3874 proves its allocation/copy/free/publish sequence; 11601 proves
the enclosing factory append and lock lifetime.

The next work therefore needs the actual background game update producer and
the complete larger allocation preimage. Another favorable scheduling run
would not establish those producers. Private CPU/CRT ABI and uninterrupted
native trajectories remain outside the current claim.

Validation: 16 focused tests pass across the new channel helper, relocated
playback, playback units, existing factory adapters and factory audit. The
original V12 regression requires the explicit concurrency failure and defers
all allocator outputs. No game was launched by these checks. Root's connected
attempt is retained separately in
`analysis/physics-native-controlled-recovery-parent-audio-v12-aliased-attempt-20261023/report.json`.
