// Observe the entire original prephysics prefix on its actual clock and stack.
import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {nativeFrameControlInputRegions, verifyNativeControlPrefixEvidence} from './lib/native-frame-control-continuation.mjs';
import {verifyNativeControlBoundaries, verifyNativeControlCaptureConfiguration} from './lib/native-control-capture.mjs';

const rva = address => `0x${(address - 0x400000).toString(16)}`;
export function nativeControlHeapInputRanges({guardedAudioChannels = true} = {}) {
  if (typeof guardedAudioChannels !== 'boolean') throw Error('Guarded audio channel option must be boolean.');
  const ranges = [
    {id: 'control-fragment-registry', rva: rva(0x849a5c), dereferenceOffsets: ['0'], length: 36 * 8},
    {id: 'control-authored-body-list-region', rva: rva(0x91e77c), dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes: 16 * 1024 * 1024},
  ];
  if (!guardedAudioChannels) ranges.push(
    {id: 'control-audio-manager-region', rva: rva(0x714b08), dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes: 16 * 1024 * 1024},
    {id: 'control-audio-cache-vector', rva: rva(0x714b08), dereferenceOffsets: ['0', '0x830'], length: 12},
    {id: 'control-audio-cache-storage-region', rva: rva(0x714b08), dereferenceOffsets: ['0', '0x830', '0'], readableRegion: true, maxRegionBytes: 16 * 1024 * 1024},
  );
  const slots = guardedAudioChannels ? [['surface', 4], ['road', 8], ['engine', 12], ['special', 16], ['boost', 20], ['horn', 8]] : [['engine', 12], ['road', 8]];
  for (let car = 0; car < 6; car++) for (const [name, offset] of slots) {
    const root = name === 'horn' ? 0x713280 + car * 16 + offset : 0x713190 + car * 40 + offset, prefix = `control-car${car}-${name}`;
    const graph = [
      {id: `${prefix}-channel`, rva: rva(root), dereferenceOffsets: ['0'], length: 12},
      {id: `${prefix}-source`, rva: rva(root), dereferenceOffsets: ['0', '0'], length: 0x9a8},
      {id: `${prefix}-waveform`, rva: rva(root), dereferenceOffsets: ['0', '0', '0x964'], length: 0x440},
      {id: `${prefix}-vtable`, rva: rva(root), dereferenceOffsets: ['0', '0', '0'], length: 0x88},
      ...(guardedAudioChannels ? [{id: `${prefix}-effect`, rva: rva(root), dereferenceOffsets: ['0', '0', '0x9a0'], length: 20}] : []),
    ];
    for (const row of graph) {
      if (guardedAudioChannels) row.dereferenceMinimumValues = row.dereferenceOffsets.map((_, index) => index === 0 ? 257 : 1);
      ranges.push(row);
    }
  }
  // Transport for other reached sound channels; not a logical allocation size.
  if (!guardedAudioChannels) for (const [name, offsets] of [['channel', ['0']], ['source', ['0', '0']]]) ranges.push({
    id: `control-first-engine-${name}-region`, rva: rva(0x71319c), dereferenceOffsets: offsets,
    readableRegion: true, maxRegionBytes: 16 * 1024 * 1024,
  });
  return ranges;
}

