import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeControlPrefix} from '../tools/lib/native-frame-control-continuation.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/control-prefix-v4-20261023';

test('original V4 six-car prephysics prefix matches all declared outputs without physics-entry refresh', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory);
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`));
  const pairing = pairNativeControlSnapshots(capture, configuration), pair = pairing.pairs[0];
  assert.equal(pairing.physicsExitCheckpoint, true);
  assert.equal(pair.physicsAfter.breakpointId, 'native-control-after-physics');
  let intermediate;
  //Only the parent ENTRY is given to the replay. Later bytes are comparison
  //inputs, never a refresh of source controls, audio, geometry or scratch.
  const source = replayNativeControlPrefix(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress,
    onBeforeStage: ({source}) => {intermediate = compareNativeControlOutput(source, pair.checkpoints.afterAi);}});
  assert.equal(intermediate.matched, true);
  assert.equal(intermediate.bytesCompared, 4984232);
  const comparison = compareNativeControlOutput(source, pair.after);
  assert.equal(comparison.matched, true);
  assert.equal(comparison.bytesCompared, 4984964);
  assert.equal(comparison.protectedControlBytes, 720);
  assert.equal(comparison.parentAbiBytesCompared, 28);
  assert.equal(comparison.differingBytes, 0);
  assert.equal(source.report.calls.length, 41);
  for (const entry of ['0x410220', '0x431750', '0x485300', '0x42a6e0', '0x42be80', '0x42a9a0']) {
    assert.equal(source.report.calls.filter(row => row.entry === entry).length, 6);
  }
  assert.deepEqual(source.report.calls.slice(-4).map(row => row.entry), ['0x494f60', '0x429f30', '0x449640', '0x420500']);

  const protectedRegion = source.ownedRegions.find(row => row.id === 'control-car0-axes-controls');
  const address = protectedRegion.address, computed = Buffer.from(source.span(address, protectedRegion.length));
  const corrupted = {...pair.after, ranges: new Map([...pair.after.ranges].map(([id, row]) => {
    const bytes = Buffer.from(row.bytes), offset = address - Number(row.address);
    if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
    return [id, {...row, bytes}];
  }))};
  const mismatch = compareNativeControlOutput(source, corrupted);
  assert.equal(mismatch.matched, false);
  assert.equal(mismatch.firstDivergence.address, address);
  assert.equal(mismatch.owned.find(row => row.id === protectedRegion.id).differingBytes, 1);
  assert.deepEqual(source.span(address, protectedRegion.length), computed);
  assert.equal(compareNativeControlOutput(source, pair.after).matched, true);
});
