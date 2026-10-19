# Wheel drive preparation

`src/wheel-drive.mjs` ports drive preparation `0x41c460` and the registered-cell surface classifier `0x41c6c0`. The existing traction and spin arithmetic in `src/wheel-physics.mjs` also has an independent retained-instruction comparison. Steering preparation and caller `0x41c080` are now ported with explicit effect callbacks, followed by traction-force accumulation; see [the connected wheel path](wheel-frame.md). Original effect constructors and complete vehicle frame behavior remain open.

## State and arithmetic

`prepareWheelDriveInputs(body, drive, {gameMode, modeFlags})` takes the existing Q16 `body.linearVelocity` and Q12 short `body.rotation`. Both global options are explicit. It mutates the three signed-short counters and returns common grip `capacity`, `driveShift`, and diagnostic reduced `speedQ16` / `alignmentQ16`. `driveShift` is applied by the native caller to its drive term; it does not shift the grip capacity.

| Structured field | Vehicle offset | Representation |
| --- | --- | --- |
| `inputByte` | `0x64e` | Unsigned byte; values greater than 128 reset counter65c to 30. |
| `counter658` | `0x658` | Signed short; accumulates while the active lateral/alignment branch holds. |
| `counter65a` | `0x65a` | Signed short; subsequent countdown, initialized to min(counter658 *8, 960). |
| `counter65c` | `0x65c` | Signed short; input-associated hold counter. |
| `scaleQ12` | `0x2f3a` | Signed short, shifted left four before further scaling. |
| `reductionQ16` | `0x6b0` | Signed word; positive values affect game modes >=4. |
| `multiplierQ16` | `0x650` | Signed word; values below 30,000 increase prepared capacity by capacity >>2. |
| `capacityOffset` | `0x3cf8` | Signed word added before the 0xc00 minimum. |
| `capacityOverride` | `0x3d04` | Signed word; exactly 1 forces the final capacity to 0xc00. |

These are descriptive interface names inferred from code, not recovered original variable names or fully established gameplay meanings. Global `gameMode` comes from config pointer `0x5ecb1c` +0x57c; `modeFlags` from byte +0x553. Flag 0x1 has priority over flag 0x2 when applying the respective 0xd000 /0xb000 multipliers.

Velocity shifts right four before length measurement. Forward direction uses rotation entries 2,5,8, each signed-short shifted left four. Speeds <=0x8000 use alignment 0x10000; otherwise native Q16 dot/length division supplies alignment, with thresholds 0xec54 and 0xfa00. The state machine retains signed-short wrapping, branch order, countdown-after-initialization and output dependence on the decremented counter. Capacity arithmetic retains separate signed 64-bit Q16 products and 32-bit wrapped offsets.

`node tools/verify-wheel-drive-inputs-instructions.mjs` interprets 340 retained instructions, including the length, fixed root, dot and division callees. All 4,000 synthetic fixtures match the full 16,384-byte vehicle region plus both outputs. Cases include counter/offset extremes, reduced-speed boundaries, forward/reverse/lateral velocity, mode flags, reduction and override. No helper stubs are used. Report: `analysis/wheel-drive-inputs-instruction-check.json`.

## Registered-cell surface mode

`readVehicleSurfaceMode(data, scene, cellRef)` reproduces `0x41c6c0`. This consumes the vehicle's registered cell at native +0x11c, rather than one wheel's selected surface metadata. Cell -1 returns zero. Otherwise it reads the top ten bits of the referenced grid vertex's word +4. Loader `0x44caf4` /`0x44caf8` sets lower bound `0x90929c` from GFXM u16 +0x66.

Codes below that lower bound or >=0x3f0 return zero. Remaining codes <0x3d0 return mode 1; codes 0x3d0..0x3ef return mode 2. Native `0x41c080` forces grip reduction 26 for mode 1. This remains separate from the five-bit reduction in the ordinary contact descriptor.

`node tools/verify-vehicle-surface-mode-instructions.mjs` matches all 31 retained instructions on 7,169 fixtures: every ten-bit code under seven lower bounds, varied grid coordinates, plus the absent-cell sentinel. No helpers are stubbed. `node tools/validate-vehicle-surface-modes.mjs` validates every one of the 1,155,548 installed level vertices in all 80 packs; all classify as mode zero in serialized data. This does not establish which codes can be written during gameplay. Reports: `analysis/vehicle-surface-mode-instruction-check.json` and `analysis/vehicle-surface-mode-catalog.json`.

## Traction and spin comparison

`node tools/verify-wheel-traction-instructions.mjs` interprets 350 retained traction/spin/math instructions for 4,000 synthetic wheel states. The complete 200-byte wheel region, correction vector and skid return match. Coverage includes 500 low-slip cases, 3,500 capacity-limited cases, 3,284 skid returns, 532 spin-zero clamps, and scaled/exempt special-time branches. Report: `analysis/wheel-traction-instruction-check.json`.

Effect helper `0x483b90` is explicitly omitted as a no-op in this isolated arithmetic comparison. Its sound/particle/state behavior is not reconstructed or verified by this test. The newer complete drive-caller comparison uses deterministic state-mutating callback mocks to check ordering and argument contracts. All experiments use retained static instructions and reconstructed code; the original process was not executed.

## Next boundary

The caller preserves spin clamps, opposite-wheel contact gating, front/rear terms, spin-dependent resistance and traction dispatch. Assembly `218` contains a mode-dependent 3/2 numerator that Ghidra's pseudocode `188` omits; it affects only the spin-threshold division branch. The rear effect call sites and downstream numeric force application are covered by the ports and instruction checks. [The vehicle frame stage](vehicle-frame.md) also covers rest/air assists and special-state force arithmetic. Actual effect implementations and collision/race scheduling remain open. See [wheel-frame.md](wheel-frame.md) for wheel evidence and scope.
