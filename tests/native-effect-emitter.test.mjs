import test from 'node:test';
import assert from 'node:assert/strict';
import {emitNativeEffectOnStack, nativeEffectStackLayout} from '../src/native-effect-emitter.mjs';
import {createNativeFrameSoundBindings, nativeFrameActiveSoundCaptureRanges, bindCapturedNativeThreadEnvironment, nativeFrameSoundAdditionalRegions} from '../tools/lib/native-frame-sound.mjs';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const numericalContext = decodePhysicsNumericalContext({x87ControlWord: 0x7f, mxcsr: 0x1f80});
const incoming = {ebx: 0x11223344, ebp: 0x55667788, esi: 0x10203040, edi: 0x50607080};
const args = [0, 0x600, 0x3fff, 6, 0x20000, 0, 1];
function publish(memory, entry, words = args, caller = 0x482791) {
  memory.writeUInt32LE(caller, entry);
  words.forEach((value, index) => memory.writeInt32LE(value | 0, entry + 4 + index * 4));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function threadFixture() {
  const base = 0x7ffb1234, context = Buffer.alloc(716), bytes = Buffer.alloc(4), descriptor = Buffer.from('ffff000000f3cf00', 'hex');
  context.writeUInt32LE(0x53, 144); bytes.writeUInt32LE(0xffffffff);
  descriptor.writeUInt16LE(base & 0xffff, 2); descriptor[4] = base >>> 16 & 255; descriptor[7] = base >>> 24;
  const row = {id: 'thread-seh-head', address: `0x${base.toString(16)}`, length: 4, bytes, sha256: hash(bytes), source: 'stopped-owned-thread-fs-zero'};
  const snapshot = {tid: 1234, context, contextSha256: hash(context), ranges: new Map([[row.id, row]]),
    threadEnvironment: {fsSelector: '0x00000053', descriptorHex: descriptor.toString('hex'), fsBase: `0x${base.toString(16)}`, sehWord: '0xffffffff', tid: 1234, selectorApi: 'Wow64GetThreadSelectorEntry', contextSelectorOffset: 144, source: 'stopped-owned-thread-selector-query'}};
  const {memory} = createCapturedMemory([{address: base, bytes}]);
  return {snapshot, memory, base, row};
}

test('actual emitter and naturally-null dispatcher match every shared-stack byte through native preRET', async () => {
  const {evidence, instructions} = await readInstructionEvidence(['149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json'], {directory: 'analysis/native-simulation/results'});
  assert.ok(evidence.every(row => row.subject.digest.sha256 === 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const machine = new BoundedX86(instructions, {entry: 0x484bb0, fpuPrecisionBits: 24});
  let cases = 0;
  for (const offset of [0, 4, 8, 12]) for (const code of [24, 0, 1, 22, 64, -1]) {
    machine.reset();
    const entry = 0x9000 + offset, layout = nativeEffectStackLayout(entry), words = [...args];
    words[1] = offset === 4 ? -1 : offset === 8 ? 0x7fffffff : args[1];
    words[2] = offset === 12 ? -0x80000000 : args[2]; words[3] = offset === 8 ? 9 : 6;
    machine.bytes.fill(0xa5, entry - 128, entry + 40);
    machine.bytes.writeUInt32LE(0x10000, 0x6f2414); machine.bytes.writeUInt32LE(0x10100, 0x6f2418);
    publish(machine.bytes, entry, words);
    Object.assign(machine.r, {ECX: code, EDX: 0x20034, ESP: entry, ...Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key.toUpperCase(), value | 0]))});
    const source = Buffer.from(machine.bytes), binding = createNativeFrameSoundBindings({memory: source, numericalContext});
    let reachedReturn = false;
    machine.onInstruction = address => {if (address === 0x484c70) {reachedReturn = true; throw Error('test-preRET-boundary');}};
    assert.throws(() => machine.run(), /At 0x484c70: test-preRET-boundary/);
    assert.equal(reachedReturn, true);
    const actual = binding.call484bb0({memory: source, code, registerEdx: 0x20034, args: words, scratchBase: entry, nativeStack: {entryRegisters: incoming}});
    assert.equal(actual, machine.r.EAX, `return code${code}/ESP${entry.toString(16)}`);
    assert.deepEqual(source.subarray(entry - 128, entry + 40), machine.bytes.subarray(entry - 128, entry + 40), `all shared stack bytes code${code}/alignment${offset}`);
    assert.equal(source.readUInt32LE(entry), 0x482791, 'actual native caller return is retained');
    assert.equal(source.readUInt32LE(layout.dispatchEntry), 0x484c5d);
    assert.deepEqual(source.subarray(0x10000, 0x10100), machine.bytes.subarray(0x10000, 0x10100), 'no fabricated bank entries');
    cases++;
  }
  assert.equal(cases, 24);
});

