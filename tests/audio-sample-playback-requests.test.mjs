import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGameAudioSamplePlayback} from '../src/audio-sample-playback-requests.mjs';

test('a source without a voice retains its state and never reaches formatting or manager services', () => {
  const memory = Buffer.alloc(0x800000), object = 0x10000;
  memory.fill(0x57, object, object + 0x9a0); memory.writeUInt32LE(0, object + 0x97c);
  const before = Buffer.from(memory.subarray(object, object + 0x9a0));
  requestGameAudioSamplePlayback(object, 0x101, {memory, scratchBase: 0x9000});
  assert.deepEqual(memory.subarray(object, object + 0x9a0), before);
});

test('a queued play request captures its manager before thread service replaces the global root', () => {
  const memory = Buffer.alloc(0x800000), object = 0x10000, manager = 0x20000, other = 0x30000, header = 0x40000, array = 0x41000;
  const put = (p, v) => memory.writeUInt32LE(v >>> 0, p);
  put(object + 0x97c, 1); put(0x714b08, manager); put(manager + 0x83c, header);
  put(header, array); put(header + 4, array); put(header + 8, array + 4);
  put(0x715b08, 3); put(0x714afc, 0x715b30); put(0x714b18, 1);
  const services = {libraryCall(name, args) {assert.equal(name, 'vsprintf_s'); memory[args[0]] = 0; return 0;}, platformCall(name) {if (name === 'GetCurrentThreadId') {put(0x714b08, other); return 99;} assert(['EnterCriticalSection', 'LeaveCriticalSection'].includes(name)); return 0;}};
  requestGameAudioSamplePlayback(object, 0x101, {memory, scratchBase: 0x9000, services});
  assert.equal(memory[object + 0x950], 1); assert.equal(memory.readUInt32LE(object + 0x94c), 3);
  assert.equal(memory.readUInt32LE(array), object); assert.equal(memory.readUInt32LE(header + 4), array + 4);
  assert.equal(memory.readUInt32LE(0x714b08), other); assert.equal(memory.readUInt32LE(manager + 0x890), 0);
});
