import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createControlledNativeRecoveryCaptureConfig} from './prepare-controlled-native-recovery-capture.mjs';
import {nativeWorkerGainPairBreakpoints} from './lib/native-worker-gain-pair.mjs';
import {nativeWorkerGainWindowPolicy, verifyNativeWorkerGainWindowConfiguration} from './lib/native-worker-gain-window.mjs';
import {verifyNativeWorkerGainPairEvidence} from './prepare-native-worker-gain-pair-capture.mjs';

export async function createNativeWorkerGainWindowCaptureConfig(directory, output) {
  const result = await createControlledNativeRecoveryCaptureConfig(directory, output, {stackBytesBefore: 24576});
  const config = result.configuration;
  config.pendingFrameObserver.maxPendingBytes = 128 * 1024 * 1024 - 262144;
  const points = nativeWorkerGainPairBreakpoints();
  config.breakpoints.push(...points);
  config.observationActivation = {breakpointId: 'controlled-recovery-caller', rawHit: 229, observationBreakpointIds: points.map(p => p.id)};
  config.ownedWorkerGainWindow = nativeWorkerGainWindowPolicy();
  const policy = verifyNativeWorkerGainWindowConfiguration(config), evidence = await verifyNativeWorkerGainPairEvidence();
  return {...result, policy, evidenceIds: [...new Set([...result.evidenceIds, ...evidence.evidenceIds])], limitations: [...result.limitations,
    'Independent activation-anchored worker leaf entry/normal RET8 pair; no same-parent interleaving claim. No worker scheduling intervention.',
    'One real selected recovery parent is retained separately. Completion requires both observations within the original 90-second/global snapshot bounds.',
    'Entry/return inputs only: missing waveform/voice/mixer objects and external service outcomes remain explicit. No full gain, private ABI or concurrency reconstruction claim.']};
}
async function requireNew(filename) {try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;} throw Error(`Refusing existing worker window output: ${filename}`);}
export async function prepareNativeWorkerGainWindowCapture(directory, output, filename) {
  const result = await createNativeWorkerGainWindowCaptureConfig(directory, output);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, JSON.stringify(result.configuration, null, 2) + '\n', {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, policy: result.policy, evidence: result.evidenceIds,
    method: 'Prepared only; no process launched.', limits: result.limitations};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [directory, output, filename] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length !== 5) throw Error('Usage: node tools/prepare-native-worker-gain-window-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
  console.log(JSON.stringify(await prepareNativeWorkerGainWindowCapture(directory, output, filename)));
}
