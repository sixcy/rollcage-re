# Localized race startup

`src/localized-startup.mjs` reconstructs the complete `479420` message
initializer. Its public entry is `initializeLocalizedRaceMessages(runtime)`;
`runtime.memory` is shared native memory and `runtime.scratchBase` is native
entry ESP. Optional `entryRegisters` supply actual incoming EBX/EBP/ESI/EDI.
The source executes the existing actual localization decoder/search references
`439780`, `439610` and `439580`. Its raw decoder adapter supplies the actual
TAB diagnostic child `401300` at the original nested ESP, rather than a game
callback returning fabricated data.

The initializer performs43 separate `PC_IN_GAME_MESSAGES` lookups. Each
selected CR-delimited row is limited to255 bytes, then packed into the captured
session arena at `session+b20h`. The capacity/fallback tests reload the live
session root and use a strict unsigned end comparison against `session+12a0h`:
equality rejects the row. Rejected rows point at the beginning of the current
session arena. Missing rows use a space; empty rows remain empty. After the43
rows, one final space is written and its address fills slots43..63 of the
64-pointer table at `70ea00`. The original probe frame, cookie, saved-register
stores and consumed copy-call arguments/return addresses are preserved.

`src/localization-resource.mjs` closes the actual upstream producer `439090`.
`loadProcessedLocalization(runtime)` frees the old buffer, queries original
entry8 metadata, reads that resource through actual `401160`/`401380`, and
preprocesses it in place. Control bytes below32 become1 except TAB. A tilde
followed by a tilde becomes NUL, with the original forward overlapping behavior
and one-byte lookahead. The preprocessing count is captured after the resource
read, so aliases changing the live count during the loop do not extend it.

The metadata query is exposed as `findRawArchiveResource(index, runtime)` in
`game-resource-files.mjs`. Actual `401140` is just signed16(index)*16 plus the
live index-table pointer. Nearest duplicate selection belongs to `401160`.
This distinction matters: `439090` captures the original entry8 decoded size
independently of the duplicate selected for the subsequent read.

The full TAB branch is in the separate `src/archive-diagnostics.mjs`:
`formatGameDiagnostic` (`401300`), `appendGameDiagnostic` (`4012c0`) and
`openGameDiagnosticLog` (`401260`). The game code owns its enable flags,
2000-byte local,1998-byte formatter limit, forced terminator, suffix copy,
lazy logfile, optional original session header and live stream reloads.
`vsnprintf`, `fopen`, `fputs` and `fflush` are genuine CRT service boundaries.
Variadic arguments occupy native entryESP+8 onwards. The existing unrelated
`game-diagnostics.mjs` implementation remains separate.

Retained parent evidence is `9013..9014`; `12022..12037` recover the TAB logger,
resource producer and ownership references. `12039..12041` retain original
diagnostic strings and archive initial state. Language-root xrefs and containing
procedures are `12038`, `12042..12050`. The frontend initializer `440690`
calls `439090`, then sets `6e65f0` from settings byte `5ecefc+36h`.
Frontend selection `442460` also updates that word. This package does not claim
those complete frontend initialization/menu algorithms or the separate
`43bb20` frontend teardown.

Validation uses retained instructions without running the original process:

- `verify-localized-startup-instructions.mjs`:24 ordinary cases pass,
  1,032 actual decoder calls,397 reached instructions and87,220,150 steps.
  Every mapped byte at or above10000h, all4352 parent-owned string scratch
  bytes, cookie and ordered CRT copies match. Cases cover missing/empty rows,
  truncation, exact capacity equality, natural arena/session-root and
  arena/pointer-table aliases. Six additional staged cases use distinct
  language payloads.
- Its `diagnosticRows` option passes eight parent cases with344 actual TAB
  diagnostic entries,445 reached instructions and14,150,089 steps. Complete
  formatted log text and file requests match; no game callee is mocked.
- `verify-localization-resource-instructions.mjs`:240 cases pass, including
  original metadata size versus nearest duplicate, all control bytes,
  overlapping markers and buffer/count aliasing.
- `verify-archive-diagnostics-instructions.mjs`:360 cases pass, including
  disabled/open/failed-open/header/truncation/live-stream branches, complete
  mapped memory, the2000-byte formatter local and ordered CRT requests.

`probe-localized-startup.mjs` reads installed IDX and the resource8 IMG window
at its original offset. It executes actual `401000` archive setup,
`439090` loading/GT20/preprocessing, then `479420`. The complete95,426-byte
resource matches the independently decoded original SHA-256
`2c121109cc7e5a8f63f0012ffa87c34dd0751478874bac3b26380cea9a9bf604`.
All215 original Western message rows match a separate literal-row extraction;
the absent Japanese table produces43 native space fallbacks.

`verify-localization-installed-instructions.mjs` compares this persistent
archive-startup→resource-producer→six-language message chain against actual
instructions: eight operations,258 decoder calls, one actual GT20 decode,
698 reached instructions and356,320,214 steps pass. All mapped memory and
ordered file/allocation/copy/format requests match. The pure `strrchr` searches
already computed in the archive reference are excluded from service-order
logs. The real file bytes remain read-only; CRT handles, allocation, compiler
guards and caller session/language roots are explicit fixture contracts.

Private localization-child frames are outside the comparison domain; arbitrary
aliases into their unported private stores are not certified. Original
concurrent process behavior, frontend language selection and later message
rendering are not established by these checks. The frozen-phase prototype
and its reports remain preserved under `tools/next-phase/localized-startup/`;
the canonical source additionally closes its TAB and upstream resource gaps.
