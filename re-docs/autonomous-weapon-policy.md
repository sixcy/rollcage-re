# Autonomous weapon-use policy

`src/autonomous-weapon-policy.mjs` reconstructs complete parent `4103f0`, all six reached item-specific decision functions, the route speed-marker scan and authored object coordinate transform. Item numbers are numeric native IDs; this work does not assign weapon names from IDs.

Call `initializeAutonomousWeaponTables(memory)` once to copy the original 112 bytes at `570540` and shipped yaw values. Then call `updateAutonomousWeaponPolicy(body, {memory, scratchBase})`, with `scratchBase` equal to native entry ESP. All native game decisions have actual defaults. Optional `handlers.call410780`, `call410f80`, `call411340`, `call410930`, `call411ba0`, `call410c90` allow explicit observation/substitution; a handler receives `{memory, ecx, edx, args, scratchBase, slot}` and must return integer EAX or `{eax}`. Normal execution requires none of them.

| Address | Export | Behavior |
| --- | --- | --- |
| `4103f0` | `updateAutonomousWeaponPolicy` | Signed slot IDs, two timers/private RNG, phase gates, duplicate-item arbitration and button bits |
| `410780` | `decideAutonomousItem00(body, flag, options)` | Selected flag1 racer, progression gap/speed, opponent mask and difficulty RNG |
| `410f80` | `decideAutonomousItem01(body, timer, options)` | Existing active-object suppression, event eligibility, target range and nearby racer progression |
| `411340` | `decideAutonomousItem02(body, timer, options)` | Predictive racer targeting, transformed authored object rows and precomputed nearby objects |
| `410930` | `decideAutonomousItem03(body, flag, timer, options)` | Forward route admission, ahead/rear racer classification, skill/weight thresholds and reverse-use bits |
| `411ba0` | `decideAutonomousItem04(body, flag, options)` | Late-race/mode gates, speed-marker scan and multiple future route alignment checks |
| `410c90` | `decideAutonomousItem07(body, flag, timer, options)` | Forward route admission, racer progress/range/mask tests and difficulty RNG |
| `411b00` | `hasAutonomousSpeedMarker(body, options)` | Current point plus at most nine successors; byte7 sentinel255 and authored direction/open/cyclic behavior |
| `411260` | `writeAutonomousObjectPosition(row, output, options)` | Original yaw lookup, local-coordinate rotation and independently wrapping output words |

`options` is `{memory, scratchBase}`; pure memory-only helpers ignore the scratch argument. Runtime body/session/record pointers, event storage, 24 registered active-object pointers, authored object rows, material references and precomputed nearby-object lists are explicit caller-owned native inputs. Their producers are outside this module. No invented visibility search or object registration substitutes for those producers.

## Details preserved from assembly

Slot IDs are sign-extended bytes: empty `-1` seeds a negative delay only when its signed timer is nonnegative; other IDs increment a wrapping word timer. Delay selection uses the private LCG at `5ea4d4`, difficulty `5ea4d8`, ordered slot transitions and original shift ranges. The global clock gate is unsigned `>=350` after timer updates. Phase6+ blocks everything below150 and slot2 below300; the flagged-record early return applies outside phase6.

Equal low-five-bit IDs choose the greater signed timer, with ties favoring slot1. Slot IDs/flags and initial admission are captured; slot2's timer is read again after slot1's decision. Previous-frame button bits suppress setting current button bits after the actual decision runs. Timer words overlap other state, and the reverse-use path preserves upper bytes by writing only mode word `6c4` while adding `4000` to controls.

Prediction in `411340` uses actual future route steps4/6/8 and shift3/4/5, target speed at `664`, velocity and the original fixed-point normalization. Authored object coordinates use original yaw bytes; event suppression and all three native threshold tables remain actual game logic. `410c90` uses route direction again after overwriting its former facing-vector scratch with the distant target delta. `411ba0` keeps original point coordinates for both later route comparisons. Assembly's boundary at progression `32768` is preserved where the decompilation differs.

`410780` can retain signed index `-1` if no racer has flag1. Its difficulty0 path then accesses the caller-owned record immediately preceding `909300`; this native dereference is retained, not replaced with a fabricated selected racer.

## Evidence and validation

Parent pseudo: request309; parent assembly420; item pseudo/assembly421–432; dispatch bytes433; original threshold bytes434; scan435/436; transform437/438; RNG jump tables439/440; normalization dispatcher441/442. All are retained in `analysis/native-simulation/results/`. `src/autonomous-weapon-tables.json` retains the exact threshold bytes and evidence ID; the yaw table was already recovered separately.

- `node tools/verify-autonomous-weapon-policy-instructions.mjs`: **16,000 fixtures**, **220 parent instructions**, **787,789 interpreted steps**, PASS. The six deliberately admitted callback contracts include **2,815 calls**, **994 mutating calls**, checking native order, low-byte/word/stack inputs and entry ESP. This separate check validates parent behavior around opaque callees; it is not the full-closure evidence.
- `node tools/verify-autonomous-weapon-decisions-instructions.mjs`: **18,000 fixtures**, **2,000 for each of nine entries**, **2,456 retained instructions**, **8,249,272 interpreted steps**, PASS. Every game callee is actual, with **no mocked calls**. Checks full body/session/progression/RNG storage, six decision EAX results, route-marker result and coordinate output. Directed cases exercise predictive racers, authored rows, nearby objects and reverse use alongside randomized gates. Item03 sets reverse-use state in500 cases; item02 accepts1,552; item04 accepts1,503; the marker scan accepts500.
- `node --test tests/autonomous-weapon-policy.test.mjs`: **19 focused tests**, PASS, including geometric/prediction/default-helper paths, timer/ID/clock boundaries, callback alias ordering, marker horizon and yaw word wrap.

Reports are `analysis/autonomous-weapon-policy-instruction-check.json` and `analysis/autonomous-weapon-decisions-instruction-check.json`. These compare synthetic memory against interpreted shipped instructions. They are not original-process execution or proof of recovered producer/setup behavior, weapon spawning/damage, or complete race AI.
