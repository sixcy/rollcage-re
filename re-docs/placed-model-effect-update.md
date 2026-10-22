# Pending placed-model effects (`00414060`)

`src/placed-model-effect-update.mjs` closes the `00414060` stage called by the ordinary race update `00450e50`. `updatePlacedModelContactEffects(runtime)` takes `{memory, scratchBase, soundRuntime?, handlers?}`; there are no public ECX, EDX or stack arguments. `scratchBase` is native entry ESP. The parent’s local position and velocity occupy entry ESP minus 24 and minus 12 respectively. All reached game callees use their actual existing implementations; no game handler is required.

The shared array begins at `00920800` with unsigned count `009207e4` and 16-byte rows:

| Offset | Native use |
| --- | --- |
| `+0/+2/+4` | Signed short world position, shifted left 16 when activated |
| `+6` | Signed damage/status byte; `00414060` considers exactly zero ready, then writes `ff` after activation |
| `+7` | Unsigned delay byte, decremented only when `+6` is zero |
| `+8` | Signed effect scale byte |
| `+9` | Suppresses repeated class-two break when nonzero |
| `+a/+b` | Retained padding |
| `+c` | Placed model body address |

The scan captures count once. A nonzero delay is decremented, and even a delay of one waits until the next call. The first ready row activates and returns immediately; later row delays are not aged during that call. Nonzero status bytes, including positive remaining damage status and `ff`, are skipped.

## Actual effects and ordering

Signed `scale<=0` selects sound code 10, three-count kind-4 particles and three-count debris using velocity `(0,-32,0)` in Q16. It does not publish the larger effect request/damage globals, terrain brightness, position-effect queue or pulse.

Positive scale selects `amount=scale-1`, velocity `(0,-64,0)`, kind-4 and kind-8 particle helpers, the bounded position-effect queue `00436410`, debris, terrain brightness/range mutation `00437aa0` and a three-slot pulse claim `00437670`. It publishes origin/strength/flag at `0091cd80..90`, with strength `amount*4+4`. The separate request at `0091cd60..74` is written only when `00811180==0`. Sound code 11 is emitted only for nonzero amount. **Scale one is silent but still invokes both particle kinds and debris**: actual downstream formulas emit at least one particle per kind and twelve debris records when storage is available.

Sound positions use the actual 24-entry ring `00919020`, advancing `009153dc` with unsigned wrap comparison. `emitNativeEffect` and `dispatchNativeSound` perform the complete game adapter/channel/position/reverb decisions. `soundRuntime` supplies genuine libaudio interfaces; the absent-bank path needs none. Native’s unread fifth stack argument is preserved as the observed ring increment. The module does not execute audio devices.

After effects, live row `+9` controls actual `breakClassTwoModel` (`004142a0`), which removes spatial membership, releases attachments, rewrites model configuration flags and sets its model-associated row’s suppression flag. The original selected row receives `+6=ff` only after that helper returns. Existing actual particle/debris allocation, active reuse, spatial selection/insertion, RNG, terrain range decoding, dirty queue and pulse helpers are used directly.

## Damage and constructor ownership

The existing `src/world-effect-records.mjs` function is `00413fc0`, the damage/falloff path for these same rows. New `applyPlacedModelEffectDamage({memory})` is a raw-memory bridge to that checked arithmetic. It reads the active flag at `0091cd90`, count at `009207e4`, signed high-word origin at `0091cd82/86/8a`, and strength `0091cd8c`. Positive signed status bytes lose inverse-square damage based on the maximum squared axis distance; nonpositive bytes remain unchanged. A resulting zero makes the row eligible for a later `00414060` call. Native byte wrapping and truncation remain those of the existing arithmetic port.

Retained ownership evidence resolves the inputs:

- Scene setup `0047ea40` writes `00ff` to the status/delay word of 50 rows and resets count to zero before map construction. This identifies initialized capacity, not a new bounds guard: the native append has no explicit 50-row guard.
- Map/runtime construction `0044c2b0`, assembly `0044cf2f..0044cf8e`, appends a row for each class-two placed model. It copies the object’s world-position high words, three authored placement bytes into status/delay/scale, the model body pointer and a zero suppression byte; object `+19b` receives the row index. Native increments count before publishing the row fields.
- The full scene/map constructors remain separate unported parents here. This module neither synthesizes authored rows nor claims to implement those parents. The raw bridge connects actual damage and activation on caller-owned mapped rows.

## Retained-instruction validation

Target: Redux 1.3.8.0, SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

`node tools/verify-placed-model-effect-update-instructions.mjs` passes:

- 1,800 mixed scenarios × four persistent calls, plus 160 damage/activation scenarios × six frames: **8,160 actual `00414060` calls** and **960 actual `00413fc0` calls**.
- **1,616 distinct instructions reached; 14,166,517 interpreted steps**. The new stage has 158 instructions; the existing damage entry has 57.
- 640 damage-to-ready transitions, 1,687 actual class-two breaks/attachment releases, 11,268 particle emits, 44,322 debris emits and 22,608 terrain-vertex writes.
- Populated sound banks execute 11,800 declared libaudio calls and 60 actual game reverb installations after an explicit library availability transition. Source-pointer and color mutations exercise live reloads. Bounded CRT name copying and 3,004 compiler-cookie checks are the other admitted services; no game callees are mocked.
- Every mapped data byte from `10000h` upward is compared after each damage/activation stage, alongside exact audio-service order and arguments. Declared private stack scratch is excluded.

Primary report: `analysis/placed-model-effect-update-linked-instruction-check.json`. Earlier `placed-model-effect-update-instruction-check.json` and `placed-model-effect-update-complete-instruction-check.json` are preserved subsets, not additive results.

`node --test tests/placed-model-effect-update.test.mjs`: **9 tests pass**, covering empty count, delay ordering, early scan return, silent scale-one emissions, signed negative scale, ring wrap, request gating, actual class-two break, raw damage linkage and a smaller full-graph instruction comparison.

Evidence comes from `2800/2801` (stage pseudo/158 instructions), `2802` (count xrefs), `2803/2804` (damage entry), `2805/2806` (map constructor) and `2807` (scene setup). Stage assembly identity: `ev_31244b396846ab3143d04789b6bd9f74b1acf32cd85777764f1c8f74325e0cac`; damage assembly: `ev_fa1d2561c9991a3232c6b0201ddd71126a612f3b4ffc7277e80815e7fc5c61a0`. Original tables and descendants are loaded only from exact-target retained evidence.

Fixtures explicitly construct model/configuration pointers, linked bodies, pool/free/active storage, spatial bands, terrain vertices/palette and sound channels. They do not establish original-process timing, resource-loader provenance, physical contact production, renderer output or real device behavior. Original files were not changed or executed.
