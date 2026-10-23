# Native v9 cached factory declared-data match

The real cached factory now executes from the original v9 caller/descriptor,
allocation preimages and read-before-use cache/mixer inputs through 4a7710h and
4a7460h. It consumes all 16 observed external boundaries, returns the actual
source pointer 157b1468h, and matches all 16,660 declared data bytes plus EAX
at original manager-return snapshot 313. Existing game source ports were not
changed for this binding.

This is completed source execution with a declared-data comparison. It is not
complete private CPU/CRT ABI equality, an adaptive channel-selector binding, or
a full recovery-parent replay. `complete:true` and `matchedFullFactory:false`
make that distinction explicit.

Reports retained separately:

- `analysis/native-audio-factory-v9-bound-attempt-20261023.json`: strict
  FindData preimage comparison stops at the inner file query.
- `analysis/native-audio-factory-v9-typed-success-final-20261023.json`: explicit
  typed-success output contracts complete the factory and match the declared
  output regions. The earlier `typed-success` report is preserved; the final
  report corrects its inherited stopped-attempt scope descriptions.

## Genuine game execution and external outcomes

`tools/lib/native-recovery-factory-replay.mjs` retains the v8 input provenance:
original parent-before private stack and owner, observed manager-call argument
words, existing emitter/dispatcher descriptor producers, and the actual source
allocation preimage. The full 460h-byte descriptor and separate 9a8h-byte
constructor-source checkpoint match. The source allocation starts as BAADF00Dh
bytes; no initialized source is supplied as a child answer.

Actual cache records are admitted at their pre-comparison observations. The
source cache algorithm examines the genuine 44 entries and selects the
existing `..\idxdata\redux\sound\sfx_pinkpurp.wav` waveform. Actual mixer
objects and slot-zero vtables come from their pre-getter observations; the real
mixer search and getter execute. Engine/vtable inputs come from the original
pre-COM observation. The known XAudio2 backend vtable slot is explicitly
captured. No decoder or PCM child is substituted; neither is reached by this
cache-hit request.

`tools/lib/native-recovery-factory-services.mjs` validates original service
order, entry ESP, argument words and CPU return stores before admitting an
outcome. Its 16 boundaries are eight file calls, the source allocator, six
critical-section/thread calls and CreateSourceVoice. Bounded valid-string CRT
semantics execute explicitly. The COM output is only the genuine interface's
voice-pointer DWORD, after format/send/interface/output-preimage validation;
the game constructs the source, callback and send list itself.

Enter/Leave modify only the 24-byte Win32 lock state. The game executes wrapper
depth/owner and vector mutations. GetCurrentThreadId returns the captured TID
and writes no lock or manager bytes. Its observed v9 waiter state stays stable.
Pre-Enter snapshots are unavailable: the checked source lock preimage is the
original manager input or preceding observed own Leave, not an invented
immediate native sample. No concurrent post-Leave manager writes are injected.

## Two explicit successful-output contracts

Strict mode first matches all 592 bytes of the outer FindFirstFileW preimage
and applies only actual changed output bytes. It advances through open, size,
both closes, source allocation and genuine construction. The inner find-data
preimage then differs at offset zero, before the API runs:

| Buffer | Source preimage prefix | Original preimage prefix |
| --- | --- | --- |
| Inner FindData, dbd2c8h | `feffffff0cd3db001e028777` | `1935e17760147b1500001501` |
| Size result, dbf98ch | `000000001f1af8ff` | `0a00000008fadb00` |

The exact preceding writer of these private bytes is unproved. These
differences are not relabeled as CRT causality, seeded from later native
snapshots, or hidden as a full private-stack match.

Successful GetFileSizeEx defines all eight `[out] LARGE_INTEGER` bytes. After
exact ABI/pointer/size/success validation, its captured eight-byte result is
written independently of prior scratch contents; the old bytes are recorded
verbatim as not compared. False BOOL is rejected by this contract.
See [Microsoft GetFileSizeEx documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfilesizeex).

FindFirstFileW has a separate explicit `typedSuccessfulFindFirst:true` option.
For successful handles it writes only attributes/times/file-size bytes 0–35,
the reparse tag at 36–39 only when the reparse attribute is set, and both
bounded strings through their NULs. Reserved words and unused string-array
tails remain exactly as in source memory. Invalid handles, wrong pointers and
unterminated captured names are rejected. In this observation the defined
spans are 0+36, 44+34 and 564+26 bytes. The untouched spans 36+8, 78+486 and
590+2 are recorded as not compared, including the inner query's differing
private bytes. See [FindFirstFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirstfilew)
and [WIN32_FIND_DATAW](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-win32_find_dataw).

## Compared output and remaining scope

All 17 declared output regions match: complete source 9a8h, waveform 440h,
manager d74h, 8,460 global bytes, restored FS:[0], six vector headers and their
full captured capacities. EAX also matches. Final output is read only by the
comparison; it never seeds the execution. Deliberate changes to final source
or manager bytes produce comparison failures rather than service answers.

The next integration remains the outer adaptive sound-owner/channel graph and
complete parent comparison. Private native service/CRT frames, volatile
registers and the reserved/tail differences above remain outside this result.

Validation: 22 focused tests pass across factory services, v8 factory audit,
original source constructor/services, relocated playback and factory/path
comparisons. Tests poison output scratch/tails, preserve neighbors, exercise
the conditional reparse contract, reject invalid success contracts, and prove
finished source/manager bytes are not execution seeds.
