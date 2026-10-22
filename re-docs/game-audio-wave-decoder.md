# WAV, AIFF and ADPCM reference

`src/game-audio-wave-decoder.mjs` implements the native WAV-family decoder as live byte-backed operations. `initializeGameWaveDecoder(decoder,runtime)` is4b4720; `parseGameWaveDecoder` is4b40d0; `readGameWaveDecoderPcm(decoder,output,byteCount,runtime)` is4b4a00; `getGameWaveOutputSize` is4b4a30; `resetGameWaveDecoder` is4b4860. Runtime supplies shared memory, native entryESP in scratchBase, incoming registers, inherited FS:[0] word and genuine CRT/Win32 services. The initializer defaults to actual4aea00 PCM population and reset defaults to actual4aed20 block destruction in game-audio-decoder-lifecycle.mjs.

The parser handles original RIFF/WAVE and FORM/AIFF branches, including data-before-format, unknown chunks, fact records,14-byte legacy fmt, extended format limits, channel checks, ADPCM coefficient-count clamping, endian conversion and original AIFF rate extraction. It follows native chunk sizes exactly, without adding a format-spec alignment correction. Helper4b4eb0 stores its ReadFile result count into the second caller argument; only full successful reads update file counters. Parser branches deliberately retain native early-success behavior after some short/failed reads. Seek helpers4b4f30/4b4970 sign-extend32-bit positions into SetFilePointerEx and retain live post-service reloads.

ADPCM initialization preserves native BA/B4/EC/E8/F0/F4 sizing rather than substituting a standard decoder's block policy.4b4a60 expands mono/stereo block headers and nibbles using original575a20/575a40/575a60 tables, retained12279 and reproduced by initializeGameWaveDecoderTables. Intermediate multiply/add operations wrap at32 bits before signed shifts and final16-bit saturation. The original MOVSX plus subsequent10000h subtraction for negative deltas is preserved.4b3f00 handles unsigned8-bit WAVE expansion, signed8-bit AIFF expansion and16-bit endian swaps in place.

The4b4cb0 reader preserves logical progress separately from physical file progress: logical sample counts advance after a short or failed PCM read, while file counters advance only after a full successful read. ADPCM output remains cached between requests. Owner virtual48h is the actual4ad500 raw byte getter. Value1 permits rewind; value2 prevents rewind while still suppressing the final EOF marker.4b4a00 converts logical count back to output byte count, and4b4a30 intentionally returns zero for ADPCM, selecting native4aea00's aligned1MiB block fallback.

## Stream resampling setup

`src/game-audio-resampling-setup.mjs` exports `setupGameAudioStreamResampling(decoder,runtime)` for4af650 and roundGameAudioFrameCount for4afb20. It resets old resampling ownership, computes format alignment/rate, compares16 bytes plus the last WORD against actual4b3ed0 stream-format storage and, when different, invokes actual4a2b40/405310/405860 string formatting and debugger/category registration. It computes duration and required samples through double arithmetic, genuine Microsoft compiler conversion boundaries and original float32 bit rounding, then allocates/publishes98h/9Ch.

The native cold category path consumes a real volatile ECX producer from string growth.405860 restores its saved cookie with POP ECX; the reference reads that actual published stack word at the proven nested grow entry minus44, and forwards it through4a91d0. It does not fill unexplained end-of-call stack differences. The precise debugger/category/registration helpers are described in application-debugger-native-frames.md.

## Native comparisons

All reports concern interpreted retained native instructions and declared synthetic services, not an original process:

- Parser:1200 cases,522 reached instructions,595787 steps; all10MiB mapped memory plus24KiB private stack, restored TLS and ordered services.
- ADPCM blocks and PCM conversion:2400 cases,321 reached,1253111 steps; original tables, mono/stereo, predictor/delta/nibble/saturation, short/failed reads and512 private bytes.
- Reader:1200 cases,558 reached,925536 steps;800 actual ADPCM blocks,925 loop getters,84 rewinds and560 converters, with full24KiB private stack.
- Resampling setup:1200 cases,500 reached,299435 steps;412 changed-format allocations, guarded and cold enabled categories with actual record-vector growth, full24KiB private stack. The earlier guarded-category report is retained separately; the connected report is game-audio-resampling-setup-connected-instruction-check.json.
- Full initializer and reset:1200 worlds,1092 successful initializers,1326 reached,1403951 steps. Each successful parent performs actual parser/sizing/rewind/common PCM-block population and vector growth;600 actual ADPCM blocks are decoded. Every world then runs actual4b4860/4aed20 reset. All mapped bytes/private24KiB, ordered services, file cursor and TLS compare.
- Seven focused tests check data ordering, AIFF metadata, short-read progress, loop byte2, negative-delta saturation, in-place expansion and float rounding.

Evidence includes11747/11748,11790/11791 and12251..12283 under analysis/native-simulation. Static coefficient bytes retain selected target SHA256 c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5 in game-audio-wave-decoder-tables.json. Installed artifacts were not modified.

## Bounds and remaining integration

The full initializer fixture explicitly supplies a preconstructed decoder, file metadata and valid heap. Actual decoder/FFT construction, file-open/path processing and sample-factory binding are independently owned/proven in the neighboring audio modules; this report does not pretend that supplied state was produced by its own fixture. Factory/backend integration must continue to use those actual producers.

ReadFile, SetFilePointerEx, allocator/free, formatting and compiler conversions are genuine library/platform boundaries. No host audio, thread or game execution occurs. The resampling proof uses finite positive rates and bounded normal allocations; native FP exceptions/MXCSR modes/NaN payloads and opaque CRT internal frames are outside its numeric model. Memory-failure assertion/INT3 branches are translated through the existing actual assertion helper, but this parent's normal-heap report does not validate their complete UI/error-service domain. Native exception unwinding remains separate.

The chunk walker has an explicit maxWaveChunks bound (default100000). The ADPCM reference rejects a nonpositive nibble-payload loop rather than performing native unbounded writes. Those invalid/nonterminating memory domains are not claimed to match. OGG/MP3 vendor decoding, general sample backend/channel lifecycle, asynchronous manager update4a6600 and actual PCM mixing/resampling consumers remain separate work. This module proves the reached WAV-family algorithms and setup, not the whole audio subsystem.
