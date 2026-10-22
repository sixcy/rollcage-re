import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {resampleGamePixelImage} from '../src/game-image-resampling.mjs';

test('resampler publishes original SEH/saved words before aliased zero-size stores', async () => {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), put = (m, p, v) => m.writeInt32LE(v | 0, p);
  for (const S of [0x9000, 0x9200, 0x9400]) for (const sehWord of [0, 0x8f8c, 0x12345678]) for (const offset of [null, -20, -24, -28]) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), image = offset === null ? 0x100000 : S + offset, entryRegisters = {EBX: 0x2468, EBP: 0x1357, ESI: 0x172345, EDI: image};
    memory.fill(0x36, S - 0x500, S + 100); put(memory, image + 4, 0); machine.reset(); machine.fs0 = sehWord; memory.copy(machine.bytes);
    assert.equal(resampleGamePixelImage(image, 0, 7, 0x1234, image, {memory, scratchBase: S, sehWord, entryRegisters}), 1);
    machine.entry = 0x4c4c20; machine.r.ECX = image; machine.r.ESP = S; Object.assign(machine.r, entryRegisters); put(machine.bytes, S, -1); [0, 7, 0x1234, image].forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); machine.run();
    assert.equal(machine.r.EAX & 255, 1);
    assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000));
    assert.deepEqual(memory.subarray(S - 12, S), machine.bytes.subarray(S - 12, S), `S=${S.toString(16)},image=${image.toString(16)}`);
    const frame = S - 0x3dc; assert.deepEqual(memory.subarray(frame, frame + 16), machine.bytes.subarray(frame, frame + 16));
  }
});
