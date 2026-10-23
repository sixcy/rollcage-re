import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {replayNativeWorkerGainEntry} from '../tools/lib/native-worker-gain-replay.mjs';
import {workerSourceVtableWords} from '../tools/lib/native-recovery-worker-observation.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(moduleBaseAddress = 0x400000, force = 0) {
  const actual = p => moduleBaseAddress + p - 0x400000, S = 0x9000, manager = 0x1300000, table = 0x1310000, source = 0x1400000, fsBase = 0x1420000;
  const word = v => {const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b;}, ranges = new Map();
  const part = (id, address, bytes, extra = {}) => ranges.set(id, {id, address, length: bytes.length, bytes, sha256: hash(bytes), ...extra});
  const returned = actual(force ? 0x4a72f6 : 0x4a722c), args = Buffer.alloc(12), stack = Buffer.alloc(444, 0xba);
  args.writeUInt32LE(returned); args.writeUInt32LE(source, 4); args.writeUInt32LE(force, 8); args.copy(stack, 432);
  const managerBytes = Buffer.alloc(0xd74), vtable = Buffer.alloc(0x64), sourceBytes = Buffer.alloc(0x9a8), sourceVtable = Buffer.alloc(0x88);
  managerBytes.writeUInt32LE(table); vtable.writeUInt32LE(actual(0x4a79f0), 0x48); vtable.writeUInt32LE(actual(0x4b12d0), 0x60);
  sourceBytes.writeUInt32LE(actual(0x5d3f60)); sourceBytes.writeUInt32LE(1, 0x438); workerSourceVtableWords.forEach((p, i) => sourceVtable.writeUInt32LE(actual(p), i * 4));
  part('worker-gain-manager-root', actual(0x714b08), word(manager)); part('worker-gain-manager', manager, managerBytes); part('worker-gain-manager-vtable', table, vtable);
  part('worker-gain-source', source, sourceBytes); part('worker-gain-source-vtable', actual(0x5d3f60), sourceVtable);
  part('worker-gain-arguments', S, args); part('worker-gain-stack', S - 432, stack); part('worker-gain-literal-5dc774', actual(0x5dc774), word(0x3f800000));
  part('thread-seh-head', fsBase, word(0xffffffff), {source: 'stopped-owned-thread-fs-zero'});
  const registers = {edi: 0x3333, esi: source, ebx: 0x1111, edx: 0x4444, ecx: manager, eax: table, ebp: 0x2222, eip: actual(0x4b12d0), esp: S, fpuControlWord: 0x27f, mxcsr: 0x1fa0};
  const context = Buffer.alloc(716); for (const [name, offset] of Object.entries({edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196})) context.writeUInt32LE(registers[name], offset);
  context.writeUInt32LE(0x27f, 28); context.writeUInt32LE(0x1fa0, 228); context.writeUInt32LE(0x53, 144);
  const descriptor = Buffer.alloc(8); descriptor.writeUInt16LE(fsBase & 65535, 2); descriptor[4] = fsBase >>> 16 & 255; descriptor[7] = fsBase >>> 24;
  const before = {ordinal: 12, tid: 2, moduleBaseAddress, breakpointId: 'worker-gain-entry', registers, context, contextSha256: hash(context), ranges,
    ownedWorkerGainPair: {role: 'entry', beforeOriginalInstruction: true, entryEsp: S, source, manager, returnAddress: returned, force, tid: 2, expectedTid: 2},
    threadEnvironment: {tid: 2, fsSelector: 0x53, fsBase, sehWord: 0xffffffff, descriptorHex: descriptor.toString('hex'), contextSelectorOffset: 144, source: 'stopped-owned-thread-selector-query', selectorApi: 'Wow64GetThreadSelectorEntry'}};
  return {before, actual, S, manager, source, refresh() {for (const row of ranges.values()) row.sha256 = hash(row.bytes); before.contextSha256 = hash(context);}};
}

