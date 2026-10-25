import test from 'node:test';
import assert from 'node:assert/strict';
import {raceLayoutFixture} from './lib/race-layout-fixture.mjs';
import {createCheckpointTopologyDraft, validateCheckpointTopologyDraft, compileCheckpointTopology, insertCheckpointAfter, removeCheckpoint, setFinishCheckpoint, setCheckpointTimingMarker} from '../src/checkpoint-topology.mjs';
import {parseCheckpointProgression, transitionCheckpoint, findNearestRespawnCheckpoint} from '../src/respawn-progress.mjs';
import {finishRaceProgress} from '../src/race-completion.mjs';
import {updateLapAdvance} from '../src/lap-timing.mjs';

test('checkpoint snapshot and legacy hydration preserve bytes and reject unknown/duplicate edits atomically', () => {
  const source = raceLayoutFixture(), before = Buffer.from(source), draft = createCheckpointTopologyDraft(source);
  assert.deepEqual(compileCheckpointTopology(source, draft).data, source);
  const legacy = [{id: 1, position: [193, -20, -64], direction: [0, 0, -16384]}];
  const hydrated = createCheckpointTopologyDraft(source, legacy), result = compileCheckpointTopology(source, hydrated);
  assert.equal(result.topologyChanged, false); assert.equal(result.data.readInt16LE(0x1b18), 193);
  assert.deepEqual(result.startingGridDirection, [0, 0, -16384]);
  assert.throws(() => createCheckpointTopologyDraft(source, [legacy[0], legacy[0]]), /legacy/);
  assert.throws(() => createCheckpointTopologyDraft(source, [{...legacy[0], id: 255}]), /legacy/);
  assert.deepEqual(source, before);
});

test('insert rebuilds native count, four-lane references, order and explicit progress policy, preserving opaque bits', () => {
  const source = raceLayoutFixture(), before = Buffer.from(source), base = createCheckpointTopologyDraft(source);
  source.copy(source, 0x1b28, 0x1b00, 0x1b14); source[0x1b41] = 2;
  const alternatives = createCheckpointTopologyDraft(source), draft = insertCheckpointAfter(source, alternatives, alternatives.checkpoints[0].id);
  assert.equal(draft.checkpoints[0].id, alternatives.checkpoints[0].id);
  assert.equal(draft.checkpoints[1].planes[0].timingMarker, false); assert.equal(draft.checkpoints[1].planes[1].timingMarker, false);
  const result = compileCheckpointTopology(source, draft), parsed = parseCheckpointProgression(result.data);
  assert.equal(parsed.checkpointCount44, 3); assert.deepEqual([...parsed.checkpointIds90], [0, 1, 255, 255, 2, 3, 255, 255, 4, 255, 255, 255]);
  for (let order = 0; order < 3; order++) for (const id of parsed.checkpointIds90.subarray(order * 4, order * 4 + 4)) if (id !== 255) {
    const offset = id * 20; assert.equal(parsed.checkpoints70[offset + 1], order);
    assert.equal(parsed.checkpoints70.readUInt16LE(offset + 2), Math.floor(order * 65536 / 3));
    assert.equal(parsed.checkpoints70.readUInt16LE(offset + 10), 0xdead);
    assert.equal(parsed.checkpoints70.readUInt16LE(offset + 18) & 0xfffe, 0xab00);
  }
  assert.deepEqual(result.data.subarray(0x1a00, 0x1a10), source.subarray(0x1a00, 0x1a10));
  assert.equal(before.length, source.length); assert.equal(base.checkpoints.length, 2);
});

