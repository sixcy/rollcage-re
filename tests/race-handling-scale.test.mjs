import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRaceHandlingScale} from '../src/race-handling-scale.mjs';

function fixture(count = 3) {
  const memory = Buffer.alloc(0xa00000), session = 0x50000, scratchBase = 0x9000, ranks = scratchBase - 0x20;
  memory.writeUInt32LE(session, 0x5ecb1c); memory[session + 0x54d] = count; memory[session + 0xa87] = 1;
  const records = [], bodies = [];
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c, body = 0x10000 + index * 0x4000;
    records.push(record); bodies.push(body); memory.writeUInt32LE(body, record); memory[record + 0x1d] = index + 1;
    memory.writeInt32LE(0x12345678, body + 0x6e0); memory.writeUInt32LE(0xdeadbeef, body + 0x2f38);
    memory.writeUInt32LE(record, ranks + (index + 1) * 4);
  }
  return {memory, session, scratchBase, ranks, records, bodies};
}
const run = f => updateRaceHandlingScale(f);

test('disabled tuning and mode4 restore the packed neutral handling fields without touching gap', () => {
  for (const disabled of [true, false]) {
    const f = fixture(2); if (disabled) f.memory[f.session + 0xa87] = 0; else f.memory[f.session + 0x551] = 4;
    run(f);
    for (const body of f.bodies.slice(0, 2)) {assert.equal(f.memory.readUInt32LE(body + 0x2f38), 0x10000040); assert.equal(f.memory.readInt32LE(body + 0x6e0), 0x12345678);}
    assert.equal(f.memory.readUInt32LE(f.bodies[2] + 0x2f38), 0xdeadbeef);
  }
});

test('zero participant count leaves caller rank slots and bodies intact', () => {
  const f = fixture(0), before = Buffer.from(f.memory); run(f);
  assert.deepEqual(f.memory.subarray(0x10000, 0x28000), before.subarray(0x10000, 0x28000));
  assert.deepEqual(f.memory.subarray(f.ranks, f.ranks + 28), before.subarray(f.ranks, f.ranks + 28));
  assert.equal(f.memory.readUInt32LE(f.scratchBase - 0x24), 0);
});

test('rank order chooses the leader and applies the signed8192 threshold', () => {
  const f = fixture(3); f.memory[f.records[0] + 0x1d] = 3; f.memory[f.records[1] + 0x1d] = 1; f.memory[f.records[2] + 0x1d] = 2;
  f.memory.writeInt32LE(10000, f.records[1] + 0x24); f.memory.writeInt32LE(1808, f.records[2] + 0x24); f.memory.writeInt32LE(1807, f.records[0] + 0x24);
  run(f);
  assert.deepEqual(f.bodies.slice(0, 3).map(body => f.memory.readInt32LE(body + 0x6e0)), [8193, 0, 8192]);
  assert.deepEqual(f.bodies.slice(0, 3).map(body => f.memory.readUInt16LE(body + 0x2f3a)), [0x1400, 0x1000, 0x1400]);
  assert.equal(f.memory.readUInt16LE(f.bodies[2] + 0x2f38), 0x40);
});

test('finished entries compact in place and leave excluded body fields untouched', () => {
  const f = fixture(3); f.memory[f.records[0] + 0x249] = 1; f.memory[f.records[2] + 0x249] = 3;
  f.memory.writeInt32LE(7777, f.records[0] + 0x24); run(f);
  assert.equal(f.memory.readUInt32LE(f.ranks + 4), f.records[1]); assert.equal(f.memory.readUInt32LE(f.ranks + 8), 0); assert.equal(f.memory.readUInt32LE(f.ranks + 12), 0);
  assert.equal(f.memory.readUInt32LE(f.scratchBase - 0x24), 2);
  assert.equal(f.memory.readUInt32LE(f.bodies[0] + 0x2f38), 0xdeadbeef); assert.equal(f.memory.readUInt32LE(f.bodies[2] + 0x2f38), 0xdeadbeef);
  assert.equal(f.memory.readInt32LE(f.bodies[1] + 0x6e0), 0);
});

test('all finished participants leave all handling and gap fields unchanged', () => {
  const f = fixture(3); for (const record of f.records.slice(0, 3)) f.memory[record + 0x249] = 1;
  run(f); assert.equal(f.memory.readUInt32LE(f.scratchBase - 0x24), 3);
  for (const body of f.bodies.slice(0, 3)) assert.equal(f.memory.readUInt32LE(body + 0x2f38), 0xdeadbeef);
});

test('duplicate ranks retain stale slots and can select a record outside the active prefix', () => {
  const f = fixture(2); f.memory[f.records[1] + 0x1d] = 1; f.memory.writeUInt32LE(f.records[2], f.ranks + 8);
  f.memory.writeInt32LE(10, f.records[1] + 0x24); f.memory.writeInt32LE(11, f.records[2] + 0x24); run(f);
  assert.equal(f.memory.readUInt32LE(f.bodies[0] + 0x2f38), 0xdeadbeef);
  assert.equal(f.memory.readInt32LE(f.bodies[2] + 0x6e0), -1); assert.equal(f.memory.readUInt16LE(f.bodies[2] + 0x2f3a), 0xfff);
});

test('negative gaps retain native shift wrap before fixed division', () => {
  for (const [gap, expected] of [[-32768, 0], [-32769, 0x1fff], [-1, 0xfff]]) {
    const f = fixture(2); f.memory.writeInt32LE(-gap, f.records[1] + 0x24); run(f);
    assert.equal(f.memory.readInt32LE(f.bodies[1] + 0x6e0), gap); assert.equal(f.memory.readUInt16LE(f.bodies[1] + 0x2f3a), expected);
  }
});

test('lap/progress subtraction wraps to signed32 and live participant count can end the output loop', () => {
  const f = fixture(2), aliasedBody = f.session + 0x54d - 0x6e0;
  f.memory.writeUInt32LE(aliasedBody, f.records[0]); f.memory.writeInt32LE(-0x80000000, f.records[0] + 0x24); f.memory.writeInt32LE(0x7fffffff, f.records[1] + 0x24);
  run(f); assert.equal(f.memory[f.session + 0x54d], 0); assert.equal(f.memory.readUInt16LE(aliasedBody + 0x2f3a), 0x1000);
  assert.equal(f.memory.readUInt32LE(f.bodies[1] + 0x2f38), 0xdeadbeef);
  const g = fixture(2); g.memory.writeInt32LE(-0x80000000, g.records[0] + 0x24); g.memory.writeInt32LE(0x7fffffff, g.records[1] + 0x24); run(g);
  assert.equal(g.memory.readInt32LE(g.bodies[1] + 0x6e0), 1);
});
