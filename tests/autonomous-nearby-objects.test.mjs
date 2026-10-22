import test from 'node:test';
import assert from 'node:assert/strict';
import {populateAutonomousNearbyBodies, populateAutonomousNearbyObstacles} from '../src/autonomous-nearby-objects.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), body = 0x10000, registered = 0x14000, pack = 0x20000, groups = 0x21000, points = 0x30000, registry = 0x38000, objects = 0x40000, scratchBase = 0x9000;
  memory.fill(0x7a, 0x920b40, 0x921000); memory.writeUInt32LE(pack, 0x90b98c); memory.writeUInt32LE(groups, pack + 0x60); memory.writeUInt32LE(registry, 0x849a5c);
  for (let index = 0; index < 2; index++) {
    const group = groups + index * 12; memory.writeUInt16LE(2, group); memory[group + 5] = index; memory.writeUInt32LE(points + index * 0x1000, group + 8);
    memory.writeInt16LE(100, points + index * 0x1000 + 16 + (index ? 4 : 0));
  }
  for (const address of [body, registered]) {memory.writeUInt16LE(0, address + 0x6c0); memory.writeUInt16LE(0, address + 0x6c2);}
  memory.writeUInt32LE(body, 0x909300); memory.writeUInt32LE(groups, 0x909354); memory.writeUInt32LE(0, 0x909358);
  for (let index = 0; index < 36; index++) {memory.writeUInt32LE(0xffffffff, registry + index * 8); memory[registry + index * 8 + 4] = 0;}
  const setObject = (index, position, flag = 1, type = 0) => {
    const object = objects + index * 0x200;
    position.forEach((value, axis) => memory.writeInt32LE(value << 16, object + 0x34 + axis * 4)); memory[object + 0x19a] = type;
    memory.writeUInt32LE(object, 0x920b40 + index * 12);
    if (index < 36) {memory.writeUInt32LE(object, registry + index * 8); memory[registry + index * 8 + 4] = flag;}
    return object;
  };
  return {memory, body, registered, pack, groups, points, registry, objects, scratchBase, setObject};
}
const selectedBodies = f => [...f.memory.subarray(0x920f60, 0x920f60 + f.memory[0x6e650e])];
const selectedObstacles = f => [...f.memory.subarray(0x920e80, 0x920e80 + f.memory.readUInt32LE(0x6e651c))];

test('all36 registry slots are visited and any nonzero active byte qualifies', () => {
  const f = fixture(); for (let index = 0; index < 36; index++) f.setObject(index, [index * 50, 0, 0], [1, 2, 128, 255][index % 4]);
  populateAutonomousNearbyBodies(f.body, f);
  assert.deepEqual(selectedBodies(f), Array.from({length: 36}, (_, index) => index)); assert.equal(f.memory[0x920f60 + 36], 0x7a);
});

test('body cutoff2500 is inclusive, perpendicular/zero dots pass, and rejected active entries still refresh distances', () => {
  const f = fixture(); [[2500, 0, 0], [2501, 0, 0], [-1, 0, 0], [0, 2500, 0], [0, 0, 0]].forEach((position, index) => f.setObject(index, position));
  populateAutonomousNearbyBodies(f.body, f); assert.deepEqual(selectedBodies(f), [0, 3, 4]);
  assert.equal(f.memory.readInt32LE(0x920ec4), 6255001); assert.equal(f.memory.readInt32LE(0x920ec8), 1); assert.equal(f.memory.readUInt32LE(0x920ec0 + 5 * 4), 0x7a7a7a7a);
});

test('obstacle cutoff1000 is inclusive and rejected/type5 entries retain old distances', () => {
  const f = fixture(); [[1000, 0, 0], [1001, 0, 0], [-1, 0, 0], [0, 0, 0], [0, 1000, 0]].forEach((position, index) => f.setObject(index, position, 1, index === 4 ? 5 : 0));
  f.memory.writeUInt32LE(5, 0x6e6514); populateAutonomousNearbyObstacles(f.body, f); assert.deepEqual(selectedObstacles(f), [0, 3]);
  assert.equal(f.memory.readInt32LE(0x920da0), 1000000); assert.equal(f.memory.readInt32LE(0x920da0 + 3 * 4), 0);
  for (const index of [1, 2, 4]) assert.equal(f.memory.readUInt32LE(0x920da0 + index * 4), 0x7a7a7a7a);
  assert.equal(f.memory[0x920e82], 0x7a);
});

