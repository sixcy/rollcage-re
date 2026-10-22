# Wheel skid, rear particle and surface debris references

`src/wheel-effects.mjs` reconstructs the complete reached numeric/state graphs rooted at Redux `483b90`, `436630` and `42c590`. These routines mutate the supplied native-addressed `Buffer`; they do not construct a game session or execute the original executable.

The public entry points are:

| Native entry | JavaScript entry | Arguments before options |
| --- | --- | --- |
| `483b90` | `updateWheelTractionEffects` | wheel address, measured slip strength, surface reduction |
| `436630` | `emitWheelRearParticle` | body address, position address, direction address, packed color, intensity, effect-record address |
| `42c590` | `emitWheelSurfaceParticles` | body address |

Each takes `{memory,scratchBase}`, where `scratchBase` denotes its native entry ESP. The surface routine consumes the padding short in its local vector at entry ESP minus 26; caller scratch storage must exist and retain its bytes. Particle/debris return values are descriptive allocation addresses/counts, rather than claims about incidental native EAX values.

`initializeWheelEffectTables(memory)` installs the independently retained original floats at `5dc5f4` (1/4096) and `5dc97c` (4). Original square-root data comes from the existing fixed-integer module. All pool, configuration, spatial, RNG, clock, brightness and renderer storage remains caller supplied.

## Recovered behavior and closure

`483b90` writes wheel `+c4` before checking the skid setting. It preserves the remaining skid state when disabled, uses distinct active/new-skid thresholds, and preserves native signed absolute-value overflow. Its complete graph is `483e60` movement/direction acceptance, `483d10` quantized endpoint and packed cross-vector update, `483c80` 292-byte ring append, `483f10` short collinear merge, and `484020` saturated signed-short distance. Ring pointers wrap or remain unchanged after a successful merge.

`436630` has **four stack arguments**: direction, color, intensity, and the 28-byte emission gate. The last pointer is required to reproduce suppression and record writes. `4365a0` uses unsigned clock differences, reduced distance and atomic snapshots when input aliases the record. Accepted emissions use actual `435df0` allocation/reuse, `4748d0` removal, `474670` registration and `4286e0`/`4746f0` spatial selection from `body-retirement-effects.mjs`. Quantized velocity, special-time scaling, brightness, one RNG step, variant selection and the shared modulo-12 frame byte are preserved.

`42c590` emits only from rear wheels 2/3 at signed speed `body+664 >= 20000h`. Its supported surface codes are 5, 6, 8, 9 and 14. It exposes the native integer and float renderer scratch writes, uses the original quality threshold, preserves the exact three-step RNG sequence per attempted particle, and delegates to real `475c30` debris allocation/registration. `4334b0` supplies the original short Q12 transform; `475bc0` preserves the native low-word color products and bit mixing. Material kind 20 divides the supplied velocity even when no debris slot is free. This graph contains no sound dispatch call.

## Ordinary frame binding contract

The structured `wheel-drive.mjs` callback arguments already carry the correct numeric arguments. They require views over the **same** native memory before the raw defaults can observe their mutations. Merely providing an `.address` alongside copied object fields does not establish that relationship.

The native wheel base is `body + 324h + 200*i`. Within that record:

| Structured field | Native offset | Width |
| --- | --- | --- |
| `flags` | `00` | byte |
| `supportProjection` | `04` | 3 signed DWORDs |
| `slipVector` | `10` | 3 signed DWORDs |
| `relativeHit` | `1c` | 3 signed DWORDs |
| `leverArm` | `28` | 3 signed DWORDs |
| `driveDirection` | `34` | 3 signed DWORDs |
| `tractionCorrection` | `4c` | 3 signed DWORDs |
| `spin` | `58` | signed DWORD |
| `slipWithSpin` | `60` | 3 signed DWORDs |
| `angle` | `78` | signed DWORD |
| `slipSpeed` | `7c` | signed DWORD |
| registry vehicle index | `9c` | byte |
| continuation marker | `9e` | byte |
| quantized skid endpoint | `a0` | 3 signed words; following padding preserved |
| `effectFlags` | `a8` | DWORD |
| cached slip | `ac` | 3 signed DWORDs |
| skid record pointer | `b8` | DWORD; `ffffffffh` sentinel |
| `effectSpeed` | `c4` | signed DWORD |

The skid projection uses `relativeHit` at `+1c`, while the caller constructs rear particle position from `leverArm` at `+28` plus body position. These are different vectors.

Six 28-byte gate records begin at `body+3dc8h`. Each contains signed DWORD `status`, signed distance threshold at `+4`, unsigned clock interval at `+8`, last clock at `+c` and last position at `+10`. Rear wheel `i` uses slots `i` and `i+2`. Status writes from suppressed surface categories must also write through to this native storage. Array properties require both in-place element writes and whole-array assignment to alias their native lanes.

With those views, the traction callback can directly call `updateWheelTractionEffects(wheel.address,measuredSpeed,surfaceReduction,options)`. Rear emission can put its caller-created temporary vectors in explicitly supplied scratch storage and pass their addresses plus `record.address` to `emitWheelRearParticle`; the vectors are temporary arguments, rather than a synchronized copy of body/wheel state. The surface callback directly calls `emitWheelSurfaceParticles(vehicle.body.address,options)` after wheel forces.

The caller must also supply coherent raw registry `909300+30ch*index` body pointers, config `5ecefc`, material pointers at `body+198h+28*i`, body speed `+664`, the effect pools/spatial index and original constants. Material metadata obtained from parsed GFXM files needs an explicit runtime address mapping before a native pointer can be written; this module does not invent one. The existing respawn runtime's two-field wheel view only covers flags/spin and is insufficient for the complete wheel frame.

## Evidence and validation

Retained entry assembly is `analysis/native-simulation/results/715-wheel-traction-effects-assembly.json`, `717-wheel-rear-emission-assembly.json` and `719-wheel-surface-particles-assembly.json`. Child assembly and original switch/float bytes are retained under IDs 810–831. Shared allocation, registration, spatial and arithmetic evidence is enumerated in `analysis/wheel-effects-instruction-check.json`.

`node tools/verify-wheel-effects-instructions.mjs` passes 7,344 complete calls against 1,725 retained instructions, executing 3,527,598 interpreted steps. It includes 48 fixtures for each of the gate, rear-emission and surface-entry alias checks. It compares complete body, wheel, gate, skid ring, particle/debris pool, free/active/spatial list, RNG, frame and renderer output regions. The run reaches 780 rear particles, 5,825 debris records, 449 merges and 153 segment append attempts. All reached callees execute their retained instructions: there are no effect acceptance or allocator mocks.

`node --test tests/wheel-effects.test.mjs` passes nine focused tests for disabled effects, hysteresis, merging, clock rollover, aliased gate inputs, particle frame rollover, empty debris pools, rear-wheel/material gating and short-distance saturation. All fixtures are synthetic native memory, not original-process runtime observations. These results establish this bounded effect graph; game-owned runtime construction, renderer consumption and full-frame integration remain separate claims.
