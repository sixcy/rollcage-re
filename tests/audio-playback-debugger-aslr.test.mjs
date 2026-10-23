import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {requestGameAudioSamplePlayback} from '../src/audio-sample-playback-requests.mjs';

const installed = existsSync('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');
const put = (memory, address, value) => memory.writeUInt32LE(value >>> 0, address);
const imports = [[0x56e228, 'vsprintf_s', 4], [0x56e220, 'operatorNew', 1], [0x56e210, 'operatorDelete', 1], [0x56e470, 'operatorDeleteArray', 1],
  [0x56e094, 'EnterCriticalSection', 1, true], [0x56e09c, 'GetCurrentThreadId', 0, true], [0x56e090, 'LeaveCriticalSection', 1, true], [0x56e08c, 'InitializeCriticalSectionAndSpinCount', 2, true]];

function world(memory, actual, {replaceManager = false, memcpyEcx} = {}) {
  const calls = [], allocations = [], freed = []; let cursor = 0x1410000;
  const string = address => {let end = address; while (memory.readUInt8(end)) end++; return memory.subarray(address, end).toString('latin1');};
  return {calls, allocations, freed, libraryCall(name, args, context) {
    calls.push({name, args: [...args], entryEsp: context.scratchBase, returned: memory.readUInt32LE(context.scratchBase)});
    if (name === 'vsprintf_s') {
      assert.equal(args[2], actual(0x5d3f00));
      const text = string(args[2]).replace(/%s/g, () => string(memory.readUInt32LE(args[3])));
      assert.ok(text.length < args[1]); Buffer.from(`${text}\0`, 'latin1').copy(memory.subarray(args[0], args[0] + text.length + 1)); return text.length;
    }
    if (name === 'operatorNew') {
      const address = cursor; cursor = cursor + args[0] + 31 & ~15;
      assert.ok(cursor < 0x1440000); memory.subarray(address, cursor).fill(0xcd); allocations.push([address, args[0]]); return address;
    }
    if (name === 'operatorDelete' || name === 'operatorDeleteArray') {freed.push(args[0]); return 0;}
    if (name === 'registerExit') {assert.ok([actual(0x56d9e0), actual(0x56d9d0)].includes(args[0])); return 0;}
    if (name === 'memcpy' || name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory.subarray(args[0], args[0] + args[2])); if (name === 'memcpy' && memcpyEcx !== undefined) context.volatileRegisters.ECX = memcpyEcx; return args[0];}
    throw Error(`Unadmitted playback CRT ${name}.`);
  }, platformCall(name, args, context) {
    calls.push({name, args: [...args], entryEsp: context.scratchBase, returned: memory.readUInt32LE(context.scratchBase)});
    if (name === 'GetCurrentThreadId') {if (replaceManager) put(memory, actual(0x714b08), 0x1403000); return 77;}
    //These explicitly declared opaque Win32 outcomes exercise ownership of
    //the first24 bytes; game-owned depth/owner fields follow at+24/+28.
    if (name === 'InitializeCriticalSectionAndSpinCount') {assert.equal(args[1], 4096); memory.subarray(args[0], args[0] + 24).fill(0x31); return 1;}
    if (name === 'EnterCriticalSection') {memory.subarray(args[0], args[0] + 24).fill(0x52); return 0;}
    if (name === 'LeaveCriticalSection') {memory.subarray(args[0], args[0] + 24).fill(0x73); return 0;}
    throw Error(`Unadmitted playback Win32 ${name}.`);
  }};
}

