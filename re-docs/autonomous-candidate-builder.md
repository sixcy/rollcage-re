# Autonomous route candidate construction

`src/autonomous-candidate-builder.mjs` reconstructs Redux `4210b0` and its child `421260`, using the existing actual `491390`/`491400` directional route walkers. `buildAutonomousRouteCandidates(body, groupIndex, pointIndex, {memory,scratchBase})` returns native EAX: the next free descending row index, initially19 and eventually−1 when the twenty-row table is full. `scratchBase` is native entry ESP; the live free index is stored at ESP−90, budget/tier low bytes at ESP−8c/−88, and the 64-word visited list at ESP−84.

`appendAutonomousRouteCandidates(groupIndex, pointIndex, freeIndexAddress, budget, tier, {memory,scratchBase})` exposes the child independently. It follows 12-byte route groups from resource `90b98c`→`+60`; point addresses use the group `+8` pointer and 16-byte stride. Point byte10 supplies a low-nibble lookahead budget. Tiers0/1 reduce budgets greater than1 by one. Each next point clamps the decremented budget to its own adjusted nibble. Reversed and cyclic groups retain native endpoint semantics.

Rows at `91f1e0` have a52-byte stride. The builder writes group word+0, truncated point byte+2, lookahead byte+36, disabled byte+38, link/end flag byte+39, and optional point-kind word+42. A zero point-kind leaves the old word unchanged. Missing a preceding route point sets the first row disabled. When the lookahead stops at an open end, the last allocated row's bytes38/39 become1/1. Other row fields retain their input bytes for the separate score/modifier passes.

The parent scans allocated rows backwards. Each point dword+12 contains two links: group bits0..4 with point bits5..13, and group bits14..18 with point bits19..27. Each nonzero unseen group is added once to the live visited list and appended using the current row's remaining budget. It rereads the packed links after processing the first link. Group0 rows suppress expansion. Point IDs are truncated to a byte before the later row scan, so an initial point300 is stored and subsequently inspected as point44; the child walker itself uses the full low word.

Retained evidence:

- `349-autonomous-candidate-origin.json` and `350-autonomous-candidate-origin-assembly.json`: parent pseudo/assembly, assembly evidence `ev_8175ad0f0a45a36e11079b2bdff14bea37d8d5d298de79e4e77e0a08cae1efc7`.
- `500-autonomous-candidate-append-pseudo.json` and `501-autonomous-candidate-append-assembly.json`: child pseudo/assembly, assembly evidence `ev_8e7b388d85b966fc0c292559433b03238b01260ebf516c40245dd8dfddd48a89`.
- Existing retained `211-autonomous-next-point-assembly.json` and `229-autonomous-previous-point-assembly.json` provide the actual directional callees.

Validation:

- `node --test tests/autonomous-candidate-builder.test.mjs`: seven focused tests pass.
- `node tools/verify-autonomous-candidate-builder-instructions.mjs`: 358 retained instructions,4,000 independent append fixtures and5,000 complete builder fixtures match across17,803,135 interpreted steps. This includes1,537 exhausted candidate tables and4,167 cases expanding links. The report is `analysis/autonomous-candidate-builder-instruction-check.json`.
- Comparisons cover the full1,040-byte candidate table and neighboring guard bytes,32group headers,16,384point records,body,free-index word,live visited words,and builderEAX. Fixtures include reverse/open/cyclic routes, tier budgets, retained tags,8-bit row truncation, both links, shared groups, and cycles.

No game-owned callees are mocked. The instruction checker admits only compiler ABI boundaries: `568162` checks the exact security-cookie equality, and reaching compiler range-failure `5684da` fails verification. These synthetic states and retained-instruction checks do not execute the original game or claim reconstruction of upstream route/body producers. Native ABI scratch must remain separate from game-owned point/table memory; arbitrary stack aliasing is outside this module's contract.
