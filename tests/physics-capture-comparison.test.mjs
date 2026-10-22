import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {comparePhysicsCaptures, loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';

const capture = (...values) => ({header: {executableSha256: 'a'.repeat(64)}, snapshots: values.map((bytes, index) => ({breakpointId: 'forces', hit: index + 1, ranges: new Map([['body', {bytes}]])}))});
const field = {name: 'momentum.x', range: 'body', offset: 0, type: 's32'};
const word = value => {const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes;};

test('comparison reports first differing ordered stage and fixed-point field exactly', () => {
  const result = comparePhysicsCaptures(capture(word(10), word(20), word(30)), capture(word(10), word(21), word(31)), [field]);
  assert.equal(result.matched, false); assert.equal(result.comparedFields, 2);
  assert.deepEqual(result.firstDivergence, {snapshot: 2, kind: 'field', stage: 'forces', hit: 2, field: 'momentum.x', range: 'body', offset: 0, reference: 20, candidate: 21, referenceBytes: '14000000', candidateBytes: '15000000'});
  assert.equal(comparePhysicsCaptures(capture(word(10)), capture(word(10)), [field]).matched, true);
});

test('missing or reordered stages cannot produce a match', () => {
  const a = capture(word(1)), b = capture(word(1)); b.snapshots[0].breakpointId = 'integration';
  assert.equal(comparePhysicsCaptures(a, b, [field]).firstDivergence.kind, 'stage-order');
  assert.equal(comparePhysicsCaptures(capture(word(1), word(2)), a, [field]).firstDivergence.kind, 'missing-stage');
});

test('floats compare representations by default and require explicit justified tolerance', () => {
  const a = word(0), b = word(-2147483648), policy = {...field, type: 'f32'};
  assert.equal(comparePhysicsCaptures(capture(a), capture(b), [policy]).matched, false);
  const f = x => {const data = Buffer.alloc(4); data.writeFloatLE(x); return data;};
  assert.throws(() => comparePhysicsCaptures(capture(f(1)), capture(f(1.01)), [{...policy, absoluteTolerance: 0.1}]), /evidence reason/);
  assert.equal(comparePhysicsCaptures(capture(f(1)), capture(f(1.01)), [{...policy, absoluteTolerance: 0.02, toleranceReason: 'Synthetic test policy, no native evidence claim.'}]).matched, true);
  const nan1 = word(0x7fc00001), nan2 = word(0x7fc00002);
  assert.equal(comparePhysicsCaptures(capture(nan1), capture(nan2), [{...policy, absoluteTolerance: 1, toleranceReason: 'Synthetic'}]).matched, false);
});

test('pointer comparisons use only explicitly named regions and reject unknown or ambiguous pointers', () => {
  const policy = {...field, type: 'pointer'}, a = capture(word(0x1234)), b = capture(word(0x2234));
  const maps = {referencePointers: [{id: 'body0', address: 0x1200, length: 0x100}], candidatePointers: [{id: 'body0', address: 0x2200, length: 0x100}]};
  assert.equal(comparePhysicsCaptures(a, b, [policy], maps).matched, true);
  assert.throws(() => comparePhysicsCaptures(a, b, [policy]), /exactly one/);
  assert.throws(() => comparePhysicsCaptures(a, b, [policy], {...maps, referencePointers: [...maps.referencePointers, ...maps.referencePointers]}), /exactly one/);
});

test('comparison refuses omitted fields, absent ranges, mismatched identity and out-of-range offsets', () => {
  const a = capture(word(1)), b = capture(word(1));
  assert.throws(() => comparePhysicsCaptures(a, b, []), /nonempty/);
  assert.throws(() => comparePhysicsCaptures(a, b, [{...field, range: 'missing'}]), /Missing/);
  assert.throws(() => comparePhysicsCaptures(a, b, [{...field, offset: 2}]), /exceeds/);
  b.header.executableSha256 = 'b'.repeat(64);
  assert.throws(() => comparePhysicsCaptures(a, b, [field]), /identities/);
});

test('capture loader checks target, completion, state hashes and traversal before replay', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'redux-capture-')), context = Buffer.alloc(716), data = word(123);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(dir, 'context.bin'), context); await writeFile(path.join(dir, 'body.bin'), data);
  const rows = [{type: 'capture', schemaVersion: 1, executableSha256: 'a'.repeat(64)}, {type: 'snapshot', ordinal: 1, breakpointId: 'forces', hit: 1, contextFile: 'context.bin', contextSha256: hash(context), ranges: [{id: 'body', file: 'body.bin', length: 4, sha256: hash(data)}]}, {type: 'complete', snapshots: 1}];
  const save = () => writeFile(path.join(dir, 'trace.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await save(); assert.equal((await loadPhysicsCapture(dir)).snapshots[0].ranges.get('body').bytes.readInt32LE(), 123);
  await assert.rejects(loadPhysicsCapture(dir, {expectedSha256: 'b'.repeat(64)}), /hash differs/);
  await writeFile(path.join(dir, 'body.bin'), word(124)); await assert.rejects(loadPhysicsCapture(dir), /hash differs/);
  rows[1].ranges[0].file = '../body.bin'; await save(); await assert.rejects(loadPhysicsCapture(dir), /filename/);
  rows.pop(); await save(); await assert.rejects(loadPhysicsCapture(dir), /completion/);
});
