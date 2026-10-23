import {writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReduxCaptureConfig} from './lib/redux-capture-config.mjs';
import {nativeFrameRootRanges} from './lib/native-frame-manifest.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const nativeFrameBoundaries = Object.freeze({entry: 0x4749e0, exit: 0x474b1e, caller: 0x451012, returnAddress: 0x451017});
const rva = address => `0x${(address - 0x400000).toString(16)}`;
const phaseGate = () => ({range: {id: 'active-race-phase', rva: rva(0x5ecb1c), dereferenceOffsets: ['0'], offset: '0x57c', length: 4}, equalsBytesHex: '04000000'});

export function assertNativeFrameBoundaries(instructions) {
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, ...args] of [
    [0x4749e0, 'PUSH', 'ECX'], [0x4749e1, 'PUSH', 'EBX'], [0x4749e2, 'PUSH', 'EBP'], [0x4749e3, 'PUSH', 'ESI'], [0x4749e4, 'PUSH', 'EDI'],
    [0x4749e5, 'CALL', '0x0046e9b0'], [0x474b17, 'POP', 'EDI'], [0x474b18, 'POP', 'ESI'], [0x474b19, 'POP', 'EBP'],
    [0x474b1a, 'XOR', 'EAX', 'EAX'], [0x474b1c, 'POP', 'EBX'], [0x474b1d, 'POP', 'ECX'], [0x474b1e, 'RET'],
    [0x474ac0, 'MOV', 'dword ptr [ESP + 0x10]', 'ESI'], [0x474ae7, 'MOV', 'dword ptr [ESP + 0x10]', 'EAX'],
    [0x451012, 'CALL', '0x004749e0'], [0x451017, 'CALL', '0x0044f050'],
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || row.args.length !== args.length || row.args.some((value, index) => value !== args[index])) throw Error(`Retained native frame boundary differs at0x${address.toString(16)}.`);
  }
}

export async function verifyNativeFrameBoundaries() {
  const evidence = await Promise.all([
    readInstructionEvidence(['278-physics-frame-assembly.json']),
    readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'}),
  ]);
  assertNativeFrameBoundaries(evidence.flatMap(row => row.instructions));
  const records = evidence.flatMap(row => row.evidence);
  if (records.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Native frame evidence target SHA differs.');
  return {instructions: evidence.flatMap(row => row.instructions), evidenceIds: records.map(row => row.evidence_id)};
}

// All are explicit game roots; each region is individually bounded. A null,
// unreadable or split logical allocation must fail capture/coverage, never be
// replaced with zero bytes. No process-wide sweep or pointer scanning occurs.
export function nativeFrameDependencyRanges({maxRegionBytes = 64 * 1024 * 1024} = {}) {
  if (!Number.isInteger(maxRegionBytes) || maxRegionBytes < 1 || maxRegionBytes > 64 * 1024 * 1024) throw Error('Invalid frame dependency region bound.');
  const region = (id, address, dereferenceOffsets) => ({id, rva: rva(address), dereferenceOffsets, readableRegion: true, maxRegionBytes});
  return [
    region('geometry-region', 0x90b970, ['0']), region('original-gfxm-region', 0x90b990, ['0']),
    region('terrain-pack-region', 0x90b98c, ['0']), region('sector-table-region', 0x90b98c, ['0', '0']),
    region('spatial-rows-region', 0x90b98c, ['0', '0x14']), region('spatial-nodes-region', 0x90b98c, ['0', '0x38']),
    region('terrain-normals-region', 0x90b98c, ['0', '0x1c']), region('zone-regions-region', 0x90b98c, ['0', '0x80']),
    region('static-model-links-region', 0x90b98c, ['0', '0x7c']), region('materials-region', 0x90b988, ['0']),
    region('session-region', 0x5ecb1c, ['0']), region('configuration-region', 0x5ecefc, ['0']),
    region('particle-region', 0x6e65b4, ['0']), region('debris-region', 0x902b84, ['0']),
    region('debris-free-region', 0x902b7c, ['0']), region('debris-active-region', 0x902b80, ['0']),
    region('skid-region', 0x8495d4, ['0']),
  ];
}

export async function createNativeFrameCaptureConfig(directory, outputDirectory, {frames = 1, skipFrames = 0, stackBytesBefore, maxRegionBytes = 64 * 1024 * 1024, attachmentWindowBytes = 1024} = {}) {
  if (!Number.isInteger(frames) || frames < 1 || frames > 3) throw Error('Whole-frame capture requires1..3 explicitly bounded frames.');
  if (!Number.isInteger(skipFrames) || skipFrames < 0 || skipFrames > 0x7fffffff) throw Error('skipFrames must be a nonnegative signed32 integer.');
  if (!Number.isInteger(stackBytesBefore) || stackBytesBefore < 4 || stackBytesBefore > 65536) throw Error('Declare a frame stack depth between4 and65536 bytes.');
  const evidence = await verifyNativeFrameBoundaries(), config = createReduxCaptureConfig(directory, 'hidden-idle', outputDirectory);
  config.breakpoints = config.breakpoints.filter(row => ['launcher-policy', 'graphics-policy', 'before-device-creation'].includes(row.id));
  const shared = [...nativeFrameRootRanges({stackBytesBefore, maxRegionBytes, attachmentWindowBytes}), ...nativeFrameDependencyRanges({maxRegionBytes})];
  config.ranges = [];
  config.maxDurationMs = 90000; config.maxEvents = 1000000; config.maxSnapshots = 3 + frames * 2;
  config.breakpoints.push(
    {id: 'native-frame-before', rva: rva(nativeFrameBoundaries.entry), ranges: structuredClone(shared), captureWhen: phaseGate(), skipMatchingHits: skipFrames},
    {id: 'native-frame-after', rva: rva(nativeFrameBoundaries.exit), ranges: structuredClone(shared), captureWhen: phaseGate(), skipMatchingHits: skipFrames, stopAfterHits: frames},
  );
  return {configuration: config, evidenceIds: evidence.evidenceIds, frames, skipFrames, stackBytesBefore,
    limitations: ['Explicit regions may not cover every logical geometry/effect allocation; replay fails on missing coverage.', 'Stack depth is caller declared and still requires retained callgraph proof.', 'Six native participants are preserved, with no physics/AI/input writes.', 'Hidden-window policies do not isolate physical input.']};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing frame capture output: ${filename}`);
}
export async function prepareNativeFrameCapture(directory, outputDirectory, configurationFile, options = {}) {
  const result = await createNativeFrameCaptureConfig(directory, outputDirectory, options), filename = path.resolve(configurationFile);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: filename, output: result.configuration.outputDirectory, frames: result.frames, skipFrames: result.skipFrames, stackBytesBefore: result.stackBytesBefore, evidence: result.evidenceIds, limits: result.limitations,
    method: 'Prepared only: actual active4749e0 entry/preRET pairs, explicit bounded roots and validated hidden policies; no process launched.'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, frameCount = '1', stackDepth, skipFrames = '0'] = process.argv.slice(2);
  if (!directory || !output || !filename || stackDepth === undefined) throw Error('Usage: node tools/prepare-native-frame-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIGURATION_FILE FRAMES STACK_BYTES_BEFORE [SKIP_FRAMES]');
  console.log(JSON.stringify(await prepareNativeFrameCapture(directory, output, filename, {frames: Number(frameCount), stackBytesBefore: Number(stackDepth), skipFrames: Number(skipFrames)})));
}
