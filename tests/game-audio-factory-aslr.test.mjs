import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {selectGameAudioDecoderFormat, isGameAudioUncompressedFile, createGameAudioChannel, getGameAudioDecoderFormat, copyGameAudioWaveformFormat} from '../src/game-audio-sample-factory.mjs';
import {resolveGameAudioPath, initializeGameAudioFilePathConstants} from '../src/game-audio-file-paths.mjs';
import pathConstants from '../src/game-audio-file-path-constants.json' with {type: 'json'};
import {constructXAudioSample} from '../src/game-audio-sample-state.mjs';
import {replayNativeRecoverySourceConstructor} from '../tools/lib/native-recovery-source-replay.mjs';
import {verifyGameAudioSampleFactory} from '../tools/verify-game-audio-sample-factory-instructions.mjs';

const executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const installed = existsSync(executable);
const put = (memory, address, value) => memory.writeUInt32LE(value >>> 0, address);

//Constructed loader behavior comes from the verified PE relocation directory.
//Only IMAGE_REL_BASED_HIGHLOW DWORDs and direct relative control-flow targets
//move. Heap pointers, integer fields and nonrelocated immediates never do.

function services(memory) {
  const calls = [], wide = address => {let end = address; while (memory.readUInt16LE(end)) end += 2; return memory.subarray(address, end).toString('utf16le');};
  return {calls, libraryCall(name, args, context) {
    calls.push({name, args: [...args], entryEsp: context.scratchBase, returnAddress: memory.readUInt32LE(context.scratchBase)});
    const [output, capacity, input, count] = args;
    if (name === 'strncpy_s') {let length = 0; while (length < count && memory.readUInt8(input + length)) length++; assert.ok(length < capacity); Buffer.from(memory.subarray(input, input + length)).copy(memory.subarray(output, output + length)); memory.writeUInt8(0, output + length); return 0;}
    if (name === '_wcsicmp') {const left = wide(output).toLowerCase(), right = wide(capacity).toLowerCase(); return left === right ? 0 : left < right ? -1 : 1;}
    if (name === 'wcsncpy_s' || name === 'wcscpy_s') {const text = wide(input).slice(0, name === 'wcsncpy_s' ? count : undefined); assert.ok(text.length < capacity); Buffer.from(`${text}\0`, 'utf16le').copy(memory.subarray(output, output + (text.length + 1) * 2)); return 0;}
    if (name === 'wcscat_s') {const text = wide(output) + wide(input); assert.ok(text.length < capacity); Buffer.from(`${text}\0`, 'utf16le').copy(memory.subarray(output, output + (text.length + 1) * 2)); return 0;}
    if (name === 'wcsstr') {const index = wide(output).indexOf(wide(capacity)); return index < 0 ? 0 : output + index * 2;}
    if (name === 'wcsncmp') {const left = wide(output).slice(0, input), right = wide(capacity).slice(0, input); return left === right ? 0 : left < right ? -1 : 1;}
    if (name === 'memset') {memory.subarray(output, output + input).fill(capacity); return output;}
    throw Error(`Unadmitted ASLR CRT service ${name}.`);
  }};
}

const imports = [[0x56e47c, 'wcsncpy_s', 4], [0x56e2c8, '_wcsicmp', 2], [0x56e218, 'wcscat_s', 3], [0x56e2b8, 'wcscpy_s', 3], [0x56e2b4, 'wcsstr', 2], [0x56e2c4, 'wcsncmp', 3], [0x56e21c, 'strncpy_s', 4]];
function fixtureMemory(loaded, S, stackBytes = 0x1000) {
  const {memory, actual} = loaded;
  const definitions = [[0x56fe60, 96], [0x56ff20, 280], [0x570030, 56], [0x5d0320, 24], [0x5d3a0c, 72], [0x5d3b28, 0x80], [0x5dc774, 4], [0x5dcba0, 16], [0x5ed314, 4], [0x5e8890, 4], [0x714afc, 0x210c],
    ...imports.map(([address]) => [address, 4])];
  const rows = definitions.map(([address, length]) => ({address: actual(address), bytes: Buffer.from(memory.subarray(actual(address), actual(address) + length))}));
  rows.push({address: S - stackBytes, bytes: Buffer.from(memory.subarray(S - stackBytes, S + 64))}, {address: 0x1400000, bytes: Buffer.from(memory.subarray(0x1400000, 0x1405000))}, {address: 0x1300000, bytes: Buffer.from(memory.subarray(0x1300000, 0x1300004))});
  const merged = [];
  for (const [address, length] of [...definitions].sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && address <= previous[0] + previous[1]) previous[1] = Math.max(previous[1], address + length - previous[0]);
    else merged.push([address, length]);
  }
  const aliases = merged.map(([address, length]) => ({address, targetAddress: actual(address), length}));
  return {rows, ...createCapturedMemory(rows, {aliases})};
}

