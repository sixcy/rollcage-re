import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {appendGameImagePointer} from '../src/game-image-storage.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {createNativeRecoveryAdaptiveSoundBindings} from '../tools/lib/native-recovery-channel-replay.mjs';
import {compareNativeRecoveryParentAudio} from '../tools/check-native-recovery-parent-audio.mjs';
import {REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

const installed = existsSync('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');
test('actual preferred/relocated empty-channel vector growth preserves sparse preimage, zero memmove and every native return word', {skip: !installed}, async () => {
  for (const moduleBaseAddress of [0x400000, 0x6e0000]) {
    const loaded = await loadRelocatedAudioFixture(moduleBaseAddress), {memory: initial, actual} = loaded;
    const vector = 0x1400000, input = 0x1400040, allocation = 0x1400200, S = 0x1500000;
    initial.fill(0, vector, vector + 12); initial.writeUInt32LE(0x4a7710, input); initial.fill(0x9b, allocation, allocation + 4);
    initial.fill(0x57, S - 256, S + 16); initial.writeUInt32LE(0xffffffff, S); initial.writeUInt32LE(input, S + 4);
    for (const [slot, target] of [[0x56e220, 0x1600000], [0x56e478, 0x1600010]]) initial.writeUInt32LE(target, actual(slot));
    const rows = [[vector, 12], [input, 4], [allocation, 4], [S - 256, 272]].map(([address, length]) => ({address, bytes: Buffer.from(initial.subarray(address, address + length))}));
    const source = createCapturedMemory(rows), calls = [], referenceCalls = [];
    const world = (memory, trace) => ({libraryCall(name, args, runtime) {
      trace.push({name, args: [...args], entryEsp: runtime.scratchBase, returnAddress: memory.readUInt32LE(runtime.scratchBase)});
      if (name === 'operatorNew') {assert.deepEqual(args, [4]); assert.equal(memory.readUInt32LE(allocation), 0x9b9b9b9b); return allocation;}
      if (name === 'memmove') {assert.deepEqual(args, [allocation, 0, 0]); return allocation;}
      throw Error(`Unadmitted pointer-vector CRT ${name}.`);
    }});
    const registers = {EBX: 0x121212, EBP: 0x232323, ESI: 0x343434, EDI: 0x454545};
    appendGameImagePointer(vector, input, {memory: source.memory, scratchBase: S, moduleBaseAddress, nativePointerVector: true, entryRegisters: registers, services: world(source.memory, calls)});
    const reference = new BoundedX86(loaded.instructions, {entry: actual(0x40ebc0)}); reference.bytes = Buffer.from(initial);
    Object.assign(reference.r, registers, {ESP: S, ECX: vector});
    const next = new Map(loaded.instructions.slice(0, -1).map((row, index) => [row.address, loaded.instructions[index + 1].address]));
    reference.onInstruction = address => {
      assert.ok(!loaded.unresolvedRelocations.has(address));
      const row = loaded.instructions[reference.entries.get(address)];
      if (row.op === 'CALL' && reference.externalCalls.has(reference.get(row.args[0]) >>> 0)) reference.bytes.writeUInt32LE(next.get(address), reference.r.ESP - 4);
    };
    const services = world(reference.bytes, referenceCalls);
    for (const [target, name, count] of [[0x1600000, 'operatorNew', 1], [0x1600010, 'memmove', 3]]) reference.externalCalls.set(target, cpu => {
      cpu.r.EAX = services.libraryCall(name, Array.from({length: count}, (_, index) => cpu.bytes.readUInt32LE(cpu.r.ESP + index * 4)), {scratchBase: cpu.r.ESP - 4});
    });
    reference.run(100000);
    assert.deepEqual(calls, referenceCalls);
    for (const row of rows) assert.deepEqual(source.span(row.address, row.bytes.length), reference.bytes.subarray(row.address, row.address + row.bytes.length));
    assert.equal(source.memory.readUInt32LE(allocation), 0x4a7710, 'Opaque wrapper word must not be rebased.');
    assert.equal(source.memory.readUInt32LE(vector), allocation); assert.equal(source.memory.readUInt32LE(vector + 4), allocation + 4);
  }
});

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v12-20261023';
test('original connected parent retains actual allocator timing and stops at a genuine background lock producer', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration); assert.equal(pairs.length, 1);
  const pair = pairs[0], bindings = createNativeRecoveryAdaptiveSoundBindings({capture, pair, configuration});
  const original = createCapturedMemory([...pair.before.ranges.values()]);
  const allocations = bindings.additionalInputSpans.filter(row => row.role === 'allocator-output-capacity');
  assert.deepEqual(allocations.map(row => row.length), [12, 2472, 4, 32]);
  for (const row of allocations) {
    assert.equal(row.bytes, undefined, 'Future allocation preimage is not an earlier input row.');
    assert.equal(row.initializeAt, 'matched-original-allocator-return');
    assert.equal(original.span(row.address, row.length).equals(row.preimageBytes), false, 'Actual parent freed-heap contents differ before allocation.');
  }
  const result = compareNativeRecoveryParentAudio(capture, pair, configuration);
  assert.equal(result.matched, false); assert.equal(result.sourceComplete, false); assert.equal(result.fullPrivateAbiMatched, false);
  assert.equal(result.error.boundary.kind, 'unbound-concurrency');
  assert.match(result.error.message, /waiter changes across GetCurrentThreadId/);
  assert.equal(result.factoryExternalEvents, 14);
  assert.equal(result.playbackComplete, false);
  assert.deepEqual(result.sourceEvents.map(row => [row.name, row.allocation]), [['operatorNew', 'allocator-wrapper']]);
  assert.deepEqual(result.sourceCheckpoints, []);
});
