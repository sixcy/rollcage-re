import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRawEffectParticles, advanceRawBodyDebris, advanceRawType8Particle, advanceRawType34Particle, blendRawEffectColor} from '../src/particle-lifetime.mjs';
import {registerRawEffectSpatial, allocateRawEffectParticle} from '../src/body-retirement-effects.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  put(0x902eec, 0x100000); put(0x909254, 0x40000); put(0x909278, 0x45000);
  for (let row = 0; row < 256; row++) {word(0x40000 + row * 16, 0xff00); word(0x40002 + row * 16, 255); put(0x4000c + row * 16, 0x43000);}
  put(0x9153c4, 0x100000); put(0x91900c, 0x100400); put(0x6e65c0, 0x100000); put(0x6e65c8, 0x100200); put(0x6e65b4, 0x100300);
  for (let index = 0; index < 3; index++) {const p = 0x100000 + index * 256; put(p, 9); memory[p + 0x94] = 1; word(p + 0xa2, 16); word(p + 0x96, 2); put(p + 0xac, index ? p - 256 : 0); put(p + 0xa8, index < 2 ? p + 256 : 0); registerRawEffectSpatial(p, 0, 0, 0, {memory});}
  return {memory, put, word};
}

test('particle expiry updates first, unlinks active/spatial membership and prepends free list', () => {
  const {memory, put, word} = fixture(); word(0x100096, 1); put(0x100000, 8); word(0x10009c, 100); word(0x100196, 0);
  advanceRawEffectParticles({memory});
  assert.equal(memory.readInt32LE(0x100088), 100 << 8); assert.equal(memory[0x100094], 0); assert.equal(memory.readUInt16LE(0x100096), 1);
  assert.equal(memory.readUInt32LE(0x6e65b4), 0x100000); assert.equal(memory.readUInt32LE(0x1000ac), 0x100300); assert.equal(memory.readUInt32LE(0x6e65c0), 0x100100); assert.equal(memory.readUInt32LE(0x1001ac), 0);
  assert.equal(memory.readUInt16LE(0x100196), 65535); assert.equal(memory.readUInt16LE(0x100296), 1); assert.equal(memory.readUInt32LE(0x100004), 0);
  assert.equal(allocateRawEffectParticle({memory}), 0x100000); assert.equal(memory.readUInt32LE(0x6e65b4), 0x100300); assert.equal(memory.readUInt32LE(0x6e65c8), 0x100000);
});

test('kind1 motion leaves position unchanged and decreases vertical velocity before size growth', () => {
  const {memory, put, word} = fixture(); put(0x100088, 123); word(0x1000a2, 1); word(0x100096, 33); word(0x10009e, -10); memory[0x100095] = 127;
  advanceRawEffectParticles({memory}); assert.equal(memory.readInt32LE(0x100088), 123); assert.equal(memory.readInt16LE(0x10009e), -66); assert.equal(memory[0x100095], 159); assert.equal(memory.readUInt16LE(0x100096), 32);
});

test('type8 gravity wraps to16 before truncating7/8 damping', () => {
  const {memory, word} = fixture(); word(0x10009e, -32768); word(0x10009c, -9); memory[0x100095] = 254;
  advanceRawType8Particle(0x100000, -1, {memory}); assert.equal(memory.readInt16LE(0x10009e), 28560); assert.equal(memory.readInt16LE(0x10009c), -7); assert.equal(memory[0x100095], 2); assert.equal(memory[0x10009b], 255);
});

test('type34 uses particle address bit400 for its extra size increment', () => {
  const {memory} = fixture(); memory[0x100095] = 252; memory[0x100495] = 252;
  advanceRawType34Particle(0x100000, 64, {memory}); advanceRawType34Particle(0x100400, 63, {memory});
  assert.equal(memory[0x100095], 253); assert.equal(memory[0x100495], 254); assert.equal(memory.readInt16LE(0x10049e), -35);
});

test('fixed color blending keeps signed16 saturation, unclamped scratch and byte clamp distinct', () => {
  const {memory, put, word} = fixture(); word(0x91d404, 4096); put(0x91d3b4, 0x100000); put(0x91d3b8, -100); put(0x91d3bc, 320); memory[0x91d3ff] = 0xab;
  blendRawEffectColor({memory});
  assert.equal(memory.readInt32LE(0x91d448), 65536); assert.equal(memory.readInt16LE(0x91d408), 32767); assert.equal(memory.readInt16LE(0x91d40c), -7);
  assert.deepEqual([...memory.subarray(0x91d43c, 0x91d440)], [255, 0, 20, 0xab]); assert.deepEqual(memory.subarray(0x91d434, 0x91d438), memory.subarray(0x91d43c, 0x91d440));
});

test('debris life0 frees and reprocesses swapped ID;life3 detaches;life4 moves', () => {
  const {memory, put, word} = fixture(); put(0x902b7c, 0x46000); put(0x902b80, 0x46100); put(0x902b84, 0x110000); put(0x902b88, 4); put(0x902b8c, -1);
  for (let index = 0; index < 4; index++) {const p = 0x110000 + index * 128; word(0x46100 + index * 2, index); word(p + 8, [0, 3, 4, 1][index]); if (index === 1 || index === 2) registerRawEffectSpatial(p, 0, 0, 0, {memory});}
  put(0x110100 + 0x58, 0x12345); put(0x110100 + 0x5c, -0x8000); put(0x110100 + 0x60, 1);
  advanceRawBodyDebris({memory});
  assert.equal(memory.readUInt32LE(0x902b88), 3); assert.equal(memory.readInt32LE(0x902b8c), 0); assert.equal(memory.readUInt16LE(0x46000), 0); assert.deepEqual([0, 2, 4].map(o => memory.readUInt16LE(0x46100 + o)), [3, 1, 2]);
  assert.equal(memory.readUInt16LE(0x110188), 0); assert.equal(memory.readUInt16LE(0x110088), 2); assert.equal(memory.readUInt32LE(0x110084), 0);
  assert.equal(memory.readInt32LE(0x11014c), 0x12345); assert.equal(memory.readInt32LE(0x11015c), 0); assert.equal(memory.readUInt16LE(0x110108), 3);
});
