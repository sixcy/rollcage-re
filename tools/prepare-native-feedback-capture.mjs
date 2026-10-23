// Observe the module inputs reached by the real between-frame drive stages.
// This extends the existing frame observer; it does not write race state.
import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {nativeFrameDriveInputRegions} from './lib/native-frame-drive-continuation.mjs';

export async function createNativeFeedbackCaptureConfig(directory, outputDirectory, options = {}) {
  const result = await createNativeFrameCaptureConfig(directory, outputDirectory, options);
  const inputs = nativeFrameDriveInputRegions.map(({id, preferredAddress, length}) => ({
    id, rva: `0x${(preferredAddress - 0x400000).toString(16)}`, length,
  }));
  for (const breakpoint of result.configuration.breakpoints) {
    if (!['native-frame-before', 'native-frame-after'].includes(breakpoint.id)) continue;
    const ids = new Set(breakpoint.ranges.map(row => row.id));
    if (inputs.some(row => ids.has(row.id))) throw Error('Drive input range conflicts with the frame observer.');
    breakpoint.ranges.push(...structuredClone(inputs));
  }
  return {...result, driveInputRanges: inputs,
    limitations: [...result.limitations,
      'Target registry and pickup controller ranges are observation bounds, not recovered native capacity limits.',
      'A captured root does not imply that every reached pointee or external service is available.']};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing feedback capture output: ${filename}`);
}

export async function prepareNativeFeedbackCapture(directory, outputDirectory, configurationFile, options = {}) {
  const result = await createNativeFeedbackCaptureConfig(directory, outputDirectory, options);
  const filename = path.resolve(configurationFile);
  await requireNew(result.configuration.outputDirectory);
  await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: filename, output: result.configuration.outputDirectory, frames: result.frames,
    skipFrames: result.skipFrames, stackBytesBefore: result.stackBytesBefore,
    driveInputRanges: result.driveInputRanges, evidence: result.evidenceIds, limits: result.limitations,
    method: 'Prepared only: bounded original-process frame observations plus explicit drive-stage module inputs; no process launched.'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, frames = '3', stackBytesBefore = '4096', skipFrames = '60'] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 8) throw Error('Usage: node tools/prepare-native-feedback-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIGURATION_FILE [FRAMES STACK_BYTES_BEFORE SKIP_FRAMES]');
  console.log(JSON.stringify(await prepareNativeFeedbackCapture(directory, output, filename,
    {frames: Number(frames), stackBytesBefore: Number(stackBytesBefore), skipFrames: Number(skipFrames)})));
}
