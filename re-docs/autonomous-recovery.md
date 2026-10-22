# Autonomous recovery and power slides

`src/autonomous-recovery.mjs` reconstructs four complete Redux functions using raw caller-owned memory. Their numerical callees use the existing route geometry, speed, steering and fixed-point modules. No game callee is replaced with a callback in this module.

| Native entry | JavaScript export | Recovered behavior |
| --- | --- | --- |
| `47ff20` | `updateAutonomousStuckState(body, {memory})` | Opening countdown, saturated age, surface-sensitive stuck counter and mode `80` admission |
| `41f0d0` | `maybeStartAutonomousRandomRecovery(body, {memory})` | Clock/speed gates, private LCG and mode `200` admission |
| `47ffb0` | `updateAutonomousReverseRecovery(body, {memory, scratchBase})` | Mode `80` phase/timeout policy, route/facing/velocity decisions and actual steering |
| `4311e0` | `updateAutonomousPowerSlide(body, {memory, scratchBase})` | Modes `1`/`2` admission, steering/braking timer, target preparation and actual speed selection |

`scratchBase` is the native entry ESP, not the beginning of an allocated scratch buffer. Provide space below it for the nested numerical helpers. `memory` holds native body/session/progression pointers and address-indexed globals; this module does not construct those inputs. Route directions use the actual `491d80`/`491ce0` helpers; surface lookup uses `430e90`; steering uses `431520`; power-slide target and speed use `431380` and `430fc0`.

## Preserved details

- The opening gate reads session `57c == 4` and unsigned `580 < 60`. Its word write sets age `6e8` to `254` and also clears the adjacent stuck counter `6e9`.
- Age saturates at `255`. The stuck counter wraps as a byte and triggers strictly above `30`, or `60` for surface codes above `10`. Speed `85` fails the stuck gate. A mode assignment writes all four bytes at `6c4`, clearing the overlapping timer `6c6`.
- Random recovery uses its own seed at `5ea4d4`, multiplication by `16807`, and mask `7fffffff`. Clock `90a548` is unsigned, so a negative signed representation passes the `378` gate. The probability shift uses the low five bits of byte `6f2`, including the intermediate 32-bit wrap. Failed gates leave the generator untouched.
- Mode `80` increments its word timer before checking the captured old value. Age thresholds are `120` on surfaces up to `10` and `150` otherwise. Younger vehicles use phase `60`/timeout `120`; older vehicles use phase `20`/timeout `60`. Alignment thresholds are `5780` and `a474`. Velocity is dotted against the facing vector. Timeout clears the mode/timer and age before any progression-route access. Completion clears these fields after steering. The reverse steering path negates the shared target and preserves native call-stack offsets.
- Modes `1`/`2` write their initial target before checking their timer. Timer `0` needs speed at least `200` and route alignment at least `ddb3`; timers `10..29` only advance; `30+` clears the whole mode/timer dword. Steering admission uses strict opposing thresholds below `-30000` or above `30000`. Target advancement can change body `6c2`; subsequent speed selection still uses the original authored point's byte `7`, doubled, with session mode `4` overriding it to `250`.

## Evidence and validation

Retained decompilations are requests `303`, `304`, `306`, `307`; retained complete assembly is `320-autonomous-stuck-counter-assembly.json`, `321-autonomous-random-recovery-assembly.json`, `322-autonomous-reverse-recovery-assembly.json`, and `323-autonomous-power-slide-assembly.json` in `analysis/native-simulation/results/`. The generated comparison report records the evidence IDs for all parent and actual numerical-callee instructions.

`node tools/verify-autonomous-recovery-instructions.mjs` passes **8,000 synthetic fixtures**, **2,000 per entry**, interpreting **2,394 retained instructions** over **3,270,303 executed steps**. It compares the complete 16,384-byte body, route groups/point storage, wheel metadata, six 780-byte progression records, session storage, private RNG/clock globals, power-slide return values and meaningful shared target scratch. The fixtures include first-wheel null metadata, mode/timer overlap, byte/word limits, unsigned clocks, shift-count masking, forward/backward velocity, route direction disagreement, steering correction and mode `4`. There are 333 accepted slides, 167 generator updates and 1,495 cleared modes. No calls are mocked. Report: `analysis/autonomous-recovery-instruction-check.json`.

`node --test tests/autonomous-recovery.test.mjs` passes **12 focused tests**, covering the thresholds and ordering described above. The six-record oracle limit prevents a malformed seventh record from overlapping clock `90a548` (`909300 + 6 * 30c`). It does not claim that constructors or race setup have been recovered.

These are reconstructed algorithms checked against interpreted shipped instructions using synthetic memory. They are not original-process runtime observations, whole-race behavior, or evidence of complete autonomous driving. The broader dispatcher still has separately tracked game-policy callees outside this module.
