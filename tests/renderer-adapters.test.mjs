import test from 'node:test';
import assert from 'node:assert/strict';
import {appendRendererAdapter, enumerateRendererAdapters, selectRendererDisplayMode} from '../src/renderer-adapters.mjs';
import {initializeRendererTextureCreationConstants} from '../src/renderer-texture-creation.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture(modes = []) {
  const memory = initializeRendererTextureCreationConstants(Buffer.alloc(0xa00000)), manager = 0x100000, caps = 0x110000, values = 0x120000, calls = [];
  put(memory, manager + 0x368, 0x130000); put(memory, manager + 0x488, caps); put(memory, caps + 0x534, 1); [640, 480, 32, 60].forEach((v, i) => put(memory, values + i * 4, v));
  const runtime = {memory, scratchBase: 0x9000, services: {direct3DCall(object, method, args) {
    calls.push([method, args]); if (method === 0x18) return modes.length; if (method === 0x1c) modes[args[3]].forEach((v, i) => put(memory, args[4] + i * 4, v)); return 0;
  }}};
  return {memory, manager, caps, values, calls, runtime};
}
test('exact dimensions choose nearest refresh before smaller matching-refresh modes', () => {
  const {memory: m, manager, values, runtime} = fixture([[320, 240, 60, 22], [640, 480, 75, 22], [640, 480, 120, 22]]);
  assert.equal(selectRendererDisplayMode(manager, values, values + 4, values + 8, values + 12, 0, runtime), 1);
  assert.deepEqual([get(m, manager + 0x424), get(m, manager + 0x428), get(m, manager + 0x42c)], [640, 480, 75]);
});
test('zero requested refresh chooses smallest dimension deficit and keeps first equal score', () => {
  const {memory: m, manager, values, runtime} = fixture([[640, 480, 60, 22], [640, 480, 75, 22]]); put(m, values + 12, 0);
  selectRendererDisplayMode(manager, values, values + 4, values + 8, values + 12, 1, runtime); assert.equal(get(m, manager + 0x42c), 60);
});
test('no compatible mode leaves output pointers and native manager fields stale', () => {
  const {memory: m, manager, values, runtime} = fixture([[800, 600, 60, 22], [640, 480, 60, 23]]); put(m, manager + 0x424, 123);
  assert.equal(selectRendererDisplayMode(manager, values, values + 4, values + 8, values + 12, 0, runtime), 0);
  assert.equal(get(m, values), 640); assert.equal(get(m, manager + 0x424), 123);
});
test('width/height pointer alias preserves native sequential output overwrite', () => {
  const {memory: m, manager, values, runtime} = fixture([[640, 480, 60, 22]]);
  selectRendererDisplayMode(manager, values, values, values + 8, values + 12, 0, runtime); assert.equal(get(m, values), 480); assert.equal(get(m, manager + 0x424), 640);
});
test('adapter append rebases an aliased input after vector growth', () => {
  const {memory: m, manager, runtime} = fixture(), vector = manager + 0x47c, input = 0x140000, output = 0x180000;
  put(m, vector, input); put(m, vector + 4, input + 0x53c); put(m, vector + 8, input + 0x53c); m.fill(0x76, input, input + 0x53c);
  runtime.services.libraryCall = name => name === 'operatorNew' ? output : undefined; appendRendererAdapter(vector, input, runtime);
  assert.equal(get(m, vector + 4), output + 2 * 0x53c); assert(m.subarray(output, output + 0x53c).equals(m.subarray(output + 0x53c, output + 2 * 0x53c)));
});
test('adapter enumeration resets logical end before rejecting failed capability queries', () => {
  const {memory: m, manager, runtime} = fixture(), vector = manager + 0x47c; put(m, vector, 0x140000); put(m, vector + 4, 0x145000); put(m, vector + 8, 0x148000);
  runtime.services.direct3DCall = (object, method) => method === 0x10 ? 3 : -1;
  assert.equal(enumerateRendererAdapters(manager, runtime), 0); assert.equal(get(m, vector + 4), 0x140000); assert.equal(get(m, vector + 8), 0x148000);
});
