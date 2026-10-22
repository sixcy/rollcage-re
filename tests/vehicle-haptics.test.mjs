import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeVehicleHapticsConstants, applyVehicleHapticEffect, stopVehicleHapticEffect, applyVehicleDirectionalHaptics, applyVehicleConstantHaptics} from '../src/vehicle-haptics.mjs';
function fixture({outer = true, inner = true, available = true} = {}) {
  const memory = Buffer.alloc(0xa00000), calls = [], map = 0x20000, oldHeader = 0x21000, newHeader = 0x22000, node = 0x23000;
  initializeVehicleHapticsConstants(memory); memory.writeUInt32LE(0x10000, 0x714b54); memory.writeUInt32LE(0x19000, 0x6f2360); memory.writeUInt32LE(oldHeader, map); memory.writeUInt32LE(55, node + 20);
  for (const offset of [0, 4, 8]) memory.writeUInt32LE(oldHeader, oldHeader + offset);
  const runtime = {memory, scratchBase: 0x9000, handlers: {}};
  runtime.handlers.hapticContainerCall = (entry, {args}) => {
    calls.push(['map', entry]);
    if (entry === 0x40b2a0) {memory.writeUInt32LE(outer ? 0x18000 : 0x19000, args[0]); return args[0];}
    if (entry === 0x40c0a0) return newHeader;
    if (entry === 0x40b220) {outer = true; return map;}
    if (entry === 0x40b5b0) {memory.writeUInt32LE(inner ? node : memory.readUInt32LE(map), args[0]); return args[0];}
    if (entry === 0x40b2f0) {inner = true; return node + 20;}
    if (entry === 0x40b6b0) {inner = false; return;}
    if (entry === 0x40b9d0) return;
    if (entry === 0x40b370) {inner = false; return;}
    throw Error('Unexpected library operation');
  };
  runtime.handlers.free = pointer => calls.push(['free', pointer]);
  runtime.handlers.deviceCall = (pointer, method, args) => {calls.push(['device', pointer, method, args]); if (method === 0x14) return available ? 0x11000 : 0; if (method === 0x34) return 99; return 0;};
  return {memory, calls, runtime, map, oldHeader, newHeader, node};
}
test('unavailable device returns AL0 without touching the container cache', () => {
  const {runtime, calls} = fixture({available: false}); assert.equal(applyVehicleHapticEffect(-1, 1, Buffer.alloc(20), runtime), 0); assert.equal(calls.length, 1);
});
test('missing outer cache replaces/clears its library header then creates the requested effect', () => {
  const {memory, runtime, calls, map, oldHeader, newHeader, node} = fixture({outer: false, inner: false});
  assert.equal(applyVehicleHapticEffect(2, 1, Buffer.alloc(20), runtime), 1);
  assert.equal(memory.readUInt32LE(map), newHeader); assert.equal(memory.readUInt32LE(node + 20), 99); assert(calls.some(call => call[0] === 'free' && call[1] === oldHeader));
  assert.deepEqual(calls.filter(call => call[0] === 'device').map(call => call[2]), [0x14, 0x34, 0x40]);
});
test('existing handle updates with a live descriptor and does not recreate it', () => {
  const {memory, runtime, calls} = fixture(); const descriptor = Buffer.alloc(20); descriptor.writeFloatLE(0.25, 12);
  applyVehicleHapticEffect(2, 1, descriptor, runtime);
  assert.deepEqual(calls.filter(call => call[0] === 'device').map(call => call[2]), [0x14, 0x44]); assert.equal(memory.readFloatLE(0x9004 + 12), 0.25);
});
test('stop always selects key1 and reloads the handle between stop and release calls', () => {
  const {memory, runtime, calls, node} = fixture(); const original = runtime.handlers.deviceCall;
  runtime.handlers.deviceCall = (pointer, method, args) => {const value = original(pointer, method, args); if (method === 0x3c) memory.writeUInt32LE(77, node + 20); return value;};
  stopVehicleHapticEffect(2, runtime);
  assert.deepEqual(calls.filter(call => call[0] === 'device').map(call => [call[2], call[3]]), [[0x14, [2, 3]], [0x3c, [55]], [0x38, [77]]]); assert.equal(memory.readInt32LE(0x9000 - 8), 1);
});
test('directional haptics clamps angle and gain with float32 stages and uses type2', () => {
  const {runtime} = fixture(); const values = []; runtime.handlers.apply407380 = (id, type, descriptor, context) => values.push([id, type, Buffer.from(descriptor), context.scratchBase]);
  applyVehicleDirectionalHaptics(3, -1, 20000, runtime); applyVehicleDirectionalHaptics(3, 0, 20000, runtime); assert.deepEqual(values[0], values[1]); assert.equal(values[0][1], 2); assert.equal(values[0][3], 0x9000 - 56); assert.equal(values[0][2].readFloatLE(16), 1); assert.equal(values[0][2].readFloatLE(12), 0);
});
test('constant haptics preserves duration sentinel, signed negative duration and type0 descriptor layout', () => {
  const {runtime} = fixture(); const values = []; runtime.handlers.apply407380 = (id, type, descriptor, context) => values.push([type, Buffer.from(descriptor), context.scratchBase]);
  applyVehicleConstantHaptics(3, -1, -20000, runtime); applyVehicleConstantHaptics(3, -2, 20000, runtime);
  assert.equal(values[0][0], 0); assert.equal(values[0][1].readFloatLE(0), 0); assert.equal(values[0][1].readFloatLE(12), -1); assert(values[1][1].readFloatLE(0) < 0); assert.equal(values[1][1].readFloatLE(12), 1); assert.equal(values[1][2], 0x9000 - 48); assert.equal(values[1][1].readUInt32LE(16), 0);
});
