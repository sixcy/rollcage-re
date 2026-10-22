import test from 'node:test';
import assert from 'node:assert/strict';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {resampleGameImageRows} from '../src/game-image-resample-rows.mjs';
test('box resampling averages the authored source block through the real pixel codecs', () => {
  const memory = Buffer.alloc(0xa00000), source = 0x100000, target = 0x110000, runtime = {memory, scratchBase: 0x9000}, put = (p, v) => memory.writeInt32LE(v | 0, p);
  for (const [image, pixels, size] of [[source, 0x200000, 2], [target, 0x210000, 1]]) {put(image + 4, pixels); put(image + 8, size); put(image + 12, size); put(image + 0x44, 32); setGameImageMasks(image, -1, -1, -1, -1, runtime);}
  memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(1 / 255, 0x5dc618); memory.writeFloatLE(255.9999, 0x5dca48);
  [0xff000000, 0xff0000ff, 0xff00ff00, 0xffff0000].forEach((v, i) => put(0x200000 + i * 4, v)); resampleGameImageRows(source, [0, 0, 1, 1, 0, 1, source, target, 3, 0], runtime); assert.equal(memory.readUInt32LE(0x210000), 0xff3f3f3f);
});
