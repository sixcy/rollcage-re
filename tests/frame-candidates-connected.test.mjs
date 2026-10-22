import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {createConnectedFrameCandidateFixture} from '../tools/lib/frame-candidate-runtime-fixtures.mjs';

test('terrain writes beyond the64 count survive in fields untouched by later model writes', () => {
  const f = createConnectedFrameCandidateFixture(17); buildFrameCandidates(f.bodies, f.options);
  assert.equal(f.bodies[0].terrainWord15c, 64); assert.equal(f.bodies[0].modelCandidateCount15e, 9);
  const model = f.views.candidateAt(f.addresses.arena + f.bodies[0].modelCandidateOffset158);
  assert.equal(model.type, 1); assert.equal(model.columns, 12); assert.equal(model.byte2, 0xa5); assert.equal(model.flagsByte0 & 0xf0, 0xa0);
  assert.ok(f.memory.readUInt32LE(f.addresses.arena + 400 * 16 + 12) >= f.addresses.vertices);
});

test('native terrain-count model cursor permits later bodies to overwrite an earlier model view', () => {
  const f = createConnectedFrameCandidateFixture(8); buildFrameCandidates(f.bodies, f.options);
  const [first, second] = f.bodies; assert.equal(first.terrainWord15c, 0); assert.ok(first.modelCandidateCount15e > 0); assert.equal(first.modelCandidateOffset158, second.modelCandidateOffset158);
  const record = f.views.candidateAt(f.addresses.arena + first.modelCandidateOffset158);
  assert.equal(record.settings.placementIndex, 1); assert.equal(record.settings, f.models.instances.get(1).settings);
});

test('actual sparse spatial fallback plus prior outside registration sets state16 but still builds models', () => {
  const f = createConnectedFrameCandidateFixture(99), result = buildFrameCandidates(f.bodies, f.options), body = f.bodies[1];
  assert.equal(result.reports[1].skipped, 'outside_stays_outside'); assert.equal(body.collisionState128, 16); assert.equal(body.terrainWord15c, 0); assert.ok(body.modelCandidateCount15e > 0);
});

test('signed aggregate index reads the retained byte before collision IDs through raw views', () => {
  const f = createConnectedFrameCandidateFixture(31), body = f.bodies[0]; buildFrameCandidates(f.bodies, f.options);
  assert.equal(body.collisionCount10c, 255); assert.equal(body.collisionIds[-1], 2);
  assert.deepEqual([8, 12, 16].map(offset => f.memory.readInt32LE(f.addresses.records + 2 * 72 + offset)), body.position.map(value => value >> 8));
  assert.equal(f.memory.readInt32LE(f.addresses.records + 72 + 8), 0);
});

test('type17 radius changes are visible directly in the same native shape records', () => {
  const f = createConnectedFrameCandidateFixture(3), body = f.bodies[2]; buildFrameCandidates(f.bodies, f.options);
  assert.equal(body.flags & 511, 17); assert.equal(f.memory.readInt32LE(f.addresses.records + body.collisionIds[0] * 72 + 0x40), 0x1900); assert.equal(f.memory.readInt32LE(f.addresses.records + body.collisionIds[1] * 72 + 0x40), 0x5000);
  const candidate = f.views.candidateAt(f.addresses.arena + body.terrainCandidateOffset154); assert.equal(candidate.address, f.memory.readUInt32LE(body.address + 0x154));
});
