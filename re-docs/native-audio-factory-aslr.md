# Audio factory and path addresses under ASLR

The source factory/path adapters now distinguish explicit image addresses from
heap addresses and scalar fields. This extends the source bindings needed by
the recovery-sound work. It does not establish a complete original-process
audio or recovery-parent comparison.

`src/game-audio-sample-factory.mjs` and `src/game-audio-file-paths.mjs` use the
observed `runtime.moduleBaseAddress` through `nativeCodeAddress` only at proven
image operands: CALL returns, SEH handlers, literal string arguments, known
vtable stores and virtual/callback target comparisons. Heap objects, interface
pointers, source arguments, rates, flags and IEEE bit patterns remain unchanged.
The default preferred base remains400000h, preserving earlier instruction
fixtures. The source constructor/descriptor ports use the same explicit rule.

The path-constant initializer optionally accepts that runtime address context.
Literal/data table bytes remain unchanged. Only the four known code-pointer
DWORDs at4a3ca8 move, along with each table's destination image address. It
does not reset the live5ed314 path callback or7158f8 cache guard. Captured
runtimes should use their observed loader bytes instead of initializing over
saved process state.

## Captured-memory contract

Live module globals retain preferred-address reads/writes through explicitly
declared aliases. Relevant factory roots include56e2c8,714b08 and714b18.
Path bindings additionally require56e47c,5ed314,5e8890,5dcba0, the four-byte
delimiter table at5d3a0c,7158f8 and the three1024-byte caches at714c60,
715068 and7154f8. Returned literal/cache pointers and arguments passed to
external CRT functions use their actual image addresses. These aliases route
specific declared storage; they never rebase arbitrary pointer values.

Two existing16-byte copies now take explicit real source/destination spans,
so they work with sparse captured memory without adding an implicit backing
buffer. Retained11613 proves4a45ae loads the entire5dcba0 template before
4a45dd stores it. Retained11625 proves4a7ae2/4a7ae6 loads/stores the complete
waveform format, followed by the later WORD read/store at4a7aeb/4a7aef.
`copyGameAudioWaveformFormat` exposes that existing inline block for comparison;
it adds no native CALL. Its last WORD must observe an earlier overlapping
16-byte store, rather than come from an invented18-byte snapshot. Source
constructor zero stores, the outer factory's16-byte file-record clear and the
eight-byte failed-file-size clear likewise use explicit bounded spans; the
sparse-memory facade remains strict.

## Independent constructed checks

`tests/game-audio-factory-aslr.test.mjs` reads the installed executable without
executing or changing it, verifies the exact Redux SHA256, maps its PE sections
and applies actual `IMAGE_REL_BASED_HIGHLOW` entries. Retained instruction
operands move only where those relocation entries identify their encoded
DWORDs. Direct relative branch/CALL targets move with their image origin;
the test rejects any reached instruction with an unresolved relocation.
This is not a numeric-range heuristic applied to game data.

The constructed reference runs original retained instructions at base6e0000h
for extension/format selection, uncompressed-file policy and the full4a4460
path graph. Source execution uses sparse image/heap/private-stack spans and
explicit global aliases. Declared final spans and ordered CRT arguments,
entry stacks and return words compare. Path tests also run at400000h and
deliberately overlap the16-byte global template with private stack storage.

The same constructed loader executes4ad7e0 through actual preRET4ad8de with
its real4acf70/40cea0 descendants. Its independent output then feeds the
constructor comparator, which matches all3,720 declared bytes, six registers
and six genuine CRT string-copy calls. The input source is the original
constructed allocation preimage, not the initialized output. Synthetic
selector/FS/context records exercise the binding schema; they are not Windows
selector queries or original-process observations.

Other cases preserve opaque COM/interface values that numerically equal known
preferred image addresses, compare the relocated jump table against PE loader
bytes, and match the waveform-format block against its four original
instructions across five overlaps. Preferred-base loaded-WAV and cache-hit
factory regressions retain full game-child, private-stack and service-order
comparisons. CRT/COM/OS responses in these fixtures remain explicit constructed
external services, not claims of observed native service outcomes.

## Remaining boundaries

The earlier recovery leaves and sound allocation lineage remain their separate
original-process evidence. Earlier richer attempts did not establish a
constructor pair; the subsequentv8 capture now supplies one, as described below.
The retained original-process constructor regression passes against that pair.

A full source factory still needs captured allocation preimages, cache/mixer
pointees and complete external file/locking/COM outcomes. Application/debugger,
asynchronous file-management, queued callbacks and additional decoder/stream
children have their own address and sparse-memory obligations. No game-owned
child is replaced by a service answer to bypass those gaps. Audio owner,
channel, source, manager/vector, waveform and affected global outputs must join
the comparison ledger before the complete recovery parent can be called a
match. Audible playback and uninterrupted game fidelity remain open.

The subsequent independent original-processv8 capture establishes the real4ad7e0 entry/preRET pair under module base6e0000h. The source constructor matches all3720 declared bytes, six checked registers and six bounded CRT copies using its captured allocation preimage and actual descriptor/literals/TLS. The retained regression now passes and rejects deliberate source-byte/register/numerical-context corruption. The [constructor report](../analysis/physics-native-controlled-recovery-source-v8-20261023/report.json) separately retains a later critical-section inspector error; constructor equality does not establish full factory, playback or recovery-parent source equality.

The corrected [v8 constructor/service inspection](../analysis/physics-native-controlled-recovery-source-v8-inspected-20261023/report.json) also exits0. It preserves the independently observed Win32 waiter-count transition rather than treating it as a GetCurrentThreadId write. Source factory/playback/full-parent equality remains open.
