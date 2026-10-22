import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPickupSpecialCandidates, appendObjectSpecialCandidates, appendMarkerSpecialCandidates,
  scoreAutonomousSpecialCandidate, specialCandidateRouteCost} from '../src/autonomous-special-candidates.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), body = 0x10000, free = 0x20000, pack = 0x30000, resource = 0x31000, groups = 0x32000, points = 0x33000;
  const list = 0x40000, objects = 0x41000, rows = 0x43000, markers = 0x44000, meta = 0x45000, frames = 0x46000, descriptor = 0x47000, scratchBase = 0x9000;
  memory.writeUInt32LE(pack, 0x90b98c); memory.writeUInt32LE(resource, 0x90b990); memory.writeUInt32LE(resource, pack + 8); memory.writeUInt32LE(groups, pack + 0x60); memory.writeUInt32LE(points, groups + 20);
  memory.writeUInt32LE(0x700, points + 8); memory.writeUInt32LE(rows, resource + 0xec); memory.writeUInt32LE(markers, resource + 0xe4); memory[resource + 0xf5] = 1;
  memory.writeUInt32LE(list, 0x902020); memory.writeInt32LE(1, 0x902024); memory.writeUInt32LE(1, 0x82e904); memory.writeInt32LE(18, free);
  memory.writeUInt32LE(0x80c, body + 0x6ec); memory[body + 0x68c] = 255; memory.writeUInt32LE(descriptor, body + 0x10); memory.writeUInt16LE(32, descriptor + 0x32); memory.writeInt16LE(100, body + 0x668);
  const source = 0x91f1e0 + 19 * 52, destination = 0x91f1e0 + 18 * 52;
  memory.writeUInt16LE(1, source); memory.writeInt32LE(65536, source + 16); memory.writeInt32LE(13, source + 48); memory.writeInt32LE(2, destination + 44); memory.writeInt32LE(3, destination + 48);
  memory.writeUInt32LE(meta, rows + 4); memory.writeUInt32LE(frames, meta + 0x194); memory[meta + 0x192] = 0x5a;
  const setPosition = (index, x, y = 0, z = 0) => {
    const object = objects + index * 0x300, row = rows + index * 20, marker = markers + index * 20;
    memory.writeUInt32LE(object, list + index * 4); memory.writeUInt16LE(0x81, object + 0x182); memory.writeUInt16LE(1, object + 0x18c);
    [x, y, z].forEach((value, axis) => memory.writeInt32LE(value << 16, object + 0x34 + axis * 4));
    memory.writeUInt32LE(object, row); memory.writeUInt32LE(meta, row + 4); [x, y, z].forEach((value, axis) => memory.writeInt16LE(value, row + 8 + axis * 2)); memory[row + 18] = 1;
    [x, y, z].forEach((value, axis) => memory.writeInt16LE(value, marker + axis * 2)); memory[marker + 18] = 1;
  };
  setPosition(0, 500);
  const calls = [], handlers = {call411fa0: request => {calls.push(['position', request]); return 7;}, call4126d0: request => {calls.push(['obstacle', request]); return 11;}};
  return {memory, body, free, pack, resource, groups, points, list, objects, rows, markers, meta, frames, descriptor, source, destination, scratchBase, handlers, calls, setPosition};
}
const variants = [[appendPickupSpecialCandidates, 3, 51], [appendObjectSpecialCandidates, 4, 34], [appendMarkerSpecialCandidates, 5, 50]];

test('each special modifier appends its native type, coordinates and score without resetting the destination row', () => {
  for (const [append, code, score] of variants) {
    const f = fixture(); append(f.body, f.free, f);
    assert.equal(f.memory.readInt32LE(f.free), 17); assert.equal(f.memory[0x6e650f], 1); assert.equal(f.memory[0x91f1c0], 31);
    assert.deepEqual([0, 2, 4].map(offset => f.memory.readInt16LE(0x91f600 + offset)), [500, 0, 0]);
    assert.equal(f.memory[f.destination + 37], code); assert.equal(f.memory.readUInt16LE(f.destination), 0);
    assert.equal(f.memory.readInt32LE(f.destination + 44), score); assert.equal(f.memory.readInt32LE(f.destination + 48), 16);
    if (code === 4) assert.equal(f.memory[f.destination + 3], 0x5a);
  }
});

test('body permissions, full target table and no free candidate row return without insertion', () => {
  for (const [append] of variants) for (const blocked of ['flags', 'target', 'free']) {
    const f = fixture(); if (blocked === 'flags') f.memory.writeUInt32LE(0, f.body + 0x6ec); else if (blocked === 'target') f.memory[0x6e650f] = 20; else f.memory.writeInt32LE(-1, f.free);
    append(f.body, f.free, f); assert.equal(f.calls.length, 0); assert.equal(f.memory[f.destination + 37], 0);
  }
  const f = fixture(); f.memory[f.body + 0x68c] = 4; f.memory[f.body + 0x68d] = 4; appendPickupSpecialCandidates(f.body, f.free, f); assert.equal(f.calls.length, 0);
});

