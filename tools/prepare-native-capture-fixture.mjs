// Generates a synthetic x86 PE debugger fixture. Never launches an executable.
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function buildNativeCaptureFixture() {
  const bytes = Buffer.alloc(0x600);
  const word = (at, value) => bytes.writeUInt16LE(value, at);
  const dword = (at, value) => bytes.writeUInt32LE(value, at);
  bytes.write('MZ'); dword(0x3c, 0x80); bytes.write('PE\0\0', 0x80);
  word(0x84, 0x14c); word(0x86, 1); word(0x94, 0xe0); word(0x96, 0x102);
  const optional = 0x98;
  word(optional, 0x10b); bytes[optional + 2] = 14;
  dword(optional + 4, 0x400); dword(optional + 16, 0x1000);
  dword(optional + 20, 0x1000); dword(optional + 24, 0x1000);
  dword(optional + 28, 0x400000); dword(optional + 32, 0x1000); dword(optional + 36, 0x200);
  word(optional + 40, 4); word(optional + 48, 4);
  dword(optional + 56, 0x2000); dword(optional + 60, 0x200); word(optional + 68, 3);
  dword(optional + 72, 0x100000); dword(optional + 76, 0x1000);
  dword(optional + 80, 0x100000); dword(optional + 84, 0x1000); dword(optional + 92, 16);
  dword(optional + 104, 0x1200); dword(optional + 108, 40);
  dword(optional + 192, 0x1250); dword(optional + 196, 8);
  const section = 0x178;
  bytes.write('.fixture', section); dword(section + 8, 0x400); dword(section + 12, 0x1000);
  dword(section + 16, 0x400); dword(section + 20, 0x200); dword(section + 36, 0xe0000060);
  // mov [counter],0; mov ecx,3; inc [counter]; nop; loop inc; push 0; call [ExitProcess].
  Buffer.from('c7050011400000000000b903000000ff050011400090e2f76a00ff1550124000cc', 'hex').copy(bytes, 0x200);
  dword(0x400, 0x1240); dword(0x40c, 0x1260); dword(0x410, 0x1250);
  dword(0x440, 0x1280); dword(0x450, 0x1280);
  bytes.write('KERNEL32.dll\0', 0x460); bytes.write('ExitProcess\0', 0x482);
  return bytes;
}

export function buildPendingFrameFixture() {
  const bytes = buildNativeCaptureFixture();
  bytes.fill(0, 0x200, 0x300);
  // Two real calls to the same frame. First has no dispatch; second calls the
  // event with ESP=frameEntryESP-28 and ECX at the sole104-byte pool record.
  Buffer.from('c7050011400000000000c7050811400080114000c7050c11400001000000e81d000000e8180000006a00ff1550124000cc', 'hex').copy(bytes, 0x200);
  Buffer.from('ff0500114000833d0011400002751583ec18b980114000ba11000000e81f00000083c41890c3', 'hex').copy(bytes, 0x240);
  Buffer.from('90c3', 'hex').copy(bytes, 0x280);
  return bytes;
}

export function buildPendingFilteredFixture() {
  const bytes = buildPendingFrameFixture();
  // Remove only the native conditional skip. Both frames now dispatch, while
  // the observer's counter==2 predicate rejects the first actual event.
  if (bytes.subarray(0x24d, 0x24f).toString('hex') !== '7515') throw Error('Pending fixture conditional branch differs.');
  bytes.fill(0x90, 0x24d, 0x24f);
  return bytes;
}

export function buildThreadEnvironmentFixture() {
  const bytes = buildNativeCaptureFixture(); bytes.fill(0, 0x200, 0x300);
  //MOV EAX,FS:[0]; store observed SEH head; XOR EAX,EAX; MOV AX,FS;
  //store selector; NOP observation boundary; ExitProcess only after continuing.
  Buffer.from('64a100000000a30011400031c0668ce0a304114000906a00ff1550124000cc', 'hex').copy(bytes, 0x200);
  return bytes;
}

export function buildPendingThreadEnvironmentFixture() {
  const bytes = buildPendingFrameFixture(); bytes.fill(0, 0x200, 0x240);
  //Observe FS:[0] BEFORE either real frame CALL, leaving frame/event code and
  //their stack ABI unchanged. Counter1100 starts at the PE's original BSS zero.
  Buffer.from('64a100000000a310114000c7050811400080114000c7050c11400001000000e81c000000e8170000006a00ff1550124000cc', 'hex').copy(bytes, 0x200);
  return bytes;
}

