import test from 'node:test';
import assert from 'node:assert/strict';
import {insertRendererTargetPointer, registerRendererTarget, constructRendererStockName} from '../src/renderer-target-registration.mjs';
import {initializeRaceViewportLiterals} from '../src/race-viewports.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture(capacity = 4) {
  const memory = initializeRaceViewportLiterals(Buffer.alloc(0xa00000)), owner = 0x100000, vector = owner + 44, data = 0x110000, input = 0x120000, allocations = [];
  put(memory, vector, data); put(memory, vector + 4, data + 8); put(memory, vector + 8, data + capacity * 4); put(memory, data, 11); put(memory, data + 4, 22); put(memory, input, 99);
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {allocations.push([name, args]); return 0x180000;}}, handlers: {allocate: () => 0x190000, free() {}}};
  return {memory, owner, vector, data, input, runtime, allocations};
}
test('insertion preserves an aliased element while shifting in place', () => {
  const {memory: m, vector, data, input, runtime, allocations} = fixture(); insertRendererTargetPointer(vector, input, data, 0, data + 4, runtime);
  assert.deepEqual([get(m, data), get(m, data + 4), get(m, data + 8)], [22, 11, 22]); assert.equal(get(m, input), data); assert.equal(allocations.length, 0);
});
test('full target vector grows by one and returns the rebased iterator', () => {
  const {memory: m, vector, data, input, runtime, allocations} = fixture(2); insertRendererTargetPointer(vector, input + 4, data + 4, 0, input, runtime);
  assert.deepEqual([get(m, 0x180000), get(m, 0x180004), get(m, 0x180008)], [11, 99, 22]); assert.equal(get(m, input + 4), 0x180004); assert.deepEqual(allocations, [['operatorNew', [12]], ['operatorDelete', [data]]]);
});
test('stock-name constructors retain native inline versus heap ownership', () => {
  const {memory: m, input, runtime} = fixture(); constructRendererStockName(input, false, runtime); assert.equal(m.toString('latin1', input, input + 10), 'StockScene'); assert.equal(get(m, input + 20), 15);
  constructRendererStockName(input, true, runtime); assert.equal(m.toString('latin1', get(m, input), get(m, input) + 17), 'StockRenderTarget'); assert.equal(get(m, input + 20), 31); assert.equal(get(m, input + 24), 0);
});
test('matching target names insert before existing entries without replacing them', () => {
  const {memory: m, owner, vector, data, input, runtime} = fixture(); const old = 0x140000, fresh = 0x150000;
  put(m, data, old); put(m, vector + 4, data + 4); m.write('Same\0', input); put(m, input + 16, 4); put(m, input + 20, 15); m.write('Same\0', old + 20); put(m, old + 36, 4); put(m, old + 40, 15);
  registerRendererTarget(owner, fresh, input, 0, runtime); assert.deepEqual([get(m, data), get(m, data + 4)], [fresh, old]); assert.equal(get(m, vector + 4), data + 8);
});
