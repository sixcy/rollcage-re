import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditNativeControlAudioOutputs} from '../tools/check-native-control-audio-outputs.mjs';

const input = 'analysis/native-physics-local/startup-20261022/control-prefix-v3-20261023';

test('actual control V3 source audio output fields match physics entry despite later explicit control-input failure', async () => {
  const {report} = await auditNativeControlAudioOutputs(input);
  assert.equal(report.matchedDeclaredAudioOutputs, true);
  assert.equal(report.sourceComplete, false); assert.equal(report.wholePrefixMatched, false);
  assert.equal(report.comparison.bytesCompared, 448); assert.equal(report.comparison.regions.length, 29);
  assert.equal(report.comparison.differingBytes, 0); assert.equal(report.comparison.nativeChangedBytes, 85);
  assert.equal(report.comparison.sourceChangedBytes, 85);
  assert.equal(report.completedAudioCalls.length, 6); assert.equal(report.sourceVirtualCalls.length, 26);
  assert.equal(report.sourceStoppedAt.stage, '0x42a6e0'); assert.match(report.sourceStoppedAt.reason, /0x9c7edd/);
  const retained = JSON.parse(await readFile('analysis/native-control-audio-v3-output-audit-20261023.json'));
  assert.deepEqual(report, retained);
});

test('after-only source gain corruption fails declared audio comparison without changing genuine replay or its inputs', async () => {
  let target;
  const {report, source, pair} = await auditNativeControlAudioOutputs(input, {transformAfter: after => {
    const gain = [...after.ranges.values()].find(row => Number(row.address) <= 0x17707588 && Number(row.address) + row.bytes.length > 0x17707588);
    assert.ok(gain); target = 0x17707588;
    const ranges = new Map([...after.ranges].map(([id, row]) => {
      const bytes = Buffer.from(row.bytes);
      if (target >= Number(row.address) && target < Number(row.address) + bytes.length) bytes[target - Number(row.address)] ^= 1;
      return [id, {...row, bytes}];
    }));
    return {...after, ranges};
  }});
  assert.equal(report.matchedDeclaredAudioOutputs, false); assert.equal(report.comparison.differingBytes, 1);
  assert.equal(report.sourceVirtualCalls.length, 26); assert.equal(report.completedAudioCalls.length, 6);
  const original = [...pair.after.ranges.values()].find(row => target >= Number(row.address) && target < Number(row.address) + row.bytes.length);
  assert.equal(source.memory[target], original.bytes[target - Number(original.address)]);
  assert.equal(report.wholePrefixMatched, false); assert.equal(report.sourceStoppedAt.stage, '0x42a6e0');
});
