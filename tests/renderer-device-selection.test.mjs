import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRendererAdapter} from '../src/renderer-device-selection.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture() {
  const memory = Buffer.alloc(0xa00000), manager = 0x100000, rows = 0x110000;
  put(memory, manager + 0x47c, rows); put(memory, 0x715b08, 3); put(memory, 0x714afc, 0x715b30); put(memory, 0x714b50, 1); put(memory, 0x714b4c, 17); put(memory, manager + 0x438, -37);
  return {memory, manager, rows, runtime: {memory, scratchBase: 0x9000}};
}
test('zero-width selection still publishes the chosen raw adapter and capability tier', () => {
  const {memory: m, manager, rows, runtime} = fixture(), record = rows + 0x53c; put(m, record + 0x4c8, 0xfffe0100); put(m, record + 0x4d0, 0xffff0300);
  assert.equal(selectRendererAdapter(manager, 1, 0, 0, 480, 32, 60, runtime), 1); assert.equal(get(m, manager + 0x488), record); assert.equal(get(m, manager + 0x438), 5);
});
test('an adapter without qualifying tier bits preserves the old tier', () => {
  const {memory: m, manager, runtime} = fixture(); selectRendererAdapter(manager, 0, 0, -1, 480, 32, 60, runtime); assert.equal(get(m, manager + 0x438), -37);
});
test('all failed mode attempts reach the native error child and return failure', () => {
  const {manager, runtime} = fixture(); runtime.services = {direct3DCall: () => 0}; let request;
  runtime.handlers = {call50fb20: value => {request = value;}};
  assert.equal(selectRendererAdapter(manager, 0, 0, 640, 480, 32, 60, runtime), 0); assert.equal(request.ecx, manager); assert.deepEqual(request.args, [0x5db1f4]);
});
