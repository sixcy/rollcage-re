import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {compareNativeRecoveryPrefix} from '../tools/check-native-recovery-prefix.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-capture';

test('retained controlled native recovery matches all predeclared globals and application inputs before the explicit audio boundary', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory);
  const config = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, config), pair = pairs[0];
  const result = compareNativeRecoveryPrefix(capture, pair);
  assert.equal(result.matched, true, JSON.stringify(result.firstDivergence));
  assert.equal(result.prefixes.length, 1); assert.equal(result.prefixes[0].comparedBytes, 34546);
  assert.equal(result.applications.matched, true); assert.equal(result.applications.nativeCalls, 1);
  assert.equal(result.sourceComplete, false); assert.match(result.sourceError, /Sound dispatch requires service allocate/);
  assert.equal(result.fullParentOutputCompared, false, 'A matching prefix cannot turn the failed full parent into a success.');
  const event = capture.snapshots.find(row => row.breakpointId === 'native-recovery-apply-entry');
  const region = event.ranges.get('recovery-route-metrics-candidates-clone');
  event.ranges.set(region.id, {...region, bytes: Buffer.from(region.bytes)});
  event.ranges.get(region.id).bytes[0] ^= 1;
  const changed = compareNativeRecoveryPrefix(capture, pair);
  assert.equal(changed.matched, false);
  assert.equal(changed.firstDivergence.id, region.id);
  assert.equal(changed.applications.matched, true, 'A global-only mismatch is detected independently of matching application arguments.');
});
