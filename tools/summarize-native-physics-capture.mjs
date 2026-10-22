import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';

const [captureDirectory, manifestFile, output] = process.argv.slice(2);
if (!captureDirectory || !manifestFile || !output) throw Error('Usage: node tools/summarize-native-physics-capture.mjs CAPTURE_DIRECTORY INSTALLATION_MANIFEST NEW_REPORT_DIRECTORY');
const capture = await loadPhysicsCapture(captureDirectory, {expectedSha256: REDUX_SHA256});
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
assert.equal(manifest.target.sha256, REDUX_SHA256);
let verifiedBytes = 0;
for (const file of manifest.files) {
  const resolved = path.resolve(manifest.source, file.path), relative = path.relative(manifest.source, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Invalid installation manifest path.');
  const bytes = await readFile(resolved);
  assert.equal(bytes.length, file.length, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  verifiedBytes += bytes.length;
}
const trace = (await readFile(path.join(captureDirectory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const stages = capture.snapshots.map(row => ({stage: row.breakpointId, hit: row.hit, ordinal: row.ordinal,
  registers: row.registers, numericalContext: decodePhysicsNumericalContext({x87ControlWord: Number(row.registers.fpuControlWord), mxcsr: Number(row.registers.mxcsr)}),
  gravityQ16: row.ranges.get('gravity')?.bytes.readInt32LE(), logicalClock: row.ranges.get('clock')?.bytes.readUInt32LE(),
  ranges: [...row.ranges.values()].map(({bytes, ...range}) => range)}));
const report = {schemaVersion: 1, authority: 'original-process-with-declared-instrumentation', target: manifest.target,
  method: 'Windows debugger launched the unchanged workspace copy of the shipped executable; snapshots precede the original breakpoint instruction.',
  module: trace.find(row => row.type === 'module' && row.kind === 'main'), stages, completion: capture.complete,
  sourceVerification: {files: manifest.files.length, bytes: verifiedBytes, allOriginalHashesUnchanged: true},
  installedHooks: trace.filter(row => row.type === 'service-hook-installed'),
  interventions: capture.interventions, cleanup: trace.find(row => row.type === 'owned-process-cleanup'),
  limits: ['Startup checkpoints are not race-stage or trajectory equivalence.', 'Temporary code breakpoints, process TEMP/TMP redirection, folder/API adapters and registry/child/IPC denial are declared interventions.', 'Later Direct3D/library code can change floating-point state; retain separate stage contexts.', 'Breakpoint-paused elapsed time cannot prove wall-clock cadence.', 'Hook coverage is the enumerated main-executable imports, not every dynamically resolved or third-party API.']};
// These selected startup probes contain only numeric contexts, globals and small
// records; refuse to accidentally publish a later asset-sized capture here.
for (const row of capture.snapshots) for (const range of row.ranges.values()) if (range.bytes.length > 4096) throw Error('Summary retention supports only reviewed small startup ranges.');
await mkdir(output);
const files = new Set(['trace.jsonl', 'configuration.json']);
for (const row of capture.snapshots) {files.add(row.contextFile); for (const range of row.ranges.values()) files.add(range.file);}
for (const file of files) await copyFile(path.join(captureDirectory, file), path.join(output, file), constants.COPYFILE_EXCL);
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({stages: stages.map(({stage, gravityQ16, numericalContext}) => ({stage, gravityQ16, x87Precision: numericalContext.x87.precisionBits, rounding: numericalContext.x87.roundingMode})), sourceFilesUnchanged: manifest.files.length, output}));
