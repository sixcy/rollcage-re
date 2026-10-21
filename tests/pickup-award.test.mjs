import test from 'node:test';
import assert from 'node:assert/strict';
import {awardWeightedPickup, initializePickupProbabilityTables} from '../src/pickup-award.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), record = 0x909300, body = 0x20000, session = 0x60000, packetAddress = 0x70000;
  initializePickupProbabilityTables(memory);
  memory.writeUInt32LE(session, 0x5ecb1c); memory.writeUInt32LE(body, record); memory[record + 0x1d] = 1;
  memory[body + 0x68c] = 255; memory[body + 0x68d] = 255; memory.writeUInt32LE(0xffffffff, body + 0x6bc);
  memory.writeInt32LE(1, 0x5ec954); memory.fill(0xa5, packetAddress, packetAddress + 12);
  return {memory, record, body, session, packetAddress};
}
function force(memory, item, row = 0x574ee0) {memory.fill(0, row, row + 8); memory[row + item] = 100;}
function addVehicle(f, index, primary, secondary, active = false) {
  const body = 0x20000 + index * 0x2000;
  f.memory.writeUInt32LE(body, 0x909300 + index * 0x30c); f.memory[body + 0x68c] = primary; f.memory[body + 0x68d] = secondary;
  f.memory.writeUInt32LE(active ? 0x50000 + index * 4 : 0xffffffff, body + 0x6bc);
  if (active) f.memory[0x50000 + index * 4] = 1;
  f.memory[f.session + 0x54d] = Math.max(f.memory[f.session + 0x54d], index + 1);
  return body;
}
const run = (f, handlers = {}) => awardWeightedPickup(f.record, {...f, handlers});
const seedForRandom = target => {
  for (let seed = 0; seed < 65536; seed++) if ((Math.imul((Math.imul(seed, 0x41a7) & 0x7fffffff) >>> 15, 0x7fff) >>> 16) % 100 === target) return seed;
  throw Error('Missing declared test seed.');
};

test('weighted selection uses strict bucket boundaries and a single wrapped LCG step', () => {
  for (const [random, expected] of [[9, 0], [10, 1]]) {
    const f = fixture(), seed = seedForRandom(random); f.memory.writeInt32LE(seed, 0x5ec954);
    f.memory.fill(0, 0x574ee0, 0x574ee8); f.memory[0x574ee0] = 10; f.memory[0x574ee1] = 90;
    const result = run(f);
    assert.equal(result.item, expected); assert.equal(result.random, random);
    assert.equal(f.memory.readInt32LE(0x5ec954), Math.imul(seed, 0x41a7) & 0x7fffffff);
  }
});

test('rejected weight advances to the next available item without drawing another random value', () => {
  const f = fixture(); f.memory.fill(0, 0x574ee0, 0x574ee8); f.memory[0x574ee0] = 100; f.memory[0x574ee1] = 100;
  f.memory[0x903502] = 2;
  const result = run(f);
  assert.equal(result.item, 1); assert.equal(result.rejectedChoices, 1); assert.equal(result.iterations, 2);
  assert.equal(f.memory.readInt32LE(0x5ec954), 16807);
});

test('nine restricted choices fall back to item4 while zero-weight entries do not count as rejections', () => {
  const f = fixture(); force(f.memory, 3); f.memory.writeInt32LE(1, 0x90cb80);
  const result = run(f);
  assert.equal(result.item, 4); assert.equal(result.rejectedChoices, 9); assert.equal(result.iterations, 68);
  assert.equal(f.memory[f.body + 0x68d], 4);
});

test('modes1 and7 force item4 even with no free slot, while still consuming their random step', () => {
  for (const mode of [1, 7]) {
    const f = fixture(); f.memory[f.session + 0x551] = mode; f.memory[f.body + 0x68c] = 2; f.memory[f.body + 0x68d] = 3;
    const result = run(f);
    assert.equal(result.item, 4); assert.equal(result.slot, null); assert.equal(f.memory.readInt32LE(0x5ec954), 16807);
    assert.deepEqual([...f.memory.subarray(f.body + 0x68c, f.body + 0x68e)], [2, 3]);
  }
});

test('item0 counts both occupied zero-ID slots, and item2 counts at most one per vehicle', () => {
  const first = fixture(); force(first.memory, 0); addVehicle(first, 1, 0, 0);
  assert.equal(run(first).item, 4);
  const second = fixture(); force(second.memory, 2); addVehicle(second, 1, 2, 2); second.memory[0x903501] = 4;
  assert.equal(run(second).item, 2);
  const third = fixture(); force(third.memory, 2); addVehicle(third, 1, 2, 2); third.memory[0x903501] = 5;
  assert.equal(run(third).item, 4);
});

test('modes3 and8 reject a second own item2 by record identity, including a distinct record sharing the same body', () => {
  for (const mode of [3, 8]) {
    const f = fixture(); f.memory[f.session + 0x551] = mode; force(f.memory, 2, 0x574eb4);
    f.memory[f.body + 0x68c] = 2; f.memory[f.session + 0x54d] = 1;
    assert.equal(run(f).item, 4);
    const g = fixture(); g.memory[g.session + 0x551] = mode; force(g.memory, 2, 0x574eb4);
    g.memory[g.body + 0x68c] = 2; g.memory[g.session + 0x54d] = 1;
    g.memory.writeUInt32LE(g.body, 0x10000); g.memory[0x1001d] = 1; g.record = 0x10000;
    assert.equal(run(g).item, 2);
  }
});

