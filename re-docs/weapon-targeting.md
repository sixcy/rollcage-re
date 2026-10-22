# Weapon target selection (`48ac00`)

`src/weapon-targeting.mjs` ports the native scheduler `48ac00`, both target scans in `48acb0`, forward preference/line sampling `48b0e0`, and terrain obstruction `48b2a0`. It uses actual `422c70` normalization and `4286e0` spatial lookup, with shared-memory APIs and native entry `scratchBase`:

- `updateWeaponTargets(runtime)` updates eligible participant records and advances target lock timers.
- `updateVehicleWeaponTarget(record,runtime)` scans the authored model list at auxiliary-pack `+ec` and runtime object registry `82e880`.
- `evaluateWeaponTarget(record,mode,targetShortAddress,bestScoreAddress,runtime)` and `weaponTargetBucketObstructed(bucket,directionAddress,fromAddress,targetShortAddress,runtime)` expose the smaller entries.

The scheduler performs unsigned clock division before checking participant count, so zero participants produce the native division-failure condition. Human-controlled bodies update every tick; autonomous mode8 bodies update on their participant-index remainder. Its second pass uses a captured session pointer and live count. A newly acquired target's timer decrements in that same pass.

The scans preserve signed-short world coordinates and wrapping signed distances. Kind-one object targets require held input1000 and exclude the own body. A state2 lock restricts both lists to its existing target kind and identity. Equal forward scores accept the later candidate. Model retention uses the extra6000 threshold. An existing model target retains its original output point; existing body targets refresh their point.

Line preference captures quarter-step deltas before normalizing its direction. Four spatial samples compare native unsigned-byte-sized coordinate windows, including their asymmetric negative-difference behavior. Terrain testing retains the exact narrowed cross products and writes `91d360/368/370`, `91d408/40c/410` and `91d448/44c/450` in native order.

`node tools/verify-weapon-targeting-instructions.mjs` passes4,000 mixed fixtures and384 persistent scheduler frames:4,384 calls,845 reached instructions,5,359,750 steps. All mapped bytes at/above `10000h` compare after each call, with no game or platform callback replacements. Actual visits include1,110 accepted model candidates,1,784 accepted body candidates,443 obstructed terrain cases and62 timer-expiry transitions. Four x87 rounding modes are declared. Eight focused tests pass with `node --test tests/weapon-targeting.test.mjs`. The report is `analysis/weapon-targeting-instruction-check.json`.

These checks explicitly construct synthetic participant, model, object-registry, spatial and terrain inputs. They do not establish full upstream loader/session construction or original-process behavior. Private stack values beyond those required by the currently translated calls are not a complete process-stack reconstruction. The broader `48d7c0` weapon coordinator remains unfinished.

Retained assembly for Redux SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`:

- 3215 (`48ac00`), `ev_eba9a072e22ca820d0565f013965ab66fd590f611fc12a1b0fcb6b6d0e97cd9d`.
- 3223 (`48acb0`), `ev_f7ada5cb2d7ee2b945bae57afd8b6ee0b10ed87db2b62a7c08818716c1dd27e7`.
- 3235 (`48b0e0`), `ev_bfb4388ebb2cdbd03b66d87560f8ede7c7c8968021482179adb959536c57df57`.
- 3261 (`48b2a0`), `ev_266f5c020f7a7b4ae20617731791b4224edee868961477406b1bd27e726fca3e`.