async function comparePlayback({moduleBaseAddress = 0x6e0000, coldDebugger = false, coldCategory = false, growRecords = false, replaceManager = false, voice = true, memcpyEcx}) {
  const loaded = await loadRelocatedAudioFixture(moduleBaseAddress), {memory: initial, actual} = loaded;
  const object = 0x1400000, manager = 0x1402000, header = 0x1404000, array = 0x1405000, S = 0x1500000, flag = 0x101;
  initial.fill(0x57, S - 0x6000, S + 64); put(initial, S, 0xffffffff); put(initial, S + 4, flag);
  initial.write('Recovery source with a long native name\0', object + 4, 'latin1');
  put(initial, object + 0x97c, voice ? 0x4a7f40 : 0); put(initial, object + 0x94c, 0x12345678); initial[object + 0x950] = 0xcd;
  put(initial, actual(0x714b08), manager); put(initial, manager + 0x83c, header);
  put(initial, header, array); put(initial, header + 4, array); put(initial, header + 8, array + 64);
  put(initial, actual(0x715b08), coldDebugger ? 0 : 3); put(initial, actual(0x714afc), coldDebugger ? 0 : actual(0x715b30));
  initial[actual(0x715b54)] = 1; put(initial, actual(0x714b18), coldCategory ? 0 : 1); put(initial, actual(0x714b1c), 123);
  put(initial, actual(0x716b9c), 11);
  const recordHeader = actual(0x715b30) + 0x1048;
  if (!coldDebugger && !growRecords) {put(initial, recordHeader, 0x1406000); put(initial, recordHeader + 4, 0x1406000); put(initial, recordHeader + 8, 0x1406040);}
  for (const [index, [slot]] of imports.entries()) put(initial, actual(slot), 0x1600000 + index * 16);
  const globals = [[0x714afc, 0x210c], [0x5dcbd0, 16], [0x5d3f00, 64], [0x5d3b98, 16], [0x5e8890, 4], ...imports.map(([address]) => [address, 4])];
  const rows = globals.map(([address, length]) => ({address: actual(address), bytes: Buffer.from(initial.subarray(actual(address), actual(address) + length))}));
  rows.push({address: object, bytes: Buffer.from(initial.subarray(object, object + 0x50000))}, {address: S - 0x6000, bytes: Buffer.from(initial.subarray(S - 0x6000, S + 64))});
  const source = createCapturedMemory(rows, {aliases: globals.map(([address, length]) => ({address, targetAddress: actual(address), length}))});
  const sourceWorld = world(source.memory, actual, {replaceManager, memcpyEcx});
  const reference = new BoundedX86(loaded.instructions, {entry: actual(0x4ad9e0), fpuPrecisionBits: 24}); reference.bytes = Buffer.from(initial); reference.fs0 = 0x12345678;
  const referenceWorld = world(reference.bytes, actual, {replaceManager, memcpyEcx}), incoming = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545};
  Object.assign(reference.r, incoming, {ESP: S, ECX: object});
  const next = new Map(loaded.instructions.slice(0, -1).map((row, index) => [row.address, loaded.instructions[index + 1].address]));
  reference.onInstruction = address => {
    assert.ok(!loaded.unresolvedRelocations.has(address));
    const row = loaded.instructions[reference.entries.get(address)];
    if (row.op === 'CALL' && reference.externalCalls.has(reference.get(row.args[0]) >>> 0)) put(reference.bytes, reference.r.ESP - 4, next.get(address));
  };
  for (const [index, [, name, count, platform]] of imports.entries()) reference.externalCalls.set(0x1600000 + index * 16, state => {
    const args = Array.from({length: count}, (_, index) => state.bytes.readUInt32LE(state.r.ESP + index * 4));
    state.r.EAX = referenceWorld[platform ? 'platformCall' : 'libraryCall'](name, args, {scratchBase: state.r.ESP - 4});
    if (platform) state.r.ESP += count * 4;
  });
  for (const [address, name, count] of [[0x568a48, 'memcpy', 3], [0x56832a, 'registerExit', 1]]) reference.externalCalls.set(actual(address), state => {
    const context = {scratchBase: state.r.ESP - 4, volatileRegisters: {ECX: state.r.ECX}};
    state.r.EAX = referenceWorld.libraryCall(name, Array.from({length: count}, (_, index) => state.bytes.readUInt32LE(state.r.ESP + index * 4)), context);
    state.r.ECX = context.volatileRegisters.ECX | 0;
  });
  reference.externalCalls.set(actual(0x568980), state => {state.r.ESP -= state.r.EAX;});
  reference.externalCalls.set(actual(0x568162), () => {});
  requestGameAudioSamplePlayback(object, flag, {memory: source.memory, scratchBase: S, moduleBaseAddress, sehWord: 0x12345678, entryRegisters: incoming, services: sourceWorld});
  reference.run(500000);
  assert.equal(reference.fs0, 0x12345678); assert.deepEqual(sourceWorld.calls, referenceWorld.calls);
  for (const row of rows) assert.deepEqual(source.span(row.address, row.bytes.length), reference.bytes.subarray(row.address, row.address + row.bytes.length), `actualspan0x${row.address.toString(16)}`);
  for (const [name, value] of Object.entries(incoming)) assert.equal(reference.r[name] >>> 0, value);
  if (voice) {
    assert.equal(source.memory.readUInt32LE(object + 0x94c), 3); assert.equal(source.memory[object + 0x950], 1);
    assert.equal(source.memory.readUInt32LE(array), object); assert.equal(source.memory.readUInt32LE(header + 4), array + 4);
    assert.equal(source.memory.readUInt32LE(manager + 0x88c), 0); assert.equal(source.memory.readUInt32LE(manager + 0x890), 0);
    if (coldCategory) {
      const begin = source.memory.readUInt32LE(recordHeader);
      assert.equal(source.memory.readUInt32LE(begin + 4), actual(0x5d3b98));
    }
    assert.ok(sourceWorld.allocations.length > 0); assert.ok(sourceWorld.freed.length > 0);
  } else assert.equal(sourceWorld.calls.length, 0);
  return {source, sourceWorld, actual, object, manager};
}

test('real relocated play-request/string/debugger/queue instructions match sparse source state', {skip: !installed}, async () => {
  await comparePlayback({});
  await comparePlayback({coldCategory: true});
  await comparePlayback({coldCategory: true, growRecords: true});
});

test('cold relocated debugger uses actual constructors and native record growth with explicit OS services', {skip: !installed}, async () => {
  const result = await comparePlayback({coldDebugger: true, coldCategory: true});
  assert.equal(result.source.memory.readUInt32LE(result.actual(0x714afc)), result.actual(0x715b30));
  assert.equal(result.source.memory.readUInt32LE(result.actual(0x715b30)), result.actual(0x5d38f0));
  assert.ok(result.sourceWorld.calls.some(row => row.name === 'registerExit'));
});

test('request retains captured manager identity across an external root replacement; null voice skips all services', {skip: !installed}, async () => {
  const result = await comparePlayback({replaceManager: true});
  assert.equal(result.source.memory.readUInt32LE(result.actual(0x714b08)), 0x1403000);
  await comparePlayback({voice: false});
});

test('actual formatter and game tail carry explicit external memcpy ECX through native debugger entry under ASLR', {skip: !installed}, async () => {
  await comparePlayback({memcpyEcx: 0});
  await comparePlayback({memcpyEcx: 0xf1234567});
});
