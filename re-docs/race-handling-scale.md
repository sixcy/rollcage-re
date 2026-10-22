# Rank-gap handling scale

`src/race-handling-scale.mjs` reconstructs Redux 1.3.8.0 `420500`, called after race progression/ranking and before physics. Its initial evidence filename, `311-race-weapon-stage.json`, predates this recovery: this procedure produces handling fields, not pickup awards.

`updateRaceHandlingScale({memory, scratchBase, maxIterations})` uses a raw Buffer and numeric addresses. `scratchBase` is native entry ESP. The default iteration budget is 65,536; reaching it throws instead of accepting a runaway memory traversal. The supported comparison domain has readable pointed storage, successful native signed arithmetic, and intact caller stack cookie.

## Native behavior

The session pointer is global `5ecb1c`; participant count is byte `session+54d`. Mode byte `551 == 4`, or tuning byte `a87 == 0`, selects the neutral path. It writes dword `10000040` to each registered body `+2f38`, restoring low word `0040` and upper word `1000`, and leaves gap `6e0` untouched. The loop rereads the captured session's live count after each output.

The active path captures participant count, then stores each `909300 + index*30c` record address by unsigned rank byte `record+1d` into a stack table. It never clears this table. Duplicate ranks overwrite earlier entries; holes retain caller bytes. Rank 1 lives at entry ESP minus `1c`, rank 0 at minus `20`. The removed count lives at minus `24`; a traversal pointer, later the leader progress, lives at minus `28`.

The procedure walks ranks from one upward until the captured count or a zero pointer. Records with `249 & 1` are removed by a forward overlapping dword copy, the tail is zeroed, and the same rank is checked again. Removing every captured participant produces no body output. A zero table entry only stops this compaction scan; it does not establish an initialized replacement record for the output stage.

For remaining entries, leader progress is `(u8(record+1c) << 16) + i32(record+24)`, with signed 32-bit wrap. Each output body is loaded from its rank record. It receives signed gap `leaderProgress - recordProgress` at `6e0`.

For a signed gap above `2000`, adjustment is `4000`. Otherwise native `41c990` divides `(gap << 16)` by `20000000` in Q16, then the result is multiplied by `4000` in Q16. The initial left shift wraps before division. This detail preserves surprising negative-gap behavior: gap `-32768` yields stored scale zero, while `-32769` wraps to stored scale `1fff`.

The scale word at body `2f3a` is the low word of `(10000 + adjustment) >> 4`. The following write sets body `2f38` to word `0040`. Normal gap zero yields scale `1000`; gaps at or above 8192 yield `1400` unless signed wrap changes the earlier arithmetic. Excluded records retain their old handling and gap fields.

The output loop reads the live participant count minus the retained removed count after each body update. It reloads the session pointer and retained leader only on the division path, matching the original register lifetimes. Raw aliases therefore matter: if a body's gap output overlaps the live count, the zero leader gap can terminate output after that body. The source retains these reads and write widths.

## Evidence and validation

Pseudocode is `311-race-weapon-stage.json`, Evidence `ev_39ddf146714f62168a3de60f417d766235b3d3bd54bb660ab6eda75197e605ca`. Full assembly is `312-race-handling-scale-assembly.json`, Evidence `ev_3e2783f9e23bc7bad937a81701235375e0743f1ab5e4f61e2e7340c5573d4350`. Actual fixed divide is retained in `134-checkpoint-interpolation-assembly.json`, Evidence `ev_da5b27885b591b415a91ce7e3aa053c0f888bb34fcb120aa22eb750e50432d2a`.

`node tools/verify-race-handling-scale-instructions.mjs` passes 5,000 synthetic fixtures executing 151 retained instructions and 858,633 interpreted steps, including actual `41c990`. It compares six full 16,384-byte bodies, six full 780-byte records, the session neighborhood and meaningful rank/leader/removed scratch. The corpus includes 127 live-count aliases, 6,399 divides, 8,539 active body outputs, 1,970 neutral outputs and 4,173 removals. The CRT cookie check is the sole explicit external boundary. Report: `analysis/race-handling-scale-instruction-check.json`.

`node --test tests/race-handling-scale.test.mjs` passes eight focused tests for neutral output, zero count, rank ordering, threshold arithmetic, finished compaction, all-excluded preservation, duplicate/stale rank slots, signed shift wrap and live-count output aliasing. These are static instruction comparisons and synthetic fixtures. No original game process was executed; broader interpretation of the upstream tuning configuration remains separate.
