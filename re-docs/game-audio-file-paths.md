# Audio file paths and file probes

`src/game-audio-file-paths.mjs` translates the actual game path/file adapters used by the audio database and sample factory. This is reference JavaScript over a shared native-address buffer, without running the original process or doing host file I/O.

| Address | Export / behavior |
| --- | --- |
| `4a0790` | `findGameAudioPathText`: reuses the recovered ASCII-insensitive command-flag matcher, adding its actual saved-register publication. A mismatch consumes the current input code unit. |
| `4a4820` | `findGameAudioDirectorySeparator`: scans backwards for either original separator-table word; consumes an unused stack argument. |
| `4a4870` | `normalizeGameAudioPath`: URL exception, slash conversion, initial UNC separators, repeated backslash collapse, original permissive parent/dot reductions and trailing-backslash removal. |
| `4a43f0` | `getGameAudioDirectory(input, output, runtime)`: secure copy followed by the actual separator-index truncation. |
| `4a4460` | `resolveGameAudioPath(input, output, runtime)`: redirect callback, tilde expansion and five sequential prefix replacements, preserving original temporary bytes and offsets. |
| `4030c0` | `lookupGameAudioPath(key, runtime)`: application-installed lookup, literal root/effects directories, lazy document/app-document/resource caches and fallback. |
| `4a0810` | `convertGameAudioAnsiPath(input, retain, runtime)`: allocated UTF16 conversion and optional real pointer-retention FIFO. |
| `405e00` | `assignGameAudioWidePath(output, input, runtime)`: actual fixed-record copy adapter. |
| `4a3ac0` | `gameAudioPathExists(input, runtime)`: resolved `FindFirstFileW` probe, closes the search handle and rejects directory entries. |
| `4a3b40` | `openGameAudioFile(path, mode, record, overlapped, runtime)`: native access/share/disposition/flag switch, lock-violation retry and append seek. |
| `4a2af0` | `closeGameAudioFile(record, runtime)`: pending overlapped completion/cancellation, live handle close and handle invalidation. |
| `4a7fc0` | `resolveGameAudioSamplePath(output, runtime)`: consumes the actual1024-byte by-value path at `ENTRYESP+8`, probes/resolves it or constructs the database-directory fallback, then lowercases and copies the result. |

All functions take caller-owned `runtime.memory` and exact numeric `runtime.scratchBase` (native entry ESP). Callers publish the actual argument slots; this matters for delayed reads and aliases. Optional `entryRegisters` supply original incoming callee-saved words. `runtime.sehWord` is a declared inherited synthetic exception-chain word, distinct from actual host TLS. Set `nativeDequeCopies: true` to publish the original deque-growth scratch and CRT calls throughout the conversion-to-FIFO chain. The legacy FIFO byte-copy boundary remains available to existing callers.

`initializeGameAudioFilePathConstants(memory)` installs SHA-checked original literal bytes and tables. It preserves the live callback at `5ed314` and lazy cache state. Shipped image bytes select `4a0780`, which returns the original empty string. Actual application entry `404d70` installs `4030c0` at `404d7a`, before application startup. Both targets execute actual game defaults. Other callback targets require an explicit `pathLookup` contract and are outside this recovered domain.

The application lookup owns cache guard `7158f8` and the1024-byte records at `714c60`, `7154f8` and `715068`. Its shell-folder paths call the real ANSI conversion and retention queue; the JavaScript does not fabricate their contents. First/second root substitutions preserve the original one-code-unit offset table. `4a4460` is not host environment expansion or `path.normalize()`. The normalizer intentionally retains the original substring/reduction quirks.

The runtime supplies genuine `services.libraryCall` and `services.platformCall` implementations for CRT allocation/copy/search/formatting, Win32 file/shell/conversion/critical-section/thread services and exit registration. Optional compiler cookie verification is also a service. Native numerical decisions, allocation ownership transfer, lazy state, retry/cleanup and callback selection are game code. No file manager background reader was observed.

Evidence is retained under `analysis/native-simulation/results/11588..11671` and the original factory callers `9125/9126`; database filename builders use the independently recovered `audio-database-paths.mjs`. Original callback writer `404d70` is retained in `11657/11658`; the callback itself is `11662/11663`. Target SHA256 is `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

Validation: `node tools/verify-game-audio-file-paths-instructions.mjs` passes2,400 fixtures,1,440 reached instructions and3,077,241 interpreted steps. It compares all mapped bytes from10000h, the declared24KiB private stack plus the complete incoming1024-byte path record, defined return widths and ordered CRT/Win32 calls. Fixtures alternate the shipped and installed callbacks, include input/output aliasing, file/directory/missing results, transient lock failure, size success/failure, pending cancellation, shell-path fallback, URL/UNC/dot cases and both sample-path branches. Real CPU CALL return stores are explicit even for opaque library services; compiler probe/cookie internals remain services. Five focused tests pass. Reports are immutable/repeatable; these are interpreted-instruction matches over declared fixtures, not original-process runtime observations.

Remaining scope: this completes these path/file routines, not `4a7710` sample-factory closure. Its `4a7460` instance/waveform-cache/decoder graph remains separate ongoing work. Invalid pointers, allocation exceptions, arbitrary installed callback addresses and CRT invalid-parameter behavior outside the declared valid-string domain are not established by these fixtures. No installed game files are modified.
