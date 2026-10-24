import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNativePickupEditorValidationConfig, writePickupArchiveParts, prepareNativePickupEditorValidation} from '../tools/prepare-native-pickup-editor-validation.mjs';
import {createReduxCaptureConfig} from '../tools/lib/redux-capture-config.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {parsePickupPlacements} from '../src/pickup-editor.mjs';
import {getGame} from '../src/track-games.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(count = 16) {
  const data = Buffer.alloc(0x200, 0x69); data.write('GFXM'); data.writeUInt32LE(0x120, 0x90); data[0x94] = count; data[0xf7] = 3;
  return data;
}

test('pickup staging config pins source/header/count and leaves original startup actions intact', () => {
  const root = path.resolve('analysis/pure-staging-policy-only'), data = fixture();
  const o = createNativePickupEditorValidationConfig(root, {kind: 'edited16', quality: 'HIGH', compiledData: data, indexSha256: 'a'.repeat(64), imageSha256: 'b'.repeat(64)});
  const original = createReduxCaptureConfig(root, 'hidden-idle', path.join(root, 'capture'));
  assert.deepEqual(o.phaseActions, original.phaseActions); assert.deepEqual(o.breakpoints.slice(0, 3), original.breakpoints.slice(0, 3));
  assert.equal(o.breakpoints.length, 12); assert.deepEqual(o.ranges, []); assert.equal(o.maxDurationMs, 90000); assert.equal(o.maxSnapshots, 80);
  assert.equal(o.pickupEditorObservation.scenario, 'cycle'); assert.equal(o.pickupEditorObservation.targetIndex, 15); assert.equal(o.pickupEditorObservation.expectedControllerCount, 3);
  assert.equal(o.pickupEditorObservation.authoredHex.length, 384); assert.equal(o.pickupEditorObservation.headerIdentityHex.length, 80);
  assert.equal(o.pickupEditorObservation.resourceSha256, sha(data)); assert.equal(o.controlledRaceSettings.level, 1);
  for (const breakpoint of o.breakpoints.slice(3)) assert(!breakpoint.skipMatchingHits && !breakpoint.captureWhen && !breakpoint.stopAfterHits);
  const zero = createNativePickupEditorValidationConfig(root, {kind: 'zero', quality: 'LOW', compiledData: fixture(0), indexSha256: 'a'.repeat(64), imageSha256: 'b'.repeat(64)});
  assert.equal(zero.pickupEditorObservation.authoredHex, ''); assert.equal(zero.pickupEditorObservation.authoredSha256, sha(Buffer.alloc(0))); assert.equal(zero.pickupEditorObservation.targetIndex, -1);
  assert.throws(() => createNativePickupEditorValidationConfig(root, {kind: 'baseline', quality: 'LOW', compiledData: fixture(17), indexSha256: 'a'.repeat(64), imageSha256: 'b'.repeat(64)}), /count/);
});

test('exclusive streaming archive assembly preserves original ranges and refuses overwrite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rollcage-pickup-stage-'));
  try {
    const source = path.join(directory, 'source.img'), destination = path.join(directory, 'output.img');
    const original = Buffer.from([1, 2, 3, 4, 5]); await writeFile(source, original, {flag: 'wx'});
    const plan = {parts: [{offset: 0, length: 5}, new Uint8Array(3), Buffer.from([6, 7])], imageBytes: 10};
    const result = await writePickupArchiveParts(source, destination, plan), expected = Buffer.from([1, 2, 3, 4, 5, 0, 0, 0, 6, 7]);
    assert.deepEqual(await readFile(destination), expected); assert.deepEqual(result, {length: 10, sha256: sha(expected)}); assert.deepEqual(await readFile(source), original);
    await assert.rejects(writePickupArchiveParts(source, destination, plan), /existing/);
    await assert.rejects(writePickupArchiveParts(source, path.join(directory, 'short.img'), {parts: [{offset: 4, length: 4}], imageBytes: 4}), /Short original/);
  } finally {await rm(directory, {recursive: true});}
});

const manifestPath = 'analysis/pickup-editor-native-cases-20261024/manifest.json';
test('prepared six isolated cases decode expected counts and preserve all unaffected IDX records', {skip: !existsSync(manifestPath)}, async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.cases.length, 6); assert.equal(manifest.sourceFiles.length, 171); assert(manifest.baselineBefore.allMatched && manifest.baselineAfter.allMatched);
  const originalIndex = await readFile(path.join(manifest.baselineRoot, 'installation/IDXData/Rollcage.idx'));
  const affected = ['LOW/LEV1.BLP', 'HIGH/LEV1.BLP'].map(name => getGame('rollcage').tracks.find(row => row.name === name).index);
  for (const row of manifest.cases) {
    const expected = JSON.parse(await readFile(row.expectedPath, 'utf8')), config = JSON.parse(await readFile(row.configurationPath, 'utf8'));
    assert.equal(expected.installation.files.length, 171); assert.equal(expected.installation.changes.length, row.kind === 'baseline' ? 0 : 2);
    assert.equal(sha(await readFile(row.configurationPath)), expected.configurationSha256);
    assert.equal(config.executablePath, path.join(row.root, 'installation/Direct3D/Rollcage Redux.exe'));
    const archive = await RollcageArchive.open(expected.installation.root);
    try {
      for (let index = 0; index < archive.entries.length; index++) if (row.kind === 'baseline' || !affected.includes(index)) assert.deepEqual(archive.indexData.subarray(index * 16, index * 16 + 16), originalIndex.subarray(index * 16, index * 16 + 16));
      const track = getGame('rollcage').tracks.find(track => track.name === config.pickupEditorObservation.sceneName), {data} = await archive.readResource(track.index);
      assert.equal(parsePickupPlacements(data).count, row.expectedCount); assert.equal(sha(data), config.pickupEditorObservation.resourceSha256);
    } finally {await archive.close();}
  }
  await assert.rejects(prepareNativePickupEditorValidation(path.dirname(manifestPath)), /existing/);
});