export async function prepareNativeCaptureFixture(outputDirectory) {
  const destination = path.resolve(outputDirectory), executablePath = path.join(destination, 'synthetic-debugger-fixture.exe');
  const bytes = buildNativeCaptureFixture();
  await mkdir(destination);
  const configuration = {
    schemaVersion: 1, executablePath, workingDirectory: destination, arguments: [],
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    outputDirectory: path.join(destination, 'normal-capture'),
    maxDurationMs: 10000, maxEvents: 1000, maxSnapshots: 10, showWindow: false,
    breakpoints: [{id: 'counter-after-increment', rva: '0x1015', ranges: [{id: 'counter', address: '0x401100', length: 4}]}]
  };
  await writeFile(executablePath, bytes, {flag: 'wx'});
  await writeFile(path.join(destination, 'capture-config.json'), `${JSON.stringify(configuration, null, 2)}\n`, {flag: 'wx'});
  await writeFile(path.join(destination, 'bounded-config.json'), `${JSON.stringify({...configuration, outputDirectory: path.join(destination, 'bounded-capture'), maxSnapshots: 2}, null, 2)}\n`, {flag: 'wx'});
  const filtered = structuredClone(configuration);
  filtered.outputDirectory = path.join(destination, 'filtered-capture');
  filtered.breakpoints[0].stopAfterHits = 1;
  filtered.breakpoints[0].captureWhen = {range: {id: 'counter-gate', rva: '0x1100', length: 4}, equalsBytesHex: '02000000'};
  await writeFile(path.join(destination, 'filtered-config.json'), `${JSON.stringify(filtered, null, 2)}\n`, {flag: 'wx'});
  const matchingWindow = structuredClone(configuration);
  matchingWindow.outputDirectory = path.join(destination, 'matching-window-capture');
  matchingWindow.breakpoints[0].stopAfterHits = 1;
  matchingWindow.breakpoints[0].captureWhen = {range: {id: 'constant-zero-gate', rva: '0x1104', length: 4}, equalsBytesHex: '00000000'};
  matchingWindow.breakpoints[0].skipMatchingHits = 2;
  await writeFile(path.join(destination, 'matching-window-config.json'), `${JSON.stringify(matchingWindow, null, 2)}\n`, {flag: 'wx'});
  const pendingBytes = buildPendingFrameFixture(), pendingExecutable = path.join(destination, 'synthetic-pending-frame-fixture.exe');
  await writeFile(pendingExecutable, pendingBytes, {flag: 'wx'});
  const pendingFrame = {...configuration, executablePath: pendingExecutable, expectedSha256: createHash('sha256').update(pendingBytes).digest('hex'), outputDirectory: path.join(destination, 'pending-frame-capture'), maxSnapshots: 3,
    breakpoints: [
      {id: 'frame-before', rva: '0x1040', captureWhen: {range: {id: 'zero-gate', rva: '0x1104', length: 4}, equalsBytesHex: '00000000'}, skipMatchingHits: 0, ranges: [{id: 'counter', rva: '0x1100', length: 4}, {id: 'caller', baseRegister: 'esp', length: 4}]},
      {id: 'frame-after', rva: '0x1064', stopAfterHits: 1, captureWhen: {range: {id: 'zero-gate', rva: '0x1104', length: 4}, equalsBytesHex: '00000000'}, skipMatchingHits: 0, ranges: [{id: 'counter', rva: '0x1100', length: 4}, {id: 'caller', baseRegister: 'esp', length: 4}]},
      {id: 'dispatch', rva: '0x1080', ranges: [{id: 'counter', rva: '0x1100', length: 4}, {id: 'event', baseRegister: 'ecx', length: 104}, {id: 'caller', baseRegister: 'esp', length: 4}]},
    ],
    pendingFrameObserver: {beforeBreakpointId: 'frame-before', afterBreakpointId: 'frame-after', eventBreakpointId: 'dispatch', maxPendingBytes: 65536, maxCandidateFrames: 2, maxEventSnapshots: 1, eventStackOffset: -28, eventReturnRva: '0x1061', eventPointerRegister: 'ecx', eventRecordBytes: 104, eventPoolRoot: {id: 'pool', rva: '0x1108', length: 4}, eventPoolCapacity: {id: 'capacity', rva: '0x110c', length: 4}},
  };
  await writeFile(path.join(destination, 'pending-frame-config.json'), `${JSON.stringify(pendingFrame, null, 2)}\n`, {flag: 'wx'});
  const pendingFilteredBytes = buildPendingFilteredFixture(), pendingFilteredExecutable = path.join(destination, 'synthetic-pending-filtered-fixture.exe');
  await writeFile(pendingFilteredExecutable, pendingFilteredBytes, {flag: 'wx'});
  const pendingFiltered = structuredClone(pendingFrame);
  pendingFiltered.executablePath = pendingFilteredExecutable;
  pendingFiltered.expectedSha256 = createHash('sha256').update(pendingFilteredBytes).digest('hex');
  pendingFiltered.outputDirectory = path.join(destination, 'pending-filtered-capture');
  pendingFiltered.breakpoints.find(row => row.id === 'dispatch').captureWhen = {range: {id: 'event-counter-gate', rva: '0x1100', length: 4}, equalsBytesHex: '02000000'};
  await writeFile(path.join(destination, 'pending-filtered-config.json'), `${JSON.stringify(pendingFiltered, null, 2)}\n`, {flag: 'wx'});
  const threadBytes = buildThreadEnvironmentFixture(), threadExecutable = path.join(destination, 'synthetic-thread-environment-fixture.exe');
  await writeFile(threadExecutable, threadBytes, {flag: 'wx'});
  const threadEnvironment = {...configuration, executablePath: threadExecutable, expectedSha256: createHash('sha256').update(threadBytes).digest('hex'), outputDirectory: path.join(destination, 'thread-environment-capture'), captureThreadEnvironment: true, maxSnapshots: 1,
    breakpoints: [{id: 'thread-environment-observed', rva: '0x1015', ranges: [{id: 'counter', rva: '0x1100', length: 8}]}]};
  await writeFile(path.join(destination, 'thread-environment-config.json'), `${JSON.stringify(threadEnvironment, null, 2)}\n`, {flag: 'wx'});
  const pendingThreadBytes = buildPendingThreadEnvironmentFixture(), pendingThreadExecutable = path.join(destination, 'synthetic-pending-thread-environment-fixture.exe');
  await writeFile(pendingThreadExecutable, pendingThreadBytes, {flag: 'wx'});
  const pendingThreadEnvironment = {...structuredClone(pendingFrame), executablePath: pendingThreadExecutable, expectedSha256: createHash('sha256').update(pendingThreadBytes).digest('hex'), outputDirectory: path.join(destination, 'pending-thread-environment-capture'), captureThreadEnvironment: true, ranges: [{id: 'fixture-thread-seh', rva: '0x1110', length: 4}]};
  await writeFile(path.join(destination, 'pending-thread-environment-config.json'), `${JSON.stringify(pendingThreadEnvironment, null, 2)}\n`, {flag: 'wx'});
  await writeFile(path.join(destination, 'expected.json'), `${JSON.stringify({
    provenance: 'Synthetic x86 PE, generated without executing game code. Imports only KERNEL32!ExitProcess; no file, registry, network or child-process calls.',
    normal: {snapshots: 3, counters: [1, 2, 3], ecx: [3, 2, 1], eip: '0x00401015', completeReason: 'process-exit', exitCode: 0},
    bounded: {snapshots: 2, counters: [1, 2], completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    filtered: {snapshots: 1, skippedRawHits: [1], actualSkippedPredicateBytesHex: ['01000000'], counters: [2], snapshotHits: [1], snapshotRawHits: [2], snapshotMatchingHits: [1], completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    matchingWindow: {snapshots: 1, skippedRawHits: [1, 2], skippedMatchingHits: [1, 2], counters: [3], snapshotHits: [1], snapshotRawHits: [3], snapshotMatchingHits: [3], completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    pendingFrame: {snapshots: 3, counters: [1, 2, 2], snapshotHits: [1, 1, 1], snapshotRawHits: [2, 1, 2], snapshotMatchingHits: [2, 1, 2], candidateIndex: 2, discardedCandidates: [1], discardedObservedEvents: [0], eip: ['0x00401040', '0x00401080', '0x00401064'], completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    pendingFiltered: {snapshots: 3, counters: [1, 2, 2], snapshotHits: [1, 1, 1], snapshotRawHits: [2, 2, 2], snapshotMatchingHits: [2, 1, 2], candidateIndex: 2, discardedCandidates: [1], discardedObservedEvents: [1], eip: ['0x00401040', '0x00401080', '0x00401064'], completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    threadEnvironment: {snapshots: 1, eip: '0x00401015', completeReason: 'snapshot-bound', terminatedOwnedChild: true},
    pendingThreadEnvironment: {snapshots: 3, counters: [1, 2, 2], snapshotHits: [1, 1, 1], snapshotRawHits: [2, 1, 2], snapshotMatchingHits: [2, 1, 2], candidateIndex: 2, discardedCandidates: [1], discardedObservedEvents: [0], eip: ['0x00401040', '0x00401080', '0x00401064'], completeReason: 'snapshot-bound', terminatedOwnedChild: true}
  }, null, 2)}\n`, {flag: 'wx'});
  return {directory: destination, executablePath, configuration: path.join(destination, 'capture-config.json')};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node tools/prepare-native-capture-fixture.mjs NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(await prepareNativeCaptureFixture(process.argv[2])));
}