test('item3 is unique and item7 includes the global high-byte inventory count', () => {
  const f = fixture(); force(f.memory, 3); addVehicle(f, 1, 3, 255);
  assert.equal(run(f).item, 4);
  const g = fixture(); force(g.memory, 7); g.memory[0x903503] = 1;
  assert.equal(run(g).item, 4);
});

test('item6 counts active controllers and rejects the owning record even below the global limit', () => {
  const own = fixture(); force(own.memory, 6); addVehicle(own, 0, 255, 255, true);
  assert.equal(run(own).item, 4);
  const other = fixture(); force(other.memory, 6); addVehicle(other, 1, 255, 255, true);
  assert.equal(run(other).item, 6);
  const two = fixture(); force(two.memory, 6); addVehicle(two, 1, 255, 255, true); addVehicle(two, 2, 6, 255);
  assert.equal(run(two).item, 4);
});

test('mode2 follows the backward record formula and preserves all signed distance bucket boundaries', () => {
  const f = fixture(); f.memory[f.session + 0x551] = 2; f.memory.writeUInt16LE(2, f.body + 0x65e);
  const reference = 0x90960c - 2 * 0x30c; f.memory[reference + 0x1c] = 0; f.memory.writeInt32LE(0, reference + 0x24);
  for (let row = 0; row < 4; row++) force(f.memory, [1, 4, 5, 7][row], 0x574ec0 + row * 8);
  for (const [delta, item] of [[-32768, 7], [-32767, 7], [-32766, 5], [0, 5], [1, 4], [32767, 4], [32768, 1]]) {
    f.memory.writeInt32LE(delta, f.record + 0x24); f.memory[f.body + 0x68c] = 255; f.memory[f.body + 0x68d] = 255;
    assert.equal(run(f).item, item, `delta ${delta}`);
  }
});

test('rank/difficulty and body mode8 select their exact table offsets without rank0 clamping', () => {
  const f = fixture(); f.memory[f.session + 0x551] = 5; f.memory.writeInt32LE(2, 0x6e9f68);
  force(f.memory, 5, 0x574f10 + 12 * 8); force(f.memory, 7, 0x575030);
  assert.equal(run(f).item, 5);
  f.memory[f.body + 0x68d] = 255; f.memory[f.body + 0x718] = 8;
  assert.equal(run(f).item, 7);
  f.memory[f.body + 0x68d] = 255; f.memory[f.record + 0x1d] = 0; force(f.memory, 3, 0x575028);
  assert.equal(run(f).item, 3);
});

test('network authority denial happens after selection and -1 local participant means zero', () => {
  const f = fixture(); force(f.memory, 5); f.memory.writeUInt32LE(0x81, 0x6eafe0); f.memory.writeInt32LE(-1, 0x6e9f70);
  f.memory.writeUInt16LE(1, f.body + 0x65e);
  const denied = run(f); assert.equal(denied.slot, null); assert.equal(denied.item, 5); assert.equal(f.memory.readInt32LE(0x5ec954), 16807);
  f.memory.writeUInt16LE(0, f.body + 0x65e);
  assert.equal(run(f).slot, 0x68d);
});

test('slot writes prefer secondary and preserve stale packet high bits and untouched header bytes', () => {
  for (const primary of [false, true]) {
    const f = fixture(); force(f.memory, 5); f.memory.writeUInt16LE(3, f.body + 0x65e);
    f.memory.writeUInt32LE(0x87, 0x6eafe0); f.memory.writeInt32LE(3, 0x6e9f70);
    if (primary) f.memory[f.body + 0x68d] = 2;
    f.memory.writeUInt32LE(0xdeadbeef, f.packetAddress + 8); const before = Buffer.from(f.memory.subarray(f.packetAddress, f.packetAddress + 12));
    let observed;
    const result = run(f, {call4a0420(request) {observed = request; assert.equal(f.memory[f.body + (primary ? 0x68c : 0x68d)], 5);}});
    assert.equal(result.slot, primary ? 0x68c : 0x68d); assert.equal(result.networkSent, true);
    assert.equal(observed.ecx, 1); assert.equal(observed.edx, f.packetAddress); assert.deepEqual(observed.args, [12, 18]);
    assert.equal(f.memory[f.packetAddress], 0x90); assert.deepEqual(f.memory.subarray(f.packetAddress + 1, f.packetAddress + 8), before.subarray(1, 8));
    assert.equal(f.memory.readUInt32LE(f.packetAddress + 8), ((0xdeadbeef & (primary ? 0xffff8020 : 0xffff8000)) | (5 << 10) | 3 | (primary ? 32 : 0)) >>> 0);
  }
});

test('high vehicle indices can receive an item while suppressing outgoing notification', () => {
  const f = fixture(); force(f.memory, 5); f.memory.writeUInt16LE(6, f.body + 0x65e);
  f.memory.writeUInt32LE(0x87, 0x6eafe0); f.memory.writeInt32LE(6, 0x6e9f70);
  const result = run(f); assert.equal(result.slot, 0x68d); assert.equal(result.networkSent, false);
});

test('malformed zero-probability rows require the explicit host iteration bound rather than an invented item', () => {
  const f = fixture(); f.memory.fill(0, 0x574ee0, 0x574ee8);
  assert.throws(() => awardWeightedPickup(f.record, {...f, maxIterations: 16}), /iteration bound/);
  assert.throws(() => initializePickupProbabilityTables(Buffer.alloc(10)), /exceed/);
});
