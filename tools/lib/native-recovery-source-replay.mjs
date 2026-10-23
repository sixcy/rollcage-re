import {createCapturedMemory} from './captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {constructXAudioSample} from '../../src/game-audio-sample-state.mjs';
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {firstByteDivergence} from './native-body-replay.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';
import {nativeRecoverySoundLineageLayout} from './native-recovery-sound-selection.mjs';

export const nativeRecoverySourceConstructor = Object.freeze({entry: 0x4ad7e0, exit: 0x4ad8de, returns: Object.freeze([0x4a74e3, 0x4a750e]), bytes: 0x9a8});
const uint = (value, name) => {value = Number(value); if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Invalid source constructor ${name}.`); return value;};

export async function verifyNativeRecoverySourceConstructorBoundaries() {
  const {evidence, instructions} = await readInstructionEvidence(['11601-audio-sample-factory-4a7460.json', '11619-audio-sample-graph-4ad7e0.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Source constructor target SHA differs.');
  const rows = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x4ad7e0, 'PUSH', ['-0x1']], [0x4ad845, 'CALL', ['0x004acf70']], [0x4ad8de, 'RET', ['0x1c']],
    [0x4a74de, 'CALL', ['0x004ad7e0']], [0x4a74e3, 'MOV', ['EBP', 'EAX']], [0x4a7509, 'CALL', ['0x004ad7e0']], [0x4a750e, 'MOV', ['EBP', 'EAX']]]) {
    const actual = rows.get(address);
    if (actual?.op !== op || JSON.stringify(actual.args) !== JSON.stringify(args)) throw Error(`Source constructor boundary differs at0x${address.toString(16)}.`);
  }
  return evidence.map(row => row.evidence_id);
}

function actualBase(snapshot) {
  const bases = new Set([snapshot.moduleBaseAddress, ...[...snapshot.ranges.values()].map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(Number));
  if (bases.size !== 1) throw Error('Source constructor requires one observed main-module base.');
  return uint([...bases][0], 'module base');
}

export function selectNativeRecoverySourceConstructorPair(capture, parentPair) {
  const base = parentPair?.moduleBaseAddress, parentEsp = Number(parentPair?.before?.registers?.esp);
  if (capture?.header?.executableSha256 !== REDUX_SHA256 || !Number.isSafeInteger(base) || !Number.isSafeInteger(parentEsp)) throw Error('Source constructor selection requires its original controlled parent.');
  const expectedEsp = nativeRecoverySoundLineageLayout(parentEsp).factoryEntry - 0x850;
  const actual = value => nativeCodeAddress(value, {moduleBaseAddress: base});
  const candidates = capture.snapshots.filter(row => row.tid === parentPair.before.tid && Number(row.registers?.esp) === expectedEsp && row.observedDebugEventOrdinal > parentPair.before.observedDebugEventOrdinal && row.observedDebugEventOrdinal < parentPair.after.observedDebugEventOrdinal);
  const entries = candidates.filter(row => Number(row.registers.eip) === actual(nativeRecoverySourceConstructor.entry));
  const exits = candidates.filter(row => Number(row.registers.eip) === actual(nativeRecoverySourceConstructor.exit));
  if (entries.length !== 1 || exits.length !== 1 || entries[0].observedDebugEventOrdinal >= exits[0].observedDebugEventOrdinal) throw Error('Source constructor requires exactly one actual nested entry/preRET pair.');
  return {before: entries[0], after: exits[0], moduleBaseAddress: base};
}

//The only external constructor services reached by the observed empty-callable
//branch are valid bounded CRT string copies. Read every actual input word and
//preserve destination padding. These are explicit CRT semantics, not game-child
//answers; every resulting source byte is independently compared below.
function constructorCrt(memory, moduleBaseAddress, calls) {
  return (name, args, runtime) => {
    if (!['strncpy_s', 'wcsncpy_s'].includes(name) || args.length !== 4) throw Error(`Unobserved source constructor CRT service ${name}.`);
    const [output, capacity, input, count] = args.map((value, index) => uint(value, `CRT argument${index}`));
    const wide = name === 'wcsncpy_s', width = wide ? 2 : 1;
    const allowed = wide ? [nativeCodeAddress(0x56feb0, {moduleBaseAddress})]
      : [nativeCodeAddress(0x56fe6b, {moduleBaseAddress}), nativeCodeAddress(0x5d0320, {moduleBaseAddress})];
    if (!allowed.includes(input) || capacity !== (wide ? 512 : 24) || count !== capacity - 1) throw Error('Source constructor CRT input/capacity differs from its actual descriptor imports.');
    const values = [];
    for (let index = 0; index < count; index++) {
      const value = wide ? memory.readUInt16LE(input + index * width) : memory.readUInt8(input + index);
      if (!value) break;
      values.push(value);
    }
    for (const [index, value] of values.entries()) {
      if (wide) memory.writeUInt16LE(value, output + index * width); else memory.writeUInt8(value, output + index);
    }
    if (wide) memory.writeUInt16LE(0, output + values.length * width); else memory.writeUInt8(0, output + values.length);
    calls.push(Object.freeze({name, args: Object.freeze([...args]), entryEsp: runtime.scratchBase, returnAddress: memory.readUInt32LE(runtime.scratchBase), result: 0}));
    return 0;
  };
}

export function replayNativeRecoverySourceConstructor(pair) {
  const {before, after} = pair ?? {};
  if (!before?.ranges || !after?.ranges || before.tid !== after.tid) throw Error('Source constructor requires actual same-thread entry/preRET snapshots.');
  const moduleBaseAddress = actualBase(before);
  if (actualBase(after) !== moduleBaseAddress || pair.moduleBaseAddress !== undefined && pair.moduleBaseAddress !== moduleBaseAddress) throw Error('Source constructor module base changes across the call.');
  const actual = value => nativeCodeAddress(value, {moduleBaseAddress});
  const S = uint(before.registers?.esp, 'entry ESP'), object = uint(before.registers?.ecx, 'object');
  if (uint(before.registers.eip, 'entry EIP') !== actual(nativeRecoverySourceConstructor.entry) || uint(after.registers?.eip, 'preRET EIP') !== actual(nativeRecoverySourceConstructor.exit) || uint(after.registers.esp, 'preRET ESP') !== S) throw Error('Source constructor entry/preRET/ESP differs.');
  const numerical = decodePhysicsNumericalContext({x87ControlWord: Number(before.registers.fpuControlWord), mxcsr: Number(before.registers.mxcsr)});
  if (numerical.x87.precisionBits !== 24 || numerical.x87.roundingMode !== 'nearest-even' || numerical.x87.exceptionMask !== 63 || numerical.sse.roundingMode !== 'nearest-even' || numerical.sse.exceptionMask !== 63 || numerical.sse.flushToZero || numerical.sse.denormalsAreZero) throw Error('Source constructor requires captured PC24/nearest-even with masked exceptions and noFTZ/DAZ.');
  const bound = createCapturedMemory([...before.ranges.values()]), {memory} = bound;
  const original = createCapturedMemory([...before.ranges.values()]), observed = createCapturedMemory([...after.ranges.values()]);
  const caller = memory.readUInt32LE(S), descriptor = memory.readUInt32LE(S + 4);
  if (!nativeRecoverySourceConstructor.returns.map(actual).includes(caller) || observed.memory.readUInt32LE(S) !== caller) throw Error('Source constructor caller return differs.');
  memory.subarray(S - 512, S + 32); memory.subarray(object, object + 0x9a8); memory.subarray(descriptor, descriptor + 0x460);
  if (!object || !descriptor || object < descriptor + 0x460 && descriptor < object + 0x9a8) throw Error('Source constructor capture requires distinct actual source and descriptor storage.');
  if (memory.readUInt32LE(S + 24) !== 0) throw Error('Source constructor populated std::function requires its genuine callback binding.');
  const tls = bindCapturedNativeThreadEnvironment(before, {memory});
  if (!tls.nativeTls) throw Error('Source constructor requires its actual observed FS:[0] head.');
  const outputTls = bindCapturedNativeThreadEnvironment(after, {memory: observed.memory});
  if (!outputTls.nativeTls || outputTls.nativeTls.fsBase !== tls.nativeTls.fsBase || outputTls.nativeTls.fsSelector !== tls.nativeTls.fsSelector) throw Error('Source constructor thread environment changes across its call.');
  const incoming = Object.fromEntries(['ebx', 'ebp', 'esi', 'edi'].map(name => [name.toUpperCase(), uint(before.registers[name], name)]));
  const calls = [];
  const result = constructXAudioSample(object, descriptor, {memory, scratchBase: S, moduleBaseAddress, entryRegisters: incoming, sehWord: tls.nativeTls.sehWord,
    services: {libraryCall: constructorCrt(memory, moduleBaseAddress, calls)}});
  const regions = [{id: 'source', address: object, length: 0x9a8, readOnly: false}, {id: 'descriptor', address: descriptor, length: 0x460, readOnly: true},
    ...[[0x56fe60, 96], [0x5d0320, 24], [0x5dc774, 4]].map(([preferred, length]) => ({id: `literal-${preferred.toString(16)}`, address: actual(preferred), length, readOnly: true})),
    ...tls.comparisonRegions.map(row => ({...row, readOnly: false}))];
  const comparisons = regions.map(row => ({...row, divergence: firstByteDivergence(observed.span(row.address, row.length), bound.span(row.address, row.length)),
    readOnlyDivergence: row.readOnly ? firstByteDivergence(original.span(row.address, row.length), observed.span(row.address, row.length)) : null}));
  const registers = ['eax', 'ebx', 'ebp', 'esi', 'edi', 'esp'].map(name => ({name, expected: name === 'eax' ? result : uint(before.registers[name], `incoming ${name}`), actual: uint(after.registers[name], `outgoing ${name}`)}));
  const firstDivergence = comparisons.find(row => row.divergence || row.readOnlyDivergence) ?? registers.find(row => row.expected !== row.actual) ?? null;
  return {matched: !firstDivergence, comparedBytes: comparisons.reduce((sum, row) => sum + row.length, 0), firstDivergence, comparisons, registers,
    moduleBaseAddress, input: {object, descriptor, entryEsp: S, caller}, crtCalls: calls,
    limits: ['This is the actual empty-callable4ad7e0 constructor boundary, not the surrounding factory/COM/playback or complete recovery parent.',
      'Only source storage, actual read-only descriptor/literals and restored FS:[0] plus declared return/preserved registers are compared; private scratch and volatile ECX/EDX/EFLAGS are excluded.',
      'Valid bounded CRT string-copy behavior is supplied explicitly. No allocator, game-child result, final initialized source or callback answer is injected.']};
}

//Keep genuine external outcomes distinct from source replay. In particular,
//an observed Win32 critical-section result is not a no-op service, and an
//observed CreateSourceVoice result is not an initialized game-source answer.
export function inspectNativeRecoverySourceServices(capture, parentPair, soundProof) {
  const base = parentPair?.moduleBaseAddress, actual = value => nativeCodeAddress(value, {moduleBaseAddress: base});
  const rows = capture.snapshots.filter(row => row.tid === parentPair.before.tid && row.observedDebugEventOrdinal > parentPair.before.observedDebugEventOrdinal && row.observedDebugEventOrdinal < parentPair.after.observedDebugEventOrdinal);
  const unique = address => {
    const found = rows.filter(row => Number(row.registers?.eip) === actual(address));
    if (found.length !== 1) throw Error(`Source service requires one actual nested observation at0x${address.toString(16)}.`);
    if (actualBase(found[0]) !== base) throw Error('Source service module base differs.');
    const clock = found[0].ranges.get('recovery-audio-clock');
    if (!clock || clock.bytes.length !== 4 || clock.bytes.readUInt32LE() !== soundProof.controlledInput.clock) throw Error('Source service actual clock differs.');
    return found[0];
  };
  if (capture.header?.executableSha256 !== REDUX_SHA256 || !soundProof?.allocationMemory?.verified || soundProof.managerAddress <= 0 || soundProof.sourceAddress <= 0) throw Error('Source service audit requires its verified actual allocation lineage.');
  const before = unique(0x4b1daf), after = unique(0x4b1db2);
  const input = createCapturedMemory([...before.ranges.values()]), output = createCapturedMemory([...after.ranges.values()]);
  const esp = uint(before.registers.esp, 'COM CALL ESP'), bp = soundProof.layout.factoryEntry - 0x850;
  const expectedEsp = (bp & ~7) - 56;
  if (esp !== expectedEsp || uint(before.registers.ebp, 'COM EBP') !== bp || uint(after.registers.ebp, 'COM return EBP') !== bp || uint(after.registers.esp, 'COM return ESP') !== esp + 32 || before.observedDebugEventOrdinal >= after.observedDebugEventOrdinal) throw Error('Source COM call/return actual stack ABI differs.');
  const args = Array.from({length: 8}, (_, index) => input.memory.readUInt32LE(esp + index * 4));
  const source = soundProof.sourceAddress, engine = input.memory.readUInt32LE(soundProof.managerAddress + 0x910), table = input.memory.readUInt32LE(engine);
  const target = input.memory.readUInt32LE(table + 0x20);
  if (uint(before.registers.ecx, 'COM ECX') !== engine || uint(before.registers.edx, 'COM EDX') !== table || !target || args[0] !== engine || args[1] !== source + 0x97c || args[2] !== soundProof.allocationMemory.source.waveformAddress + 8 || ![0, 8].includes(args[3]) || args[4] !== 0x44800000 || args[5] !== source + 0x978 || args[7] !== 0) throw Error('Source COM interface or eight native arguments differ.');
  const sends = input.span(args[6], 8), descriptors = input.span(sends.readUInt32LE(4), 8);
  if (sends.readUInt32LE() !== 1 || ![0, 128].includes(descriptors.readUInt32LE()) || !descriptors.readUInt32LE(4)) throw Error('Source COM actual send-list descriptors differ.');
  const voiceAddress = output.memory.readUInt32LE(args[1]);
  const outputRows = [...after.ranges.values()].filter(row => row.baseRegister === 'ebp' && JSON.stringify(row.dereferenceOffsets) === '["0x18"]' && Number(row.address) === args[1] && row.bytes.length === 4);
  if (outputRows.length !== 1 || outputRows[0].bytes.readUInt32LE() !== voiceAddress || voiceAddress !== soundProof.allocationMemory.source.voiceAddress) throw Error('Source COM output voice does not match its actual factory result.');
  const criticalSections = [];
  for (const [kind, enteredAt, threadAt, leftAt, offset] of [['mixer', 0x4a7a05, 0x4a7a0b, 0x4a7a53, 0x854],
    ['factory', 0x4a7691, 0x4a7697, 0x4a76c0, 0x854], ['playback', 0x4adaaa, 0x4adab0, 0x4adad9, 0x874]]) {
    const entered = unique(enteredAt), thread = unique(threadAt), left = unique(leftAt);
    if (entered.observedDebugEventOrdinal >= thread.observedDebugEventOrdinal || thread.observedDebugEventOrdinal >= left.observedDebugEventOrdinal || uint(thread.registers.eax, 'GetCurrentThreadId EAX') !== thread.tid) throw Error('Source critical-section service order/thread result differs.');
    if (uint(entered.registers.esp, 'GetCurrentThreadId CALL ESP') !== uint(thread.registers.esp, 'GetCurrentThreadId return ESP')) throw Error('Source GetCurrentThreadId stack differs.');
    const address = soundProof.managerAddress + offset;
    const a = createCapturedMemory([...entered.ranges.values()]), b = createCapturedMemory([...thread.ranges.values()]), c = createCapturedMemory([...left.ranges.values()]);
    const enteredBytes = a.span(address, 32), threadBytes = b.span(address, 32), leftBytes = c.span(address, 32);
    //Modern Windows LockCount+4 includes waiter bits. A contending thread can
    //change them while this thread still owns the lock. V8 observes-2→-6.
    //Admit only that field's waiter-bit changes; retain every observed byte
    //and never treat this transition as a GetCurrentThreadId write/service.
    //Layout/bit meanings: Microsoft "Displaying a Critical Section".
    const lockCountBefore = enteredBytes.readInt32LE(4), lockCountAfter = threadBytes.readInt32LE(4);
    if ((lockCountBefore & 1) || (lockCountBefore & 3) !== (lockCountAfter & 3) || enteredBytes.readUInt32LE(12) !== thread.tid || enteredBytes.readInt32LE(8) < 1 ||
        !enteredBytes.subarray(0, 4).equals(threadBytes.subarray(0, 4)) || !enteredBytes.subarray(8, 32).equals(threadBytes.subarray(8, 32))) throw Error('Source critical-section ownership or protected wrapper bytes differ across GetCurrentThreadId.');
    const changedWin32ByteOffsets = Array.from({length: 24}, (_, index) => index).filter(index => enteredBytes[index] !== threadBytes[index]);
    criticalSections.push({kind, address, enteredOrdinal: entered.ordinal, threadOrdinal: thread.ordinal, leftOrdinal: left.ordinal,
      threadId: uint(thread.registers.eax, 'GetCurrentThreadId result'), enteredWin32BytesHex: enteredBytes.subarray(0, 24).toString('hex'), afterThreadIdWin32BytesHex: threadBytes.subarray(0, 24).toString('hex'), leftWin32BytesHex: leftBytes.subarray(0, 24).toString('hex'),
      lockCountBefore, lockCountAfter, waitersBefore: (~lockCountBefore) >>> 2, waitersAfter: (~lockCountAfter) >>> 2, changedWin32ByteOffsets,
      enteredNativeDepth: enteredBytes.readInt32LE(24), enteredNativeOwner: enteredBytes.readUInt32LE(28), leftNativeDepth: leftBytes.readInt32LE(24), leftNativeOwner: leftBytes.readUInt32LE(28)});
  }
  return {verified: true, sourceServiceComparisonComplete: false, com: {callOrdinal: before.ordinal, returnOrdinal: after.ordinal, callEsp: esp, serviceEntryEsp: esp - 4,
    callerReturn: actual(0x4b1db2), args, interfaceTarget: target, result: uint(after.registers.eax, 'CreateSourceVoice HRESULT'),
    outputVoiceAddress: args[1], voiceAddress, sendListHex: sends.toString('hex'), sendDescriptorHex: descriptors.toString('hex')}, criticalSections,
    limits: ['These are original external COM/Win32 outcomes, not a complete source factory or playback comparison.',
      'Only post-EnterCriticalSection and post-LeaveCriticalSection states are observed; their pre-call state/ABI must still be admitted when binding a complete source execution.',
      'Observed Win32 waiter-bit transitions between GetCurrentThreadId boundaries are retained separately; they are not attributed to that API or injected as a service result. Concurrent producer binding remains open.',
      'No initialized source output or opaque voice object is supplied as a game-child result.']};
}