test('finish rotation preserves cyclic relationships and deletion chooses next finish with a two-checkpoint minimum', () => {
  const source = raceLayoutFixture(), base = createCheckpointTopologyDraft(source), added = insertCheckpointAfter(source, base, base.checkpoints[0].id);
  const selected = added.checkpoints[1].id, rotated = setFinishCheckpoint(added, selected);
  assert.deepEqual(rotated.checkpoints.map(row => row.id), [selected, base.checkpoints[1].id, base.checkpoints[0].id]);
  const removed = removeCheckpoint(rotated, selected); assert.equal(removed.checkpoints[0].id, base.checkpoints[1].id);
  assert.throws(() => removeCheckpoint(removed, removed.checkpoints[0].id), /two/);
  assert.equal(compileCheckpointTopology(source, removed).info.checkpointCount, 2);
  assert.equal(base.checkpoints[0].id, 'checkpoint-0');
});

test('timing marker independently changes only low flag bit and every alternative lane', () => {
  const source = raceLayoutFixture(); source.copy(source, 0x1b28, 0x1b00, 0x1b14); source[0x1b41] = 2;
  const base = createCheckpointTopologyDraft(source), changed = setCheckpointTimingMarker(base, base.checkpoints[0].id, false);
  const output = compileCheckpointTopology(source, changed).data;
  for (let index = 0; index < source.length; index++) if (![0x1b12, 0x1b3a].includes(index)) assert.equal(output[index], source[index]);
  assert.equal(output[0x1b12], 0); assert.equal(output[0x1b3a], 0); assert.equal(base.checkpoints[0].planes[0].timingMarker, true);
});

test('invalid planes, duplicate identities, dangling templates and capacity reject before modifying source or draft', () => {
  const source = raceLayoutFixture(), before = Buffer.from(source), base = createCheckpointTopologyDraft(source);
  for (const mutate of [
    draft => {draft.checkpoints[0].planes[0].direction = [0, 0, 0];},
    draft => {draft.checkpoints[0].planes[0].position = [64, -20, 30000];},
    draft => {draft.checkpoints[0].planes[0].sourceId = 255;},
    draft => {draft.checkpoints[1].id = draft.checkpoints[0].id;},
    draft => {draft.checkpoints[0].planes[0] = null;},
    draft => {draft.checkpoints[1].planes[0].id = draft.checkpoints[0].planes[0].id;},
  ]) {const draft = structuredClone(base); mutate(draft); const prior = structuredClone(draft); assert.throws(() => compileCheckpointTopology(source, draft)); assert.deepEqual(draft, prior);}
  const large = {checkpoints: Array.from({length: 255}, (_, n) => ({id: `cp-${n}`, planes: [{...structuredClone(base.checkpoints[0].planes[0]), id: `p-${n}`}, null, null, null]}))};
  assert.equal(validateCheckpointTopologyDraft(source, large).draft.checkpoints.length, 255);
  const maximum = parseCheckpointProgression(compileCheckpointTopology(source, large).data);
  assert.equal(maximum.checkpointIds90[254 * 4], 254); assert.equal(maximum.checkpointCount44, 255);
  large.checkpoints[0].planes[1] = {...structuredClone(large.checkpoints[0].planes[0]), id: 'extra'};
  assert.throws(() => validateCheckpointTopologyDraft(source, large), /255 native/);
  assert.deepEqual(source, before);
});

test('repeated alternative lane references stay shared instead of duplicating native planes', () => {
  const source = raceLayoutFixture(); source[0x1b41] = 0;
  const base = createCheckpointTopologyDraft(source), inserted = insertCheckpointAfter(source, base, base.checkpoints[0].id);
  const parsed = parseCheckpointProgression(compileCheckpointTopology(source, inserted).data);
  assert.deepEqual([...parsed.checkpointIds90], [0, 0, 255, 255, 1, 1, 255, 255, 2, 255, 255, 255]);
});

test('new planes cannot inherit unchanged-original admission when their plane misses covered terrain', () => {
  const source = raceLayoutFixture(); source.writeInt16LE(30000, 0x1b08);
  const base = createCheckpointTopologyDraft(source); assert.deepEqual(compileCheckpointTopology(source, base).data, source);
  assert.throws(() => insertCheckpointAfter(source, base, base.checkpoints[0].id), /intersect covered terrain/);
});