test('point annotations and source object flags gate pickup candidates', () => {
  for (const blocked of ['point', 'occupiedRow', 'object', 'route']) {
    const f = fixture(); if (blocked === 'point') f.memory.writeUInt32LE(0, f.points + 8); else if (blocked === 'occupiedRow') f.memory[f.source + 38] = 1; else if (blocked === 'object') f.memory.writeUInt16LE(0x80, f.objects + 0x182); else f.memory.writeUInt16LE(2, f.objects + 0x18c);
    appendPickupSpecialCandidates(f.body, f.free, f); assert.equal(f.calls.length, 0);
  }
});

test('object metadata type5 is excluded while other low-nibble types preserve metadata byte192', () => {
  const f = fixture(); f.memory[f.frames + 3] = 0xa5; appendObjectSpecialCandidates(f.body, f.free, f); assert.equal(f.calls.length, 0);
  f.memory[f.frames + 3] = 0xa6; appendObjectSpecialCandidates(f.body, f.free, f); assert.equal(f.memory[f.destination + 3], 0x5a);
});

test('pickup and marker passes exclude distances below300 while object pass permits them', () => {
  for (const [append, code] of variants) {
    const f = fixture(); f.setPosition(0, 299); append(f.body, f.free, f); assert.equal(f.memory[0x6e650f], code === 4 ? 1 : 0);
    const g = fixture(); g.setPosition(0, 1501); append(g.body, g.free, g); assert.equal(g.memory[0x6e650f], 0);
  }
});

test('score discounts use integer quarter subtraction beyond1000 units', () => {
  for (const [append, code, expected] of [[appendPickupSpecialCandidates, 3, 44], [appendObjectSpecialCandidates, 4, 28], [appendMarkerSpecialCandidates, 5, 43]]) {
    const f = fixture(); f.setPosition(0, 1100); append(f.body, f.free, f); assert.equal(f.memory[f.destination + 37], code); assert.equal(f.memory.readInt32LE(f.destination + 44), expected);
  }
});

test('object pass snapshots body position while pickup and marker passes reread it for later objects', () => {
  for (const [append, code] of variants) {
    const f = fixture(); f.setPosition(1, 600); f.memory.writeInt32LE(2, 0x902024); f.memory.writeUInt32LE(2, 0x82e904); f.memory[f.resource + 0xf5] = 2;
    f.handlers.call411fa0 = () => {f.memory.writeInt32LE(1000 << 16, f.body + 0x34); return 7;};
    append(f.body, f.free, f); assert.equal(f.memory[0x6e650f], code === 4 ? 2 : 1);
  }
});

test('zero-distance object input retains the native division failure instead of inventing a score', () => {
  const f = fixture(); f.setPosition(0, 0); assert.throws(() => appendObjectSpecialCandidates(f.body, f.free, f), /IDIV by zero/);
});

test('special score captures body coordinates and conditionally adds obstacle cost', () => {
  const f = fixture(); f.memory[f.destination + 2] = 2; f.memory.writeInt32LE(-123 << 16, f.body + 0x34);
  assert.equal(scoreAutonomousSpecialCandidate(f.body, 18, 1, f), 18);
  assert.equal(f.calls[0][1].edx, f.scratchBase - 12); assert.equal(f.calls[0][1].args[0], 0x91f610);
  assert.equal(f.memory.readInt16LE(f.scratchBase - 12), -123); assert.equal(f.calls[1][0], 'obstacle');
  const g = fixture(); assert.equal(scoreAutonomousSpecialCandidate(g.body, 18, 0, g), 7); assert.equal(g.calls.length, 1);
});

test('route cost retains the previous row relation and overwrites the caller body argument with radius', () => {
  const f = fixture(); assert.equal(specialCandidateRouteCost(0x91f600, 99, 19, f.body, f), 13); assert.equal(f.calls.length, 0);
  assert.equal(f.memory.readUInt32LE(f.scratchBase + 8), 32);
  f.memory.writeUInt16LE(1, f.destination); f.memory.writeInt32LE(100, f.destination + 48);
  assert.equal(specialCandidateRouteCost(0x91f600, 99, 19, f.body, f), 107);
  assert.equal(f.calls[0][1].edx, 0x91f600); assert.equal(f.calls[0][1].args[0], f.scratchBase - 12); assert.equal(f.calls[0][1].args[3], 99);
});