test('ASLR captured roots and real selected bank slot are admitted without rewriting pointers', () => {
  const moduleBaseAddress = 0x600000, root = 0x6f2414, actualRoot = root + 0x200000, entry = 0x30001000, bank = 0x33000000;
  const {memory} = createCapturedMemory([
    {address: actualRoot, bytes: Buffer.alloc(12)}, {address: entry - 256, bytes: Buffer.alloc(512, 0x5a)}, {address: bank, bytes: Buffer.alloc(100)},
  ], {aliases: [{address: root, targetAddress: actualRoot, length: 12}]});
  memory.writeUInt32LE(bank, root); memory.writeUInt32LE(bank + 100, root + 4);
  publish(memory, entry, args, 0x682791);
  const before = Buffer.from(memory.subarray(bank, bank + 100));
  const binding = createNativeFrameSoundBindings({memory, moduleBaseAddress, numericalContext});
  assert.equal(binding.call484bb0({memory, code: 24, registerEdx: 0x44000000, args, scratchBase: entry, nativeStack: {entryRegisters: incoming}}), 127);
  const layout = nativeEffectStackLayout(entry);
  assert.equal(memory.readUInt32LE(layout.dispatchEntry), 0x684c5d);
  assert.equal(memory.readUInt32LE(entry), 0x682791);
  assert.deepEqual(memory.subarray(bank, bank + 100), before);
  assert.deepEqual(binding.comparisonRegions.map(row => [row.address, row.length, row.comparison]), [[actualRoot, 8, 'read-only'], [bank + 24 * 4, 4, 'read-only']]);
  memory.writeUInt32LE(0x12340000, bank + 24 * 4);
  assert.throws(() => binding.call484bb0({memory, code: 24, registerEdx: 0, args, scratchBase: entry, nativeStack: {entryRegisters: incoming}}), /populated sound0x12340000 requires complete40db20/);
  assert.equal(memory.readUInt32LE(bank + 96), 0x12340000);
});

test('unavailable captured bank bytes and missing native caller/register context fail explicitly', () => {
  const entry = 0x30001000;
  const {memory} = createCapturedMemory([{address: 0x6f2414, bytes: Buffer.alloc(12)}, {address: entry - 256, bytes: Buffer.alloc(512)}]);
  memory.writeUInt32LE(0x33000000, 0x6f2414); memory.writeUInt32LE(0x33000100, 0x6f2418); publish(memory, entry);
  const binding = createNativeFrameSoundBindings({memory, numericalContext}), request = {memory, code: 24, registerEdx: 0, args, scratchBase: entry, nativeStack: {entryRegisters: incoming}};
  assert.throws(() => binding.call484bb0(request), /Uncaptured/);
  assert.throws(() => binding.call484bb0({...request, nativeStack: {}}), /incoming ebx/);
  memory.writeUInt32LE(1, entry + 4);
  assert.throws(() => binding.call484bb0(request), /arguments differ from actual caller stack/);
  assert.throws(() => createNativeFrameSoundBindings({memory, numericalContext: decodePhysicsNumericalContext({x87ControlWord: 0x27f, mxcsr: 0x1f80})}), /PC24/);
});

test('dispatcher receives live parameter/argument stack rather than a private copy', () => {
  const memory = Buffer.alloc(0xa00000), entry = 0x9000;
  publish(memory, entry);
  let calls = 0;
  const result = emitNativeEffectOnStack(24, 0x20034, args, {memory, scratchBase: entry, nativeStack: {entryRegisters: incoming}, dispatch40ea40(request) {
    calls++;
    const layout = nativeEffectStackLayout(entry);
    assert.equal(request.parameters.buffer, memory.buffer);
    assert.equal(request.parameters.byteOffset, memory.byteOffset + layout.parameters);
    assert.equal(memory.readUInt32LE(request.scratchBase), 0x484c5d);
    assert.equal(memory.readUInt32LE(request.scratchBase + 16), layout.parameters);
    request.parameters.writeInt32LE(-99, 4);
    return -1;
  }});
  assert.equal(result, 127); assert.equal(calls, 1);
  assert.equal(memory.readInt32LE(nativeEffectStackLayout(entry).parameters + 4), -99);
});

