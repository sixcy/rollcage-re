# Native vehicle control audio frames

`tools/lib/native-control-audio.mjs` connects the existing `485300` vehicle
audio decisions to genuine source controls on the caller's shared memory.
`createNativeControlAudioBindings({memory, moduleBaseAddress,
numericalContext, nativeTls, source})` returns `handlers`, live
`comparisonRegions`, and diagnostic `events`. Optional source mode requires
`nativeAudioCalls: true`, the real `485300` entry ESP in `scratchBase`, and
the original incoming `EBX`, `EBP`, `ESI`, and `EDI` in `entryRegisters`.
It is intended only for the physics prefix's actual `485300` call.

The previous high-level callback inherited the outer `485300` entry ESP.
Calling a source setter there writes its argument at outer `ESP+4`, which
belongs to `450e50`. Native source calls instead enter below `485300`'s
84-byte prologue frame and their actual pushed arguments/return word.
The optional mode now carries explicit call-site metadata; the bridge checks
each allowed caller, method, ESP, return word, argument word and incoming
nonvolatile register. It never chooses a caller from the source's identity.

## Recovered boundaries

Retained `271-vehicle-state-485300-assembly.json`, `703`, `705`, `707`, and
`155-sound-playback-setup-assembly.json` establish the call frames. Files are
under `analysis/native-simulation/results`.

| Caller | Source call | Actual source entry ESP |
| --- | --- | --- |
| `485300`, one argument | `4855cd`, `485c62`, `485cc1`, `485da0`, `485dfb`, `485ee0`, `485f3b`, `4861c5` | caller entry minus 92 |
| `485300`, clear | `485fdc`, `486121` | caller entry minus 88 |
| `484d90`, frequency | `484dc5` → `484dc8` | wrapper entry minus 8 |
| `484d30`, gain | `484d86` → `484d89` | wrapper entry minus 16 |
| `484d10`, stop | tail jump `484d24` | wrapper entry, inherited return word |
| `40e5e0`, effect queries/getter | `40e628`, `40e639`, `40e673`, `40e6b9` | helper entry minus `84h` |

The bridge executes original game ports `4ad5f0` → `4ad650`, `4ad6a0`,
`4ad5b0`, `4ad580`, and `4ae4a0`. Tiny `4ae350` is independently checked
against SHA-verified original PE bytes `8b81a0090000c3`: return `[ECX+9a0]`.
`40e5e0` uses its real cookie/saved-register/local stack slots and actual
effect field stores when an effect already exists. Code return words and
known cookie/reverb literal addresses use the observed image load base.
Other high-level data globals require explicitly declared observed aliases;
heap pointers and arbitrary integer values are never rebased.

Native `485cc4` restores ESI from local `+34h` after that slot has been
replaced with engine pitch at `485bca`. This is not the initial body pointer.
The direct frame-offset setter saves this actual incoming ESI in its own
frame; tests compare that private write against interpreted game code.

## Validation

`node tools/verify-native-control-audio-instructions.mjs
analysis/native-control-audio-instruction-check-20261023.json` retained a
positive report: **24 constructed cases, 392 genuine source calls, 20,066
interpreted instructions**. Preferred `400000h` and relocated `6e0000h`
images come from the unchanged original PE, target SHA-256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
The source runs through strict sparse memory with explicit known image data
aliases; actual interpreted instructions use real HIGHLOW relocations.

The comparison includes child entry ESP/return words, arguments,
EBX/EBP/ESI/EDI, and child-written stack words after each return. It compares
body, audio cache, complete constructed source spans, waveform/effect spans,
and preserves outer entry `ESP+4..ESP+31`. Cases cover pending activity,
populated engine/boost/road/surface sources, existing or absent effects,
mode-zero early returns, 22,050/44,100-Hz waveforms, null waveform,
high/low slip wrappers, and deferred-state clear. Only the compiler security
cookie boundary is admitted externally; source methods execute game code.

`node --test tests/native-control-audio.test.mjs tests/vehicle-audio.test.mjs
tests/vehicle-audio-connected.test.mjs tests/vehicle-sound-controls.test.mjs
tests/sound-dispatch.test.mjs` passed **29 tests**. Negative tests reject
missing/wrong caller frames before executing source setters, preserve
wrapper caller words, and retain the reached reverb-installation error.
Existing default high-level sound/haptic behavior remains covered.

## Remaining scope

These are constructed instruction comparisons, not new original-process
runtime evidence. The complete `485300` private CPU/stack frame is not
compared or claimed. Native creation/play (`484bb0`, `484cb0`, `40ea40`),
reverb installation, and haptic caller register frames remain explicit
reached dependencies. Actual native inputs must keep their observed flags
and populated states; the bridge never clears those inputs or replaces
game outputs with null handles. The comparison regions expose only source
gain, frame offset, deferred state, and reached effect amount/duration fields.

Native input completeness still requires each reached channel/source/vtable,
waveform rate, and effect span plus the existing vehicle globals, literals,
cookie, and actual shared stack. This component provides no new native
capture or input admission. It does not change V11/V12's strict concurrency
failure, prove a background worker schedule, or claim audible playback.

## Actual control-prefix V3 output audit

