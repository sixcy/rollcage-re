# Vehicle rejection prepass

`src/post-frame-vehicle-check.mjs` reconstructs47e180, which47ccc0 calls before capturing its physical-body list. It checks the registered vehicles for an excessive signed height or a sustained low-speed condition and marks selected bodies with state32 for the following state dispatch.

Static evidence is retained in`analysis/native-simulation/results/104-post-frame-prepass.json`, pseudocode `ev_fd021209c83703d664bd22f13e4f4e048e68c6482f97c2de95f647d178f5d5a0`, and`109-post-frame-vehicle-check-assembly.json`, assembly `ev_1634d8e82ddf8042a5c4e87c630efad2e1a73cd968c241cc34fb1e3b3f199727`. This reconstruction does not claim original-process execution.

The unsigned vehicle count comes from session byte+54d and is captured once. Records start at909300 with30c-byte stride; each record supplies its body pointer at+00 and a byte counter at+248. Every counted record is checked without an additional body-type filter.

For each body, the low byte of closest terrain reference+11c selects a sector header through the pointer table at909240. The comparison is between the body's signed high16 Y coordinate and the sector header's signed short+14 **plus512**. A strictly greater Y marks the body immediately. This port treats the signed header value as an explicit numeric input; it does not invent a runtime sector bound or infer a height from rendered geometry.

Otherwise, signed short speed+668 below2 increments record byte+248 with8-bit wrapping. It then tests bit1 of all four wheel flag bytes, beginning at body+324 with200-byte stride. If every wheel's low bit is set, it clears the counter before comparing it against90. A resulting counter strictly greater90 marks the body. Therefore counter90 becomes91 and triggers rejection, while255 wraps to0 and does not. Signed negative speeds enter the same branch. Speed2 or greater clears the counter and does not inspect wheel state.

Marking writes body dword+128=32, record byte+248=0 and clears only the high bit of the current record body's collision flags+110. The state and flags are otherwise unchanged. No spatial movement, lifecycle removal, pose correction or wheel reset occurs in this routine.

## Interface

```js
checkPostFrameVehicles(runtime, {
  sectorHeights, //signed16 values indexed by sector
  vehicleStateFor(body, record, index) { return state; }
});

// runtime = {
//   session: {vehicleCount54d},
//   records: [{body00, field248}, ...]
// }
// body: position, closestTerrain11c, speed668, collisionState128, collisionFlags
// state: {wheels:[{flags}, {flags}, {flags}, {flags}]}
```

Packed closest terrain references and the existing structured`{sector,row,column}` representation are accepted; only the sector byte participates. `vehicleStateFor` supplies existing wheel storage and is required only when a slow branch reaches the wheel reads. This storage adapter is not an original native callback and should have no side effects. Heights can be read directly from the installed scene's actual sector-header bytes at segment offset+14 by the caller. Missing reached state remains an explicit error.

The return reports checked vehicles, marked bodies, height failures and low-speed failures. Those counters describe work done by the reference; the original routine returns no corresponding report.

## Verification

`node tools/verify-post-frame-vehicle-check-instructions.mjs` passes5000 synthetic fixtures against all44 retained47e180 instructions, with no mocked native calls or arithmetic helpers. It compares every byte of eight16384-byte bodies, eight780-byte registry records,256 sector headers and their pointer table, and the1536-byte session. It exercises signed16 height/Y/speed limits, exact height+512 and speed2 thresholds, wheel-bit patterns, counter boundaries, aliases between registered body pointers and zero/nonzero captured counts.

The19990 registry checks produce12177 marks:9107 height failures and3070 low-speed failures. Fixtures include859 counter wraps,401 all-wheel resets and1071 repeated body registrations. All462142 interpreted steps match. Report:`analysis/post-frame-vehicle-check-instruction-check.json`.

`node --test tests/post-frame-vehicle-check.test.mjs` passes seven focused tests for the strict height threshold,91st slow check, wraparound, grounded reset, fast-path storage requirements, packed/structured sector selection, declared registry count and missing reached inputs.

These checks establish interpreted-instruction agreement for supplied static state. Producers of speed668, registry population/counter initialization and live sector references remain caller-owned until separately reconstructed.
