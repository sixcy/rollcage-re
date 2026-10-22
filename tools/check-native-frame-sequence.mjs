// Read-only comparison of already-retained native frames. Never launches Redux.
import {mkdir, writeFile, copyFile, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {replayNativeFrameSequence} from './lib/native-frame-sequence.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {verifyNativeFrameBoundaries} from './prepare-native-frame-capture.mjs';

export async function checkNativeFrameSequence(input, output, {coveragePolicy = 'strict'} = {}) {
  const evidence = await verifyNativeFrameBoundaries();
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const pairing = pairNativeFrameSnapshots(capture, configuration);
  if (pairing.frames < 2) throw Error('Consecutive replay requires at least two complete captured native frames.');
  await mkdir(output);
  for (const filename of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, filename), path.join(output, filename), constants.COPYFILE_EXCL);
  let report;
  try {
    ({report} = await replayNativeFrameSequence(pairing.pairs, {frameOptions: pairing.options, coveragePolicy}));
  } catch (error) {
    report = {schemaVersion: 1, method: 'carried-source-physics-with-observed-external-producers', matched: false, frames: pairing.frames, coveragePolicy, replayStage: error.replayStage ?? 'sequence-contract', replayError: error.stack};
  }
  Object.assign(report, {targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation', captureDirectory: path.resolve(input), boundaryEvidence: evidence.evidenceIds, stackPolicy: pairing.options, skipFrames: pairing.skipFrames ?? 0, matchingWindow: pairing.pairs.map(pair => ({beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, matchingHit: pair.matchingHit ?? pair.before.matchingHit ?? pair.before.hit})), completion: capture.complete, interventions: capture.interventions});
  // Relative run tuples stay compact; retained schema1 reports remain untouched.
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report)}\n`, {flag: 'wx'});
  return {report, output: path.resolve(output)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, coveragePolicy = 'strict'] = process.argv.slice(2);
  if (!input || !output || !['strict', 'initial-observation'].includes(coveragePolicy) || process.argv.length > 5) throw Error('Usage: node tools/check-native-frame-sequence.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY [strict|initial-observation]');
  const result = await checkNativeFrameSequence(input, output, {coveragePolicy});
  console.log(JSON.stringify({matched: result.report.matched, frames: result.report.frames, externallyPatchedBytes: result.report.externallyPatchedBytes, abiRefreshedBytes: result.report.abiRefreshedBytes, firstDivergence: result.report.firstDivergence, replayError: result.report.replayError, output: result.output}));
  if (!result.report.matched) process.exitCode = 1;
}
