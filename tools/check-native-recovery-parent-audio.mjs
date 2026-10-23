import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {replayNativeRecoveryParent} from './lib/native-recovery-parent-replay.mjs';
import {compareNativePrepassPair} from './check-native-prepass-replay.mjs';
import {createNativeRecoveryAdaptiveSoundBindings} from './lib/native-recovery-channel-replay.mjs';
import {nativeRecoveryFactoryInputAliases} from './lib/native-recovery-factory-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from './lib/native-recovery-sound-selection.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {firstByteDivergence} from './lib/native-body-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

// Extra inputs are original read-before-use observations, never finished game
// children. Allocator preimages remain deferred external outputs: the parent
// already observes their backing with different, earlier freed-heap contents.
export function compareNativeRecoveryParentAudio(capture, pair, configuration) {
  const adapters = createNativeRecoveryAdaptiveSoundBindings({capture, pair, configuration});
  const inputs = adapters.additionalInputSpans.filter(row => row.role === 'actual-read-before-use-input');
  const ranges = new Map(pair.before.ranges);
  for (const [index, row] of inputs.entries()) ranges.set(`adaptive-input-${index}`, {
    id: `adaptive-input-${index}`, address: row.address, length: row.length, bytes: row.bytes,
  });
  const before = {...pair.before, ranges};
  let replay, semantic, audio, error;
  try {
    replay = replayNativeRecoveryParent(before, {...pair.options, moduleBaseAddress: pair.moduleBaseAddress, nativeAudio: true,
      additionalInputAliases: nativeRecoveryFactoryInputAliases([...pair.before.ranges.values()], pair.moduleBaseAddress),
      nativeSoundContinuations: {
        selectAdaptiveSoundChannelOnStack: adapters.selectAdaptiveSoundChannelOnStack,
        playSelectedNativeSoundOnStack: adapters.playSelectedNativeSoundOnStack,
      }});
    semantic = compareNativePrepassPair(pair, replay);
    const proof = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
    const original = createCapturedMemory([...pair.after.ranges.values()]).memory;
    const regions = [
      ['owner', proof.ownerAddress, 0x490], ['wrapper', proof.wrapperAddress, 12],
      ['source', proof.sourceAddress, 0x9a8], ['channel-storage', proof.channelVectorObservations.allocation.address, 4],
      ['manager', proof.managerAddress, 0xd74],
    ];
    for (const offset of [0x830, 0x834, 0x838, 0x83c, 0x840, 0x84c]) {
      const header = original.readUInt32LE(proof.managerAddress + offset);
      regions.push([`vector-${offset.toString(16)}-header`, header, 12]);
      const begin = original.readUInt32LE(header), end = original.readUInt32LE(header + 4), capacity = original.readUInt32LE(header + 8);
      if (end < begin || capacity < end || !begin && (end || capacity) || capacity - begin > 65536) throw Error('Parent audio output vector exceeds its declared bound.');
      if (capacity > begin) regions.push([`vector-${offset.toString(16)}-storage`, begin, capacity - begin]);
    }
    const rows = regions.map(([id, address, length]) => {
      const difference = firstByteDivergence(original.subarray(address, address + length), replay.memory.subarray(address, address + length));
      return {id, address, length, matched: !difference, difference};
    });
    audio = {matched: rows.every(row => row.matched), comparedBytes: rows.reduce((sum, row) => sum + row.length, 0), regions: rows};
  } catch (failure) {error = {message: failure.message, stage: failure.replayStage ?? null, boundary: failure.boundary ?? null, stack: failure.stack};}
  return {matched: semantic?.matched === true && audio?.matched === true, sourceComplete: Boolean(replay), fullPrivateAbiMatched: false,
    ...(semantic ? {semantic} : {}), ...(audio ? {audio} : {}), ...(error ? {error} : {}),
    inputAdmissions: inputs.map(({id, address, length, originalOrdinal}) => ({id, address, length, originalOrdinal})),
    deferredAllocatorOutputs: adapters.additionalInputSpans.filter(row => row.role === 'allocator-output-capacity').map(({id, address, length, originalOrdinal, initializeAt}) => ({id, address, length, originalOrdinal, initializeAt})),
    sourceEvents: adapters.events, sourceCheckpoints: adapters.checkpoints,
    factoryExternalEvents: adapters.factoryExternalEvents, playbackComplete: adapters.playbackComplete,
    limits: [...adapters.limits, 'Additional original cache/mixer/COM read inputs are admitted explicitly; this is not a reconstruction of their complete prior initialization or concurrent producers.',
      'Only declared semantic output and listed audio regions are compared. Full private CPU/CRT stack and uninterrupted original trajectories remain outside this check.']};
}

export async function checkNativeRecoveryParentAudio(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  if (pairs.length !== 1) throw Error('Parent audio comparison requires exactly one complete controlled parent.');
  const report = {schemaVersion: 1, targetSha256: REDUX_SHA256, captureDirectory: path.resolve(input), authority: 'controlled-native-recovery-input',
    ...compareNativeRecoveryParentAudio(capture, pairs[0], configuration)};
  await mkdir(output);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-recovery-parent-audio.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoveryParentAudio(input, output);
  console.log(JSON.stringify({matched: report.matched, sourceComplete: report.sourceComplete, error: report.error?.message, output}));
  if (!report.matched) process.exitCode = 1;
}
