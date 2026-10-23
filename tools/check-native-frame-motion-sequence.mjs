//Read retained captures only. Opt in to one genuine source443d90 producer;
//all other after→next-before producers remain separately supplied inputs.
import {mkdir, writeFile, copyFile, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {replayNativeFrameSequence} from './lib/native-frame-sequence.mjs';
import {createNativeMotionStateContinuation} from './lib/native-frame-motion-continuation.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {verifyNativeFrameBoundaries} from './prepare-native-frame-capture.mjs';

export async function checkNativeFrameMotionSequence(input, output, {coveragePolicy = 'initial-observation'} = {}) {
  const evidence = await verifyNativeFrameBoundaries(), sourceContinuation = await createNativeMotionStateContinuation();
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const pairing = pairNativeFrameSnapshots(capture, configuration);
  if (pairing.frames < 2) throw Error('Motion continuation requires at least two captured physics frames.');
  await mkdir(output);
  for (const filename of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, filename), path.join(output, filename), constants.COPYFILE_EXCL);
  let report;
  try {({report} = await replayNativeFrameSequence(pairing.pairs, {frameOptions: pairing.options, coveragePolicy, sourceContinuation}));}
  catch (error) {report = {schemaVersion: 3, method: 'carried-source-physics-with-selected-source-continuation-and-observed-external-producers', matched: false,
    frames: pairing.frames, coveragePolicy, replayStage: error.replayStage ?? 'source-continuation-contract', replayError: error.stack};}
  Object.assign(report, {targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation', captureDirectory: path.resolve(input),
    boundaryEvidence: evidence.evidenceIds, sourceProducerEvidence: sourceContinuation.evidence, stackPolicy: pairing.options,
    skipFrames: pairing.skipFrames ?? 0, matchingWindow: pairing.pairs.map(pair => ({beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, matchingHit: pair.matchingHit ?? pair.before.matchingHit ?? pair.before.hit})),
    completion: capture.complete, interventions: capture.interventions});
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report)}\n`, {flag: 'wx'});
  return {report, output: path.resolve(output)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, coveragePolicy = 'initial-observation'] = process.argv.slice(2);
  if (!input || !output || !['strict', 'initial-observation'].includes(coveragePolicy) || process.argv.length > 5) throw Error('Usage: node tools/check-native-frame-motion-sequence.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY [strict|initial-observation]');
  const result = await checkNativeFrameMotionSequence(input, output, {coveragePolicy});
  console.log(JSON.stringify({matched: result.report.matched, frames: result.report.frames, sourceContinuation: result.report.sourceContinuation,
    externallyPatchedBytes: result.report.externallyPatchedBytes, abiRefreshedBytes: result.report.abiRefreshedBytes,
    firstDivergence: result.report.firstDivergence, replayError: result.report.replayError, output: result.output}));
  if (!result.report.matched) process.exitCode = 1;
}
