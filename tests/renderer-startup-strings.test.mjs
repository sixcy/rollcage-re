import test from 'node:test';
import assert from 'node:assert/strict';
import {constructRendererString, destroyRendererString, ensureRendererString, appendRendererString, assignRendererWideString, constructRendererWideString, cacheRendererWideString} from '../src/renderer-startup-strings.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), get = (m, p) => m.readInt32LE(p);
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, input = 0x110000, trace = []; let cursor = 0x180000;
  const runtime = {memory, scratchBase: 0x9000, services: {
    libraryCall(name, args) {trace.push([name, args]); if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}},
    platformCall(name, args) {assert.equal(name, 'MultiByteToWideChar'); for (let i = 0; i < args[3]; i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}
  }};
  return {memory, object, input, trace, runtime};
}
test('self-range append rebases data after a heap growth allocation', () => {
  const {memory: m, object, input, runtime} = fixture(); m.write('123456789abcdef\0', input); constructRendererString(object, input, runtime); appendRendererString(object, object + 5, 10, runtime);
  assert.equal(m.toString('latin1', get(m, object), get(m, object) + 25), '123456789abcdef6789abcdef'); assert.equal(get(m, object + 16), 25);
});
test('explicit shrinking copies into SSO before deleting old storage', () => {
  const {memory: m, object, input, trace, runtime} = fixture(); m.write('A long name requiring heap storage\0', input); constructRendererString(object, input, runtime); const old = get(m, object);
  ensureRendererString(object, 5, 1, runtime); assert.equal(m.toString('latin1', object, object + 5), 'A lon'); assert.equal(get(m, object + 20), 15); assert.deepEqual(trace.at(-1), ['operatorDelete', [old]]);
});
test('destruction releases the separate conversion owner before SSO heap storage', () => {
  const {memory: m, object, input, trace, runtime} = fixture(); m.write('A long name requiring heap storage\0', input); constructRendererString(object, input, runtime); const heap = get(m, object); put(m, object + 24, 0x170000);
  destroyRendererString(object, runtime); assert.deepEqual(trace.slice(-2), [['operatorDeleteArray', [0x170000]], ['operatorDelete', [heap]]]); assert.equal(get(m, object + 20), 15); assert.equal(get(m, object + 24), 0);
});
test('a nonnull empty narrow input still allocates and frees the wide conversion temporary', () => {
  const {memory: m, object, input, trace, runtime} = fixture(); constructRendererWideString(object, input, runtime);
  assert.deepEqual(trace.map(row => [row[0], row[1][0]]), [['operatorNewArray', 2], ['operatorDeleteArray', 0x180000]]); assert.equal(get(m, object + 20), 7); assert.equal(get(m, object + 16), 0);
});
test('wide self-substring assignment preserves two-byte units and terminator', () => {
  const {memory: m, object, input, runtime} = fixture(); put(m, object + 20, 7); m.write('ABCDE\0', input, 'utf16le'); assignRendererWideString(object, input, 5, runtime); assignRendererWideString(object, object + 2, 3, runtime);
  assert.equal(m.toString('utf16le', object, object + 6), 'BCD'); assert.equal(m.readUInt16LE(object + 6), 0); assert.equal(get(m, object + 16), 3);
});
test('cached conversion replaces its own owner without changing the narrow string', () => {
  const {memory: m, object, input, trace, runtime} = fixture(); m.write('Hello\0', input); constructRendererString(object, input, runtime); const first = cacheRendererWideString(object, runtime), second = cacheRendererWideString(object, runtime);
  assert.notEqual(first, second); assert.equal(get(m, object + 24), second); assert(trace.some(row => row[0] === 'operatorDeleteArray' && row[1][0] === first)); assert.equal(m.toString('latin1', object, object + 5), 'Hello');
});
