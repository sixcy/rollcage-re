# Scripted object motion

`src/scripted-motion.mjs` reconstructs the object bytecode runner at **0x476550** and its four-point table-difference helper at **0x476df0**. These routines set velocity, teleport, follow paths, emit a lifecycle effect or request destruction. Position integration and surrounding object lifecycle remain the caller's responsibility.

## Evidence and verification

Retained assembly: `analysis/native-simulation/results/051-scripted-motion-assembly.json` (Evidence `ev_5213808e8e7df1986255f10391b1fa53c1e747718c04554a183391e950f3534c`) and `057-scripted-curve-assembly.json` (`ev_43507ad80ccb3963d90c9e8366bdcff6fdcba90ca1a2dcb4cdc69f67c9625f67`). The helper pseudocode is retained in `058-scripted-curve.json`.

`src/scripted-curve-table.json` retains all **1,028 bytes** at virtual address **0x574ab0**, PE file offset **1,522,864**. The instruction checker independently compares these bytes with both the installed executable and provider reply `065-scripted-curve-table.json` (Evidence `ev_85e0009bf9856dde0d522908b4b13cf4fc7bb30e55a15f4f7106f18f41527ee8`). Executable identity is SHA-256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.

Run:

```powershell
node tools/verify-scripted-motion-instructions.mjs
node --test tests/scripted-motion.test.mjs
```

The checker compares **1,197 retained x86 instructions**, **5,000 interpreter fixtures** and **1,000 independent full-signed-domain curve fixtures**, with **1,128,283 interpreted instruction steps**. It compares the entire 1,024-byte body, unchanged bytecode, callback sequence and callback mutations. Integer multiplication, division, vector length, table lookup, cross product and float normalization run through their retained instructions; no arithmetic helpers are stubbed. Only spatial removal/insertion, effect creation and body destruction are explicit callbacks. It exercises all opcodes 0–8, positive and negative unknown opcodes, restart chains, segment transitions, signed timer states, action modes and four declared x87 rounding modes. The deterministic fixture corpus includes 151 destruction requests and 218 orientation changes. Report: `analysis/scripted-motion-instruction-check.json`.

The 16 focused tests record externally meaningful behaviors, including delayed timer advancement, callback-dependent insertion, path completion, timer aliasing, table quantization, basis orientation and wrapping offsets. They supplement the native instruction comparison.

## Integration contract

Call `stepScriptedMotion(body, {bytecode, spawnPositions, handlers, roundingMode, maxOpcodes})`. `bytecode` is the explicit native Buffer selected by the caller. Native pointer `body+0x134` is represented by this Buffer. The source does not discover or manufacture a script. It returns `{destroyed, executedOpcodes}`; an early destruction request returns immediately. The function mutates the supplied body.

| Native field | Source property | Storage and use |
| --- | --- | --- |
| +0x00 | `flags` | Low nine bits select object type; bit 0x8000 controls teleport spatial callbacks. |
| +0x34 | `position` | Three signed Q16 coordinates. |
| +0x40 | `momentum` | Q16; refreshed only after commands that mark velocity changed. |
| +0x68 | `linearVelocity` | Three signed Q16 components. |
| +0xa8 | `mass` | Q16 multiplier for momentum; unity takes the native direct-copy branch. |
| +0xc4 | `rotation` | Nine signed Q12 shorts, stored by row. |
| +0x108 | `integrationFlags` | Successful path orientation sets the low bit (value 1). |
| +0x138 | `scriptOffset138` | Unsigned word byte offset, wrapping on advancement. |
| +0x13a | `scriptTimer13a` | Unsigned word storage, signed reads at path termination tests. |
| +0x13c | `scriptActionTimer13c` | Unsigned word storage, signed reads for wait sentinel. |
| +0x13e | `scriptSegment13e` | Unsigned byte path segment. |
| +0x13f | `scriptSpawnIndex13f` | Unsigned byte into eight-byte spawn records. |
| +0x180 | `scriptField180` | Type-26 configuration dword, meaning still unresolved. |
| +0x184 | `scriptField184` | Type-26 configuration word, meaning still unresolved. |

`spawnPositions` accepts the native eight-byte-record Buffer (signed x/y/z shorts at +0/+2/+4; final short unused here) or an explicit array of equivalent triples. `roundingMode` is passed to native float direction normalization for opcode 7. The four supported contexts are `nearest-even`, `toward-zero`, `down`, and `up`; the original runtime control word has not been observed. `maxOpcodes` defaults to 100,000 and is a reconstruction workflow guard against malformed infinite chains, rather than a recovered game limit.

Callbacks receive the same mutable body. Required callbacks are checked only when reached:

