# Decoder file, PCM block and cleanup ownership

`src/game-audio-decoder-lifecycle.mjs` reconstructs the game-owned file/block/container lifecycle needed by sample factories and retirement. Runtime uses shared native-address `memory`, exact numeric entry `scratchBase`, optional incoming `entryRegisters` and explicit inherited `sehWord`. CRT and Win32 operations remain declared service interfaces; no original process, host file I/O or device is invoked by the checks.

| Native | Public export |
| --- | --- |
|4af2a0|`openGameAudioDecoderFile(decoder, path, runtime)`|
|4aed20|`resetGameAudioDecoderBlocks(decoder, runtime)`|
|4aea00|`populateGameAudioStream(decoder, runtime)`|
|4b4890|`closeGameAudioDecoder(decoder, runtime)`|
|4ae8e0|`destroyGameAudioStream(decoder, runtime)`|
|4b4060 /4b4f80 /4b59a0|`releaseGameAudioDecoder(decoder, flags, runtime)`|
|4b5a90 /4b5280|`resetGameMp3Decoder` /`resetGameOggDecoder`|
|4b3090|`destroyGameAudioSpectrumState(object, runtime)`|
|4b3a00 /4b39c0|`destroyGameAudioStreamingBuffer` /`releaseGameAudioStreamingBuffer`|
|4a7bb0 /4afc80|`removeGameAudioWaveform(manager, waveform, runtime)` /`releaseCachedGameAudioWaveform(waveform, runtime)`|

The file opener executes original path resolution, lock-violation retries,64-bit size publication and cleanup decisions. A zero size closes the handle but leaves its numeric field unchanged. Original return high bits are retained around AL success/failure. The path helper optionally publishes its derived final ECX to `runtime.outputRegisters`, preserving the actual failure-debugger saved-word producer.

Block reset frees each block's PCM before deleting the block, derives an unsigned upward-rounded pointer count, and reloads the container before resetting its end. Population implements the actual allocation/inline append/rebase/growth policy, wrapped format calculations, EOF loop and signed read-result decisions. Known WAV output-size/PCM reads and streaming resampling use their actual recovered children. OGG/MP3 PCM-read targets still require explicit reached handlers and are not claimed reconstructed here. Allocation failure calls the recovered game assertion; the current population corpus uses successful allocations.

Concrete decoder deletion resets the codec before sample-owner policy, file counters and handle cleanup. It then destroys an optional streaming buffer, vector backing/container, critical section and seven FFT allocations. The vector destructor intentionally does not free pointed blocks a second time. Waveform cache removal destroys the first exact match, reloads the live cache and moves its suffix; duplicate entries retain the original behavior. Original `4ad580/4ad5b0` sample-owner state policies execute directly.

Initialized OGG teardown reaches four statically linked Xiph Vorbis services. The shipped vendor string at5dc4e8 (`11858`) and retained11850..11857 layouts/control flow corroborate identification against the official [Vorbis block implementation](https://github.com/xiph/vorbis/blob/master/lib/block.c) and [Vorbis metadata implementation](https://github.com/xiph/vorbis/blob/master/lib/info.c). These comparisons identify library ownership; they do not establish an exact source-version match. The source interface is `services.codecCall(name, [nativeStructureAddress], runtime)`:53bec0=`vorbis_block_clear`,53c410=`vorbis_dsp_clear`,539360=`vorbis_comment_clear`,5393f0=`vorbis_info_clear`. The original ABI passes the structure in ECX and uses caller stack only for CALL. Library allocation/decode internals remain services. The game wrapper's pending consume, inline Ogg stream/sync cleanup, sequencing and lifetime decisions are actual source.

All retained evidence is for target SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`. Main instruction sources are11678/11679,11756..11764,11796..11804,11826..11831 and11832..11858; WAV reset is independently recovered in the wave-decoder package.

The instruction comparisons preserve separate domains and reports:

| Report | Cases | Reached instructions | Steps |
| --- | ---: | ---: | ---: |
|`game-audio-decoder-open-instruction-check.json`|1,200|529|3,338,446|
|`game-audio-decoder-cleanup-instruction-check.json`|1,200|286|91,383|
|`game-audio-decoder-release-instruction-check.json`|1,200|459|400,618|
|`game-audio-decoder-vorbis-release-instruction-check.json`|1,200|523|411,399|
|`game-audio-population-instruction-check.json`|1,200|332|321,924|

All compare mapped10MiB memory,24KiB declared private frames, defined return bits and ordered service requests. The initialized Vorbis proof exposes only the four identified vendor entry points and supplies explicit synthetic library-owned structures/results; it does not interpret vendor internals. Other proofs execute all reached game children. Population fixtures cover PCM8/16-bit,1/2 channels, existing/null pointer storage, retired blocks, EOF skip and546 actual vector growth calls. Manager/cache/decoder/header/file/storage inputs remain caller-owned in these leaf corpora; constructor-to-parser/factory chains are separate ongoing work. Initialized application debugger/category is the tested domain; cold debugger category frame aliases require separate integration proof.
