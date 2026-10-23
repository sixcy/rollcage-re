//Saved captures only; no process launch or expected-output seeding.
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {replayNativeFrameSequence} from './lib/native-frame-sequence.mjs';
import {createNativeDriveContinuation, replayNativeDriveFrame} from './lib/native-frame-drive-continuation.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeFrameDriveSequence(input, output, {coveragePolicy = 'initial-observation', frameOptions = {}} = {}) {
  const continuation = await createNativeDriveContinuation(), capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'))), pairing = pairNativeFrameSnapshots(capture, configuration);
  if (pairing.frames < 2) throw Error('Drive feedback requires at least two original captured physics frames.');
  await mkdir(output);
  for (const name of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, name), path.join(output, name), constants.COPYFILE_EXCL);
  let report;
  try {({report} = await replayNativeFrameSequence(pairing.pairs, {replayFrame: replayNativeDriveFrame, frameOptions: {...pairing.options, ...frameOptions}, coveragePolicy, sourceContinuation: continuation}));}
  catch (error) {report = {schemaVersion: 3, method: 'source-motion-surface-and-complete-weapon-coordinator-with-explicit-external-producers', matched: false,
    requestedFrames: pairing.frames, coveragePolicy, replayStage: error.nativeDriveContinuationProgress?.stage ?? error.replayStage ?? 'drive-continuation-contract',
    missingDependency: error.nativeDriveDependency ?? null, partialSourceExecution: error.nativeDriveContinuationProgress ?? null, replayError: error.stack};}
  Object.assign(report, {targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation', captureDirectory: path.resolve(input),
    sourceProducerEvidence: continuation.evidence, stackPolicy: pairing.options, skipFrames: pairing.skipFrames,
    matchingWindow: pairing.pairs.map(pair => ({beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, matchingHit: pair.matchingHit ?? pair.before.matchingHit})),
    completion: capture.complete, interventions: capture.interventions,
    driveScope: 'Genuine443d90/48d680 participant sweep, actual procedural gate/49ac30, complete48d7c0 and genuine469fd0. Full6a8/6ac and motion outputs protected before patches; missing inputs/services fail, never substitute decay-only arithmetic.'});
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return {report, output: path.resolve(output)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/check-native-frame-drive-sequence.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const result = await checkNativeFrameDriveSequence(input, output);
  console.log(JSON.stringify({matched: result.report.matched, stage: result.report.replayStage, missingDependency: result.report.missingDependency,
    sourceContinuation: result.report.sourceContinuation, firstDivergence: result.report.firstDivergence, output: result.output}));
  if (!result.report.matched) process.exitCode = 1;
}
