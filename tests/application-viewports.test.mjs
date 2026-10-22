import test from 'node:test';
import assert from 'node:assert/strict';
import {setApplicationViewportEnabled} from '../src/application-viewports.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), ptr = (m, p) => m.readUInt32LE(p);
function fixture() {
  const memory = Buffer.alloc(0xa00000), application = 0x100000, head = 0x110000, name = 0x120000, runtime = {memory, scratchBase: 0x9000}; let cursor = 0x180000;
  put(memory, application + 0x7c, head); for (const offset of [0, 4, 8]) put(memory, head + offset, head); memory.writeUInt16LE(0x101, head + 12); memory.write('0 Player\0', name);
  runtime.handlers = {allocate(size) {const p = cursor; cursor += size + 15 & ~15; memory.fill(0x93, p, cursor); return p;}, free() {}};
  const record = () => ptr(memory, head + 4) + 44;
  return {memory, application, head, name, runtime, record};
}
test('enabled uses exact DWORD equality to one and preserves adjacent stale bytes', () => {
  const {memory: m, application, name, runtime, record} = fixture(); setApplicationViewportEnabled(application, name, 1, runtime); assert.equal(m[record() + 0x34], 1);
  m[record() + 0x35] = 0x76; setApplicationViewportEnabled(application, name, 257, runtime); assert.equal(m[record() + 0x34], 0); assert.equal(m[record() + 0x35], 0x76);
});
test('enabled flag is captured before the map insertion allocation mutates caller arguments', () => {
  const {memory: m, application, name, runtime, record} = fixture(), allocate = runtime.handlers.allocate;
  runtime.handlers.allocate = size => {put(m, 0x9008, 2); return allocate(size);};
  setApplicationViewportEnabled(application, name, 1, runtime); assert.equal(m[record() + 0x34], 1); assert.equal(ptr(m, 0x9008), 2);
});
test('null viewport name is an ordinary empty key and duplicate updates retain one node', () => {
  const {memory: m, application, runtime, record} = fixture(); setApplicationViewportEnabled(application, 0, -1, runtime); const first = record(); setApplicationViewportEnabled(application, 0, 1, runtime);
  assert.equal(record(), first); assert.equal(ptr(m, application + 0x80), 1); assert.equal(m[first + 0x34], 1);
});