test('LEV12/13 native hardcoded stage policy rejects topology but permits movement and timing', () => {
  const source = raceLayoutFixture(), base = createCheckpointTopologyDraft(source);
  for (const level of [12, 13]) {
    assert.throws(() => compileCheckpointTopology(source, setFinishCheckpoint(base, base.checkpoints[1].id), {level}), /hardcodes checkpoint stages/);
    assert.throws(() => insertCheckpointAfter(source, base, base.checkpoints[0].id, {level}), /hardcodes checkpoint stages/);
    assert.equal(compileCheckpointTopology(source, setCheckpointTimingMarker(base, base.checkpoints[0].id, false), {level}).topologyChanged, false);
  }
});

test('actual reconstructed checkpoint transition completes cycles independently of split markers and reverses finish correctly', () => {
  for (const marker of [false, true]) {
    const source = raceLayoutFixture(), base = createCheckpointTopologyDraft(source);
    let draft = insertCheckpointAfter(source, base, base.checkpoints[0].id);
    draft = setFinishCheckpoint(draft, draft.checkpoints[1].id);
    for (const row of draft.checkpoints) draft = setCheckpointTimingMarker(draft, row.id, marker);
    const data = compileCheckpointTopology(source, draft).data, pack = parseCheckpointProgression(data);
    const memory = Buffer.alloc(0x600000), address = 0x10000, bodyAddress = 0x20000, session = 0x30000;
    memory.writeUInt32LE(bodyAddress, address); memory.writeUInt32LE(session, 0x5ecb1c); memory[session + 0x58c] = 1;
    const record = {bytes: memory.subarray(address, address + 0x30c), body00: {bytes: memory.subarray(bodyAddress, bodyAddress + 0x66e)}};
    Object.defineProperty(record.body00, 'position', {get: () => [0x34, 0x38, 0x3c].map(offset => record.body00.bytes.readInt32LE(offset))});
    record.bytes[0x21] = pack.checkpointCount44 - 1;
    const runtime = {pack, session: {mode579: 0}, clock90a548: 30}; let splits = 0, finishes = 0;
    const options = {trackBasis: () => [65536, 0, 0], advanceLap: row => {splits++; updateLapAdvance(row.bytes, {body: row.body00, clock90a548: 30});},
      finishProgress: () => {finishes++; finishRaceProgress(address, {memory, scratchBase: 0x40000});}};
    for (let cycle = 0; cycle < 3; cycle++) for (let order = 0; order < pack.checkpointCount44; order++) {
      assert.equal(record.bytes[0x20], order);
      const cp = pack.checkpoints70.subarray(pack.checkpointIds90[order * 4] * 20);
      for (let axis = 0; axis < 3; axis++) record.body00.bytes.writeInt16LE(cp.readInt16LE(4 + axis * 2) + Math.sign(cp.readInt16LE(12 + axis * 2)), 0x36 + axis * 4);
      transitionCheckpoint(record, 0, runtime, options);
    }
    assert.equal(finishes, 3); assert.equal(record.bytes[0x1c], 3); assert.equal(record.bytes[0x20], 0);
    assert.equal(splits, marker ? 9 : 0);
    const nearest = findNearestRespawnCheckpoint(record, pack); assert.ok(nearest.id < 255);
    // Reverse across finish while current slot1 / previous slot0.
    record.bytes[0x20] = 1; record.bytes[0x21] = 0;
    const cp = pack.checkpoints70.subarray(pack.checkpointIds90[0] * 20);
    for (let axis = 0; axis < 3; axis++) record.body00.bytes.writeInt16LE(cp.readInt16LE(4 + axis * 2) - Math.sign(cp.readInt16LE(12 + axis * 2)), 0x36 + axis * 4);
    transitionCheckpoint(record, 0, runtime, options);
    assert.equal(record.bytes[0x20], 0); assert.equal(record.bytes[0x21], 2); assert.equal(record.bytes[0x1c], 2);
  }
});
