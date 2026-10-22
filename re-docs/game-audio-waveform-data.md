# Waveform PCM storage and file export

`src/game-audio-waveform-data.mjs` translates the original XAudio waveform backend `4b19a0`, with real `4a80c0` concatenation/resampling in `game-audio-waveform-pcm.mjs` and `4a4230/4a42c0/4a4360` write adapters in `game-audio-file-write.mjs`.

`populateGameAudioWaveform(waveform, blocks, outputPath, runtime)` consumes the native three stack arguments at entry+4/+8/+12. With a null output path it sums block lengths with32-bit wrapping, clamps unsigned sample rate to1000..200000, uses original float32/bitwise output-byte rounding, retires prior PCM and fills the concrete backend record. It invokes `copyGameWaveformPcm(format, blocks, inputBytes, outputBytes, rate, output, runtime)` with all five original stack arguments. Equal rates concatenate bytes; unequal rates concatenate temporary bytes and select nearest16-bit samples in distinct forward/reverse loops. Unequal non16-bit conversion retains the native no-output behavior. Original private argument overwrites and live pointer reloads remain visible.

A nonnull path executes actual path resolution/file creation, writes the18-byte format followed by each PCM block, and closes even a failed handle. The native format has no RIFF container wrapper. File writes preserve synchronous/overlapped dispatch, pending/error distinctions, low-byte wait,64-bit completed-offset carry and alias-visible output clearing. Only CRT/Win32 operations are services; the checkers perform no host file writes.

Evidence is retained11723..11742 and11859/11860 for target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`; helper input/output numeric widths come from the original instructions.

| Report | Cases | Reached instructions | Steps |
| --- | ---: | ---: | ---: |
|`game-audio-waveform-pcm-instruction-check.json`|2,400|183|1,552,285|
|`game-audio-waveform-storage-instruction-check.json`|660|316|48,489,682|
|`game-audio-waveform-export-instruction-check.json`|1,200|512|3,954,610|
|`game-audio-file-write-instruction-check.json`|2,400|147|92,752|

The kernel corpus includes unsigned high-bit rates, both traversal directions and8/16-bit widths. Storage includes zero, one, clamp endpoints and adjacent rates. The export corpus compares actual bytes submitted to `WriteFile`, failed/retired handles, retry, partial/error writes and real debugger getter. Standalone write cases include pending completion and output aliases. Every comparison checks all mapped10MiB,24KiB private frames, original caller argument words, defined AL and ordered services. Allocation-failure policy is translated through actual assertion but these corpora use successful allocations; cold debugger frame aliases and arbitrary malformed pointer domains are separate limits. Fixture block/header/file inputs remain explicit caller-owned data, without an original-process claim.
