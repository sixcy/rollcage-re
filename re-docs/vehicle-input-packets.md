# Stored input packet retrieval and analog decoding

`src/vehicle-input-packets.mjs` reconstructs Redux 1.3.8.0 `471250`, `433200`, `434360` and `434210`, reached by the recovered `42a6e0` input parent. These routines consume already sampled device/current/history state. They contain no device or OS polling call. Upstream device sampling, bindings, ownership and configuration constructors remain separate producers.

## Raw-memory APIs

```js
initializeVehicleInputConstants(memory);
pollInputPacket(vehicleIndex, pointerAddress, statusAddress, {memory});
decodeAnalogVehicleInput(vehicleIndex, {memory});
convertInputPacket(vehicleIndex, packetAddress, statusAddress, {memory});
transformInputAxis(value, brakeFlag, {memory});
```

The Buffer contains mapped native addresses. The initializer explicitly copies four retained float/double constants; it does not change the axis table or its initialization flag. The input parent can pass body `724` as `pointerAddress` and its retained eight-byte status scratch as `statusAddress`. Analog decoding resolves the registered body from `909300 + vehicleIndex*30c`, rather than assuming the caller's body is the same.

Optional `transformPacket(packet, status, {memory})` and `transformAxis(value, brakeFlag, {memory})` replace the recovered children for boundary tests. Production defaults execute the reconstructed children. Axis generation accepts `pow(base, exponent)`, defaulting to `Math.pow`, as the explicit numeric service corresponding to the confirmed CRT `__libm_sse2_pow` thunk. This is a standard-library boundary, not an unresolved game algorithm.

## Retrieval and packet conversion

`471250` captures flags `6eafe0`. Its minimum unsigned sample counter `6e675c` is two when flag bit0 is set and config pointer `5ecefc` byte `37` is zero; otherwise one. It clears all eight status bytes in native write order before checking that counter.

When flag bit0 is clear, bits1/2 are both clear, or global `5eb518` is nonzero, it selects fallback data `6e7ac4 + index*67c`, provided the signed index is below four. Otherwise it requires availability dword `6e7880 + index*67c`. Flag bit7 clear selects current data `6e78b0 + index*67c`. Bit7 set scans all 64 twelve-byte history entries at `6e7bd8 + index*67c`: only unsigned timestamps at or before clock `6ea69c`, and within 64 ticks, qualify. The smallest age wins; later entries win equal ages. No qualifying sample leaves the cleared status intact.

The selected status is converted to the per-index packet at `6e7edc + index*67c`. After conversion, live flags are reread. When bits0/7 are both set, every index other than selected global `6e9f70` has packet byte3 ORed with `0f`; selected `-1` means index zero. Finally the output pointer is published. Forward dword copying and pointer publication preserve overlapping aliases.

`433200` captures the raw controls dword and signed record short `25e` before clearing exactly the first twelve packet bytes. The packet starts with dword `ffff4100`; bytes12 onward retain prior data. In local mode indices above three return this initialized packet; network mode additionally requires unsigned index at most five and an available device.

Raw control bits become active-low packet bytes2/3 with their recovered permutations; the original high word becomes packet short4. The analog-enable test uses mask low-byte bit7. Enabled channels clamp signed status bytes5/6 to `[-127,127]`. Steering becomes the clamped value plus128; a negative longitudinal value writes doubled magnitude to packet9 when mask bit1 is set, while a nonnegative value writes its doubled value to packet10 when mask bit0 is set. These exact channel assignments are retained rather than renamed into a symmetric layout.

## Analog response

`434360` captures the registered body once, then processes steering, brake and throttle in that order. Before each channel it rereads record `25e` and body `724`: mask bit2 reads packet8 into body708 using `434210` flag zero; bit1 reads packet10 into body70a using flag one; bit0 reads packet9 into body709 using flag zero. Writes may alter masks or pointers observed by following channels.

`434210` lazily generates 129 dwords at `6fb740..6fb940` when initialization dword `6e65b0` is zero. It starts at float32 25, multiplies by retained float32 `0.08873294293880463`, passes the resulting exact widened float and double exponent2 to CRT power, truncates toward zero, and advances by float32 `0.8062015771865845`. It forces the first table dword to zero and sets the initialization flag. Subsequent calls preserve the caller's existing table.

Flag one applies a signed16 deadzone: absolute input below25 returns zero; other inputs return the original low word. Flag zero expands displacement from128 by integer `300/256`, clips its lookup position, applies the generated response table, and clips the result with native signed32 arithmetic. The returned low word matters; byte consumers retain only its low byte. The response is observably asymmetric around center: inputs127/128/129 produce123/128/133 with the native generated table. Existing table contents and signed overflow are preserved.

## Evidence and checks

Results460..467 retain the four procedures' pseudocode and assembly. Main assembly Evidence IDs are `ev_8d6a18530198ebfa7c65f7f3a8562df4e31e15fac2bb9b8e595b124c12d98b0d` (`471250`), `ev_6e08e32b709ae96520d08b55f267f0bb5b7e1a7d22b27daadcf0aad913fb7371` (`433200`), `ev_de459ff77518bfd1d9c42a1379443e88a18e5b393d2aec84d91a836e76b11139` (`434360`) and `ev_8a2e7f6b43e5058a1d6ffa372a98539c389bb327799c741d3e8f09f5481bc12d` (`434210`). Results468/469 identify the power thunk;470 retains the constants, Evidence `ev_9cdbb6741a99191c6c360af22e506f482a07108b62e633ebc2b6c6e38442a2a1`.

`node tools/verify-vehicle-input-packets-instructions.mjs` passes 369 retained instructions across 8,000 fixtures and 1,649,973 interpreted steps. Four thousand cases execute actual recovered children, including625 lazy initializations and80,625 power calls with exact argument comparisons. Another4,000 cases use named state-mutating child overrides to probe parent reloads. Checks compare full device/history/packet regions, six full bodies and records, table/flag state, globals, EAX and call order. Retained constants are independently checked. The CRT power implementation is supplied as the declared numeric service; its internal library instructions are not reconstructed. Report: `analysis/vehicle-input-packets-instruction-check.json`.

`node --test tests/vehicle-input-packets.test.mjs` passes14 focused tests, including actual stored-sample → packet → registered-body analog decoding. This is synthetic static instruction comparison. No original game process, physical device or OS input API was executed; installed files remain unchanged.