test('populated owner with actual null round-robin slot matches full native SEH/cookie/argument stack', async () => {
  const {instructions} = await readInstructionEvidence(['149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json', '153-sound-channel-selection-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const machine = new BoundedX86(instructions, {entry: 0x484bb0, fpuPrecisionBits: 24}), entry = 0x9000, sound = 0x20000, channels = 0x30000;
  for (const index of [0, 1]) {
    machine.reset(); machine.fs0 = 0x12345678;
    machine.bytes.fill(0xa5, entry - 256, entry + 40); machine.bytes.fill(0x69, sound, sound + 0x490);
    machine.bytes.writeUInt32LE(0x10000, 0x6f2414); machine.bytes.writeUInt32LE(0x10100, 0x6f2418); machine.bytes.writeUInt32LE(sound, 0x10000 + 24 * 4);
    machine.bytes.writeUInt32LE(channels, sound + 4); machine.bytes.writeInt32LE(2, sound + 0x488); machine.bytes.writeInt32LE(index, sound + 0x48c);
    machine.bytes.writeUInt32LE(0x89abcdef, 0x5e8890); publish(machine.bytes, entry);
    Object.assign(machine.r, {ECX: 24, EDX: 0x70000, ESP: entry, ...Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key.toUpperCase(), value | 0]))});
    const source = Buffer.from(machine.bytes), nativeTls = {sehWord: 0x12345678};
    const binding = createNativeFrameSoundBindings({memory: source, numericalContext, nativeTls});
    machine.onInstruction = address => {if (address === 0x484c70) throw Error('test-preRET-boundary');};
    assert.throws(() => machine.run(), /At 0x484c70: test-preRET-boundary/);
    assert.equal(binding.call484bb0({memory: source, code: 24, registerEdx: 0x70000, args, scratchBase: entry, nativeStack: {entryRegisters: incoming}}), machine.r.EAX);
    assert.deepEqual(source.subarray(entry - 256, entry + 40), machine.bytes.subarray(entry - 256, entry + 40));
    assert.deepEqual(source.subarray(sound, sound + 0x490), machine.bytes.subarray(sound, sound + 0x490));
    assert.equal(nativeTls.sehWord, machine.fs0); assert.equal(nativeTls.sehWord, 0x12345678);
    assert.equal(source.readInt32LE(sound + 0x48c), index ? 0 : 1);
    assert.ok(binding.comparisonRegions.some(row => row.address === sound && row.length === 0x490 && row.comparison === 'mutable'));
  }
});

test('active sound capture descriptors retain proven owner size and explicitly bounded live vector roots', () => {
  const ranges = nativeFrameActiveSoundCaptureRanges({maxRegionBytes: 1024 * 1024, includeChannelVector: true});
  assert.deepEqual(ranges.find(row => row.id === 'active-sound24-owner'), {id: 'active-sound24-owner', rva: '0x2f2414', dereferenceOffsets: ['0', '0x60'], length: 0x490});
  assert.deepEqual(ranges.find(row => row.id.endsWith('channel-vector-region')).dereferenceOffsets, ['0', '0x60', '4']);
  assert.equal(ranges.filter(row => row.readableRegion).length, 2);
  assert.ok(ranges.filter(row => row.readableRegion).every(row => row.maxRegionBytes === 1024 * 1024 && !row.length));
  assert.throws(() => nativeFrameActiveSoundCaptureRanges({maxRegionBytes: 64 * 1024 * 1024 + 1}), /observation bound/);
});

test('captured thread SEH accessor reads and writes the actual sparse head span while preserving snapshot evidence', () => {
  const f = threadFixture(), binding = bindCapturedNativeThreadEnvironment(f.snapshot, {memory: f.memory});
  assert.equal(binding.nativeTls.fsBase, f.base); assert.equal(binding.nativeTls.fsSelector, 0x53);
  assert.equal(binding.nativeTls.sehWord, 0xffffffff);
  binding.nativeTls.sehWord = 0x12345678; assert.equal(f.memory.readUInt32LE(f.base), 0x12345678);
  f.memory.writeUInt32LE(0x33445566, f.base); assert.equal(binding.nativeTls.sehWord, 0x33445566);
  assert.equal(f.row.bytes.readUInt32LE(), 0xffffffff, 'Retained input bytes never become the replay TLS backing store.');
  assert.throws(() => {binding.nativeTls.sehWord = -1;}, /Invalid captured thread SEH store/);
  assert.deepEqual(binding.comparisonRegions.map(row => [row.address, row.length, row.comparison]), [[f.base, 4, 'mutable']]);
  assert.deepEqual(bindCapturedNativeThreadEnvironment({ranges: new Map()}, {}), {nativeTls: undefined, comparisonRegions: []});
});

