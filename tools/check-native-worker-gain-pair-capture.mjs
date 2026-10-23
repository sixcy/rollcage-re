import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {verifyNativeWorkerGainPair, verifyNativeWorkerGainPairConfiguration} from './lib/native-worker-gain-pair.mjs';
import {verifyNativeWorkerGainPairEvidence} from './prepare-native-worker-gain-pair-capture.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeWorkerGainPairCapture(input, output) {
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'))); verifyNativeWorkerGainPairConfiguration(configuration);
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256}), pairing = pairNativeRecoverySnapshots(capture, configuration);
  if (pairing.pairs.length !== 1) throw Error('Worker gain pair requires one genuine selected recovery parent.');
  const records = (await readFile(path.join(input, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const proof = verifyNativeWorkerGainPair(capture, pairing.pairs[0], configuration, records), evidence = await verifyNativeWorkerGainPairEvidence();
  const report = {schemaVersion: 1, method: 'owned-worker-gain-entry-normal-exit-observation', captureDirectory: path.resolve(input),
    entryExitObservationVerified: true, wholeGainCallMatched: false, sourceReplayComplete: false, fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false,
    proof, evidence, completion: capture.complete, interventions: capture.interventions};
  await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2); if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/check-native-worker-gain-pair-capture.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON');
  console.log(JSON.stringify(await checkNativeWorkerGainPairCapture(input, output)));
}
