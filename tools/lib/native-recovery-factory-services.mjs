import {createCapturedMemory} from './captured-memory.mjs';
import {inspectNativeRecoverySourceServices} from './native-recovery-source-replay.mjs';

export class NativeRecoveryFactoryBoundary extends Error {
  constructor(boundary) {super(`${boundary.kind}: ${boundary.message}`); this.boundary = boundary;}
}
const number = value => Number(value);
const fail = (kind, message, details = {}) => {throw new NativeRecoveryFactoryBoundary({kind, message, ...details});};
function equalBytes(actual, expected, label, address) {
  if (actual.equals(expected)) return;
  let offset = 0; while (offset < actual.length && offset < expected.length && actual[offset] === expected[offset]) offset++;
  fail('input-divergence', `${label} differs before the original external call.`, {address, offset,
    sourceHex: actual.subarray(offset, offset + 24).toString('hex'), originalHex: expected.subarray(offset, offset + 24).toString('hex')});
}
const serviceNames = {'find-first': 'FindFirstFileW', 'find-close': 'FindClose', 'file-open': 'CreateFileW', 'file-retry': 'CreateFileW',
  'file-error': 'GetLastError', 'file-sleep': 'Sleep', 'file-size': 'GetFileSizeEx', 'file-close': 'CloseHandle', 'outer-close': 'CloseHandle'};

//Microsoft's GetFileSizeEx successful [out] PLARGE_INTEGER contract owns all
//eight bytes. Its previous scratch contents are not a semantic input.
//https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfilesizeex
export function applyObservedSuccessfulFileSize(memory, event, args) {
  const nativeArgs = Buffer.from(event.argumentsHex, 'hex'), output = Buffer.from(event.outputHex, 'hex');
  if (!Number.isSafeInteger(event.actualReturnEax) || event.actualReturnEax < 1 || event.actualReturnEax > 0xffffffff || nativeArgs.length !== 8 || output.length !== 8 || Buffer.from(event.inputHex, 'hex').length !== 8
    || args.length !== 2 || args[0] !== nativeArgs.readUInt32LE() || args[1] !== nativeArgs.readUInt32LE(4) || args[1] !== event.outputAddress)
    fail('external-abi', 'Successful GetFileSizeEx typed output contract differs.');
  const sourcePreimage = Buffer.from(memory.subarray(event.outputAddress, event.outputAddress + 8));
  output.copy(memory.subarray(event.outputAddress, event.outputAddress + 8));
  return {address: event.outputAddress, length: 8, sourcePreimageHex: sourcePreimage.toString('hex'), originalPreimageHex: event.inputHex,
    preimageMatched: sourcePreimage.equals(Buffer.from(event.inputHex, 'hex')), contract: 'Successful GetFileSizeEx fully written8B [out] LARGE_INTEGER; pre-call scratch is not compared as an API input.'};
}

//Explicit opt-in success contract: defined WIN32_FIND_DATAW fields only.
//Reserved words and unused string-array tails are caller/private bytes.
//https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirstfilew
//https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-win32_find_dataw
export function applyObservedSuccessfulFindFirst(memory, event, args) {
  const nativeArgs = Buffer.from(event.argumentsHex, 'hex'), before = Buffer.from(event.inputHex, 'hex'), after = Buffer.from(event.outputHex, 'hex');
  if (!Number.isSafeInteger(event.actualReturnEax) || event.actualReturnEax < 0 || event.actualReturnEax >= 0xffffffff || nativeArgs.length !== 8
    || before.length !== 592 || after.length !== 592 || args.length !== 2 || args[0] !== nativeArgs.readUInt32LE() || args[1] !== nativeArgs.readUInt32LE(4) || args[1] !== event.outputAddress)
    fail('external-abi', 'Successful FindFirstFileW typed output contract differs.');
  const spans = [{offset: 0, length: 36, fields: 'attributes/times/file-size'}];
  if (after.readUInt32LE() & 0x400) spans.push({offset: 36, length: 4, fields: 'reparse tag'});
  for (const [offset, capacity, fields] of [[44, 260, 'file name'], [564, 14, 'alternate file name']]) {
    let count = 0; while (count < capacity && after.readUInt16LE(offset + count * 2)) count++;
    if (count === capacity) fail('external-abi', `Successful FindFirstFileW ${fields} lacks its bounded NUL.`);
    spans.push({offset, length: (count + 1) * 2, fields});
  }
  const source = Buffer.from(memory.subarray(event.outputAddress, event.outputAddress + 592)), notCompared = [];
  let offset = 0;
  while (offset < 592) {
    if (spans.some(row => offset >= row.offset && offset < row.offset + row.length)) {offset++; continue;}
    const begin = offset; while (offset < 592 && !spans.some(row => offset >= row.offset && offset < row.offset + row.length)) offset++;
    notCompared.push({offset: begin, length: offset - begin, sourcePreimageHex: source.subarray(begin, offset).toString('hex'),
      originalPreimageHex: before.subarray(begin, offset).toString('hex'), originalAfterHex: after.subarray(begin, offset).toString('hex')});
  }
  for (const row of spans) after.subarray(row.offset, row.offset + row.length).copy(memory.subarray(event.outputAddress + row.offset, event.outputAddress + row.offset + row.length));
  return {address: event.outputAddress, length: 592, contract: 'Opt-in successful FindFirstFileW defined fields and bounded NUL strings only; reserved words/unused tails preserved in source.',
    preimageMatched: source.equals(before), definedSpans: spans, notCompared};
}

