# Worker gain source replay to its first external dependency

`tools/lib/native-worker-gain-replay.mjs` exports
`replayNativeWorkerGainEntry(before, {moduleBaseAddress})`. The only accepted
execution snapshot is the original pre-prologue `worker-gain-entry` at
`4b12d0`. Native normal-exit bytes and injected service adapters are not
accepted options. This is deliberately a stopped source attempt, not a
whole gain-call output match.

The helper verifies every supplied entry blob hash, raw CONTEXT716/hash,
register/numerical fields, original source/force/caller stack words and
manager/source identities. It binds the original worker FS descriptor/SEH
observation and builds strict sparse memory from entry rows alone. The
worker's actual masked nearest PC53 mode is retained, with its original
MXCSR; main-thread PC24 is rejected. Incoming general registers are passed
to the real source code in uppercase native register form.

The actual `updateAudioSourceParameters` (`4b12d0`) then invokes genuine
`findGameAudioMixer` (`4a79f0`). Its first original external operation is
`EnterCriticalSection` at `4a79ff`, through import `56e094`. The stopped
adapter verifies its computed ABI:

| Field | Source-derived value |
| --- | --- |
| Original gain entry | `S` |
| Mixer lookup entry | `S-17ch` |
| EnterCriticalSection entry | `S-194h` |
| Return word | actual relocated `4a7a05` |
| Argument | actual manager pointer plus `854h` |

It records the 24 Win32 critical-section bytes and the separate eight game
wrapper bytes before the service, then throws without applying an outcome.
It does not infer success, return the worker TID as a substitute for a
later OS call, change a LockCount, replace the mixer lookup/getter, or use
an observed initialized source. Entry buffers remain immutable; partial
source writes occur only in a new sparse memory copy.

`tools/check-native-worker-gain-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON`
first validates the actual selected parent, guarded activation, owned
CREATE_THREAD and entry/normal-exit pair using the observation checker.
The exit proves original call identity; only the entry snapshot is passed
to source execution. The report retains the genuine first missing
dependency, any earlier missing-memory/port failure, original input hashes
and partial source/manager/private-stack changed-byte counts. Full source,
private ABI and concurrency flags remain false at this boundary.

`node --test tests/native-worker-gain-replay.test.mjs
tests/native-worker-gain-pair.test.mjs` passes nine tests. Four constructed
force0/force1 preferred/ASLR cases reach the exact first external ABI with
zero source/manager bytes changed. Separate preferred and ASLR comparisons
execute original retained game instructions through the CALL itself, then
stop at a declared external entry before any OS instruction or result.
Every supplied mapped byte, including the genuine child stack writes,
matches the source attempt. The external target is a synthetic boundary
address, not an implementation or result oracle. Negative tests reject
exit snapshots, PC24 substitution, corrupted original hashes/context,
wrong source/force/thread and injected after-state/service options.

These constructed comparisons are not original-process runtime evidence.
The fresh V16 capture must be terminal, cleaned up and independently
validated before the checker reads it. Authentic worker Win32 call/return
contexts and outcomes remain the first service gap. Later real mixer
objects, waveform/decoder, voice interfaces and COM/CRT boundaries must be
admitted only when genuinely reached. Main-thread factory observations and
concurrent manager/game wrapper writes cannot supply those answers.
