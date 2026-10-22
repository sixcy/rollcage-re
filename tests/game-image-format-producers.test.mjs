import test from 'node:test';
import assert from 'node:assert/strict';
import {writeGameImageRgba} from '../src/game-image-format.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
test('packed RGBA writer publishes actual argument/return words, including output aliases with its argument slots', async () => {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), put = (m, p, v) => m.writeInt32LE(v | 0, p), image = 0x10000;
  for (const S of [0x9000, 0x9200, 0x9400]) for (const depth of [8, 16, 24, 32]) for (const pixel of [0x20000, S - 32, S - 36]) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)); m.fill(0x69, S - 128, S + 32); put(m, image + 0x44, depth); for (let i = 0; i < 4; i++) {put(m, image + 0x34 + i * 4, [3, 2, 3, 8][i]); put(m, image + 0x24 + i * 4, [11, 5, 0, 0][i]);}
    machine.reset(); m.copy(machine.bytes); writeGameImageRgba(image, pixel, 0xffabcdef, {memory: m, scratchBase: S}); machine.entry = 0x4c2270; machine.r.ECX = image; machine.r.ESP = S; put(machine.bytes, S, -1); put(machine.bytes, S + 4, pixel); put(machine.bytes, S + 8, 0xffabcdef); machine.run();
    assert.deepEqual(m.subarray(S - 40, S - 28), machine.bytes.subarray(S - 40, S - 28), `depth${depth}/pixel${pixel.toString(16)}`); assert.deepEqual(m.subarray(0x10000), machine.bytes.subarray(0x10000));
  }
});
