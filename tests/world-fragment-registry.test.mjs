import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeWorldFragmentTemplates, initializeWorldFragments, activateWorldFragment, maintainWorldFragments, recordWorldFragmentImpact} from '../src/world-fragment-registry.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v, p);
  initializeWorldFragmentTemplates(memory); put(0x902eec, 0x100000); put(0x90b98c, 0x30000); put(0x30018, 0x31000); put(0x30058, 0x32000);
  for (let index = 0; index < 3; index++) {const model = 0x20000 + index * 0x1000; put(0x31000 + index * 4, model); word(0x32002 + index * 2, index); word(model + 0x32, 1000);}
  put(0x909254, 0x40000); put(0x909278, 0x45000);
  for (let row = 0; row < 256; row++) {word(0x40000 + row * 16, 0xff00); word(0x40002 + row * 16, 255); put(0x4000c + row * 16, 0x43000);}
  put(0x91e79c, 0x180000); put(0x91e780, 0x190000); put(0x91e78c, 0x190100); put(0x91e790, 0x190200); put(0x91e794, 255); put(0x91e784, -1); put(0x902bc0, 0x170000);
  for (let index = 0; index < 256; index++) memory[0x190000 + index] = index;
  const allocations = [], addresses = [0x60000, 0x62000, 0x64000];
  initializeWorldFragments({memory, scratchBase: 0x9000, allocate: size => {allocations.push(size); return addresses[allocations.length - 1];}});
  put(0x70000, 10 << 16); put(0x70004, 20 << 16); put(0x70008, 30 << 16); put(0x70100, -123); put(0x70104, 456); put(0x70108, 789);
  put(0x6e65b4, 0x130000); put(0x902b7c, 0x71000); put(0x902b80, 0x71200); put(0x902b84, 0x140000); put(0x902b8c, -1); put(0x5ec958, 1); put(0x9153d8, 0x0700aaff);
  return {memory, put, allocations};
}

test('fragment initialization allocates36 separate bodies in4/8/24 model groups and clears pool rows', () => {
  const {memory, allocations} = fixture(); assert.deepEqual(allocations, [0x120, 0x2a0, 0x2000]);
  for (let index = 0; index < 36; index++) {
    const body = memory.readUInt32LE(0x849980 + index * 4);
    assert.equal(memory.readUInt32LE(body + 0x10), 0x20000 + (index < 4 ? 2 : index < 12 ? 1 : 0) * 0x1000);
    assert.equal(memory.readUInt32LE(body + 4), 0); assert.equal(memory[0x849940 + index], 0);
  }
  assert.deepEqual(memory.subarray(0x60000, 0x60120), Buffer.alloc(0x120)); assert.equal(memory.readUInt32LE(0x6208c), 0x64000); assert.equal(memory.readUInt32LE(0x62284), 0x65800);
});

test('fragment activation uses size fallback, low-byte tag and momentum shift before shape publication', () => {
  const {memory} = fixture(); memory.fill(1, 0x849940, 0x849944);
  activateWorldFragment(0x70000, 0x70100, 2, 0x1234, {memory}); const body = memory.readUInt32LE(0x60000);
  assert.equal(memory[0x60005], 4); assert.equal(memory[0x60006], 2); assert.equal(memory[0x60007], 0x34); assert.equal(memory[0x60004], 64);
  assert.equal(memory.readInt32LE(body + 0x40), -123 << 8); assert.equal(memory.readUInt32LE(body + 0x164), 0x60000); assert.equal(memory.readUInt32LE(body + 0x148), 0x4810b0);
  assert.equal(memory[body + 0x10c], 3); assert.equal(memory.readInt32LE(0x91e798), 4); assert.equal(memory.readUInt32LE(0x6e6bcc), 1);
});

test('occupied captured row cycles cursor28 times without searching another empty registry row', () => {
  const {memory, put} = fixture(); put(0x6e6bcc, 17); memory[0x60000 + 17 * 8 + 4] = 1;
  activateWorldFragment(0x70000, 0x70100, 0, 0, {memory});
  assert.equal(memory.readUInt32LE(0x6e6bcc), 17); assert.equal(memory.readUInt32LE(0x60000), 0); assert.equal(memory.readInt32LE(0x91e798), 0);
});

test('invalid selector and exhausted availability leave cursor and registry untouched', () => {
  const {memory} = fixture(); activateWorldFragment(0x70000, 0x70100, 4, 0, {memory}); assert.equal(memory.readUInt32LE(0x6e6bcc), 0);
  memory.fill(1, 0x849940, 0x84995c); activateWorldFragment(0x70000, 0x70100, 3, 0, {memory}); assert.equal(memory.readUInt32LE(0x6e6bcc), 0); assert.equal(memory[0x60004], 0);
});

test('maintenance uses incoming age for flags and resets impact measure below exact class threshold', () => {
  const {memory, put} = fixture(); activateWorldFragment(0x70000, 0x70100, 0, 0, {memory}); const body = memory.readUInt32LE(0x60000);
  memory[0x60004] = 62; memory.writeUInt16LE(699, body + 0x160); put(0x90a548, 0);
  maintainWorldFragments({memory, scratchBase: 0x9000}); assert.equal(memory[0x60004], 61); assert.equal(memory.readUInt32LE(body) & 511, 21); assert.equal(memory.readUInt16LE(body + 0x160), 0); assert.equal(memory.readUInt32LE(0x6e6bc8), 1);
});

test('retiring large fragment splits into two live medium rows and visits them in the same ascending scan', () => {
  const {memory} = fixture(); activateWorldFragment(0x70000, 0x70100, 2, 0, {memory}); memory[0x60004] = 1;
  maintainWorldFragments({memory, scratchBase: 0x9000});
  assert.equal(memory[0x60004], 0); assert.equal(memory[0x6000c], 63); assert.equal(memory[0x60014], 63); assert.equal(memory[0x6000e], 2); assert.equal(memory[0x60016], 2);
  assert.equal(memory.readUInt32LE(0x6e6bc8), 3); assert.equal(memory.readUInt16LE(0x902bc4), 2); assert.equal(memory.readUInt32LE(0x91e798), 8);
  const first = memory.readUInt32LE(0x60008), second = memory.readUInt32LE(0x60010);
  assert.equal(memory.readInt32LE(first + 0x34), (10 << 16) + 0x300000); assert.equal(memory.readInt32LE(second + 0x34), (10 << 16) - 0x300000);
});

test('fragment collision callback stores low16 of squared differences in signed velocity high words', () => {
  const memory = Buffer.alloc(0x1000), body = 0x100, other = 0x400;
  memory.writeInt16LE(-32768, body + 0x6a); memory.writeInt16LE(32767, other + 0x6a); memory.writeInt16LE(10, body + 0x6e); memory.writeInt16LE(-20, other + 0x6e);
  assert.equal(recordWorldFragmentImpact(body, other, {memory}), 1); assert.equal(memory.readUInt16LE(body + 0x160), (Math.imul(-65535, -65535) + 900) & 65535);
  assert.equal(recordWorldFragmentImpact(body, 0, {memory}), 1); assert.equal(memory.readUInt16LE(body + 0x160), 901);
});