async function compareFunction({moduleBaseAddress, nativeEntry, invoke, input, stackBytes = 0x1000, overlapTemplate = false, setup, sehWord, stopAt, callerReturn}) {
  const loaded = await loadRelocatedAudioFixture(moduleBaseAddress), {memory, actual} = loaded;
  assert.ok(loaded.relocatedOperands > 1000);
  const S = overlapTemplate ? actual(0x5dcba0) + 0x241c : 0x1500000;
  //A physically overlapping template/private-stack fixture is deliberate. The
  //native MOVDQA/MOVDQU pair must retain all four originally loaded DWORDs.
  memory.fill(0x36, S - stackBytes, S + 64);
  for (const [index, value] of [1, 1, 0, 0].entries()) put(memory, actual(0x5dcba0) + index * 4, value);
  put(memory, actual(0x5ed314), actual(0x4030c0)); put(memory, actual(0x7158f8), 7); put(memory, actual(0x5e8890), 0x12345678);
  memory.write(`${input}\0`, 0x1400000, 'utf16le'); put(memory, S, 0xffffffff); put(memory, S + 4, nativeEntry === 0x4a7f40 ? 0x1400000 : 0x1401000);
  if (callerReturn !== undefined) put(memory, S, actual(callerReturn));
  if (sehWord !== undefined) put(memory, 0x1300000, sehWord);
  setup?.(memory, S, actual);
  for (const [index, [slot]] of imports.entries()) put(memory, actual(slot), 0x1600000 + index * 16);
  const source = fixtureMemory(loaded, S, stackBytes), sourceServices = services(source.memory);
  const machine = new BoundedX86(loaded.instructions, {entry: actual(nativeEntry), fpuPrecisionBits: 24}); machine.bytes = Buffer.from(memory); machine.r.ESP = S;
  const incoming = {EBX: 0x12345678, EBP: 0x23456789, ESI: 0x34567890, EDI: 0x456789ab}; Object.assign(machine.r, incoming); machine.r.ECX = 0x1400000;
  if (sehWord !== undefined) machine.fs0 = sehWord;
  const initialRegisters = {...machine.r};
  const referenceServices = services(machine.bytes), next = new Map(loaded.instructions.slice(0, -1).map((row, index) => [row.address, loaded.instructions[index + 1].address]));
  const stopped = new Error('ASLR fixture reached declared preRET');
  machine.onInstruction = address => {assert.ok(!loaded.unresolvedRelocations.has(address), `Reached unresolved PE relocation in instruction0x${address.toString(16)}`); if (stopAt !== undefined && address === actual(stopAt)) throw stopped; const row = loaded.instructions[machine.entries.get(address)]; if (row.op === 'CALL') put(machine.bytes, machine.r.ESP - 4, next.get(address));};
  for (const [index, [, name, count]] of imports.entries()) machine.externalCalls.set(0x1600000 + index * 16, state => {state.r.EAX = referenceServices.libraryCall(name, Array.from({length: count}, (_, index) => state.bytes.readUInt32LE(state.r.ESP + index * 4)), {scratchBase: state.r.ESP - 4});});
  machine.externalCalls.set(actual(0x568a50), state => {state.r.EAX = referenceServices.libraryCall('memset', Array.from({length: 3}, (_, index) => state.bytes.readUInt32LE(state.r.ESP + index * 4)), {scratchBase: state.r.ESP - 4});});
  machine.externalCalls.set(actual(0x568980), state => {state.r.ESP -= state.r.EAX;});
  machine.externalCalls.set(actual(0x568162), state => assert.equal(state.r.ECX >>> 0, state.bytes.readUInt32LE(actual(0x5e8890))));
  const result = invoke({memory: source.memory, scratchBase: S, moduleBaseAddress, entryRegisters: incoming, services: sourceServices, ...(sehWord === undefined ? {} : {sehWord})});
  let reachedStop = false;
  try {machine.run(200000);} catch (error) {if (error !== stopped && error.message !== `At 0x${actual(stopAt).toString(16)}: ${stopped.message}`) throw error; reachedStop = true;}
  if (stopAt !== undefined) assert.equal(reachedStop, true);
  assert.deepEqual(sourceServices.calls, referenceServices.calls);
  const returnMask = nativeEntry === 0x4a7f40 ? 255 : 0xffffffff;
  assert.equal((result & returnMask) >>> 0, (machine.r.EAX & returnMask) >>> 0, `entry0x${nativeEntry.toString(16)} ${input}`);
  for (const row of source.rows) assert.deepEqual(source.span(row.address, row.bytes.length), machine.bytes.subarray(row.address, row.address + row.bytes.length), `actualspan0x${row.address.toString(16)}`);
  return {source, loaded, S, machine, initialRegisters};
}

