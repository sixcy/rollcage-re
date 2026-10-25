// Actual typed PowerShell/C# policy validation. Never launches the game.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const [root, output] = process.argv.slice(2);
if (!root || !output) throw Error('Usage: node tools/check-native-topology-editor-policy.mjs CASE_ROOT NEW_REPORT.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(await readFile(path.join(root, 'scenery-capture-config.json'), 'utf8')), expected = JSON.parse(await readFile(path.join(root, 'scenery-expected.json'), 'utf8'));
assert.equal(expected.profile, 'topology-assembly');
assert.deepEqual(config.sceneryEditorObservation, expected.probe); assert.deepEqual(config.topologyEditorObservation, expected.topologyProbe);
// Validate the frozen observer owned by this case. Later source additions must
// not silently replace the policy used to create a native acceptance fixture.
const helper = path.resolve(root, 'observer-source.cs'), wrapper = path.resolve(root, 'observer-wrapper.ps1');
const hashes = {helper: sha(await readFile(helper)), wrapper: sha(await readFile(wrapper))};
const run = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper, '-HelperSourcePath', helper, '-ConfigPath', path.join(root, 'scenery-capture-config.json'), '-ValidateOnly'], {encoding: 'utf8', windowsHide: true, timeout: 30000});
assert.equal(run.status, 0, run.stdout + run.stderr);
const line = run.stdout.split(/\r?\n/).find(s => s.startsWith('SCENERY-POLICY ')); assert.ok(line);
const actual = JSON.parse(line.slice('SCENERY-POLICY '.length)); assert.deepEqual(actual.links, expected.probe.links); assert.equal(actual.linksHex, expected.probe.linksHex);
const report = {passed: true, authority: 'source-wrapper-validation-only', gameExecuted: false, quality: expected.quality, level: expected.level, hashes,
  routes: expected.topologyProbe.routeCount, checkpoints: expected.topologyProbe.checkpointCount, selectedRouteBytes: expected.topologyProbe.pointSpans.reduce((n, s) => n + s.length, 0), selectedAssemblyBodies: expected.probe.placements.length,
  scope: 'Frozen observer and wrapper accepted the exact typed bounded topology/assembly contract. No capture output or process was created.'};
await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'}); console.log(JSON.stringify(report));
