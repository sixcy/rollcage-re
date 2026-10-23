import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from './lib/native-recovery-sound-selection.mjs';
import {verifyNativeRecoverySoundGraphEvidence} from './prepare-native-recovery-sound-capture.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

//Independent captured call/return lineage, not an allocator or audio replay.
export async function checkNativeRecoverySoundCapture(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const evidence = await verifyNativeRecoverySoundGraphEvidence();
  let proof, error;
  try {
    const pairing = pairNativeRecoverySnapshots(capture, configuration);
    if (pairing.pairs.length !== 1) throw Error('Recovery sound requires exactly one complete selected parent.');
    proof = selectNativeRecoverySoundSnapshots(capture, pairing.pairs[0], configuration);
  } catch (failure) {error = failure.stack ?? String(failure);}
  const report = {
    schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'controlled-native-recovery-input',
    method: 'Hash-verified original snapshots; guarded firstbody state32 at caller229; exact pending-parent/application proof followed by same-thread, clock, observed ASLR and actual ESP-relative audio call/return lineage. No process launched by checker.',
    captureDirectory: path.resolve(input), lineageVerified: Boolean(proof), sourceReplayComplete: false,
    ...(proof ? {proof} : {error}), boundaryEvidence: evidence.evidenceIds,
    completion: capture.complete,
    limits: ['Observed CRT return values are native service evidence; this checker does not execute or validate the full audio source constructor, allocator, COM or playback.',
      'The supplied recovery state is controlled input, not a naturally produced rejection.',
      'Missing bytes or unrelated generic snapshots never supply substitute allocation or game-callee answers.']
  };
  await mkdir(output);
  for (const file of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, file), path.join(output, file), constants.COPYFILE_EXCL);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-recovery-sound-capture.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoverySoundCapture(input, output);
  console.log(JSON.stringify({lineageVerified: report.lineageVerified, sourceReplayComplete: false,
    selectedCount: report.proof?.selectedCount, error: report.error, output}));
  if (!report.lineageVerified) process.exitCode = 1;
}