test('original PE HIGHLOW relocations and actual relative calls corroborate sparse ASLR extension/format execution', {skip: !installed}, async () => {
  for (const [nativeEntry, fn, input] of [[0x4af580, selectGameAudioDecoderFormat, 'folder/no.dot/clip.OGG'], [0x4a7f40, isGameAudioUncompressedFile, 'folder/WAVE.AIFF'], [0x4af580, selectGameAudioDecoderFormat, 'clip.raw']]) {
    await compareFunction({moduleBaseAddress: 0x6e0000, nativeEntry, input, invoke: runtime => fn(0x1400000, runtime)});
  }
});

test('actual relocated path graph matches sparse source state and preserves an overlapping sixteen-byte template load', {skip: !installed}, async () => {
  for (const moduleBaseAddress of [0x400000, 0x6e0000]) for (const overlapTemplate of [false, true]) {
    const result = await compareFunction({moduleBaseAddress, nativeEntry: 0x4a4460, stackBytes: 0x6000, input: '$DATA_ROOT::/A/./B/../Asset.WAV', overlapTemplate,
      invoke: runtime => resolveGameAudioPath(0x1400000, 0x1401000, runtime)});
    if (overlapTemplate) assert.deepEqual([...result.source.memory.subarray(result.loaded.actual(0x5dcba0) + 4, result.loaded.actual(0x5dcba0) + 20)].filter((_, index) => index % 4 === 0), [1, 1, 0, 0]);
  }
});

test('COM arguments and decoder payloads preserve opaque values that numerically equal preferred image addresses', () => {
  const base = 0x720000, actual = value => base + value - 0x400000, memory = Buffer.alloc(0x20000), pointer = 0x1000, S = 0x9000;
  const runtime = {memory, moduleBaseAddress: base, scratchBase: S, services: {xAudio2Call(engine, method, args, context) {
    assert.equal(engine, 0x4a7f40); assert.equal(method, 0x20); assert.equal(args[0], engine);
    assert.equal(args[4], 0x44800000); assert.equal(memory.readUInt32LE(0x2000), 0x4a74e3);
    assert.equal(memory.readUInt32LE(context.scratchBase), actual(0x4b1db2));
    return 0;
  }}};
  put(memory, pointer + 0xf4, 0x4a7f40); put(memory, pointer + 0xf8, 0x4a74e3);
  put(memory, S + 8, 0x3000); put(memory, S + 16, 0x4000); put(memory, S + 20, 0x5000);
  assert.equal(createGameAudioChannel(pointer, 0, 0x3000, 0, 0x4000, 0x5000, 0x2000, runtime), 1);
  const decoder = 0x6000, stream = 0x7000, table = 0x8000;
  put(memory, decoder + 12, stream); put(memory, stream, table); put(memory, table + 16, actual(0x4b3ed0));
  memory[decoder + 0x92] = 1; memory.writeUInt16LE(16, decoder + 0x8e); memory.writeInt16LE(2, decoder + 0x82); put(memory, decoder + 0x84, 0x5d3b28);
  assert.equal(getGameAudioDecoderFormat(decoder, runtime), stream + 8);
  assert.equal(memory.readUInt32LE(decoder + 0x88), Math.imul(4, 0x5d3b28) >>> 0);
});

