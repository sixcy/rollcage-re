// Select a whole4749e0 frame which actually invokes first-force47b020.
// The observer domain is USED BODY-ARENA BYTES, not an invented event capacity.
import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {nativeFrameActiveSoundCaptureRanges} from './lib/native-frame-sound.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const nativeForceBoundaries = Object.freeze({entry: 0x47b020, caller: 0x47a90e, returnAddress: 0x47a913, belowFrameEsp: 96});

export async function createNativeForceFrameCaptureConfig(directory, output, {skipFrames = 120, maxCandidateFrames = 600} = {}) {
  if (!Number.isInteger(maxCandidateFrames) || maxCandidateFrames < 1 || maxCandidateFrames > 600) throw Error('Native force candidate bound must be1..600.');
  const evidence = await readInstructionEvidence(['050-ordinary-preparation-assembly.json', '076-first-body-effect-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Native force target SHA differs.');
  const listing = new Map(evidence.instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[nativeForceBoundaries.entry, 'SUB', ['ESP', '0x24']], [nativeForceBoundaries.caller, 'CALL', ['0x0047b020']], [nativeForceBoundaries.returnAddress, 'JMP', ['0x0047a91c']]]) {
    if (listing.get(address)?.op !== op || JSON.stringify(listing.get(address)?.args) !== JSON.stringify(args)) throw Error(`Retained force boundary differs at0x${address.toString(16)}.`);
  }
  const result = await createNativeFrameCaptureConfig(directory, output, {frames: 1, skipFrames, stackBytesBefore: 4096});
  result.configuration.captureThreadEnvironment = true;
  for (const bp of result.configuration.breakpoints.filter(row => ['native-frame-before', 'native-frame-after'].includes(row.id))) {
    bp.ranges.push(...nativeFrameActiveSoundCaptureRanges(),
      {id: 'active-effect-lookup-bytes', rva: '0x313180', dereferenceOffsets: ['0'], length: 64});
  }
  result.configuration.maxSnapshots += 64;
  result.configuration.breakpoints.push({id: 'native-force-entry', rva: '0x7b020', ranges: [
    ...nativeFrameGlobalRegions.map(({id, preferredAddress, length}) => ({id, rva: `0x${(preferredAddress - 0x400000).toString(16)}`, length})),
    {id: 'force-body-header', baseRegister: 'ecx', length: 0x180},
    {id: 'force-physical-body-list', rva: '0x502bc0', dereferenceOffsets: ['0'], length: 0x180},
    {id: 'force-caller', baseRegister: 'esp', length: 4},
  ]});
  result.configuration.pendingFrameObserver = {
    beforeBreakpointId: 'native-frame-before', afterBreakpointId: 'native-frame-after', eventBreakpointId: 'native-force-entry',
    maxPendingBytes: 128 * 1024 * 1024, maxCandidateFrames, maxEventSnapshots: 64,
    eventStackOffset: -nativeForceBoundaries.belowFrameEsp, eventReturnRva: '0x7a913', eventPointerRegister: 'ecx',
    //474160/474670 prove arena root and used byte cursor. Each admitted observer
    //slot is one used byte. The checker separately proves exact128-byte body
    //alignment and live physical-list membership, before comparing any input.
    eventRecordBytes: 1,
    eventPoolRoot: {id: 'force-body-arena-root', rva: '0x2e6b40', length: 4},
    eventPoolCapacity: {id: 'force-body-arena-used-bytes', rva: '0x30dcf4', length: 4},
  };
  return {...result, evidenceIds: [...result.evidenceIds, ...evidence.evidence.map(row => row.evidence_id)]};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing force capture output: ${filename}`);
}
export async function prepareNativeForceFrameCapture(directory, output, filename, options = {}) {
  const result = await createNativeForceFrameCaptureConfig(directory, output, options);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, evidence: result.evidenceIds,
    method: 'Prepared only: host-buffer complete active physics entries, retain the first frame invoking actual47b020 at its known47a8e0 call. No force/weapon/state writes; no process launched.',
    limits: ['A call can return without applying force because of native distance/direction gates; inspect actual output changes before claiming an impulse.', 'Observer byte-arena admission is distinct from body alignment/list/extent proof in replay.', 'Additional sound/lookup descendants may require another explicit capture if reached.', ...result.limitations]};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, skipFrames = '120'] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 6) throw Error('Usage: node tools/prepare-native-force-frame-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [SKIP_FRAMES]');
  console.log(JSON.stringify(await prepareNativeForceFrameCapture(directory, output, filename, {skipFrames: Number(skipFrames)})));
}
