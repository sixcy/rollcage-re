# Audio sample instance state

`src/game-audio-sample-state.mjs` recovers the concrete instance layer needed by the still-incomplete `4a7710`/`4a7460` factories. It does not claim decoder/cache/factory closure.

| Native | Export |
| --- | --- |
| `4acf70` | `constructBaseAudioSample(object, descriptor, runtime)` |
| `4ad7e0` | `constructXAudioSample(object, descriptor, runtime)` |
| `4ad190` | `copyAudioSampleState(output, input, runtime)` |
| `4ad320` | `setGameAudioSampleFlags(object, flags, runtime)` |
| `4afb90` | `constructGameWaveform(object, runtime)` |

The constructors execute both actual `40cea0` descriptor initializers, the zero/vector pose fields, base/concrete vtable publication and exact partially initialized fields. The base constructor forwards the descriptor into its second record, then copies the full494h state into the first. `4ad190` uses forward DWORD loads/stores through the individually copied final thirteen fields; overlapping inputs therefore propagate original native writes. Single-precision square and reciprocal coefficients retain original float32 rounding and zero/negative domains. The requested flag field is always written; a disabled byte selects11 for the effective field.

`4afb90` constructs the waveform refcount, secure pathname copy, base/concrete vtables and backend fields. It leaves the uninitialized pathname padding and adjacent unwritten WORD intact.

Runtime uses the shared native-address `memory`, exact numeric `scratchBase` and optional incoming `entryRegisters`/explicit inherited `sehWord`. Constructors receive descriptor at native `ENTRYESP+4` and24-byte by-value `std::function` at `ENTRYESP+8`, whose callable pointer is at `ENTRYESP+18h`. Callers must publish these actual input words. Inline, heap and null callable ownership branches execute original clone/destruction selection. The genuine C++ interface is `services.stdFunctionCall(owner, methodOffset, args, runtime)`, using offsets0 for clone and10h for destruction. No game callback body is replaced by this interface; these tests declare the library function-object representation. Secure copies are CRT `services.libraryCall` operations.

Evidence: retained target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`, replies `11618/11619`, `11672/11673`, `11675/11676` and `11687..11697`; base virtual+28h is corroborated by original vtable bytes in `11708`.

`node tools/verify-game-audio-sample-state-instructions.mjs` passes1,500 fixtures,287 reached instructions and191,300 steps. It compares all mapped bytes, complete declared private frames, defined returns and ordered secure-copy/function-object library requests. Fixtures cover null/inline/heap callable lifetime, overlapping state copies, float32 ordinary/negative/zero-denominator inputs and original uninitialized object bytes. Four focused tests pass;13 related FIFO/path/state tests pass together. These are retained-instruction matches over explicit synthetic library/object inputs, without original-process or audio-device execution.

The original queued-source captured callback (`5d3d1c`) now dispatches through the independently recovered `queuedAudioStdFunctionCall`: actual `4ab790` clone, `40f2a0` destruction and `40ee80` typed base cleanup execute before genuine allocation/free services. The expanded connected report `analysis/game-audio-sample-state-queued-connected-instruction-check.json` passes 1,500 cases, 322 reached instructions and 204,000 steps, including inline/heap original queued captures, complete private frames and ordered CRT requests. The earlier library-interface report remains separately retained. Callback invocation remains the upstream asynchronous consumer's responsibility.

The full factory still requires actual decoder creation, waveform file/parse/cache ownership, device channel creation and registration. Those are separate ongoing reconstruction work and remain unbound by the main factory callers until proven.
