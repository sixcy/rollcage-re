import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRecoverySoundCaptureConfig} from './prepare-native-recovery-sound-capture.mjs';
import {nativeRecoverySoundGenericBreakpoints, verifyNativeRecoverySoundCaptureConfiguration} from './lib/native-recovery-sound-selection.mjs';
import {nativeOwnedWorkerObservationPolicy, nativeWorkerLookupSite} from './lib/native-recovery-worker-observation.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const nativeRecoveryWorkerProfileOptions = Object.freeze({includeAllocations: true, includeVectorStorage: true, includeServiceSites: true,
  deferObservationsUntilControlledCaller: true, includeBindingSites: true, includeChannelSites: true, includePlaybackSites: true, includeActiveVectorEvidence: true});

export async function verifyNativeRecoveryWorkerEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['11733-audio-sample-backend-4a79f0.json', '12339-audio-selection-4b12d0-assembly.json',
    '11601-audio-sample-factory-4a7460.json', '12361-audio-spatial-4a7c10-assembly.json', '11745-audio-waveform-child-4adbd0.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Worker lookup evidence target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x4a79f0, 'PUSH', ['EBX']], [0x4b1301, 'CALL', ['dword ptr [EAX + 0x48]']],
    [0x4b1304, 'MOV', ['ECX', 'EAX']], [0x4a7632, 'CALL', ['dword ptr [EAX + 0x48]']],
    [0x4a7635, 'MOV', ['CL', 'byte ptr [EBP + 0x45e]']], [0x4a7c9e, 'CALL', ['dword ptr [EAX + 0x48]']],
    [0x4a7ca1, 'MOV', ['ECX', 'EAX']], [0x4adbfd, 'CALL', ['dword ptr [EAX + 0x48]']],
    [0x4adc00, 'MOV', ['EBP', 'dword ptr [ESP + 0x18]']]]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Worker lookup boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds: evidence.map(row => row.evidence_id)};
}

// Optional standalone profile: legacy preparer outputs are not modified.
export async function createNativeRecoveryWorkerCaptureConfig(directory, output) {
  const result = await createNativeRecoverySoundCaptureConfig(directory, output, nativeRecoveryWorkerProfileOptions);
  const configuration = result.configuration, id = nativeWorkerLookupSite[0];
  configuration.breakpoints.push(nativeRecoverySoundGenericBreakpoints({...nativeRecoveryWorkerProfileOptions, includeOwnedWorkerObservation: true}).find(row => row.id === id));
  configuration.pendingFrameObserver.nestedBreakpointIds.push(id);
  configuration.observationActivation.observationBreakpointIds.push(id);
  configuration.ownedWorkerObservation = nativeOwnedWorkerObservationPolicy();
  const soundSelection = verifyNativeRecoverySoundCaptureConfiguration(configuration), evidence = await verifyNativeRecoveryWorkerEvidence();
  return {...result, configuration, soundSelection, evidenceIds: [...new Set([...result.evidenceIds, ...evidence.evidenceIds])], limitations: [...result.limitations,
    'Exactly one lookup entry from the manager-owned live CREATE_THREAD worker may share the selected pending parent. The existing52 nested sites retain frame-thread scope and all original budgets.',
    'The actual eight-byte lookup entry stack and raw context identify only its immediate caller. ESI is never chased; manager/lock observations do not supply game-write answers. Missing worker observation fails closed.']};
}
async function requireNew(filename) {try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;} throw Error(`Refusing existing worker capture output: ${filename}`);}
export async function prepareNativeRecoveryWorkerCapture(directory, output, filename) {
  const result = await createNativeRecoveryWorkerCaptureConfig(directory, output);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, profile: 'services-worker', soundSelection: result.soundSelection,
    evidence: result.evidenceIds, method: 'Prepared only; no process launched.', limits: result.limitations};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length !== 5) throw Error('Usage: node tools/prepare-native-recovery-worker-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
  console.log(JSON.stringify(await prepareNativeRecoveryWorkerCapture(directory, output, filename)));
}
