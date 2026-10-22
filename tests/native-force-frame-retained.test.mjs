import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots, compareNativeFramePair} from '../tools/check-native-frame-replay.mjs';
import {verifyNativeForceFrameConfiguration, traceNativeFrameForces, compareNativeForceSnapshots} from '../tools/check-native-force-frame-replay.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/hidden-selected-force-v2-capture';

test('retained original force frame matches twelve ordered inputs and every declared final byte', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory);
  const config = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const selection = verifyNativeForceFrameConfiguration(config), {pairs} = pairNativeFrameSnapshots(capture, config);
  assert.equal(pairs.length, 1);
  const pair = pairs[0], replay = traceNativeFrameForces(pair.before, pair.options);
  const force = compareNativeForceSnapshots(capture.snapshots.filter(row => row.breakpointId === selection.forceBreakpointId), replay.forceRecords, pair);
  const frame = compareNativeFramePair(pair, replay);
  assert.equal(force.matched, true, JSON.stringify(force.firstDivergence));
  assert.equal(force.nativeCount, 12); assert.equal(force.sourceCount, 12);
  assert.equal(force.entries.filter(row => row.classification.inputGate === 'accepted-nonzero-capped-input').length, 8);
  assert.equal(force.entries.filter(row => row.classification.inputGate === 'rejected-distance').length, 4);
  assert.equal(frame.matched, true, JSON.stringify(frame.firstDivergence));
  assert.equal(frame.comparedBytes, 4951966); assert.equal(frame.nativeReturn, 0);
  assert.equal(frame.nativeScenario.logicalClockBefore, 513);
  assert.equal(frame.nativeScenario.identity.before.selectedTrackStem, 'HIGH/LEV5');
  assert.equal(frame.sourceReport.wheelQueries, 24); assert.equal(frame.sourceReport.wheelHits, 21);
  assert.ok(replay.threadEnvironment.nativeTls, 'Observed thread environment participates in the compared frame.');
});
