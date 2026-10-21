# Active vehicle effect state

`applyActiveVehicleEffect(body, directionQ8, effectCode, options)` in `src/active-vehicle-effect.mjs` reconstructs `0x482730`. It applies an incoming direction to explicit vehicle-local state. The original emission at `0x484bb0` remains a callback; the state and lookup producers are separate work.

Options supply a captured `state` Buffer of at least265 bytes, a64-byte `lookup` Buffer and `handlers.onEmitActiveEffect` when its path is reached. Body inputs include the Q12 rotation, Q16 position and byte `effectByte6b4`. The first-effect port can call this implementation through `stepSimulationFrame` and `context.activeVehicleEffectFor(body)`, while callers can still provide an explicit override.

When state byte8 is zero, the routine reads byte1 as signed, subtracts `effectCode>>5`, and clamps negative results to zero. It emits before storing that result and timer10. A positive result is truncated to a byte without an upper clamp. A nonzero timer skips those operations while still updating the directional slot.

The direction is projected against the negative rotation columns. Each product shifts its signed64-bit intermediate right by8 before the wrapped additions. Coordinates offset by4096 and clamp to0..8191. Their upper bits select one of64 lookup entries; that byte chooses the final state offset `9+lookup[index]`. The full effect code is truncated only at the byte store. Callback mutations to the matrix, direction and lookup contents affect later reads, while the original state identity stays captured.

Evidence: `analysis/native-simulation/results/089-active-vehicle-effect.json` and `091-active-vehicle-effect-assembly.json`, assembly Evidence `ev_cb4a7096e8cf413384dfbafe3ff6ab502888a274e036da1ac16a21eb7c8a650c`.

`node tools/verify-active-vehicle-effect-instructions.mjs` passes187 retained instructions over4,000 fixtures and694,652 interpreted steps. It compares complete16KiB bodies, captured and alternate265-byte states, the lookup, direction, pointer global and emission observations. The fixtures include2,666 emissions and2,500 callback-mutation cases; every lookup index occurs. Only the emitter is mocked. Replacing the lookup pointer itself is outside this Buffer contract; mutations of its contents are covered. Six focused tests cover ordering, signed status wrapping, timer behavior, lookup extremes and callback mutations. No original executable execution is claimed.
