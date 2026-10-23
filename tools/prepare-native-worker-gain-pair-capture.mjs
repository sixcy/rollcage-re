import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createNativeRecoverySoundCaptureConfig} from './prepare-native-recovery-sound-capture.mjs';
import {nativeRecoveryWorkerProfileOptions} from './prepare-native-recovery-worker-capture.mjs';
import {nativeWorkerGainPairPolicy, nativeWorkerGainPairBreakpoints, verifyNativeWorkerGainPairConfiguration} from './lib/native-worker-gain-pair.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function verifyNativeWorkerGainPairEvidence() {
  const proof = await readInstructionEvidence(['12289-sound-manager-update-sources-assembly.json', '12339-audio-selection-4b12d0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (proof.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Worker gain target identity differs.');
  const listing = new Map(proof.instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x4b12d0, 'PUSH', ['EBP']], [0x4b12f2, 'MOV', ['ESI', 'dword ptr [EBP + 0x78]']],
    [0x4b1311, 'FSTP', ['float ptr [EBP + 0x78]']], [0x4b1990, 'RET', ['0x8']], [0x4b1919, 'RET', ['0x8']],
    [0x4a7226, 'PUSH', ['0x0']], [0x4a7228, 'PUSH', ['ESI']], [0x4a7229, 'CALL', ['dword ptr [EAX + 0x60]']],
    [0x4a72f0, 'PUSH', ['0x1']], [0x4a72f2, 'PUSH', ['ESI']], [0x4a72f3, 'CALL', ['dword ptr [EAX + 0x60]']]]) {
    const row = listing.get(address); if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Worker gain retained ABI differs at${address.toString(16)}.`);
  }
  return {targetSha256: REDUX_SHA256, evidenceIds: proof.evidence.map(row => row.evidence_id)};
}
export async function createNativeWorkerGainPairCaptureConfig(directory, output) {
  const result = await createNativeRecoverySoundCaptureConfig(directory, output, nativeRecoveryWorkerProfileOptions);
  const config = result.configuration, points = nativeWorkerGainPairBreakpoints();
  config.breakpoints.push(...points); config.pendingFrameObserver.nestedBreakpointIds.push(...points.map(p => p.id));
  config.observationActivation.observationBreakpointIds.push(...points.map(p => p.id)); config.ownedWorkerGainPair = nativeWorkerGainPairPolicy();
  const policy = verifyNativeWorkerGainPairConfiguration(config), evidence = await verifyNativeWorkerGainPairEvidence();
  return {...result, policy, evidenceIds: [...new Set([...result.evidenceIds, ...evidence.evidenceIds])], limitations: [...result.limitations,
    'Separate one-call owned-worker gain entry/normal-exit policy; max2 endpoint snapshots. Unsupported4b1919/open/absent/mismatched return fails closed.',
    'Actual worker PC53 raw contexts and pre-FSTP source argument are captured. Exit uses proven preserved ESI, never overwritten argument4.',
    'No nullable waveform/voice/decoder chase or arbitrary mixer indexing. Missing pointees and reached external service observations remain required for source replay.',
    'No complete gain/private ABI/interleaving or audible playback result is claimed.']};
}
async function requireNew(filename) {try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;} throw Error(`Refusing existing worker gain output: ${filename}`);}
export async function prepareNativeWorkerGainPairCapture(directory, output, filename) {
  const result = await createNativeWorkerGainPairCaptureConfig(directory, output); await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, JSON.stringify(result.configuration, null, 2), {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, evidence: result.evidenceIds, policy: result.policy,
    method: 'Prepared only; no process launched.', limits: result.limitations};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, output, filename] = process.argv.slice(2); if (!directory || !output || !filename || process.argv.length !== 5) throw Error('Usage: node tools/prepare-native-worker-gain-pair-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
  console.log(JSON.stringify(await prepareNativeWorkerGainPairCapture(directory, output, filename)));
}
