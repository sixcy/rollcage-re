import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from './lib/native-recovery-sound-selection.mjs';
import {verifyNativeRecoveryWorkerEvidence} from './prepare-native-recovery-worker-capture.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

// Uses the complete sound/activation/worker selectors and hash-checked loader.
// A legacy sound profile must not be mistaken for a worker observation.
export async function checkNativeRecoveryWorkerCapture(input, output) {
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  if (!configuration.ownedWorkerObservation) throw Error('Explicit owned worker capture policy is required.');
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256}), evidence = await verifyNativeRecoveryWorkerEvidence();
  let proof, error;
  try {
    const pairing = pairNativeRecoverySnapshots(capture, configuration);
    if (pairing.pairs.length !== 1) throw Error('Worker capture requires exactly one selected parent.');
    proof = selectNativeRecoverySoundSnapshots(capture, pairing.pairs[0], configuration);
  } catch (failure) {error = failure.stack ?? String(failure);}
  const report = {schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'controlled-native-recovery-input',
    method: 'Hash-verified original parent/audio lineage plus exactly one manager-owned live CREATE_THREAD worker lookup entry. Actual guarded host activation, pending-frame admission, raw context and immediate return-word proof. No process launched by checker.',
    captureDirectory: path.resolve(input), lineageVerified: Boolean(proof), workerLookupVerified: proof?.workerLookupObservation?.verified === true,
    sourceReplayComplete: false, fullConcurrencyProved: false, ...(proof ? {proof} : {error}), boundaryEvidence: evidence.evidenceIds, completion: capture.complete,
    limits: ['Only this immediate lookup caller is observed; the complete background interleaving is unproved.', 'Incoming ESI is not dereferenced.', 'No observed manager/lock bytes substitute for source game writes.']};
  await mkdir(output);
  for (const file of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, file), path.join(output, file), constants.COPYFILE_EXCL);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/check-native-recovery-worker-capture.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoveryWorkerCapture(input, output);
  console.log(JSON.stringify({lineageVerified: report.lineageVerified, workerLookupVerified: report.workerLookupVerified, worker: report.proof?.workerLookupObservation, error: report.error, output}));
  if (!report.lineageVerified || !report.workerLookupVerified) process.exitCode = 1;
}