//Only observed external interfaces are supplied. Game child routines still
//execute their ports. Original finished source/manager bytes are never applied.
export function createNativeRecoveryFactoryServices({capture, pair, lineage, memory, crt, typedSuccessfulFindFirst = false, allocationPreimagesAtReturn = false}) {
  if (!lineage.bindingObservations?.verified) fail('missing-evidence', 'Factory requires verified actual external binding observations.');
  const observations = inspectNativeRecoverySourceServices(capture, pair, lineage), calls = [], privateOutputPreimages = [], checkpoints = [], byOrdinal = new Map(capture.snapshots.map(row => [row.ordinal, row]));
  const snapshotMemory = ordinal => createCapturedMemory([...byOrdinal.get(ordinal).ranges.values()]);
  const events = lineage.bindingObservations.services.map(row => ({...row, name: serviceNames[row.name], kind: 'file'}));
  for (const lock of observations.criticalSections.filter(row => row.kind !== 'playback')) {
    const entered = byOrdinal.get(lock.enteredOrdinal), thread = byOrdinal.get(lock.threadOrdinal), left = byOrdinal.get(lock.leftOrdinal);
    events.push({kind: 'lock-enter', name: 'EnterCriticalSection', callOrdinal: lock.enteredOrdinal, returnOrdinal: lock.enteredOrdinal,
      callEsp: number(entered.registers.esp) - 4, returned: entered, args: [lock.address], lock});
    events.push({kind: 'thread', name: 'GetCurrentThreadId', callOrdinal: lock.threadOrdinal, returnOrdinal: lock.threadOrdinal,
      callEsp: number(thread.registers.esp), returned: thread, args: [], lock});
    events.push({kind: 'lock-leave', name: 'LeaveCriticalSection', callOrdinal: lock.leftOrdinal, returnOrdinal: lock.leftOrdinal,
      callEsp: number(left.registers.esp) - 4, returned: left, args: [lock.address], lock});
  }
  events.push({kind: 'COM', name: 'CreateSourceVoice', callOrdinal: observations.com.callOrdinal, returnOrdinal: observations.com.returnOrdinal,
    callEsp: observations.com.callEsp, args: observations.com.args, com: observations.com});
  const allocationCall = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-new-source-call' && row.tid === pair.before.tid && number(row.registers.esp) === lineage.layout.sourceAllocationEsp);
  const allocationReturn = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-new-source-return' && row.tid === pair.before.tid && number(row.registers.esp) === lineage.layout.sourceAllocationEsp);
  if (!allocationCall || !allocationReturn) fail('missing-evidence', 'Factory source allocator boundary is absent.');
  events.push({kind: 'allocation', name: 'operatorNew', callOrdinal: allocationCall.ordinal, returnOrdinal: allocationReturn.ordinal,
    callEsp: number(allocationCall.registers.esp), args: [0x9a8], returned: allocationReturn});
  events.sort((a, b) => a.callOrdinal - b.callOrdinal);
  let index = 0;
  const lockPreimages = new Map();
  const managerBefore = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-manager-call' && row.tid === pair.before.tid && number(row.registers.esp) === lineage.layout.managerEntry + 4);
  const originalManager = managerBefore?.ranges.get('recovery-audio-manager-region');
  if (!originalManager || number(originalManager.address) !== lineage.managerAddress) fail('missing-evidence', 'Factory requires its actual manager input.');
  lockPreimages.set(lineage.managerAddress + 0x854, Buffer.from(originalManager.bytes.subarray(0x854, 0x86c)));

  function next(name, args, runtime, kind) {
    const event = events[index];
    if (!event || event.name !== name || runtime.scratchBase !== event.callEsp - 4 || (event.kind === 'COM') !== (kind === 'COM'))
      fail('external-abi', `Factory ${name} is outside its next original external boundary.`, {index, expected: event?.name, expectedEntryEsp: event && event.callEsp - 4, actualEntryEsp: runtime.scratchBase});
    const native = event.kind === 'file' || event.kind === 'allocation' ? snapshotMemory(event.callOrdinal) : null;
    const expected = event.args ?? Array.from({length: (event.argumentsHex?.length ?? 0) / 8}, (_, lane) => Buffer.from(event.argumentsHex, 'hex').readUInt32LE(lane * 4));
    if (args.length !== expected.length || args.some((value, lane) => (value >>> 0) !== expected[lane])) fail('external-abi', `Factory ${name} original arguments differ.`, {expected, actual: args});
    const returnAddress = event.kind === 'file' || event.kind === 'allocation' ? number(byOrdinal.get(event.returnOrdinal).registers.eip)
      : event.kind === 'COM' ? event.com.callerReturn : number(event.returned.registers.eip);
    if (memory.readUInt32LE(runtime.scratchBase) !== returnAddress) fail('external-abi', `Factory ${name} original CPU return word differs.`);
    const argumentBytes = Buffer.alloc(expected.length * 4); expected.forEach((value, lane) => argumentBytes.writeUInt32LE(value >>> 0, lane * 4));
    equalBytes(memory.subarray(runtime.scratchBase + 4, runtime.scratchBase + 4 + args.length * 4), argumentBytes, `${name} argument stores`, runtime.scratchBase + 4);
    calls.push({name, kind: event.kind, callOrdinal: event.callOrdinal, returnOrdinal: event.returnOrdinal, entryEsp: runtime.scratchBase, args: [...args]});
    return {event, native};
  }
  const libraryCall = (name, args, runtime) => {
    if (name !== 'operatorNew') return crt(name, args, runtime);
    const {event, native} = next(name, args, runtime, 'CRT');
    if (event.kind !== 'allocation' || native.memory.readUInt32LE(event.callEsp) !== args[0]) fail('external-abi', 'Factory original allocation request differs.');
    const row = event.returned.ranges.get('recovery-audio-source-allocation');
    if (number(row.address) !== number(event.returned.registers.eax) || row.bytes.length !== args[0]) fail('external-abi', 'Factory allocator requested output extent differs.');
    if (allocationPreimagesAtReturn) row.bytes.copy(memory.subarray(number(row.address), number(row.address) + row.bytes.length));
    else equalBytes(memory.subarray(number(row.address), number(row.address) + row.bytes.length), row.bytes, 'Source allocation preimage', number(row.address));
    index++;
    return number(event.returned.registers.eax);
  };
  const platformCall = (name, args, runtime) => {
    const {event} = next(name, args, runtime, 'Win32');
    if (event.kind === 'file') {
      if (name === 'FindFirstFileW' && event.callOrdinal > allocationReturn.ordinal && !checkpoints.length) {
        const constructor = capture.snapshots.find(row => row.breakpointId === 'recovery-sound-constructor-exit' && row.tid === pair.before.tid
          && row.observedDebugEventOrdinal > allocationReturn.observedDebugEventOrdinal && row.observedDebugEventOrdinal < byOrdinal.get(event.callOrdinal).observedDebugEventOrdinal);
        const source = constructor?.ranges.get('recovery-audio-constructor-source');
        if (!source || number(source.address) !== lineage.sourceAddress || source.bytes.length !== 0x9a8) fail('missing-evidence', 'Factory requires its actual constructor comparison checkpoint.');
        equalBytes(memory.subarray(lineage.sourceAddress, lineage.sourceAddress + 0x9a8), source.bytes, 'Actual constructor source checkpoint', lineage.sourceAddress);
        checkpoints.push({kind: 'constructor-source', originalOrdinal: constructor.ordinal, beforeServiceOrdinal: event.callOrdinal, address: lineage.sourceAddress, comparedBytes: 0x9a8, matched: true});
      }
      if (event.pathBytesHex) {
        //Only the bounded string through NUL is an API input; trailing stack
        //padding belongs to the caller and must not become an API answer.
        const expected = Buffer.from(event.pathBytesHex, 'hex'); let count = 0;
        while (count + 2 <= expected.length && expected.readUInt16LE(count)) count += 2;
        equalBytes(memory.subarray(event.pathAddress, event.pathAddress + count + 2), expected.subarray(0, count + 2), `${name} path`, event.pathAddress);
      }
      if (event.outputAddress !== undefined) {
        const before = Buffer.from(event.inputHex, 'hex'), after = Buffer.from(event.outputHex, 'hex');
        if (name === 'GetFileSizeEx') privateOutputPreimages.push(applyObservedSuccessfulFileSize(memory, event, args));
        else if (name === 'FindFirstFileW' && typedSuccessfulFindFirst) privateOutputPreimages.push(applyObservedSuccessfulFindFirst(memory, event, args));
        else {
          equalBytes(memory.subarray(event.outputAddress, event.outputAddress + before.length), before, `${name} output preimage`, event.outputAddress);
        //Write only actual changed external bytes; preserve all untouched
        //FindData padding and every undeclared caller/private-stack byte.
          for (let offset = 0; offset < before.length; offset++) if (before[offset] !== after[offset]) memory.writeUInt8(after[offset], event.outputAddress + offset);
        }
      }
      index++;
      return event.actualReturnEax;
    }
    const {lock} = event, address = lock.address;
    if (event.kind === 'lock-enter') {
      equalBytes(memory.subarray(address, address + 24), lockPreimages.get(address), 'Win32 lock last observed input', address);
      const original = snapshotMemory(lock.enteredOrdinal).span(address + 24, 8);
      equalBytes(memory.subarray(address + 24, address + 32), original, 'Game lock wrapper before Enter', address + 24);
      Buffer.from(lock.enteredWin32BytesHex, 'hex').copy(memory.subarray(address, address + 24));
    } else if (event.kind === 'thread') {
      if (lock.changedWin32ByteOffsets.length) fail('unbound-concurrency', 'Win32 waiter changes across GetCurrentThreadId require their separate producer.');
      equalBytes(memory.subarray(address, address + 32), snapshotMemory(lock.enteredOrdinal).span(address, 32), 'GetCurrentThreadId read-only lock state', address);
    } else if (event.kind === 'lock-leave') {
      equalBytes(memory.subarray(address, address + 24), Buffer.from(lock.afterThreadIdWin32BytesHex, 'hex'), 'Win32 lock before Leave', address);
      equalBytes(memory.subarray(address + 24, address + 32), snapshotMemory(lock.leftOrdinal).span(address + 24, 8), 'Game wrapper before Leave', address + 24);
      const bytes = Buffer.from(lock.leftWin32BytesHex, 'hex'); bytes.copy(memory.subarray(address, address + 24)); lockPreimages.set(address, bytes);
    } else fail('external-abi', `Unadmitted factory platform boundary ${event.kind}.`);
    index++;
    return number(event.returned.registers.eax);
  };
  const xAudio2Call = (engine, method, args, runtime) => {
    const {event} = next('CreateSourceVoice', args, runtime, 'COM'), input = snapshotMemory(event.callOrdinal), output = snapshotMemory(event.returnOrdinal);
    if (method !== 0x20 || engine !== event.args[0]) fail('external-abi', 'Factory original XAudio2 interface differs.');
    const table = input.memory.readUInt32LE(engine);
    equalBytes(memory.subarray(engine, engine + 4), input.span(engine, 4), 'XAudio2 interface input', engine);
    equalBytes(memory.subarray(table, table + 0x24), input.span(table, 0x24), 'XAudio2 vtable input', table);
    for (const [address, length, label] of [[args[1], 4, 'COM output preimage'], [args[2], 18, 'COM format'], [args[6], 8, 'COM send list'], [input.memory.readUInt32LE(args[6] + 4), 8, 'COM send descriptor']])
      equalBytes(memory.subarray(address, address + length), input.span(address, length), label, address);
    output.span(args[1], 4).copy(memory.subarray(args[1], args[1] + 4));
    index++;
    return event.com.result;
  };
  return {services: {libraryCall, platformCall, xAudio2Call}, calls, privateOutputPreimages, checkpoints, get consumedEvents() {return index;}, expectedEvents: events.length,
    limits: ['Enter/Leave outcomes own only their24 Win32 bytes; game wrapper depth/owner and manager/vector changes execute in source.',
      'Pre-Enter native API snapshots are unavailable: source Win32 input is checked against the original manager input or preceding observed own Leave, not an invented immediate native sample.',
      'GetCurrentThreadId writes no lock/manager bytes. Any observed waiter transition remains an explicit separate producer.']};
}
