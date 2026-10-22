import test from 'node:test';
import assert from 'node:assert/strict';
import {copyGameAudioSampleState, queryGameAudioSampleActivity, isGameAudioSamplePending, clearGameAudioSamplePending} from '../src/audio-sample-controls.mjs';

test('forward descriptor overlap propagates the first DWORD through the entire secondary record', () => {
  const memory = Buffer.alloc(0x20000), object = 0x10000, destination = object + 0x498;
  memory.writeUInt32LE(0x12345678, destination - 4); memory.fill(0xab, destination, destination + 0x464);
  copyGameAudioSampleState(object, destination - 4, {memory, scratchBase: 0x9000});
  for (let i = 0; i < 280; i++) assert.equal(memory.readUInt32LE(destination + i * 4), 0x12345678);
  assert.equal(memory.readUInt32LE(destination + 0x460), 0xabababab);
});

test('activity tests exactly one in the low argument byte and retains the state high bytes in EAX', () => {
  const memory = Buffer.alloc(0x20000), object = 0x10000, runtime = {memory, scratchBase: 0x9000};
  memory.writeUInt32LE(0x12345678, object + 0x948); memory.writeUInt32LE(3, object + 0x94c);
  assert.equal(queryGameAudioSampleActivity(object, 2, runtime), 0x12345600);
  assert.equal(queryGameAudioSampleActivity(object, 0x101, runtime), 0x12345601);
  assert.equal(queryGameAudioSampleActivity(object, 0x100, runtime), 0x12345600);
});

test('clearing the deferred state leaves the current state and exact state-three query intact', () => {
  const memory = Buffer.alloc(0x20000), object = 0x10000, runtime = {memory};
  memory.writeUInt32LE(3, object + 0x948); memory.writeUInt32LE(3, object + 0x94c);
  clearGameAudioSamplePending(object, runtime);
  assert.equal(memory.readUInt32LE(object + 0x94c), 0); assert.equal(isGameAudioSamplePending(object, runtime), 1);
  memory.writeUInt32LE(0x103, object + 0x948); assert.equal(isGameAudioSamplePending(object, runtime), 0);
});
