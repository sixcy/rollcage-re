import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeWorkerWindowRecovery, verifyNativeWorkerGainWindow} from './lib/native-worker-gain-window.mjs';
import {verifyNativeWorkerGainPairEvidence} from './prepare-native-worker-gain-pair-capture.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {replayNativeWorkerGainEntry} from './lib/native-worker-gain-replay.mjs';

export async function checkNativeWorkerGainWindowCapture(input, output) {
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json')));
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const records = (await readFile(path.join(input, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const pair = pairNativeWorkerWindowRecovery(capture, configuration), proof = verifyNativeWorkerGainWindow(capture, pair, configuration, records);
  const report = {schemaVersion: 1, method: 'activation-anchored-owned-worker-gain-leaf-window', captureDirectory: path.resolve(input),
    entryExitObservationVerified: true, sameParentInterleavingClaimed: false, sourceReplayComplete: false, wholeGainCallMatched: false,
    fullPrivateAbiMatched: false, fullWorkerInterleavingProved: false, proof, controlledInput: pair.controlledInput,
    evidence: await verifyNativeWorkerGainPairEvidence(), completion: capture.complete,
    // Only original entry inputs initialize execution. The exit is identity
    // evidence above, never a source state or external-service answer.
    replay: replayNativeWorkerGainEntry(capture.snapshots.find(r => r.breakpointId === 'worker-gain-entry'), {moduleBaseAddress: pair.moduleBaseAddress}).report};
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/check-native-worker-gain-window-capture.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON');
  console.log(JSON.stringify(await checkNativeWorkerGainWindowCapture(input, output)));
}
