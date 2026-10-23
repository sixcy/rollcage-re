import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {verifyNativeWorkerGainPair, verifyNativeWorkerGainPairConfiguration} from './lib/native-worker-gain-pair.mjs';
import {verifyNativeWorkerGainPairEvidence} from './prepare-native-worker-gain-pair-capture.mjs';
import {replayNativeWorkerGainEntry} from './lib/native-worker-gain-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeWorkerGainReplay(input, output) {
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'))); verifyNativeWorkerGainPairConfiguration(configuration);
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256}), pairing = pairNativeRecoverySnapshots(capture, configuration);
  if (pairing.pairs.length !== 1) throw Error('Worker gain source replay requires one actual parent/pair.');
  const records = (await readFile(path.join(input, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const proof = verifyNativeWorkerGainPair(capture, pairing.pairs[0], configuration, records), evidence = await verifyNativeWorkerGainPairEvidence();
  const before = capture.snapshots.find(r => r.breakpointId === 'worker-gain-entry');
  //The exit proved call identity above. No exit rows/registers enter execution.
  const replay = replayNativeWorkerGainEntry(before, {moduleBaseAddress: pairing.pairs[0].moduleBaseAddress});
  const report = {schemaVersion: 1, captureDirectory: path.resolve(input), targetSha256: REDUX_SHA256,
    observationPairVerified: true, proof, evidence, replay: replay.report, wholeGainCallMatched: false, fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false};
  await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2); if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/check-native-worker-gain-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON');
  const report = await checkNativeWorkerGainReplay(input, output);
  console.log(JSON.stringify({observationPairVerified: report.observationPairVerified, complete: report.replay.sourceReplayComplete,
    boundary: report.replay.boundary, failure: report.replay.failure, output}));
}
