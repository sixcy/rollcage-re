import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {replayNativeBody, firstByteDivergence} from '../tools/lib/native-body-replay.mjs';

const fixture = JSON.parse(await readFile(new URL('../analysis/physics-native-body-replay-20261022-v2/body-fixtures.json', import.meta.url), 'utf8'));
test('source force and derivative routines reproduce the recorded original-process common bodies exactly', () => {
  assert.equal(fixture.authority, 'original-process-with-declared-instrumentation');
  assert.equal(fixture.targetSha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  assert.equal(fixture.cases.length, 30);
  let activeForces = 0, movingDerivatives = 0;
  for (const row of fixture.cases) {
    const before = Buffer.from(row.beforeHex, 'hex'), after = Buffer.from(row.afterHex, 'hex');
    assert.equal(before.length, 384); assert.equal(after.length, 384);
    assert.equal(createHash('sha256').update(before).digest('hex'), row.beforeSha256);
    assert.equal(createHash('sha256').update(after).digest('hex'), row.afterSha256);
    const result = replayNativeBody(row.stage, before);
    assert.deepEqual(result.body, after, `${row.stage} native ordinals ${row.beforeOrdinal}/${row.afterOrdinal}`);
    if (row.stage === 'forces' && [0x74, 0x78, 0x7c].some(p => before.readInt32LE(p) !== 0)) activeForces++;
    if (row.stage === 'derivatives' && [0x40, 0x44, 0x48].some(p => before.readInt32LE(p) !== 0)) movingDerivatives++;
  }
  assert.ok(activeForces >= 6); assert.ok(movingDerivatives >= 6);
});

test('replay rejects missing native state and reports the earliest exact byte difference', () => {
  assert.throws(() => replayNativeBody('forces', Buffer.alloc(383)), /common body/);
  assert.throws(() => replayNativeBody('unknown', Buffer.alloc(384)), /Unknown/);
  assert.throws(() => replayNativeBody('preparation', Buffer.alloc(384)), /full captured/);
  assert.throws(() => replayNativeBody('preparation', Buffer.alloc(0x3e78), {records: Buffer.alloc(256 * 72), effectFlags: {first: 1, second: 0}}), /does not mock/);
  assert.deepEqual(firstByteDivergence(Buffer.from([0, 1, 2]), Buffer.from([0, 4, 3])), {offset: 1, offsetHex: '0x1', nativeByte: 1, javascriptByte: 4});
});
