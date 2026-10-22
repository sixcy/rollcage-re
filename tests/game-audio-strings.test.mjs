import test from 'node:test';
import assert from 'node:assert/strict';
import {gameAudioNameHasPrefix, assignGameStringSubstring, moveGameString} from '../src/game-audio-strings.mjs';
function fixture(text, heap = false) {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, pointer = heap ? 0x110000 : object;
  memory.writeUInt32LE(text.length, object + 16); memory.writeUInt32LE(heap ? 63 : 15, object + 20); if (heap) memory.writeUInt32LE(pointer, object); memory.write(text + '\0', pointer);
  memory.writeUInt32LE(0x12345678, 0x5e8890); const released = [];
  const runtime = {memory, scratchBase: 0x9000, services: {libraryCall(name, args) {
    if (name === 'memmove' || name === 'memcpy') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];}
    if (name === 'operatorDelete') {released.push(args[0]); return 0;}
    throw Error(`Unexpected focused audio string service ${name}`);
  }}};
  return {memory, runtime, object, pointer, released};
}
test('audio name comparison accepts an exact prefix and retains byte case sensitivity', () => {
  const f = fixture('SFX_ENGINE_TURBO', true), name = 0x120000;
  f.memory.write('SFX_ENGINE\0', name); assert.equal(gameAudioNameHasPrefix(f.object, name, f.runtime), 1);
  f.memory.write('sfx_engine\0', name); assert.equal(gameAudioNameHasPrefix(f.object, name, f.runtime), 0);
  f.memory[name] = 0; assert.equal(gameAudioNameHasPrefix(f.object, name, f.runtime), 1);
});
test('same-object substring erases the prefix after truncating its original tail', () => {
  const f = fixture('0123456789'); assignGameStringSubstring(f.object, f.object, 2, 4, f.runtime);
  assert.equal(f.memory.toString('ascii', f.object, f.object + 5), '2345\0'); assert.equal(f.memory.readUInt32LE(f.object + 16), 4); assert.deepEqual(f.released, []);
});
test('heap string move transfers ownership and resets source without freeing its allocation', () => {
  const f = fixture('A long sample name', true), output = 0x120000;
  moveGameString(output, f.object, f.runtime);
  assert.equal(f.memory.readUInt32LE(output), f.pointer); assert.equal(f.memory.readUInt32LE(output + 16), 18); assert.equal(f.memory.readUInt32LE(output + 20), 63);
  assert.equal(f.memory[f.object], 0); assert.equal(f.memory.readUInt32LE(f.object + 16), 0); assert.equal(f.memory.readUInt32LE(f.object + 20), 15); assert.deepEqual(f.released, []);
});