`analysis/native-control-audio-v3-output-audit-20261023.json` separately
checks the original-process `control-prefix-v3-20261023` capture. It uses
the verified same-thread/stack/clock `450e50` entry, `450f18` pre-audio
checkpoint, and `4749e0` physics-entry pair. Source replay starts only from
the original entry inputs and executes all six `485300` calls through the
real bridge. It then stops at the explicit next `42a6e0` missing byte
`9c7eddh`. The live partial source memory is retained without relaxing that
failure or injecting the native after state.

The declared final audio comparison **matches 448 bytes with zero differing
bytes**: 26 gain/frame-offset fields on 13 source objects (104 bytes), six
40-byte audio caches (240 bytes), six 16-byte horn records (96 bytes), and
the collision-channel/reverb-owner globals (8 bytes). **85 bytes changed**
between the original pre-audio checkpoint and physics entry; source changes
match those bytes too. Unchanged bytes remain checked. The source calls are
six engine frequency/gain pairs, six road pairs, and one surface pair.

Command:
`node tools/check-native-control-audio-outputs.mjs
analysis/native-physics-local/startup-20261022/control-prefix-v3-20261023
analysis/native-control-audio-v3-output-audit-20261023.json`.
`node --test tests/native-control-audio-v3-outputs.test.mjs` passes two tests:
the retained positive output comparison and an after-only single-gain-byte
corruption that fails while computed source state and the explicit next
failure remain unchanged. Capture blob hashes and boundary pairing are
validated through the normal capture loader; the diagnostic also retains
the trace hash and each compared before/source/after byte string.

This is actual selected **output** equality, beyond source-call completion.
It does not establish full prefix completion: `wholePrefixMatched` and
`sourceComplete` remain false. The pre-audio/after snapshots are comparison
inputs only. No actual nested virtual-call context is captured here, so the
private caller ABI remains supported by the separate constructed instruction
checks. Whole source objects, body outputs, effects, haptics, creation/play,
audible playback, and a concurrent worker schedule are outside this audit.
The later failing `42a6e0` source does not write these selected audio fields;
other original-process activity before physics entry is covered only by
the equality of their final observed values.

## Source-derived physics-entry registers

`tools/lib/native-control-physics-registers.mjs` exports
`deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress,
parentEntryEsp, parentEntryEdx, trace})`. The trace is the actual completed
source prefix's `source.report.parentTrace`, observed at the parent's live
reload/loop points. It is not copied from the native after-register context.
The helper returns `{registers, unresolved, evidence, limits}`.

`310-race-step-parent-assembly.json` establishes:

| Register | Source derivation |
| --- | --- |
| EBX | completed `42a9a0` loop count (`450f8d`, `450fb4`) |
| EBP | original `450e50` entry EDX iteration (`450e59`) |
| ESI | last actual parent session reload; if restoration is enabled, its signed count after `450fd1` and the decrement loop |
| EDI | nonempty handling loop's end record; otherwise prior input-loop end record or audio-loop index; restoration replaces it with its row pointer plus processed rows ×24 |
| ECX | live security-cookie global on successful `420500` return |
| ESP | original parent entry ESP minus20 |
| EIP | actual relocated `4749e0` |

The later children `494f60`, `429f30`, `449640`, and `420500` preserve the
four nonvolatile registers in their retained prologues/epilogues (`289`,
`287`, `199`, `312`). Both `420500` epilogues recover the cookie before
calling `568162`. The SHA-verified original image's success path is
`CMP ECX,[cookie]; JNZ failure; REP RET`; its relocated ten bytes are
retained in the earlier V3 register diagnostic. The valid cookie return
preserves ECX. EAX/EDX and status flags remain omitted. In particular, V3
leader progress changed from 3484 to 3555 during native progression; predicting EDX
from its entry value would be wrong without genuine `449640` execution.

`analysis/native-control-v4-source-physics-registers-20261023.json` now
retains the stronger V4 result: the genuine source prefix completes, and
all **seven derived registers match** actual physics entry. The required
body-effect context pair EBX/EBP is 6/0. The source-only parent trace also
supplies ESI/EDI, with ECX read from live source cookie memory. Native after
registers are used only for comparison. The earlier
`analysis/native-control-v3-physics-register-diagnostic-20261023.json`
remains explicitly conditional, with incomplete-source obligations; it is
not the basis for the V4 binding.

`node tools/check-native-control-physics-registers.mjs
analysis/native-physics-local/startup-20261022/control-prefix-v4-20261023
analysis/native-control-v4-source-physics-registers-20261023.json --source`
reproduces the V4 audit using a new output filename.
`node --test tests/native-control-physics-registers.test.mjs` passes four
tests: actual V4 register equality, an after-only EBX corruption, twelve
constructed zero-handling/restoration paths interpreted from original
instructions at preferred/ASLR addresses, and omission of optional
registers when their trace is incomplete. Signed negative/zero/positive
restoration counts and empty handling with retained input/audio EDI are
covered. Only the required EBX/EBP pair remains available if optional
ESI/EDI evidence is absent.

This derives the declared entry registers for a future coherent physics
context. It does not itself execute `4749e0`, prove a joined prefix/physics
output comparison, or claim full private CPU ABI equality.