test('inactive registry pointers remain unread and zero obstacle count preserves stale output tails', () => {
  const f = fixture(); f.memory[0x6e650e] = 99; f.memory.writeUInt32LE(99, 0x6e651c); f.memory.writeUInt32LE(0, 0x6e6514);
  populateAutonomousNearbyBodies(f.body, f); populateAutonomousNearbyObstacles(f.body, f);
  assert.deepEqual(selectedBodies(f), []); assert.deepEqual(selectedObstacles(f), []);
  assert.equal(f.memory.readUInt32LE(0x920ec0), 0x7a7a7a7a); assert.equal(f.memory.readUInt32LE(0x920da0), 0x7a7a7a7a); assert.equal(f.memory[0x920f60], 0x7a);
});

test('short coordinate subtraction wraps and negative signed squared distance survives cutoff', () => {
  const f = fixture(); f.memory.writeInt32LE(32767 << 16, f.body + 0x34); f.setObject(0, [-32768, 0, 0]); populateAutonomousNearbyBodies(f.body, f);
  assert.deepEqual(selectedBodies(f), [0]); assert.equal(f.memory.readInt32LE(0x920ec0), 1);
  const g = fixture(); g.setObject(0, [32767, 32767, 32767]); g.memory.writeUInt32LE(1, 0x6e6514);
  populateAutonomousNearbyBodies(g.body, g); populateAutonomousNearbyObstacles(g.body, g);
  assert.deepEqual(selectedBodies(g), [0]); assert.deepEqual(selectedObstacles(g), [0]); assert.equal(g.memory.readInt32LE(0x920ec0), -1073938429); assert.equal(g.memory.readInt32LE(0x920da0), -1073938429);
});

test('matching direction flags use progression route; differing flags walk the autonomous route', () => {
  const f = fixture(); f.memory.writeUInt16LE(1, f.body + 0x6c0); f.setObject(0, [100, 0, 100]); f.setObject(1, [-100, 0, -100]);
  populateAutonomousNearbyBodies(f.body, f); assert.deepEqual(selectedBodies(f), [0]);
  f.memory[f.groups + 12 + 2] = 1; populateAutonomousNearbyBodies(f.body, f); assert.deepEqual(selectedBodies(f), [1]);
  assert.deepEqual([0, 4, 8].map(offset => f.memory.readInt32LE(f.scratchBase - 12 + offset)), [0, 0, -65500]);
});

test('direction uses the registered body while distance origin remains the original caller body', () => {
  const f = fixture(); f.memory.writeUInt32LE(f.registered, 0x909300); f.memory.writeUInt16LE(1, f.registered + 0x6c0); f.memory[f.groups + 12 + 2] = 1;
  f.memory.writeInt32LE(100 << 16, f.body + 0x34); f.setObject(0, [90, 0, -10]); populateAutonomousNearbyBodies(f.body, f);
  assert.deepEqual(selectedBodies(f), [0]); assert.equal(f.memory.readInt32LE(0x920ec0), 200);
});

test('origin is captured before route direction overwrites an overlapping caller position', () => {
  const f = fixture(), aliasedBody = f.scratchBase - 0x42; f.memory.writeUInt16LE(0, aliasedBody + 0x65e); f.memory.writeInt32LE(100 << 16, aliasedBody + 0x34); f.memory.writeInt32LE(0, aliasedBody + 0x38); f.memory.writeInt32LE(0, aliasedBody + 0x3c);
  f.memory.writeUInt32LE(f.registered, 0x909300); f.setObject(0, [90, 0, 0]); populateAutonomousNearbyBodies(aliasedBody, f);
  assert.deepEqual(selectedBodies(f), []); assert.equal(f.memory.readInt32LE(0x920ec0), 100); assert.equal(f.memory.readInt16LE(aliasedBody + 0x36), -36);
});
