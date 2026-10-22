# Audio sample factories: current bounded reconstruction

`src/game-audio-sample-factory.mjs` translates the native `4a7710` outer factory and `4a7460` instance factory, together with extension selection, decoder allocation, waveform lookup/construction and the `4b1d30` XAudio2 channel adapter. The reached loaded decoder/PCM and streaming-association operations remain explicit errors or named handlers until their actual implementations are recovered. This package does not yet establish complete factory closure.

The public entry points are `createGameAudioSample(manager, descriptor, runtime)` and `instantiateGameAudioSample(manager, descriptor, runtime)`. Runtime carries shared native-address `memory`, exact entry `scratchBase`, optional incoming `entryRegisters` and inherited `sehWord`, and declared CRT/Win32/XAudio2 interfaces. Native arguments include the descriptor at entry+4 and the original by-value24-byte `std::function` at entry+8. The original queued-source capture type uses actual clone/destruction adapters. Callers own manager, descriptor, cache, vectors and device state; these fixtures do not establish their construction.

The outer factory separately probes uncompressed WAV/AIF/AIFF files, resolves the path, opens and reads the64-bit file size, and conditionally clears the streaming byte. Its two native file-cleanup paths both run, including the final duplicate `CloseHandle`. The inner factory registers a sample even when an empty or unsupported extension produces no decoder; the temporary waveform is then destroyed. Preloaded matching waveforms increment the actual refcount. Populated waveform formats reach real mixer-ID lookup and channel routing before the genuine XAudio2 `CreateSourceVoice` COM service.

Evidence uses target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`; retained replies9125/9126,11600..11605,11618..11635,11672..11686,11723..11737 and11826/11827 provide parent and concrete-child instructions. Original vtable bytes are retained separately, including11708..11716.

`tools/verify-game-audio-sample-factory-instructions.mjs` compares all mapped bytes,24KiB of declared private stack, defined return values and ordered CRT/Win32/COM requests. The three reports preserve distinct domains:

| Report suffix | Fixtures | Reached instructions | Steps | Proven domain |
| --- | ---: | ---: | ---: | --- |
| `empty-instruction-check` |240|1,427|822,864|Actual inner factory; null/inline/heap queued captures, empty/unknown formats, rejected waveform and vector registration|
| `outer-empty-instruction-check` |240|1,530|895,264|Actual outer and inner factories over the same unsupported-format domain|
| `cache-hit-instruction-check` |240|1,580|2,826,298|Actual outer uncompressed file preflight, declared populated waveform cache/mixers and actual successful COM channel adapter|

These are retained-instruction comparisons over explicit synthetic service inputs, without original-process, file-system or audio-device execution. The cache-hit report deliberately supplies a valid waveform/header; it does not validate the still-missing loaded cache producer. Loaded cache misses, decoder parsing/population and stream association remain ongoing work. Arbitrary unknown game virtual targets remain explicit reached gaps.
