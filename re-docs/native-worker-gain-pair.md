# Owned worker gain entry and exit observations

Status: **implemented and config validated; not launched**. This adds a
separate optional capture policy for one genuine `4b12d0` entry and normal
`4b1990` pre-RET observation on the manager-owned background thread. It
does not claim a reconstructed gain call or a worker output comparison.

The motivating read-only audit is
`analysis/native-worker-gain-leaf-next-scope-audit-20261023.json`. Native V15
observes a mixer lookup in the middle of a gain call; its inputs cannot be
relabeled as the original gain entry. In particular, `FSTP` at `4b1311`
overwrites the original source argument slot with mixer gain bits.

## Separate bounded host policy

`tools/lib/native-physics-debugger.cs` now accepts `ownedWorkerGainPair`.
The old `ownedWorkerObservation` one-site/max-1 contract is unchanged. The
two policies are mutually exclusive. Defaults and previous profiles stay
unchanged; the new JavaScript regression removes exactly the new option and
three sites and compares the result with the complete existing profile.

| Site | Original instruction | Purpose |
| --- | --- | --- |
| `4b12d0` | `PUSH EBP` | actual gain entry before original prologue |
| `4b1990` | `RET 8` | normal exit before argument cleanup |
| `4b1919` | `RET 8` | reject-only unsupported spatial exit guard |

The entry and exit can publish at most **two snapshots** in the existing
selected recovery parent's pending group. The reject site never captures a
replacement endpoint. The profile keeps 90 seconds, 350 total snapshots,
115 nested snapshots, 128 MiB pending storage, the original phase-action
guards, and activation at `controlled-recovery-caller` raw hit 229. Its 52
ordinary main-thread sites are unchanged; three declared gain sites make
55 nested site IDs. All actual nested rows keep their original counters.

Before any source/vtable snapshot range is resolved, the helper:

1. Requires an active, guarded, main-thread pending parent.
2. Resolves the actual worker TID through manager+824 → worker+24, and
   requires that TID to be a different live owned CREATE_THREAD thread.
3. Reads the actual entry return/source/force words. Only the original
   `4a7229` → `4a722c` caller with force 0, or `4a72f3` → `4a72f6` with
   force 1, is admitted. Both retained callers push their ESI source.
4. Requires entry ECX to be the current manager and `[ESP+4]` to equal ESI.
   It binds source, manager, ESP, caller, force, incoming EBX/EBP/EDI,
   thread and pending candidate. An open recursive gain entry fails.

At normal exit it requires the same pending parent/candidate, owned worker,
ESP, return word, source ESI and preserved EBX/EBP/EDI. It **does not
dereference `[ESP+4]`**. Exit source ranges use the independently bound and
checked ESI. The original source/force argument bytes are still captured as
opaque output, including the overwritten first argument. `afterRetEsp`
means the arithmetic consequence `entryESP+12` of the observed RET 8; it is
not a separate post-return context observation.

An absent pair, open call at parent close, different source/caller/thread,
unsupported early return, wrong endpoint order, third endpoint or pair in a
discarded parent fails closed. Neither endpoint qualifies the parent's
selection event. No fake application, callback answer, register output,
manager change or target instruction substitution is supplied.

## Captured inputs and explicit gaps

Both endpoints retain the unmodified x86 CONTEXT (716 bytes), a 12-byte
entry/return stack, source 9a8h and vtable 88h, actual manager d74h/vtable
64h, worker object 80 bytes, actual TID/phase/clock roots, mixer vector
header and capacity-bounded storage (at most 64 KiB), and seven exact
four-byte image literals including the cookie. Pointer values are native
observations; none are rebased as generic integers.

The private stack window is `[ESP-432,ESP+12)`, retaining its original
preimage at entry. This covers the audited supported game-frame depths,
not arbitrary CRT/Win32/COM implementation stack. The checker compares
numeric fields to the actual raw context and requires the worker's masked,
nearest PC53 mode. It retains actual MXCSR rather than substituting the
main physics PC24 context. Entry/exit contexts and source bytes remain
separate temporal observations, never merged as initial game state.

There are deliberately **no nullable waveform/decoder/voice pointer
chases**, arbitrary mixer-vector index reads, or external service-result
bindings in this profile. The actual source flags/pointers are preserved,
including spatial/effect fields. Authentic mixer objects/getters,
waveform/decoder input, voice interface/vtable and reached COM/CRT/Win32
call/return evidence remain required before source gain execution. Those
worker service sites require a separately reviewed bounded extension inside
the open pair, not all-thread admission or larger budgets. Concurrent
manager/lock writes remain producer scope.

## Tools and validation

- `tools/prepare-native-worker-gain-pair-capture.mjs` prepares a new config.
- `tools/lib/native-worker-gain-pair.mjs` validates its exact policy, actual
  activation/admission/debug/lifecycle provenance, endpoint raw context,
  caller/source identity, complete declared spans, vector bounds and
  original manager/worker backlinks.
- `tools/check-native-worker-gain-pair-capture.mjs` loads hash-verified
  captures, pairs the genuine recovery parent and validates the worker
  observations without projecting counters into the old one-shot policy.
  It does not claim all original main sound-service lineage or execute
  `4b12d0`. Full source/private ABI/interleaving flags remain false.

Boundary checks use retained
`12289-sound-manager-update-sources-assembly.json` and
`12339-audio-selection-4b12d0-assembly.json`, with original target SHA-256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

`node --test tests/native-worker-gain-pair.test.mjs
tests/native-recovery-worker-observation.test.mjs` passes **21 tests**.
New cases include both caller/force contracts, overwritten exit argument,
18 provenance/input tamper variants, pure C# state/commit failures, exact
old-profile preservation and 12 C# configuration rejection variants. The
existing native V12/V13/V14/V15 retained regressions still pass. Synthetic
transport/state fixtures are explicitly not original-process gain evidence.

Prepared config:
`analysis/native-worker-gain-pair-policy-only-20261023.json`; its output
is explicitly named `worker-gain-pair-NOT-LAUNCHED-20261023` and has not
been created. No original game or native fixture was launched.

Direct execution of the existing PowerShell ValidateOnly script was denied
by the machine's script policy. No bypass, elevation or policy change was
used. The allowed direct `Add-Type`/typed `NativeDebugger.Validate` pure
API test validates the complete prepared JSON and rejects the malformed
policy variants; it executes no script file or native capture fixture.

Before claiming a whole gain-call match, obtain a real clean pair with its
actual reached branch and complete service inputs, run genuine game child
ports, and compare declared output memory and original ABI independently.
This work does not close V11/V12 concurrency, the complete manager worker,
outer scheduling or audible rendering.