export async function createNativeControlCaptureConfig(directory, output, {frames = 1, skipFrames = 60, stackBytesBefore = 24576, includeAfterAiCheckpoint = true, includePhysicsExit = false, guardedAudioChannels = true} = {}) {
  if (typeof includeAfterAiCheckpoint !== 'boolean') throw Error('Native control checkpoint option must be boolean.');
  if (typeof includePhysicsExit !== 'boolean') throw Error('Native control physics-exit option must be boolean.');
  const [prepared, boundaries, prefix] = await Promise.all([
    createNativeFrameCaptureConfig(directory, output, {frames, skipFrames, stackBytesBefore}),
    verifyNativeControlBoundaries(), verifyNativeControlPrefixEvidence(),
  ]);
  const moduleInputs = nativeFrameControlInputRegions.map(({id, preferredAddress, length}) => ({id, rva: rva(preferredAddress), length}));
  const heapInputs = nativeControlHeapInputRanges({guardedAudioChannels});
  for (const point of prepared.configuration.breakpoints) {
    const before = point.id === 'native-frame-before', after = point.id === 'native-frame-after';
    if (!before && !after) continue;
    point.id = before ? 'native-control-before' : 'native-control-after';
    point.rva = rva(before ? 0x450e50 : 0x4749e0);
    const stack = point.ranges.find(row => row.id === 'frame-stack');
    stack.length = stackBytesBefore + 32;
    point.ranges.push(...structuredClone(moduleInputs), ...structuredClone(heapInputs));
    if (new Set(point.ranges.map(row => row.id)).size !== point.ranges.length) throw Error('Control observation range IDs conflict.');
  }
  if (includeAfterAiCheckpoint) {
    const checkpoint = structuredClone(prepared.configuration.breakpoints.find(row => row.id === 'native-control-before'));
    checkpoint.id = 'native-control-after-ai'; checkpoint.rva = rva(0x450f18);
    prepared.configuration.breakpoints.push(checkpoint);
    prepared.configuration.maxSnapshots += frames;
  }
  if (includePhysicsExit) {
    const entry = prepared.configuration.breakpoints.find(row => row.id === 'native-control-after');
    const exit = structuredClone(entry);
    entry.stopAfterHits = 0;
    exit.id = 'native-control-after-physics'; exit.rva = rva(0x474b1e);
    prepared.configuration.breakpoints.push(exit);
    prepared.configuration.maxSnapshots += frames;
  }
  const policy = verifyNativeControlCaptureConfiguration(prepared.configuration);
  return {...prepared, ...policy, evidenceIds: [...new Set([...prepared.evidenceIds, ...boundaries.evidenceIds, ...prefix.evidenceIds])],
    limitations: [...prepared.limitations,
      includePhysicsExit
        ? 'This captures450e50 entry,4749e0 entry and474b1e preRET; a joined source replay still needs to establish every intervening producer without refreshing from observed physics-entry outputs.'
        : 'This captures450e50 entry through4749e0 entry, before physics executes; it is not a physics entry/exit pair or a carried full tick.',
      'The optional450f18 checkpoint isolates the completed AI/route sweep before vehicle audio. A checkpoint match does not establish the full prephysics prefix.',
      ...(includePhysicsExit ? ['The optional474b1e preRET snapshot observes the following physics call without supplying its output to the prephysics replay; it requires separate joined-source validation.'] : []),
      guardedAudioChannels
        ? 'All six cars have exact channel/source/waveform/vtable/effect observations for five sound slots and the horn. Native channel>256 and later nonnull guards are checked before dereference; false guards supply no pointee memory.'
        : 'Legacy engine/road graphs require actual nonnull pointers; other sound allocations are available only if the explicit captured transport covers their actual addresses.',
      'Authored-body-list transport requires its actual nonnull pointer; source comparison admits only the actual91e778 count times four bytes, not the containing region as capacity.',
      ...(guardedAudioChannels ? [] : ['Audio manager/cache transports require a populated cache; actual region coverage determines whether other waveforms are available.']),
      'Obstacle ranges are bounded observations; the replay must validate actual counts before using them. No native capacity is inferred.']};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing control capture output: ${filename}`);
}
export async function prepareNativeControlCapture(directory, output, configurationFile, options = {}) {
  const result = await createNativeControlCaptureConfig(directory, output, options), filename = path.resolve(configurationFile);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: filename, output: result.configuration.outputDirectory, frames: result.frames, skipFrames: result.skipFrames,
    options: result.options, physicsExitCheckpoint: result.physicsExitCheckpoint, evidence: result.evidenceIds, limits: result.limitations,
    method: 'Prepared only: original six-car phase4 race-update entry to physics-entry observations; no process launched or game state supplied.'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, frames = '1', stackBytesBefore = '24576', skipFrames = '60', physicsExit] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 9 || physicsExit !== undefined && physicsExit !== '--include-physics-exit') throw Error('Usage: node tools/prepare-native-control-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [FRAMES STACK_BYTES_BEFORE SKIP_FRAMES [--include-physics-exit]]');
  console.log(JSON.stringify(await prepareNativeControlCapture(directory, output, filename,
    {frames: Number(frames), stackBytesBefore: Number(stackBytesBefore), skipFrames: Number(skipFrames), includePhysicsExit: physicsExit === '--include-physics-exit'})));
}
