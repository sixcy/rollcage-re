import test from 'node:test';
import assert from 'node:assert/strict';
import {destroyXAudioManager, releaseXAudioManager, initializeXAudioManager} from '../src/xaudio-manager-lifecycle.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, calls = [], put = (p, v) => memory.writeInt32LE(v | 0, p), ptr = p => memory.readUInt32LE(p);
  for (const [i, offset] of [4, 8, 12, 0x814, 0x82c, 0x830, 0x834, 0x838, 0x83c, 0x840, 0x844, 0x848, 0x84c].entries()) {const header = 0x110000 + i * 32; put(object + offset, header); put(header, 0x120000 + i * 32); put(header + 4, 0x120000 + i * 32); put(header + 8, 0x120010 + i * 32);}
  put(0x714b08, object);
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {calls.push([name, ...args]); return 0;}, platformCall(name, args) {calls.push([name, ...args]); return name === 'GetCurrentThreadId' ? 73 : 1;}, xAudio2Call(owner, method, args) {calls.push(['COM', owner, method, ...args]); return 0;}}};
  return {memory, object, calls, put, ptr, runtime};
}
test('manager destruction releases mastering voice, stops engine, releases engine, then frees pool storage', () => {
  const f = fixture(); f.put(f.object + 0x914, 101); f.put(f.object + 0x910, 102); f.put(f.object + 0xd68, 0x130000); f.put(f.object + 0xd6c, 0x130000);
  destroyXAudioManager(f.object, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'COM'), [['COM', 101, 0x48, 101], ['COM', 102, 0x30, 102], ['COM', 102, 8, 102]]);
  assert.equal(f.ptr(f.object + 0x914), 0); assert.equal(f.ptr(f.object + 0x910), 0); assert.equal(f.ptr(f.object + 0xd68), 0);
  assert.deepEqual(f.calls.at(-1), ['DeleteCriticalSection', f.object + 0x8f0]);
});
test('manager engine release uses the live engine pointer after StopEngine returns', () => {
  const f = fixture(); f.put(f.object + 0x910, 101);
  f.runtime.services.xAudio2Call = (owner, method, args) => {f.calls.push(['COM', owner, method, ...args]); if (method === 0x30) f.put(f.object + 0x910, 202);};
  destroyXAudioManager(f.object, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'COM'), [['COM', 101, 0x30, 101], ['COM', 202, 8, 202]]); assert.equal(f.ptr(f.object + 0x910), 0);
});
test('manager deleting wrapper frees its object without clearing the separately owned global root', () => {
  const f = fixture(); assert.equal(releaseXAudioManager(f.object, 1, f.runtime), f.object);
  assert.deepEqual(f.calls.at(-1), ['operatorDelete', f.object]); assert.equal(f.ptr(0x714b08), f.object);
});
test('null outer allocation faults at native validation before publishing a replacement root', () => {
  const f = fixture(), previous = 0x170000; f.put(0x714b08, previous);
  assert.throws(() => initializeXAudioManager(f.runtime), error => error.address === 0x4a575b);
  assert.equal(f.ptr(0x714b08), previous); assert.deepEqual(f.calls, [['operatorNew', 0xd78]]);
});
