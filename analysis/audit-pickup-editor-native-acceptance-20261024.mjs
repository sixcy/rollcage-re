import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async name => JSON.parse(await readFile(name, 'utf8'));
const baseline = await json('analysis/pickup-editor-native-baseline-20261024/installation-manifest.json');
const staged = 'analysis/pickup-editor-native-cases-20261024';
const frozen = 'analysis/pickup-editor-native-helper-20261024-v2';
const helperManifest = await json(`${frozen}/manifest.json`);
for (const row of helperManifest.files) assert.equal(hash(await readFile(`${frozen}/${row.name}`)), row.sha256);
const helperSha256 = helperManifest.files.find(row => row.name.endsWith('.cs')).sha256;
assert.equal(helperSha256, 'e7b78b3530684a4a11d5ca6f130ab0b776c7c2f2d5c928cc2b3f36da1cd5b448');

async function fileHash(filename) {
  const digest = createHash('sha256'); let length = 0;
  for await (const bytes of createReadStream(filename)) {length += bytes.length; digest.update(bytes);}
  return {length, sha256: digest.digest('hex')};
}
async function checkInstallation(root, files) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const filename = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'No installation symlinks');
      if (entry.isDirectory()) await walk(filename);
      else {assert.ok(entry.isFile()); found.push(path.relative(root, filename).replaceAll('\\', '/'));}
    }
  }
  await walk(root);
  assert.deepEqual(found.sort(), files.map(row => row.path).sort());
  for (const row of files) assert.deepEqual(await fileHash(path.join(root, row.path)), {length: row.length, sha256: row.sha256}, row.path);
  return {root, files: files.length, bytes: files.reduce((n, row) => n + row.length, 0), allMatched: true};
}

const installations = [await checkInstallation(baseline.source, baseline.files), await checkInstallation(path.join(baseline.destination, 'installation'), baseline.files)];
const definitions = [
  ['baseline-low', 'baseline-low-v2', 'capture-v2', 'expected-v2.json', 13],
  ['baseline-high', 'baseline-high', 'capture', 'expected.json', 13],
  ['edited16-low', 'edited16-low', 'capture', 'expected.json', 16],
  ['edited16-high', 'edited16-high', 'capture', 'expected.json', 16],
  ['zero-low', 'zero-low-v2', 'capture', 'expected.json', 0],
  ['zero-high', 'zero-high', 'capture', 'expected.json', 0]
];
const cases = [];
for (const [id, reportId, captureName, expectedName, count] of definitions) {
  const root = `${staged}/${id}`, expected = await json(`${root}/${expectedName}`);
  const reportPath = `analysis/pickup-editor-native-${reportId}-check-20261024/report.json`, report = await json(reportPath);
  assert.equal(report.matched, true); assert.equal(report.authoredCount, count); assert.equal(report.helperSourceSha256, helperSha256);
  const capture = `${root}/${captureName}`, traceBytes = await readFile(`${capture}/trace.jsonl`);
  const rows = traceBytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
  const header = rows.find(row => row.type === 'capture'), complete = rows.find(row => row.type === 'complete');
  const owner = rows.find(row => row.type === 'owned-process'), cleanup = rows.find(row => row.type === 'owned-process-cleanup');
  assert.equal(header.helperSourceSha256, helperSha256); assert.equal(header.executableSha256, baseline.target.sha256);
  assert.ok(complete && complete.elapsedMs <= 90000); assert.equal(cleanup.pid, owner.pid); assert.equal(cleanup.terminated, true);
  assert.ok(!rows.some(row => row.type === 'capture-error'));
  assert.equal(hash(await readFile(`${capture}/configuration.json`)), expected.configurationSha256);
  assert.equal(hash(await readFile(expected.configurationPath)), expected.configurationSha256);
  installations.push(await checkInstallation(expected.installation.root, expected.installation.files));
  assert.equal(expected.installation.changes.length, id.startsWith('baseline') ? 0 : 2);
  if (count === 16) {assert.equal(report.collections[15], 1); assert.equal(report.placements[15], 2); assert.equal(report.completedTargetGeneration, 1);}
  cases.push({id, reportPath, reportSha256: hash(await readFile(reportPath)), capture, traceSha256: hash(traceBytes),
    sceneName: report.sceneName, count, snapshots: report.snapshots, elapsedMs: complete.elapsedMs, cleanupElapsedMs: cleanup.elapsedMs,
    completedFinalizers: report.completedFinalizers, targetLifecycle: report.stages.filter(row => row.index === 15), pid: owner.pid, terminated: cleanup.terminated});
}
const source = await json('analysis/pickup-editor-source-matrix-20261024.json'); assert.equal(source.matched, true); assert.equal(source.sourceFilesStable, true);
const browser = await json('analysis/pickup-editor-browser-20261024-v3/report.json'); assert.equal(browser.passed, true);
const state = await json('analysis/pickup-editor-state-browser-20261024-v1/report.json'); assert.equal(state.matched, true);
const result = {matched: true, target: baseline.target, helperSha256, cases, installations, sourceTotals: source.totals,
  sourceMatrixSha256: hash(await readFile('analysis/pickup-editor-source-matrix-20261024.json')),
  scope: 'LEV1 native unchanged/zero/16 exports in LOW and HIGH; source matrix covers all34 supported variants; browser check is separate reconstructed-runtime evidence.',
  limits: ['Original-process evidence covers LEV1, not native runs of all17 supported levels.', 'One rejected V1 observer timeout and one rejected zero-entry checker report are retained; neither is counted as a native acceptance pass.',
    'Only reviewed startup/frontend inputs were intervened upon; no collection, respawn, RNG, AI, position or simulation outputs were forced.', 'The broader physics goal remains paused.'],
  physicsGoalResumed: false};
await writeFile('analysis/pickup-editor-native-acceptance-20261024.json', JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({matched: true, nativeCases: cases.length, installations: installations.length, filesVerified: installations.reduce((n, row) => n + row.files, 0), originalFilesUnchanged: true}));
