# Vehicle sound controls and haptics

`src/vehicle-sound-controls.mjs` reconstructs four complete sound wrappers. `startVehicleSound(code, mode, pitch, volume, position, reverb, runtime)` implements `484cb0` and defaults through actual `emitNativeEffect → dispatchNativeSound`, including recovered channel/position/reverb selection. `stopVehicleSound(channel, runtime)`, `setVehicleSoundVolume(channel, minimum, value, runtime)` and `setVehicleSoundFrequency(channel, value, runtime)` implement `484d10`, `484d30`, `484d90`.

The start wrapper uses lowCL code, lowDL mode, signed-word pitch/volume, the position in EDX, zero first/sixth adapter arguments and seventh argument `(lowbyte(reverb) == 1)`. Its unused fifth adapter argument retains raw ECX. Other wrappers use unsigned `channel > 256` and a nonzero source pointer, then `runtime.handlers.sourceCall(source, method, args, runtime)` with method34/14/20. Volume chooses the larger signed16 value, truncates `value *32767 /16383` as an integer, then converts/multiplies as float32. Frequency preserves signed-word-1 and otherwise truncates `value *11025 /1024`. Source pointers are read live; the game does not dereference invalid sentinel handles.

`src/vehicle-haptics.mjs` reconstructs four complete game parents with explicit imported/container services:

| Entry | Export |
| --- | --- |
| `407380` | `applyVehicleHapticEffect(deviceId, effectType, descriptor20Bytes, runtime)` |
| `4074e0` | `stopVehicleHapticEffect(deviceId, runtime)` |
| `407570` | `applyVehicleDirectionalHaptics(deviceId, angle, gain, runtime)` |
| `407670` | `applyVehicleConstantHaptics(deviceId, duration, gain, runtime)` |

Runtime is `{memory, scratchBase, handlers}`; scratchBase is native entry ESP. Initialize original float bytes with `initializeVehicleHapticsConstants(memory)`. The retained table JSON includes its evidence IDs. Core407380 copies its native by-value20-byte descriptor at entryESP+4 and returns meaningful AL0/1; higher EAX bytes are volatile. Device manager714b54 method14 receives signed deviceId and3. The outer cache key is deviceId; inner cache key is effectType. A missing outer cache gets a new library header, clears/swaps the previous map and destroys/frees its old header. A missing effect is created and configured through device methods34/40; an existing effect uses44. The handle cell is read again after the actual creation service. Stop4074e0 always selects inner key1, invokes3c then38 with a live handle reload, and erases the entry.

Directional407570 clamps angle0..36000 and constructs type2 descriptor `[0,0,0,clamped(sin*rGain),clamped(cos*rGain)]`. Constant407670 constructs type0 `[durationSeconds,0,0,clampedGain,0]`; signed duration-1 becomes0. Every native float conversion/multiplication is rounded to float32. Imported `cosf`/`sinf` are library boundaries with float32 host Math defaults. Their vendor library internals are not reconstructed.

## Explicit library interfaces

- `handlers.deviceCall(pointer, method, args, runtime)` implements the imported manager/device virtual services; descriptor arguments are native addresses into runtime.memory.
- `handlers.hapticContainerCall(entry, {memory, ecx, args, scratchBase}, runtime)` implements the standard C++ container helpers. Entries/arities:40b2a0/2,40c0a0/0,40b220/1,40b6b0/1,40b9d0/3,40b5b0/2,40b2f0/1,40b370/2. Getters return integer EAX or `{eax}`; ignored clear/destroy/erase results may be undefined.
- `handlers.free(pointer, runtime)` implements operator delete. Optional `cosf`/`sinf` handlers implement the imported pure scalar math functions.
- Optional `handlers.apply407380` and `handlers.dispatch40ea40` allow focused boundary probes. Production defaults call the actual reconstructed game parents.

The retained helper evidence758–769 and771/772 identifies the nested std::map tree templates, header allocation, clearing and destruction. Those general library operations remain services; the game's cache lookup/create/update/remove decisions and native handle/descriptor aliases are implemented. No Map producer or haptic device is fabricated by the source module.

## Validation

- `node tools/verify-vehicle-sound-controls-instructions.mjs`: **10,000 fixtures**, **2,500 per wrapper**, **588 retained instructions**, **606,706 interpreted steps**, PASS. Start executes the actual emitter/dispatcher/channel/position/reverb gate using populated round-robin bank/channel records; only libaudio virtual and compiler services are admitted.825 invalid starts map to127;12,014 service calls compare arguments/order, float32 volume/vectors and live source replacement. Reverb installation/allocation variations have separate retained emitter checks; this fixture intentionally supplies fixed allocated channels and a disabled reverb gate.
- `node tools/verify-vehicle-haptics-instructions.mjs`: **10,000 fixtures**, **2,500 per parent**, **272 retained parent instructions**, **813,576 interpreted steps**, PASS. Explicit std::map/device/delete/trig services compare game-owned ordering/state and exact descriptor bytes, including signed IDs/types, gain/angle/duration edges, cached create/update/stop and callback mutation of live type/handle cells. Counts:5,480 create,948 update,715 stop,2,143 outer-map clears and6,428 descriptor deliveries.
- `node --test tests/vehicle-sound-controls.test.mjs tests/vehicle-haptics.test.mjs`: **11 focused tests**, PASS.

Evidence is retained in native-simulation requests700–707,750–772 plus the previously retained sound chain149–164 and original float bytes711/712. Reports are `analysis/vehicle-sound-controls-instruction-check.json` and `analysis/vehicle-haptics-instruction-check.json`. These are interpreted shipped instructions over synthetic caller-owned memory, not original-process execution, audible output, physical feedback or proof of runtime/device/container initialization. Instruction totals overlap their already documented emitter helpers and must not be added as unique recovered coverage.