test('worker gain genuine source prefix reaches its original first Win32 boundary under preferred/ASLR PC53 without applying an outcome', () => {
  for (const base of [0x400000, 0x6e0000]) for (const force of [0, 1]) {
    const f = fixture(base, force), originals = [...f.before.ranges.values()].map(row => Buffer.from(row.bytes));
    const {report, memory} = replayNativeWorkerGainEntry(f.before);
    assert.equal(report.sourceReplayComplete, false); assert.equal(report.wholeGainCallMatched, false);
    assert.equal(report.failure, null); assert.equal(report.reachedGenuineMixerLookup, true); assert.equal(report.externalOutcomesApplied, 0);
    assert.equal(report.input.numericalContext.x87.precisionBits, 53); assert.equal(report.input.force, force);
    assert.equal(report.boundary.name, 'EnterCriticalSection'); assert.equal(report.boundary.entryEsp, f.S - 0x194);
    assert.equal(report.boundary.returnAddress, f.actual(0x4a7a05)); assert.deepEqual(report.boundary.args, [f.manager + 0x854]);
    assert.equal(report.partialChanges.sourceBytes, 0); assert.equal(report.partialChanges.managerBytes, 0); assert.ok(report.partialChanges.stackBytes > 0);
    assert.equal(memory.readUInt32LE(f.S - 4), 0x2222); assert.equal(memory.readUInt32LE(f.S - 0x174), 0x3333);
    [...f.before.ranges.values()].forEach((row, i) => assert.deepEqual(row.bytes, originals[i]));
  }
});

test('source worker prefix matches retained original game instructions through the external CALL entry, with no service return', async () => {
  for (const base of [0x400000, 0x6e0000]) {
    const f = fixture(base), original = await loadRelocatedAudioFixture(base), trap = 0x1430000;
    //A declared external entry boundary, never executed. It lets the x86 CALL
    //itself push its real return word. No OS implementation/result is faked.
    const program = [...original.instructions, {address: trap, op: 'NOP', args: []}];
    const machine = new BoundedX86(program, {entry: f.actual(0x4b12d0), fpuPrecisionBits: 53}); machine.bytes = original.memory;
    for (const row of f.before.ranges.values()) row.bytes.copy(machine.bytes, row.address);
    machine.bytes.writeUInt32LE(trap, f.actual(0x56e094));
    Object.assign(machine.r, Object.fromEntries(Object.entries(f.before.registers).filter(([name]) => ['edi', 'esi', 'ebx', 'edx', 'ecx', 'eax', 'ebp', 'eip', 'esp'].includes(name)).map(([name, value]) => [name.toUpperCase(), value])));
    machine.fs0 = 0xffffffff;
    machine.onInstruction = address => {if (address === trap) throw Error('stopped at original external service entry');};
    assert.throws(() => machine.run(), /stopped at original external service entry/);
    const replay = replayNativeWorkerGainEntry(f.before);
    assert.equal(machine.r.ESP >>> 0, replay.report.boundary.entryEsp);
    for (const row of f.before.ranges.values()) assert.deepEqual(machine.bytes.subarray(row.address, row.address + row.bytes.length), replay.span(row.address, row.bytes.length), row.id);
  }
});

test('entry replay rejects exit/PC24/hash/source/frame substitutions and never admits an after-state option', () => {
  for (const change of [
    f => f.before.breakpointId = 'worker-gain-exit', f => f.before.ownedWorkerGainPair.role = 'exit',
    f => f.before.context[172] ^= 1, f => f.before.ranges.get('worker-gain-source').bytes[1] ^= 1,
    f => {f.before.registers.fpuControlWord = 0x7f; f.before.context.writeUInt32LE(0x7f, 28); f.refresh();},
    f => f.before.ownedWorkerGainPair.source++, f => f.before.ownedWorkerGainPair.force = 1,
    f => f.before.ownedWorkerGainPair.expectedTid = 3, f => {delete f.before.threadEnvironment;},
  ]) {const f = fixture(); change(f); assert.throws(() => replayNativeWorkerGainEntry(f.before));}
  const f = fixture();
  assert.throws(() => replayNativeWorkerGainEntry(f.before, {after: {source: Buffer.alloc(0x9a8, 0xcc)}}), /no after state or injected services/);
  assert.throws(() => replayNativeWorkerGainEntry(f.before, {services: {platformCall() {return 0;}}}), /no after state or injected services/);
});
