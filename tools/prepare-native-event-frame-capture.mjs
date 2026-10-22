// Observer-only complete frame plus ordered474bb0 entry observations. No launch.
import {writeFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {nativeEventBoundaries, verifyNativeEventBoundaries} from './inspect-native-frame-events.mjs';

export async function createNativeEventFrameCaptureConfig(directory, output, {skipFrames = 120, logicalClock = 348, maxDispatchSnapshots = 64, stackBytesBefore = 4096, selection = 'clock'} = {}) {
  if (!['clock', 'first-collision', 'first-body-pair'].includes(selection)) throw Error('Event frame selection must be clock, first-collision or first-body-pair.');
  if (!Number.isInteger(logicalClock) || logicalClock < 0 || logicalClock > 0xffffffff) throw Error('Dispatch logical clock must be uint32.');
  if (!Number.isInteger(maxDispatchSnapshots) || maxDispatchSnapshots < 1 || maxDispatchSnapshots > 256) throw Error('Dispatch snapshot bound must be1..256.');
  if (selection !== 'clock' && maxDispatchSnapshots > 64) throw Error('Pending collision selection admits at most64 event snapshots.');
  const prepared = await createNativeFrameCaptureConfig(directory, output, {frames: 1, skipFrames, stackBytesBefore});
  const eventEvidence = await verifyNativeEventBoundaries();
  const clock = Buffer.alloc(4); clock.writeUInt32LE(logicalClock);
  prepared.configuration.maxSnapshots += maxDispatchSnapshots;
  prepared.configuration.breakpoints.push({
    id: 'native-dispatch-entry', rva: `0x${(nativeEventBoundaries.dispatchEntry - 0x400000).toString(16)}`,
    captureWhen: {range: {id: 'dispatch-clock', rva: '0x50a548', length: 4}, equalsBytesHex: clock.toString('hex')},
    ranges: [
      ...nativeFrameGlobalRegions.map(({id, preferredAddress, length}) => ({id, rva: `0x${(preferredAddress - 0x400000).toString(16)}`, length})),
      {id: 'dispatch-event', baseRegister: 'ecx', length: 0x68},
      {id: 'dispatch-return', baseRegister: 'esp', length: 4},
    ],
  });
  if (selection !== 'clock') {
    delete prepared.configuration.breakpoints.at(-1).captureWhen;
    if (selection === 'first-body-pair') prepared.configuration.breakpoints.at(-1).captureWhen = {
      range: {id: 'dispatch-kind', baseRegister: 'ecx', length: 4}, equalsBytesHex: '00000000',
    };
    prepared.configuration.pendingFrameObserver = {
      beforeBreakpointId: 'native-frame-before', afterBreakpointId: 'native-frame-after', eventBreakpointId: 'native-dispatch-entry',
      maxPendingBytes: 128 * 1024 * 1024, maxCandidateFrames: 600, maxEventSnapshots: maxDispatchSnapshots,
      eventStackOffset: -nativeEventBoundaries.dispatchEspBelowFrame,
      eventReturnRva: `0x${(nativeEventBoundaries.dispatchReturn - 0x400000).toString(16)}`,
      eventPointerRegister: 'ecx', eventRecordBytes: 0x68,
      eventPoolRoot: {id: 'dispatch-pool-root', rva: '0x502ba8', length: 4},
      eventPoolCapacity: {id: 'dispatch-pool-capacity', rva: '0x502ba4', length: 4},
    };
  }
  return {...prepared, logicalClock: selection === 'clock' ? logicalClock : null, selection, maxDispatchSnapshots, eventEvidence};
}

async function requireNew(filename) {
  try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error(`Refusing existing event-frame capture output: ${filename}`);
}

export async function prepareNativeEventFrameCapture(directory, output, filename, options = {}) {
  const result = await createNativeEventFrameCaptureConfig(directory, output, options);
  await requireNew(result.configuration.outputDirectory);
  await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory,
    logicalClock: result.logicalClock, selection: result.selection, skipFrames: result.skipFrames, maxDispatchSnapshots: result.maxDispatchSnapshots,
    evidence: [...result.evidenceIds, ...result.eventEvidence],
    method: result.selection === 'clock'
      ? 'Prepared only: one complete native frame and bounded direct dispatcher observations at an explicit logical clock. The checker must prove every dispatch belongs to the paired frame; a clock mismatch or premature snapshot bound fails.'
      : result.selection === 'first-body-pair'
        ? 'Prepared only: retain the first complete frame with a native kind0 body-pair dispatch. Compare the declared body-pair substream separately; raw static-event parity is not implied. All native dispatch invocations remain counted. No gameplay writes.'
        : 'Prepared only: buffer complete native entries on the host; discard event-free candidates and retain the first complete frame with an observed same-thread dispatcher call. Bounds and original ABI proofs remain explicit; no gameplay writes.',
    limits: result.limitations};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, skipFrames = '120', logicalClock = '348', selection = 'clock'] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 8) throw Error('Usage: node tools/prepare-native-event-frame-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [SKIP_FRAMES] [LOGICAL_CLOCK] [clock|first-collision|first-body-pair]');
  console.log(JSON.stringify(await prepareNativeEventFrameCapture(directory, output, filename, {skipFrames: Number(skipFrames), logicalClock: Number(logicalClock), selection})));
}
