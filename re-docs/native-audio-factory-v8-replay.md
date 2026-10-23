# Native v8 factory inputs and first unbound service

The successful controlled v8 observation selects `SFX_PINKPURP`. Its descriptor
at 10df8340h contains `..\IDXData\Redux\Sound\SFX_PINKPURP.wav` with streaming
disabled. Actual module base is 6e0000h. The original source allocation is
1763b370h, length 9a8h, with preimage in
`snapshot-000240-range-038.bin`, SHA256
`3c0ae51927d50b0b889e41eb3915c738e92d4463bb6a78fc056747fc7a68b1ca`.

`tools/lib/native-recovery-factory-replay.mjs` makes a bounded source attempt
from those original inputs. The retained report is
`analysis/native-audio-factory-v8-attempt-20261023.json`. Its explicit result is
`complete:false`, `matchedFullFactory:false`; it is not a complete native
factory or recovery-parent match.

## Input provenance

The initial private stack comes from parent-before snapshot 233's actual
24,580-byte `frame-stack`. Actual caller arguments at the manager boundary are
overlaid from snapshot 238's 64-byte `recovery-audio-stack`. The CPU CALL's
40dc8dh return word is published at factory entry ESP 4ffcc8h. Factory/module
globals come from that same caller observation, with aliases for individually
declared image ranges only. The constructor's three immutable literal ranges
come from its before snapshot 241. The initialized source at manager return and
finished waveform bytes are never used as factory input.

The parent-before owner descriptor differs from constructor entry in three
bytes: descriptor+454h changes 5→6, +45ah changes 1→0, and +45ch changes 1→0.
These are the genuine emitter/dispatcher mode, position and velocity producers.
The helper runs existing `emitNativeEffect` and `dispatchNativeSound` against
the actual populated parent-before sound bank and owner, then stops at their
first operator-new request for 12 bytes. It returns no allocation or child
answer. The resulting entire 460h-byte descriptor matches the observed
constructor input. This is a check of that numeric producer prefix; its private
caller stack is not claimed as replayed.

Only live bank pointer words are admitted from the broad captured bank region.
That region also contains memory later allocated for the new source; its stale
parent-before bytes at the future allocation address are excluded. The source's
actual allocator preimage is admitted separately and its digest verified.

## Executed factory path

The attempt executes the existing real source ports for:

`4a7710h → 4a7f40h → 4a8850h → 4a7fc0h → 4a3ac0h → 4a4460h`.

It supplies 23 explicit bounded valid-string CRT operations, including UTF16
copy/concatenation, substring search and comparisons. ASCII case handling is
restricted to the observed path domain. It executes the actual installed path
callback binding and path normalization/prefix algorithms. No filesystem,
COM or game-child result is inferred from the later successful run.

The first missing external result is `FindFirstFileW` at preferred CALL
4a3b1eh, return 4a3b24h (actual 783b24h). Service entry ESP is 4fde0ch:

| Argument | Actual value |
| --- | --- |
| UTF16 path | 4fe468h, `..\IDXData\Redux\Sound\SFX_PINKPURP.wav` |
| `WIN32_FIND_DATAW*` | 4fde18h |

Neither the original returned handle nor its 592-byte find-data output is
captured at that service boundary. In particular, the file/directory attributes
must come from the original Windows call. The attempt stops before applying
either result. Current host file existence, a guessed success handle, the
eventual cache hit or an empty-file fallback would not supply this evidence.
The outer uncompressed-file policy also reaches CreateFileW/GetFileSizeEx and
cleanup after this point; those outcomes are not established by this stopped
execution.

## Actual cache path, checked separately

Native snapshots 243 through 286 show 44 successive pre-comparison iterations
at 4a7b56h. The helper verifies every observed slot against the original vector
storage, requires the requested 1,024-byte path to stay unchanged, and feeds
only each waveform's read-before-comparison path field to the existing real
`findGameAudioWaveform` algorithm. No waveform result is returned by a stub.
The source scan selects the same existing waveform, 10dffa48h, for
`..\idxdata\redux\sound\sfx_pinkpurp.wav`.

The first waveform input is `snapshot-000243-range-039.bin`; the matching input
is `snapshot-000286-range-039.bin`. All 44 filenames and identities are recorded
in the report. This is an isolated comparison from actual per-read inputs, not
a claim that the stopped outer factory reached this later native boundary.

The original path is therefore a nonstreaming cache hit. It does not create a
decoder, allocate/populate a new waveform, open a decoder stream or produce PCM
on this request. The existing waveform's reference count and new source's
channel creation still belong to the full factory replay.

## Remaining concrete producers

After the unsupplied path/file results, mixer lookup needs the actual mixer
objects and their vtables: the captured pointer vector begins with 0860e2d0h
and 0860c5d8h. Native lookup exits with 0860c5d8h selected. Their object+8 IDs,
vtable slot-zero target and selected bus voice data are not covered by the
captured manager object/vector spans. The captured XAudio2 CALL/RET already
provides a separate genuine COM outcome, but cannot replace these game inputs.

Formatter volatile ECX and the later formatted-string allocation preimage
remain open as described in `native-audio-playback-binding.md`. Concurrent
manager changes after LeaveCriticalSection remain separate from the service's
own lock effects; this stopped attempt does not apply or attribute them.

Validation: `node --test tests/native-recovery-factory-replay.test.mjs
tests/native-recovery-source-replay.test.mjs
tests/audio-playback-debugger-aslr.test.mjs` passed all 10 tests, with zero skips.
The three new tests verify the retained CALL/prologue boundaries, the original
stopped factory attempt, all 44 cache inputs, and rejection of changed path or
slot producers. Existing source constructor and service checks remain passing.
