import {mkdir, writeFile, copyFile, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {firstByteDivergence} from './lib/native-body-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {nativeFrameBoundaries, verifyNativeFrameBoundaries} from './prepare-native-frame-capture.mjs';
import {inspectNativeFrameScenario} from './lib/native-frame-scenario.mjs';

const frameIds = ['native-frame-before', 'native-frame-after'];
function snapshotBase(snapshot) {
  const values = new Set([...snapshot.ranges.values()].map(row => row.moduleBaseAddress).filter(value => value !== null && value !== undefined).map(Number));
  if (snapshot.moduleBaseAddress !== undefined) values.add(Number(snapshot.moduleBaseAddress));
  if (values.size !== 1 || !Number.isSafeInteger([...values][0])) throw Error('Native frame snapshot lacks one observed module base.');
  return [...values][0];
}
function stackPolicy(breakpoint) {
  const row = breakpoint.ranges?.find(range => range.id === 'frame-stack');
  const before = -Number(row?.offset), after = Number(row?.length) - before;
  if (row?.baseRegister !== 'esp' || row.rva !== undefined || row.address !== undefined || row.readableRegion || row.dereferenceOffsets?.length || !Number.isInteger(before) || before < 4 || before > 65536 || after !== 4) throw Error('Native frame stack descriptor differs from explicit ESP scratch/return coverage.');
  const queue = breakpoint.ranges?.find(range => range.id === 'attachment-queue');
  if (Number(queue?.rva) !== 0x502040 || queue.length < 4 || queue.length > 65536 || queue.length % 4 || queue.readableRegion || queue.dereferenceOffsets?.length) throw Error('Missing explicit attachment observation window.');
  return {stackBytesBefore: before, stackBytesAfter: after, attachmentWindowBytes: queue.length};
}
function gatePolicy(breakpoint) {
  const gate = breakpoint.captureWhen, row = gate?.range;
  if (gate?.equalsBytesHex !== '04000000' || Number(row?.rva) !== 0x1ecb1c || Number(row.offset) !== 0x57c || row.length !== 4 || row.readableRegion || row.baseRegister !== undefined || row.address !== undefined || JSON.stringify(row.dereferenceOffsets) !== '["0"]') throw Error('Native frame capture must retain the explicit observer-only active-phase4 gate.');
}
function activeProof(snapshot, base, boundary) {
  const session = snapshot.ranges.get('session'), gate = snapshot.captureWhen, stack = snapshot.ranges.get('frame-stack'), esp = Number(snapshot.registers?.esp);
  if (!session || session.bytes.length < 0x590 || session.bytes[0x54d] !== 6 || session.bytes.readUInt32LE(0x57c) !== 4) throw Error('Native frame requires the unchanged six-participant active phase4 session.');
  if (gate?.actualBytesHex !== '04000000' || gate.equalsBytesHex !== '04000000' || Number(gate.address) !== Number(session.address) + 0x57c || !Number.isInteger(snapshot.rawHit) || snapshot.rawHit < snapshot.hit) throw Error('Missing observed active-phase predicate evidence.');
  if (Number(snapshot.registers?.eip) !== base + boundary - 0x400000 || !stack || !Number.isSafeInteger(esp)) throw Error('Native frame instruction/stack boundary differs.');
  return {esp, stack, session};
}

// Pure pairing validates the actual ABI identity, not merely adjacent snapshots
// or a hit count. Both gates are independent reads; missing exits fail closed.
export function pairNativeFrameSnapshots(capture, configuration) {
  if (capture.header?.executableSha256 !== REDUX_SHA256) throw Error('Native frame target SHA differs.');
  const beforeBp = configuration.breakpoints?.find(row => row.id === frameIds[0]), afterBp = configuration.breakpoints?.find(row => row.id === frameIds[1]);
  if (Number(beforeBp?.rva) !== nativeFrameBoundaries.entry - 0x400000 || Number(afterBp?.rva) !== nativeFrameBoundaries.exit - 0x400000) throw Error('Missing exact native frame entry/preRET breakpoints.');
  gatePolicy(beforeBp); gatePolicy(afterBp);
  const skipFrames = Object.hasOwn(beforeBp, 'skipMatchingHits') ? beforeBp.skipMatchingHits : 0;
  const exitSkipFrames = Object.hasOwn(afterBp, 'skipMatchingHits') ? afterBp.skipMatchingHits : 0;
  if (!Number.isInteger(skipFrames) || skipFrames < 0 || skipFrames > 0x7fffffff || exitSkipFrames !== skipFrames) throw Error('Entry/return matching-hit skip windows differ or are invalid.');
  const matchingProofRequired = Object.hasOwn(beforeBp, 'skipMatchingHits') || Object.hasOwn(afterBp, 'skipMatchingHits');
  const observer = configuration.pendingFrameObserver;
  if (observer && (observer.beforeBreakpointId !== frameIds[0] || observer.afterBreakpointId !== frameIds[1] || !configuration.breakpoints.some(row => row.id === observer.eventBreakpointId) || !Number.isInteger(observer.maxCandidateFrames) || observer.maxCandidateFrames < 1)) throw Error('Pending native frame observer boundary/candidate policy differs.');
  const options = stackPolicy(beforeBp);
  if (JSON.stringify(stackPolicy(afterBp)) !== JSON.stringify(options)) throw Error('Entry/return stack policies differ.');
  if (configuration.phaseActions?.some(action => frameIds.includes(action.breakpointId))) throw Error('Filtered frame observations cannot have phase writes.');
  const frames = afterBp.stopAfterHits;
  if (!Number.isInteger(frames) || frames < 1 || frames > 3 || beforeBp.stopAfterHits > 0) throw Error('Invalid bounded native frame count.');
  if (observer && (frames !== 1 || !capture.complete?.pendingFrameSelection)) throw Error('Pending native frame lacks its selected-frame terminal proof.');
  const terminal = capture.snapshots.at(-1);
  if (capture.complete?.reason !== 'snapshot-bound' || terminal?.breakpointId !== frameIds[1] || terminal.hit !== frames) throw Error('Capture did not reach its declared active frame-return bound.');
  const pending = new Map(), pairs = [];
  let entries = 0, exits = 0;
  for (const snapshot of capture.snapshots) {
    if (!frameIds.includes(snapshot.breakpointId)) continue;
    const before = snapshot.breakpointId === frameIds[0], base = snapshotBase(snapshot), proof = activeProof(snapshot, base, before ? nativeFrameBoundaries.entry : nativeFrameBoundaries.exit);
    const group = snapshot.pendingFrame;
    const candidateIndex = observer ? group?.candidateIndex : snapshot.hit;
    if (observer && (!group || snapshot.deferredPublication !== true || snapshot.hit !== 1 || !Number.isInteger(candidateIndex) || candidateIndex < 1 || candidateIndex > observer.maxCandidateFrames || group.role !== (before ? 'before' : 'after') || group.frameTid !== snapshot.tid || Number(group.frameEntryEsp) !== proof.esp || group.frameMatchingHit !== snapshot.matchingHit || !Number.isInteger(group.observedEventHits) || !Number.isInteger(group.qualifyingEventSnapshots) || group.qualifyingEventSnapshots < 1 || group.qualifyingEventSnapshots > observer.maxEventSnapshots || group.observedEventHits < group.qualifyingEventSnapshots || !Number.isInteger(snapshot.observedDebugEventOrdinal) || !Number.isFinite(snapshot.observedElapsedMs))) throw Error('Pending native frame snapshot lacks its deferred candidate/ABI/event proof.');
    if ((matchingProofRequired && snapshot.matchingHit === undefined) || (snapshot.matchingHit !== undefined && (!Number.isInteger(snapshot.matchingHit) || snapshot.matchingHit !== skipFrames + candidateIndex || snapshot.matchingHit > snapshot.rawHit))) throw Error('Native frame matching-hit proof differs from its declared skip window.');
    const count = snapshot.ranges.get('attachment-count')?.bytes;
    if (!count || count.length !== 4 || count.readInt32LE() < 0 || count.readInt32LE() * 4 > options.attachmentWindowBytes) throw Error('Native entry/exit attachment count exceeds its declared observation window.');
    if (Number(proof.stack.address) !== proof.esp - options.stackBytesBefore || proof.stack.bytes.length !== options.stackBytesBefore + 4) throw Error('Captured ESP/stack region identity differs.');
    const returnAddress = proof.stack.bytes.readUInt32LE(options.stackBytesBefore);
    if (returnAddress !== base + nativeFrameBoundaries.returnAddress - 0x400000) throw Error('Native frame caller return address differs from retained451012 CALL.');
    if (observer && Number(group.frameReturnAddress) !== returnAddress) throw Error('Pending native frame caller proof differs.');
    if (before) {
      if (pending.has(snapshot.tid) || snapshot.hit !== ++entries) throw Error('Nested/nonsequential native frame entry.');
      pending.set(snapshot.tid, {snapshot, base, esp: proof.esp, returnAddress}); continue;
    }
    const entry = pending.get(snapshot.tid);
    if (!entry || snapshot.hit !== ++exits) throw Error('Missing same-thread sequential native frame entry.');
    pending.delete(snapshot.tid);
    if (entry.base !== base || entry.esp !== proof.esp || entry.returnAddress !== returnAddress || entry.snapshot.hit !== snapshot.hit || Number(entry.snapshot.ranges.get('session').address) !== Number(proof.session.address)) throw Error('Native frame returned with different module/ESP/caller/session identity.');
    if (observer) {
      for (const key of ['candidateIndex', 'frameTid', 'frameEntryEsp', 'frameReturnAddress', 'frameMatchingHit', 'observedEventHits', 'qualifyingEventSnapshots']) if (entry.snapshot.pendingFrame[key] !== group[key] || capture.complete.pendingFrameSelection[key] !== group[key]) throw Error('Pending native frame entry/after/terminal selection proof differs.');
      if (entry.snapshot.observedDebugEventOrdinal >= snapshot.observedDebugEventOrdinal || entry.snapshot.observedElapsedMs > snapshot.observedElapsedMs) throw Error('Pending native frame observation order differs.');
    }
    pairs.push({before: entry.snapshot, after: snapshot, moduleBaseAddress: base, options, returnAddress, matchingHit: snapshot.matchingHit ?? snapshot.hit});
  }
  if (pending.size || pairs.length !== frames || entries !== frames || exits !== frames) throw Error('Unmatched or incomplete active native frame pairs.');
  return {pairs, frames, skipFrames, options};
}

export function compareNativeFramePair(pair, replay) {
  if (typeof replay?.span !== 'function' || !Array.isArray(replay.manifest?.requiredRegions) || replay.manifest.observed?.participantCount !== 6 || !Number.isInteger(replay.report?.nativeReturn)) throw Error('Replay result lacks the complete six-participant manifest/return contract.');
  const before = createCapturedMemory([...pair.before.ranges.values()]), after = createCapturedMemory([...pair.after.ranges.values()]);
  const comparisons = [];
  for (const region of replay.manifest.requiredRegions) {
    if (region.comparison === 'abi-input') continue;
    const expected = after.span(region.address, region.length), actual = replay.span(region.address, region.length);
    const divergence = firstByteDivergence(expected, actual);
    const readOnlyDivergence = region.comparison === 'read-only' ? firstByteDivergence(before.span(region.address, region.length), expected) : null;
    comparisons.push({id: region.id, address: region.address, length: region.length, policy: region.comparison, matched: !divergence && !readOnlyDivergence, divergence, readOnlyDivergence});
  }
  if (!comparisons.length) throw Error('Replay manifest selected no semantic comparison spans.');
  const nativeReturn = Number(pair.after.registers.eax) | 0, sourceReturn = replay.report.nativeReturn;
  // The live source report contains body/candidate views. Persist only bounded
  // counters, never traverse those views or serialize asset/runtime objects.
  const sourceReport = {};
  for (const key of ['nativeReturn', 'preparedBodies', 'scriptedBodies', 'ordinaryBodies', 'processedEvents', 'storedContacts', 'rejectedContacts', 'terrainQueries', 'terrainHits', 'modelQueries', 'modelHits', 'finishedBodies', 'regeneratedEvents', 'worldUpdatedRecords']) if (Number.isSafeInteger(replay.report[key])) sourceReport[key] = replay.report[key];
  if (Array.isArray(replay.report.vehicles)) {
    sourceReport.vehicleResults = replay.report.vehicles.length;
    for (const [name, key] of [['wheelQueries', 'queries'], ['wheelHits', 'hits']]) {
      if (replay.report.vehicles.every(vehicle => Number.isSafeInteger(vehicle.contacts?.[key]))) sourceReport[name] = replay.report.vehicles.reduce((sum, vehicle) => sum + vehicle.contacts[key], 0);
    }
  }
  if (Number.isSafeInteger(replay.report.candidates?.cursor)) sourceReport.candidateCursor = replay.report.candidates.cursor;
  return {matched: nativeReturn === sourceReturn && comparisons.every(row => row.matched), nativeReturn, sourceReturn, comparisons,
    comparedBytes: comparisons.reduce((sum, row) => sum + row.length, 0), firstDivergence: comparisons.find(row => !row.matched) ?? (nativeReturn !== sourceReturn ? {kind: 'return', nativeReturn, sourceReturn} : null),
    sourceReport, manifestStatus: replay.manifest.status, numericalContext: replay.numericalContext, nativeScenario: inspectNativeFrameScenario(pair, replay.manifest, {before, after})};
}

export async function checkNativeFrameReplay(input, output) {
  const evidence = await verifyNativeFrameBoundaries(), capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const pairing = pairNativeFrameSnapshots(capture, configuration), cases = [];
  await mkdir(output);
  for (const filename of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, filename), path.join(output, filename), constants.COPYFILE_EXCL);
  // Dynamic import allows pairing/verification tests before the complete replay
  // adapter exists; an absent/unsupported adapter is retained as a failed case.
  let replayNativeFrame, adapterError;
  try {({replayNativeFrame} = await import('./lib/native-frame-replay.mjs'));} catch (error) {adapterError = error;}
  for (const pair of pairing.pairs) {
    const row = {beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, tid: pair.before.tid, entryEsp: pair.before.registers.esp,
      moduleBaseAddress: pair.moduleBaseAddress, returnAddress: pair.returnAddress, frameHit: pair.before.hit, matchingHit: pair.matchingHit, beforeRawHit: pair.before.rawHit, afterRawHit: pair.after.rawHit};
    if (pair.before.pendingFrame) row.pendingFrame = pair.before.pendingFrame;
    try {
      if (adapterError) throw adapterError;
      const replay = await replayNativeFrame(pair.before, {...pair.options, moduleBaseAddress: pair.moduleBaseAddress});
      Object.assign(row, compareNativeFramePair(pair, replay));
    } catch (error) {Object.assign(row, {matched: false, replayStage: error.replayStage ?? null, replayError: error.stack});}
    cases.push(row);
  }
  const report = {schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'original-process-with-declared-instrumentation',
    method: 'Replay each whole active4749e0 entry through its same-thread/same-ESP preRET; preserve all six participants, actual pointer bytes and explicit module aliases. Compare every declared semantic span and native return; readonly policy also requires native entry/exit invariance.',
    captureDirectory: path.resolve(input), frames: pairing.frames, skipFrames: pairing.skipFrames, stackPolicy: pairing.options, boundaryEvidence: evidence.evidenceIds,
    matched: cases.every(row => row.matched), firstDivergence: cases.find(row => !row.matched) ?? null, cases, completion: capture.complete, interventions: capture.interventions,
    limits: ['Exact declared-region frame replay; no original wall-clock cadence or physical-input isolation verdict.', 'ABI scratch bytes are captured inputs and omitted from semantic equality.', 'Captured virtual regions may omit logical-allocation descendants; missing storage/callback/mapping is an explicit failed case.', 'Raw game asset/geometry blobs remain in the original private capture directory.', 'Successful cases are independently initialized from native entry state; continuous source-only trajectories require a separate producer/input sequence.']};
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return {report, output: path.resolve(output)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-frame-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const result = await checkNativeFrameReplay(input, output);
  console.log(JSON.stringify({matched: result.report.matched, frames: result.report.frames, firstDivergence: result.report.firstDivergence, output: result.output}));
  if (!result.report.matched) process.exitCode = 1;
}