test('sparse relocated literal initialization matches PE loader bytes and preserves live policy words', {skip: !installed}, async () => {
  const loaded = await loadRelocatedAudioFixture(0x6e0000), {actual} = loaded;
  const rows = pathConstants.tables.map(table => ({address: actual(Number(table.address)), bytes: Buffer.alloc(table.bytes_hex.length / 2, 0xa5)}));
  rows.push({address: actual(0x5ed314), bytes: Buffer.from('78563412', 'hex')}, {address: actual(0x7158f8), bytes: Buffer.from('f0debc9a', 'hex')});
  const {memory} = createCapturedMemory(rows);
  initializeGameAudioFilePathConstants(memory, {moduleBaseAddress: 0x6e0000});
  for (const table of pathConstants.tables) {
    const address = actual(Number(table.address)), length = table.bytes_hex.length / 2;
    assert.deepEqual(memory.subarray(address, address + length), loaded.memory.subarray(address, address + length));
  }
  assert.equal(memory.readUInt32LE(actual(0x5ed314)), 0x12345678);
  assert.equal(memory.readUInt32LE(actual(0x7158f8)), 0x9abcdef0);
  assert.equal(memory.readUInt32LE(actual(0x5dcba0)), 1);
});

test('constructed relocated instruction execution supplies an independent complete sparse constructor replay', {skip: !installed}, async () => {
  const moduleBaseAddress = 0x6e0000, sehWord = 0x13572468;
  const result = await compareFunction({moduleBaseAddress, nativeEntry: 0x4ad7e0, input: '', sehWord, stopAt: 0x4ad8de, callerReturn: 0x4a74e3,
    setup(memory, S) {
      memory.fill(0xa7, 0x1400000, 0x14009a8); memory.fill(0xbc, 0x1401000, 0x1401460);
      memory.write('Effect\0', 0x1401000, 'ascii'); memory.write('Effect\0', 0x1401018, 'ascii'); memory.write('Sample.wav\0', 0x1401030, 'utf16le');
      for (const [offset, value] of [[0x438, 1], [0x43c, 1], [0x440, 30], [0x444, 150], [0x448, 360], [0x44c, 360], [0x450, 1]]) memory.writeFloatLE(value, 0x1401000 + offset);
      put(memory, S + 24, 0);
    }, invoke: runtime => constructXAudioSample(0x1400000, 0x1401000, runtime)});
  //This is a constructed schema/SEH context around interpreted original code,
  //not an OS selector query or original-process observation.
  const snapshot = (after = false) => {
    const context = Buffer.alloc(716); context.writeUInt32LE(0x53, 144);
    const descriptor = Buffer.alloc(8); descriptor.writeUInt16LE(0, 2); descriptor[4] = 0x30; descriptor[7] = 1;
    const registers = Object.fromEntries(Object.entries(after ? result.machine.r : result.initialRegisters).map(([name, value]) => [name.toLowerCase(), value >>> 0]));
    const ranges = new Map(result.source.rows.map((row, index) => {
      const bytes = after ? Buffer.from(result.machine.bytes.subarray(row.address, row.address + row.bytes.length)) : Buffer.from(row.bytes);
      const head = row.address === 0x1300000;
      const id = head ? 'thread-seh-head' : `constructed-${index}`;
      const range = {...row, id, length: bytes.length, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), ...(head ? {source: 'stopped-owned-thread-fs-zero'} : {})};
      return [id, range];
    }));
    return {synthetic: true, tid: 321, moduleBaseAddress, registers: {...registers, eip: result.loaded.actual(after ? 0x4ad8de : 0x4ad7e0), fpuControlWord: 0x7f, mxcsr: 0x1f80}, ranges, context,
      contextSha256: createHash('sha256').update(context).digest('hex'), threadEnvironment: {fsSelector: 0x53, fsBase: 0x1300000, sehWord, descriptorHex: descriptor.toString('hex'), tid: 321,
        contextSelectorOffset: 144, source: 'stopped-owned-thread-selector-query', selectorApi: 'Wow64GetThreadSelectorEntry'}};
  };
  const pair = {before: snapshot(), after: snapshot(true), moduleBaseAddress};
  const replay = replayNativeRecoverySourceConstructor(pair);
  assert.equal(replay.matched, true, JSON.stringify(replay.firstDivergence));
  assert.equal(replay.comparedBytes, 3720); assert.equal(replay.crtCalls.length, 6);
  assert.equal(replay.input.object, 0x1400000);
  const registers = {...pair.after.registers, ebx: (pair.after.registers.ebx ^ 1) >>> 0};
  assert.equal(replayNativeRecoverySourceConstructor({...pair, after: {...pair.after, registers}}).firstDivergence.name, 'ebx');
});

