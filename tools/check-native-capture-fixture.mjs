import assert from 'node:assert/strict';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';

const [fixtureDirectory, output, selection = 'normal,bounded'] = process.argv.slice(2);
if (!fixtureDirectory || !output) throw Error('Usage: node tools/check-native-capture-fixture.mjs FIXTURE_DIRECTORY NEW_REPORT_DIRECTORY');
const modes = selection.split(',');
if (!modes.length || modes.some(mode => !['normal', 'bounded', 'filtered', 'matching-window', 'pending-frame', 'pending-filtered', 'thread-environment', 'pending-thread-environment'].includes(mode)) || new Set(modes).size !== modes.length) throw Error('Expected distinct normal/bounded/filtered/matching-window/pending-frame/pending-filtered/thread-environment/pending-thread-environment modes.');
const expected = JSON.parse(await readFile(path.join(fixtureDirectory, 'expected.json'), 'utf8'));
const config = JSON.parse(await readFile(path.join(fixtureDirectory, 'capture-config.json'), 'utf8'));
const reports = [];
for (const mode of modes) {
  const pendingMode = ['pending-frame', 'pending-filtered', 'pending-thread-environment'].includes(mode), threadMode = mode.includes('thread-environment');
  const directory = path.join(fixtureDirectory, `${mode}-capture`), target = expected[mode.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
  const modeConfig = pendingMode || threadMode ? JSON.parse(await readFile(path.join(fixtureDirectory, `${mode}-config.json`), 'utf8')) : config;
  const capture = await loadPhysicsCapture(directory, {expectedSha256: modeConfig.expectedSha256});
  const trace = (await readFile(path.join(directory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const counters = capture.snapshots.map(row => row.ranges.get('counter').bytes.readUInt32LE());
  if (target.counters) assert.deepEqual(counters, target.counters);
  assert.equal(capture.complete.reason, target.completeReason);
  assert.equal(capture.snapshots.length, target.snapshots);
  if (mode === 'filtered') {
    const skipped = trace.filter(row => row.type === 'observation-skipped');
    assert.deepEqual(skipped.map(row => row.rawHit), target.skippedRawHits);
    assert.deepEqual(skipped.map(row => row.actualPredicateBytesHex), target.actualSkippedPredicateBytesHex);
    assert.deepEqual(capture.snapshots.map(row => row.hit), target.snapshotHits);
    assert.deepEqual(capture.snapshots.map(row => row.rawHit), target.snapshotRawHits);
    assert.ok(capture.snapshots.every(row => row.captureWhen.actualBytesHex === row.captureWhen.equalsBytesHex));
  }
  if (mode === 'matching-window') {
    const skipped = trace.filter(row => row.type === 'observation-skipped');
    assert.equal(skipped.length, 2);
    assert.ok(skipped.every(row => row.reason === 'matching-hit-window' && row.skipMatchingHits === 2 && row.actualPredicateBytesHex === '00000000' && row.expectedPredicateBytesHex === '00000000'));
    assert.deepEqual(skipped.map(row => row.rawHit), target.skippedRawHits);
    assert.deepEqual(skipped.map(row => row.matchingHit), target.skippedMatchingHits);
    assert.deepEqual(capture.snapshots.map(row => row.hit), target.snapshotHits);
    assert.deepEqual(capture.snapshots.map(row => row.rawHit), target.snapshotRawHits);
    assert.deepEqual(capture.snapshots.map(row => row.matchingHit), target.snapshotMatchingHits);
    assert.deepEqual(counters, [3]);
    assert.ok(capture.snapshots.every(row => row.captureWhen.actualBytesHex === '00000000' && row.captureWhen.equalsBytesHex === '00000000'));
  }
  if (pendingMode) {
    assert.deepEqual(capture.snapshots.map(row => row.hit), target.snapshotHits);
    assert.deepEqual(capture.snapshots.map(row => row.rawHit), target.snapshotRawHits);
    assert.deepEqual(capture.snapshots.map(row => row.matchingHit), target.snapshotMatchingHits);
    assert.deepEqual(trace.filter(row => row.type === 'pending-frame-started').map(row => row.candidateIndex), [1, 2]);
    const discarded = trace.filter(row => row.type === 'pending-frame-discarded');
    assert.deepEqual(discarded.map(row => row.candidateIndex), target.discardedCandidates);
    assert.deepEqual(discarded.map(row => row.observedEventHits), target.discardedObservedEvents ?? [0]);
    assert.ok(discarded.every(row => row.reason === 'no-qualifying-event' && row.qualifyingEventSnapshots === 0));
    if (mode === 'pending-filtered') {
      const observed = trace.filter(row => row.type === 'pending-frame-event');
      assert.deepEqual(observed.map(row => row.qualifies), [false, true]);
      assert.deepEqual(observed.map(row => row.observedEventHits), [1, 1]);
      assert.deepEqual(observed.map(row => row.qualifyingEventSnapshots), [0, 1]);
      assert.deepEqual(observed.map(row => row.rawHit), [1, 2]);
      assert.deepEqual(observed.map(row => row.candidateIndex), [1, 2]);
      assert.deepEqual(observed.map(row => row.frameMatchingHit), [1, 2]);
      assert.deepEqual(observed.map(row => row.captureWhen.actualBytesHex), ['01000000', '02000000']);
      for (const row of observed) {
        assert.equal(Number(row.esp), Number(row.frameEntryEsp) - 28); assert.equal(Number(row.returnAddress), 0x401061);
        assert.equal(Number(row.eventAddress), 0x401180); assert.equal(Number(row.poolBase), 0x401180);
        assert.equal(row.eventSlot, 0); assert.equal(row.capacity, 1); assert.equal(row.recordBytes, 104);
      }
      const skipped = trace.filter(row => row.type === 'observation-skipped');
      assert.equal(skipped.length, 1); assert.equal(skipped[0].breakpointId, 'dispatch');
      assert.equal(skipped[0].reason, 'predicate-not-equal'); assert.equal(skipped[0].rawHit, 1);
      assert.equal(skipped[0].actualPredicateBytesHex, '01000000'); assert.equal(skipped[0].expectedPredicateBytesHex, '02000000');
      assert.equal(capture.snapshots[1].captureWhen.actualBytesHex, '02000000');
    }
    const selected = trace.filter(row => row.type === 'pending-frame-selected'); assert.equal(selected.length, 1);
    assert.equal(selected[0].candidateIndex, 2); assert.equal(selected[0].firstOrdinal, 1); assert.equal(selected[0].lastOrdinal, 3);
    assert.equal(selected[0].bufferedBytes, capture.snapshots.reduce((sum, row) => sum + 716 + [...row.ranges.values()].reduce((bytes, range) => bytes + range.length, 0), 0));
    const [before, event, after] = capture.snapshots;
    for (const row of capture.snapshots) {
      assert.equal(row.deferredPublication, true); assert.equal(row.pendingFrame.candidateIndex, 2); assert.equal(row.pendingFrame.frameMatchingHit, 2);
      assert.equal(row.pendingFrame.observedEventHits, 1); assert.equal(row.pendingFrame.qualifyingEventSnapshots, 1);
      assert.equal(row.pendingFrame.frameTid, before.tid); assert.equal(row.pendingFrame.frameEntryEsp, before.registers.esp);
      assert.equal(row.pendingFrame.frameReturnAddress, `0x${before.ranges.get('caller').bytes.readUInt32LE().toString(16).padStart(8, '0')}`);
      assert.ok(row.observedElapsedMs <= row.elapsedMs);
    }
    assert.deepEqual(capture.snapshots.map(row => row.pendingFrame.role), ['before', 'event', 'after']);
    assert.equal(event.pendingFrame.eventIndex, 1); assert.equal(Number(event.registers.esp), Number(before.registers.esp) - 28);
    assert.equal(event.ranges.get('caller').bytes.readUInt32LE(), 0x401061); assert.equal(Number(event.registers.ecx), 0x401180);
    assert.equal(after.registers.esp, before.registers.esp); assert.deepEqual(after.ranges.get('caller').bytes, before.ranges.get('caller').bytes);
    assert.ok(before.observedDebugEventOrdinal < event.observedDebugEventOrdinal && event.observedDebugEventOrdinal < after.observedDebugEventOrdinal);
    assert.deepEqual(capture.complete.pendingFrameSelection, Object.fromEntries(Object.entries(before.pendingFrame).filter(([key]) => key !== 'role')));
    assert.ok(trace.findIndex(row => row.type === 'pending-frame-discarded') < trace.findIndex(row => row.type === 'snapshot'));
  }
  for (const [index, row] of capture.snapshots.entries()) {
    const eip = pendingMode ? target.eip[index] : '0x00401015';
    assert.equal(row.registers.eip, eip); assert.equal(row.context.readUInt32LE(184), Number(eip));
    assert.equal(row.context.readUInt32LE(28) & 0xffff, Number(row.registers.fpuControlWord));
    assert.equal(row.context.readUInt32LE(228), Number(row.registers.mxcsr));
    if (threadMode) {
      const environment = row.threadEnvironment, head = row.ranges.get('thread-seh-head');
      assert.ok(environment && head); assert.equal(head.length, 4);
      assert.equal(Number(environment.fsSelector), row.context.readUInt32LE(144));
      assert.ok(Number(environment.fsSelector) > 0 && Number(environment.fsSelector) <= 0xffff);
      const descriptor = Buffer.from(environment.descriptorHex, 'hex'); assert.equal(descriptor.length, 8);
      const base = (descriptor.readUInt16LE(2) | descriptor[4] << 16 | descriptor[7] << 24) >>> 0;
      assert.ok(base > 0); assert.equal(Number(environment.fsBase), base); assert.equal(Number(head.address), base);
      assert.equal(Number(environment.sehWord), head.bytes.readUInt32LE());
      const fixtureSeh = mode === 'thread-environment' ? row.ranges.get('counter').bytes.readUInt32LE() : row.ranges.get('fixture-thread-seh').bytes.readUInt32LE();
      assert.equal(Number(environment.sehWord), fixtureSeh);
      if (mode === 'thread-environment') assert.equal(Number(environment.fsSelector), row.ranges.get('counter').bytes.readUInt32LE(4));
    }
  }
  if (mode === 'normal') {
    assert.deepEqual(capture.snapshots.map(row => Number(row.registers.ecx)), target.ecx);
    assert.equal(trace.find(row => row.type === 'process-exit')?.exitCode, 0);
  } else {
    const owned = trace.find(row => row.type === 'owned-process'), cleanup = trace.find(row => row.type === 'owned-process-cleanup');
    assert.equal(cleanup?.terminated, true); assert.equal(cleanup.pid, owned.pid);
  }
  reports.push({mode, counters, ecx: capture.snapshots.map(row => Number(row.registers.ecx)), completion: capture.complete,
    snapshots: capture.snapshots.map(({ranges, context, ...row}) => ({...row, ranges: [...ranges.values()].map(({bytes, ...range}) => range)}))});
}
await mkdir(output);
for (const mode of modes) {
  const source = path.join(fixtureDirectory, `${mode}-capture`), destination = path.join(output, mode);
  await mkdir(destination);
  const {readdir} = await import('node:fs/promises');
  for (const name of await readdir(source)) await copyFile(path.join(source, name), path.join(destination, name), constants.COPYFILE_EXCL);
}
const report = {method: 'Executed synthetic x86 counter loop under Windows owned-child debugger; no game code.', matched: true, reports,
  scope: 'Verifies WOW64 INT3 reinsertion/single-step, integer/register/context capture, natural exit, snapshot bound and owned-child cleanup. Does not prove the game physics or persistence adapters.'};
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({matched: true, modes: reports.map(({mode, counters}) => ({mode, counters})), output}));