- `removeSpatial(body)` and `insertSpatial(body)` for an attached teleport.
- `triggerEffect(body, 7)` for the path action whose low nibble is 3.
- `destroyBody(body, 0, 0)` for the path action whose low nibble is 2.

Callback effects are observable. Teleport rechecks bit 0x8000 after removal, before writing position, so removal can suppress reinsertion. Restart changes position without either spatial callback. The lifecycle callbacks are integration boundaries; this module does not claim to reconstruct their allocation, effects or destruction behavior.

## Bytecode behavior

Commands and operands are little-endian. Ordinary signed velocity shorts are shifted left eight bits into the body. Unknown signed opcodes stop without advancing.

| Opcode | Recovered behavior |
| --- | --- |
| 0 | Set velocity from signed shorts +2/+4/+6, advance eight bytes, stop this call and update momentum. |
| 1 | If timer is zero, load duration from +2 and velocity from +6/+8/+10. Otherwise decrement its storage word; advance 12 bytes when it reaches zero. Always stop this call and update momentum. A zero duration reloads every call. |
| 2 | Remove if attached, set position from dwords +4/+8/+12, insert if still attached, advance 16 bytes and immediately continue. |
| 3 | Evaluate the four-point path and actions described below. |
| 4 | Set offset to zero, load the indexed spawn shorts into Q16 position, clear velocity and immediately continue from offset zero. Timers, segment, momentum and spatial links are untouched by this instruction itself. |
| 5 | Stop without advancing or modifying motion. |
| 6 | For type 26 and unsigned `kind < 100`, set dword +0x180 to 3 when kind is 2; otherwise copy operand +4 to word +0x184. Advance eight bytes and immediately continue. Negative kinds fail the unsigned comparison. |
| 7 | Evaluate the path, blend linear and curved velocities using its adjacent tangent alignment, and attempt to face the path. |
| 8 | Stop without advancing for both zero and nonzero timer states. The native nonzero branch negates a sign-extended nonzero word and therefore never reaches its apparent four-byte advancement. |

Immediate continuation applies only to teleports, restarts, configuration commands and completed paths. An ordinary velocity command or completed timed-velocity command does not execute its successor until the next invocation. Momentum is recomputed once after the final non-destruction command if any command in that chain marked velocity changed. Restart alone clears velocity without marking that flag, preserving old momentum.

## Paths and native quirks

The signed segment count is at command +2. For segment `s`, the metadata base is `command +4 +16*s`: unsigned speed at +0, action word at **+18**, and four signed dword position triples at +4/+20/+36/+52. Thus the action belongs to the following row's metadata; its location is deliberately preserved. Completion advances by `count*16 +52`, clears segment and both timer words, then immediately executes the successor.

When action low nibble is 1, an initially zero action timer becomes `((action >>>4) &0x7ff)+1`. Each positive countdown call sets zero velocity and returns; when the previous value was 1 the stored word becomes 0xffff. On the following call this signed negative sentinel allows motion. Low nibble 2 requests destruction immediately; nibble 3 emits effect 7 once while the action timer is zero and stores 1. Other actions do not block movement.

An initially zero phase timer becomes 4096 without subtracting speed on that invocation. Otherwise speed is subtracted into its word and a signed nonpositive result advances the segment. The native instruction writes **a dword** at +0x13a when starting a segment, clearing the adjacent action timer at +0x13c; the source preserves that aliasing. The new segment uses its new point window but the speed already read from the previous segment for this invocation. Speed is shifted right four, phase is `(4096 - signedTimer) >>4`, and the curve samples the retained signed-short table differences, clamping the end phase to 256.

These rounded coefficients do not form a perfect constant partition. For four x positions `[0,1,2,3]` in Q16 at phase 0 and step 16, the native curve returns x velocity 6092. Translating all four points by +1 produces 6080. The port preserves this table quantization instead of replacing the curve with an analytic spline. Multiplications and sums retain native fixed-width wrap and shift behavior.

Opcode 7 constructs and blends the neighboring tangents, computes the alignment weight, then derives a right/up/forward basis. It keeps the original matrix if the horizontal right vector is too short or the normalized length check fails. A successful matrix write sets integration flag 1; it does not rewrite the quaternion. Purely vertical paths retain the old matrix.

## Remaining boundaries

Authored script discovery and integration with actual object constructors, whole-frame lifecycle, effect internals and destruction internals remain separate work. The randomized path fixtures avoid singular tangent-length products that divide by zero. Malformed bytecode, out-of-range curve phases or missing backing memory produce JavaScript errors rather than native invalid-memory accesses. The original executable has not been run; this evidence proves agreement with interpreted retained instructions within the declared fixture domain.