test('both sparse sixteen-byte stores retain the original complete native load before writes', async () => {
  const {instructions} = await readInstructionEvidence(['11625-audio-sample-graph-4a7a60.json', '11613-audio-sample-graph-4a4460.json'], {directory: 'analysis/native-simulation/results'});
  const rows = new Map(instructions.map(row => [row.address, row]));
  assert.deepEqual(rows.get(0x4a7ae2)?.args, ['XMM0', 'xmmword ptr [EAX]']);
  assert.deepEqual(rows.get(0x4a7ae6)?.args, ['xmmword ptr [EBX + 0x8]', 'XMM0']);
  assert.deepEqual(rows.get(0x4a45ae)?.args, ['XMM0', 'xmmword ptr [0x005dcba0]']);
  assert.deepEqual(rows.get(0x4a45dd)?.args, ['xmmword ptr [ESP + 0x24]', 'XMM0']);
  const code = [0x4a7ae2, 0x4a7ae6, 0x4a7aeb, 0x4a7aef].map(address => rows.get(address));
  code.push({address: 0x4a7af3, op: 'RET', args: []}); //Bounded test wrapper only.
  for (const offset of [-8, -4, 0, 4, 8]) {
    const initial = Buffer.from(Array.from({length: 80}, (_, index) => index + 1)), format = 0x100020, waveform = format + offset - 8;
    const {memory, span} = createCapturedMemory([{address: 0x100000, bytes: initial}]);
    const machine = new BoundedX86(code); initial.copy(machine.bytes, 0x100000); put(machine.bytes, 0x9000, 0xffffffff);
    Object.assign(machine.r, {ESP: 0x9000, EAX: format, EBX: waveform});
    copyGameAudioWaveformFormat(waveform, format, {memory}); machine.run(20);
    assert.deepEqual(span(0x100000, initial.length), machine.bytes.subarray(0x100000, 0x100000 + initial.length));
    if (offset === 4) assert.equal(memory.readUInt16LE(waveform + 24), initial.readUInt16LE(format - 0x100000 + 12));
  }
});

test('loaded WAV and cached-waveform factories retain full preferred-base instruction/private-stack behavior', async () => {
  for (const branch of [{loadedWave: true}, {uncompressedCache: true}]) {
    const report = await verifyGameAudioSampleFactory({fixtures: 3, withOuter: true, output: null, ...branch});
    assert.equal(report.matched, true); assert.equal(report.compareStack, true);
    assert.equal(report.actualGameCalls['4a7460'], 3);
    assert.ok(report.actualGameCalls['4b1d30'] > 0);
  }
});
