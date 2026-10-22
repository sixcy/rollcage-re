# Native audio streaming consumers

`src/audio-stream-polling.mjs` exports `pollGameAudioStream(decoder,runtime)`, actual4aefc0. Supply the native decoder pointer, shared memory, native child-entry ESP as `scratchBase`, incoming `entryRegisters`, inherited `sehWord` and genuine services. It does not create a decoder/file/voice/thread. Its producer graph is separately recovered in decoder construction/open/initialization modules.

The reference preserves TryEnter failure, recursive lock accounting, original readiness/owner queries, duration thresholds, repeated free-buffer acquisition, actual PCM reads and4af880 resampling, XAUDIO2_BUFFER submissions, completion/drain flags and optional16-bit spectrum-ring averaging. The spectrum branch deliberately follows the native16-bit input reads, rather than inventing a generic output-format abstraction. Unknown game virtual targets throw. WAV and MP3 read targets dispatch to recovered references; OGG4b5380 remains an explicit reached gap. Finite positive rate/alignment and a valid nonempty spectrum ring are the proven fixture domain; native floating exception controls/NaN payloads are not modeled.

`src/audio-streaming-buffer.mjs` implements4b3ac0 availability,4b3ae0 acquisition,4b3bb0 submission,4b3ca0 recycling,4b3c50 drain and4b3dd0 queued duration, plus actual4b3ed0/ee0 reference getters. Free deque, active vector, total submitted bytes, owner and voice stay byte-backed. Its child40eec0 iterator stores,40ebc0/40edc0/40f060 vector ownership and40ecc0/40eee0 deque ownership are actual algorithms. Genuine Win32 critical-section and XAudio2 COM operations remain explicit services.

The4b3ca0 native tail JMP to LeaveCriticalSection uses an opt-in external stdcall tail ABI in the bounded interpreter. It preserves every native return/argument byte and performs actual stack cleanup. Existing interpreter callers retain their previous convention.

Evidence: retained12294/95,12340..12349 and12354..12359. The4af880 resampler is independently recovered/proven by the decoder worker. Compiler double/int64 conversion helpers remain declared genuine CRT intrinsics, with original CALL return stores; their opaque internal frames are not invented.

Verification:

- `verify-audio-streaming-buffer-instructions.mjs`:2400fixtures,530reached instructions,139457steps,157real allocations and300submissions. All10MiB plus4KiBprivate/caller bytes and ordered CRT/Win32/XAudio2 arguments, entry ESP and descriptor bytes match.
- `verify-audio-stream-polling-instructions.mjs`:1200parents,872reached instructions,874027steps,1134real WAV reads/submissions and235resampling calls. All10MiB plus24KiBprivate/caller stack and TLS match, together with file cursors and ordered services. Inputs include no-stream/uninitialized/failed-lock branches, zero through three free buffers, completed streams, mono/stereo, alternate rates, unequal-format resampling and spectrum-ring wrapping.
- Five focused buffering/polling tests pass. NativeCOMISD known-double comparisons have ordered/unordered/provenance checks; x87FMUL float-memory support has separate accepted/rejected/depth tests.

No original process, OS thread or audio device was executed.4a6600 manager update,4a6b60 complete arbitration, larger-than32source sorting, spatial4b12d0 and queued-next playback remain separate open scopes.