test('captured thread SEH binding rejects partial or contradictory descriptor/context/hash/live evidence', () => {
  for (const [edit, message] of [
    [f => {delete f.snapshot.threadEnvironment;}, /no explicit thread-environment metadata/],
    [f => {f.snapshot.threadEnvironment = null;}, /exactly one explicit/],
    [f => {f.snapshot.ranges.clear();}, /exactly one explicit/],
    [f => {f.row.sha256 = '0'.repeat(64);}, /SEH head hash\/bytes/],
    [f => {f.row.length = 8;}, /exact four-byte/],
    [f => {f.snapshot.context = Buffer.alloc(512);}, /716-byte context/],
    [f => {f.snapshot.contextSha256 = '0'.repeat(64);}, /context hash\/bytes/],
    [f => {f.snapshot.context.writeUInt32LE(0x54, 144); f.snapshot.contextSha256 = hash(f.snapshot.context);}, /selector differs/],
    [f => {f.snapshot.threadEnvironment.fsSelector = 'guessed';}, /Invalid captured thread selector/],
    [f => {f.snapshot.threadEnvironment.descriptorHex = '00'.repeat(8);}, /descriptor\/base\/SEH bytes disagree/],
    [f => {f.snapshot.threadEnvironment.descriptorHex = '00';}, /eight-byte descriptor/],
    [f => {f.snapshot.threadEnvironment.fsBase = f.base + 4;}, /descriptor\/base\/SEH bytes disagree/],
    [f => {f.snapshot.threadEnvironment.sehWord = 0;}, /descriptor\/base\/SEH bytes disagree/],
    [f => {f.snapshot.threadEnvironment.tid++;}, /owned-thread selector-query provenance/],
    [f => {f.snapshot.threadEnvironment.selectorApi = 'TEB-offset-guess';}, /owned-thread selector-query provenance/],
    [f => {f.memory.writeUInt32LE(0, f.base);}, /actual live memory identity\/bytes/],
    [f => {f.memory = createCapturedMemory([{address: f.base + 4096, bytes: f.row.bytes}], {aliases: [{address: f.base, targetAddress: f.base + 4096, length: 4}]}).memory;}, /actual live memory identity\/bytes/],
  ]) {const f = threadFixture(); edit(f); assert.throws(() => bindCapturedNativeThreadEnvironment(f.snapshot, {memory: f.memory}), message);}
});

test('sound cookie additional region declares its explicit preferred-global ASLR alias', () => {
  const [region] = nativeFrameSoundAdditionalRegions({moduleBaseAddress: 0x6e0000});
  assert.equal(region.preferredAddress, 0x5e8890); assert.equal(region.address, 0x8c8890); assert.equal(region.length, 4); assert.equal(region.comparison, 'read-only');
  assert.throws(() => nativeFrameSoundAdditionalRegions({}), /observed main-module base/);
  assert.throws(() => nativeFrameSoundAdditionalRegions({moduleBaseAddress: 0xffffffff}), /observed main-module base/);
});

test('real populated null-channel child publishes and restores SEH through captured-memory TLS accessor', () => {
  const f = threadFixture(), entry = 0x30001000, sound = 0x33000000, bank = 0x11000000, channels = 0x33440000;
  const {memory} = createCapturedMemory([
    {address: f.base, bytes: f.row.bytes}, {address: entry - 512, bytes: Buffer.alloc(1024)},
    {address: 0x6f2414, bytes: Buffer.alloc(12)}, {address: 0x5e8890, bytes: Buffer.alloc(4)},
    {address: sound, bytes: Buffer.alloc(0x490)}, {address: bank, bytes: Buffer.alloc(256)}, {address: channels, bytes: Buffer.alloc(8)},
  ]);
  memory.writeUInt32LE(bank, 0x6f2414); memory.writeUInt32LE(bank + 256, 0x6f2418); memory.writeUInt32LE(sound, bank + 96);
  memory.writeUInt32LE(channels, sound + 4); memory.writeInt32LE(2, sound + 0x488); memory.writeUInt32LE(0x12345678, 0x5e8890);
  publish(memory, entry);
  const tls = bindCapturedNativeThreadEnvironment(f.snapshot, {memory}), binding = createNativeFrameSoundBindings({memory, numericalContext, nativeTls: tls.nativeTls});
  const original = binding.soundRuntime.onSoundChannelRead; let calls = 0;
  binding.soundRuntime.onSoundChannelRead = request => {
    calls++; original(request);
    const childEntry = nativeEffectStackLayout(entry).dispatchEntry - 24;
    assert.equal(memory.readUInt32LE(f.base), childEntry - 12);
    assert.equal(tls.nativeTls.sehWord, childEntry - 12);
  };
  assert.equal(binding.call484bb0({memory, code: 24, registerEdx: 0x44000000, args, scratchBase: entry, nativeStack: {entryRegisters: incoming}}), 127);
  assert.equal(calls, 1); assert.equal(tls.nativeTls.sehWord, 0xffffffff); assert.equal(memory.readUInt32LE(f.base), 0xffffffff);
});
