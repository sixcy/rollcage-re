// Original47e180 recovery prepass observations; preparation never starts Redux.
import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const nativePrepassBoundaries = Object.freeze({entry: 0x47e180, exit: 0x47e234, caller: 0x47ccff, returnAddress: 0x47cd04});

export async function createNativePrepassCaptureConfig(directory, output, {frames = 3, skipFrames = 0, stackBytesBefore = 4096, includePhysicsBreadcrumb = false} = {}) {
  if (typeof includePhysicsBreadcrumb !== 'boolean') throw Error('Physics breadcrumb selection must be boolean.');
  if (!Number.isInteger(stackBytesBefore) || stackBytesBefore < 8) throw Error('Prepass observation requires both saved-register slots.');
  const evidence = await readInstructionEvidence(['109-post-frame-vehicle-check-assembly.json', '098-post-frame-body-states-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Native prepass target SHA differs.');
  const listing = new Map(evidence.instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[nativePrepassBoundaries.entry, 'MOV', ['ECX', 'dword ptr [0x005ecb1c]']], [nativePrepassBoundaries.exit, 'RET', []], [nativePrepassBoundaries.caller, 'CALL', ['0x0047e180']], [nativePrepassBoundaries.returnAddress, 'MOVZX', ['EBX', 'word ptr [0x00902bc4]']]]) {
    if (listing.get(address)?.op !== op || JSON.stringify(listing.get(address)?.args) !== JSON.stringify(args)) throw Error(`Native prepass boundary differs at0x${address.toString(16)}.`);
  }
  const result = await createNativeFrameCaptureConfig(directory, output, {frames, skipFrames, stackBytesBefore});
  for (const [oldId, id, address] of [['native-frame-before', 'native-prepass-before', nativePrepassBoundaries.entry], ['native-frame-after', 'native-prepass-after', nativePrepassBoundaries.exit]]) {
    const breakpoint = result.configuration.breakpoints.find(row => row.id === oldId);
    breakpoint.id = id; breakpoint.rva = `0x${(address - 0x400000).toString(16)}`;
  }
  if (includePhysicsBreadcrumb) {
    const before = result.configuration.breakpoints.find(row => row.id === 'native-prepass-before');
    result.configuration.maxSnapshots += frames;
    result.configuration.stopThreadStackBytes = 512;
    result.configuration.breakpoints.push({id: 'physics-entry-breadcrumb', rva: '0x749e0', captureWhen: structuredClone(before.captureWhen), ranges: [
      {id: 'clock', rva: '0x50a548', length: 4},
      {id: 'session', rva: '0x1ecb1c', dereferenceOffsets: ['0'], length: 0x590},
      {id: 'caller', baseRegister: 'esp', length: 4},
    ]});
  }
  return {...result, evidenceIds: [...result.evidenceIds, ...evidence.evidence.map(row => row.evidence_id)]};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing prepass output: ${filename}`);
}
export async function prepareNativePrepassCapture(directory, output, filename, options = {}) {
  const result = await createNativePrepassCaptureConfig(directory, output, options);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, frames: result.frames, skipFrames: result.skipFrames,
    evidence: result.evidenceIds, method: 'Prepared only: bounded original47e180 entry/preRET observations in active phase4. No rejection/pose/route/physics writes and no process launched.',
    limits: ['This prepass can mark recovery candidates; a successful comparison without rejection transitions does not prove a respawn.', ...result.limitations]};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, frames = '3', skipFrames = '0', breadcrumb] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 8 || (breadcrumb !== undefined && breadcrumb !== 'breadcrumb')) throw Error('Usage: node tools/prepare-native-prepass-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [FRAMES] [SKIP_FRAMES] [breadcrumb]');
  console.log(JSON.stringify(await prepareNativePrepassCapture(directory, output, filename, {frames: Number(frames), skipFrames: Number(skipFrames), includePhysicsBreadcrumb: breadcrumb === 'breadcrumb'})));
}
