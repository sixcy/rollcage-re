import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {verifyNativeRecoverySourceConstructorBoundaries, selectNativeRecoverySourceConstructorPair, replayNativeRecoverySourceConstructor, inspectNativeRecoverySourceServices} from '../tools/lib/native-recovery-source-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
import {constructXAudioSample} from '../src/game-audio-sample-state.mjs';
import {initializeGameAudioDescriptor} from '../src/game-audio-descriptors.mjs';

test('source constructor retains exact game constructor/return sites and both actual callers', async () => {
  assert.equal((await verifyNativeRecoverySourceConstructorBoundaries()).length, 2);
  assert.throws(() => replayNativeRecoverySourceConstructor(), /same-thread/);
});

test('source constructor relocates only proven image literals while preserving heap and scalar values', () => {
  const memory = Buffer.alloc(0x3000000), moduleBaseAddress = 0x720000, actual = value => moduleBaseAddress + value - 0x400000;
  const object = 0x2000000, descriptor = 0x2100000, S = 0x9000, calls = [];
  memory.fill(0xa7, object, object + 0x9a8);
  memory.write('Unknown\0', actual(0x5d0320), 'ascii'); memory.writeFloatLE(1, actual(0x5dc774));
  const runtime = {memory, moduleBaseAddress, scratchBase: S, entryRegisters: {EBX: 0x12345678, EBP: 0x23456789, ESI: 0x34567890, EDI: descriptor}, sehWord: 0x11223344,
    services: {libraryCall(name, args, context) {
      const wide = name === 'wcsncpy_s', width = wide ? 2 : 1;
      assert.ok(['strncpy_s', 'wcsncpy_s'].includes(name));
      const [output, capacity, input, count] = args;
      assert.ok([actual(0x56fe6b), actual(0x5d0320), actual(0x56feb0)].includes(input));
      let index = 0;
      for (; index < count; index++) {const value = wide ? memory.readUInt16LE(input + index * width) : memory[input + index]; if (!value) break; if (wide) memory.writeUInt16LE(value, output + index * width); else memory[output + index] = value;}
      assert.ok(index < capacity);
      if (wide) memory.writeUInt16LE(0, output + index * width); else memory[output + index] = 0;
      calls.push(memory.readUInt32LE(context.scratchBase)); return 0;
    }}};
  initializeGameAudioDescriptor(descriptor, {...runtime, scratchBase: 0x8000});
  memory.writeUInt32LE(descriptor, S + 4); memory.writeUInt32LE(0, S + 24);
  assert.equal(constructXAudioSample(object, descriptor, runtime), object);
  assert.equal(memory.readUInt32LE(object), actual(0x5d3f60));
  assert.equal(memory.readUInt32LE(object + 0x978), actual(0x5d3f40));
  assert.equal(memory.readUInt32LE(object + 0x984), 0x3f800000);
  assert.equal(memory.readUInt32LE(S + 4), descriptor);
  assert.equal(memory.readUInt32LE(S - 8), actual(0x56a700));
  assert.deepEqual(calls.slice(0, 3), [0x40ceb7, 0x40cece, 0x40cef0].map(actual));
});

//v7 reached its duration bound before the controlled parent and the user
//reported possible keyboard activity. Keep that failed evidence; never use it
//as a positive constructor fixture. v8 is the next independent observation.
const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v8-20261023';
test('retained original source constructor uses allocator input and matches all source/descriptor bytes under actual ASLR', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  assert.equal(pairs.length, 1);
  const lineage = selectNativeRecoverySoundSnapshots(capture, pairs[0], configuration);
  const pair = selectNativeRecoverySourceConstructorPair(capture, pairs[0]);
  assert.equal(Number(pair.before.registers.ecx), lineage.sourceAddress);
  const result = replayNativeRecoverySourceConstructor(pair);
  assert.equal(result.matched, true, JSON.stringify(result.firstDivergence));
  assert.equal(result.comparedBytes, 0x9a8 + 0x460 + 96 + 24 + 4 + 4);
  assert.equal(result.crtCalls.length, 6);
  assert.equal(result.registers.length, 6);
  assert.notEqual(result.moduleBaseAddress, 0x400000, 'The retained process exercises real module relocation.');

  const registers = {...pair.after.registers, ebx: (Number(pair.after.registers.ebx) + 1) >>> 0};
  assert.equal(replayNativeRecoverySourceConstructor({...pair, after: {...pair.after, registers}}).firstDivergence.name, 'ebx');
  const address = result.input.object + 0x960;
  const ranges = new Map([...pair.after.ranges].map(([id, part]) => {
    const bytes = Buffer.from(part.bytes), offset = address - Number(part.address);
    if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
    return [id, {...part, bytes}];
  }));
  assert.equal(replayNativeRecoverySourceConstructor({...pair, after: {...pair.after, ranges}}).matched, false);
  assert.throws(() => replayNativeRecoverySourceConstructor({...pair, before: {...pair.before, registers: {...pair.before.registers, fpuControlWord: 0x27f}}}), /PC24/);
});

test('retained service observations preserve actual Win32 waiter changes while rejecting ownership, wrapper, clock and ABI corruption', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration), pair = pairs[0];
  assert.equal(pairs.length, 1);
  const lineage = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
  const observed = inspectNativeRecoverySourceServices(capture, pair, lineage);
  assert.equal(observed.verified, true);
  assert.equal(observed.sourceServiceComparisonComplete, false);
  assert.equal(observed.com.result, 0);
  assert.equal(observed.com.voiceAddress, lineage.allocationMemory.source.voiceAddress);
  assert.deepEqual(observed.criticalSections.map(row => row.kind), ['mixer', 'factory', 'playback']);
  const factory = observed.criticalSections.find(row => row.kind === 'factory');
  assert.equal(factory.lockCountBefore, -2);
  assert.equal(factory.lockCountAfter, -6);
  assert.equal(factory.waitersBefore, 0);
  assert.equal(factory.waitersAfter, 1);
  assert.deepEqual(factory.changedWin32ByteOffsets, [4]);
  assert.notEqual(factory.enteredWin32BytesHex, factory.afterThreadIdWin32BytesHex);
  const changed = edit => ({...capture, snapshots: capture.snapshots.map(row => row.ordinal === factory.threadOrdinal ? edit(row) : row)});
  const flipByte = address => changed(row => ({...row, ranges: new Map([...row.ranges].map(([id, part]) => {
    const bytes = Buffer.from(part.bytes), offset = address - Number(part.address);
    if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
    return [id, {...part, bytes}];
  }))}));
  for (const offset of [0, 4, 8, 12, 16, 20, 24, 28]) {
    assert.throws(() => inspectNativeRecoverySourceServices(flipByte(factory.address + offset), pair, lineage), /ownership|wrapper/);
  }
  assert.throws(() => inspectNativeRecoverySourceServices(changed(row => ({...row, registers: {...row.registers, esp: Number(row.registers.esp) + 4}})), pair, lineage), /stack/);
  assert.throws(() => inspectNativeRecoverySourceServices(changed(row => ({...row, registers: {...row.registers, eax: Number(row.registers.eax) + 1}})), pair, lineage), /thread result/);
  const clockAddress = Number(capture.snapshots.find(row => row.ordinal === factory.threadOrdinal).ranges.get('recovery-audio-clock').address);
  assert.throws(() => inspectNativeRecoverySourceServices(flipByte(clockAddress), pair, lineage), /clock/);
});
