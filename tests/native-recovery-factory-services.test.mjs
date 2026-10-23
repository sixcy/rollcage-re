import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {attemptNativeRecoveryFactoryReplay} from '../tools/lib/native-recovery-factory-replay.mjs';
import {applyObservedSuccessfulFileSize, applyObservedSuccessfulFindFirst, createNativeRecoveryFactoryServices} from '../tools/lib/native-recovery-factory-services.mjs';
import {REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v9-20261023';
const available = existsSync(`${directory}/trace.jsonl`);
let cached;
async function fixture() {
  return cached ??= (async () => {
    const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
    const {pairs} = pairNativeRecoverySnapshots(capture, configuration); assert.equal(pairs.length, 1);
    const pair = pairs[0], lineage = selectNativeRecoverySoundSnapshots(capture, pair, configuration);
    return {capture, configuration, pair, lineage};
  })();
}

test('original v9 factory binds seven real external outcomes and constructs its complete source before the inner FindData input gap', {skip: !available}, async () => {
  const {capture, configuration, pair} = await fixture();
  const result = attemptNativeRecoveryFactoryReplay(capture, pair, configuration, {bindObservedServices: true});
  assert.equal(result.complete, false); assert.equal(result.matchedFullFactory, false);
  assert.equal(result.consumedExternalEvents, 7);
  assert.deepEqual(result.externalCalls.map(row => row.name), ['FindFirstFileW', 'FindClose', 'CreateFileW', 'GetFileSizeEx', 'CloseHandle', 'CloseHandle', 'operatorNew', 'FindFirstFileW']);
  assert.deepEqual(result.checkpoints.map(row => [row.comparedBytes, row.matched]), [[0x9a8, true]]);
  assert.equal(result.stop.kind, 'input-divergence'); assert.match(result.stop.message, /FindFirstFileW output preimage/);
  assert.equal(result.stop.address, 0xdbd2c8); assert.equal(result.stop.offset, 0);
  assert.equal(result.privateOutputPreimages.length, 1);
  assert.deepEqual(result.privateOutputPreimages[0], {address: 0xdbf98c, length: 8, sourcePreimageHex: '000000001f1af8ff',
    originalPreimageHex: '0a00000008fadb00', preimageMatched: false,
    contract: 'Successful GetFileSizeEx fully written8B [out] LARGE_INTEGER; pre-call scratch is not compared as an API input.'});
});

test('actual successful GetFileSizeEx output is independent of all eight prior scratch bytes and preserves neighbors', {skip: !available}, async () => {
  const {lineage} = await fixture(), event = lineage.bindingObservations.services.find(row => row.name === 'file-size');
  const nativeArgs = Buffer.from(event.argumentsHex, 'hex'), args = [nativeArgs.readUInt32LE(), nativeArgs.readUInt32LE(4)];
  for (let trial = 0; trial < 32; trial++) {
    const bytes = Buffer.alloc(40, 0x59), address = event.outputAddress;
    for (let offset = 0; offset < 8; offset++) bytes[16 + offset] = (trial * 37 + offset * 91) & 255;
    const bound = createCapturedMemory([{address: address - 16, bytes}]);
    const proof = applyObservedSuccessfulFileSize(bound.memory, event, args);
    assert.equal(proof.sourcePreimageHex, bytes.subarray(16, 24).toString('hex'));
    assert.equal(bound.span(address, 8).toString('hex'), event.outputHex);
    assert.equal(bound.memory.readBigUInt64LE(address), 43424n);
    assert.deepEqual(bound.span(address - 16, 16), bytes.subarray(0, 16));
    assert.deepEqual(bound.span(address + 8, 16), bytes.subarray(24));
  }
  const bound = createCapturedMemory([{address: event.outputAddress - 16, bytes: Buffer.alloc(40, 0x6b)}]);
  for (const [changed, values] of [[event, [args[0], args[1] + 1]], [{...event, actualReturnEax: 0}, args]]) {
    assert.throws(() => applyObservedSuccessfulFileSize(bound.memory, changed, values), /typed output contract/);
    assert.deepEqual(bound.span(event.outputAddress - 16, 40), Buffer.alloc(40, 0x6b));
  }
});

test('original FindFirstFileW applies only its captured output delta and rejects padding or return-word mismatches', {skip: !available}, async () => {
  const {capture, pair, lineage} = await fixture(), event = lineage.bindingObservations.services.find(row => row.name === 'find-first');
  const snapshot = capture.snapshots.find(row => row.ordinal === event.callOrdinal);
  const setup = () => {
    const bound = createCapturedMemory([...snapshot.ranges.values()]), S = event.callEsp - 4;
    bound.memory.writeUInt32LE(pair.moduleBaseAddress + 0xa3b24, S);
    const binding = createNativeRecoveryFactoryServices({capture, pair, lineage, memory: bound.memory, crt() {throw Error('Unexpected CRT.');}});
    const args = [event.pathAddress, event.outputAddress];
    return {bound, binding, S, args};
  };
  const {bound, binding, S, args} = setup();
  const regions = [...snapshot.ranges.values()].filter(row => row.bytes.length).map(row => ({address: Number(row.address), bytes: Buffer.from(bound.span(Number(row.address), row.bytes.length))}));
  assert.equal(binding.services.platformCall('FindFirstFileW', args, {scratchBase: S}), event.actualReturnEax);
  assert.equal(binding.consumedEvents, 1);
  assert.equal(bound.span(event.outputAddress, 592).toString('hex'), event.outputHex);
  for (const row of regions) for (let offset = 0; offset < row.bytes.length; offset++) {
    const address = row.address + offset;
    if (address < event.outputAddress || address >= event.outputAddress + 592) assert.equal(bound.memory.readUInt8(address), row.bytes[offset]);
  }
  const poisoned = setup(), address = event.outputAddress + 100;
  poisoned.bound.memory.writeUInt8(poisoned.bound.memory.readUInt8(address) ^ 1, address);
  const prior = Buffer.from(poisoned.bound.span(event.outputAddress, 592));
  assert.throws(() => poisoned.binding.services.platformCall('FindFirstFileW', poisoned.args, {scratchBase: poisoned.S}), /output preimage/);
  assert.equal(poisoned.binding.consumedEvents, 0);
  assert.deepEqual(poisoned.bound.span(event.outputAddress, 592), prior);
  const wrongReturn = setup(); wrongReturn.bound.memory.writeUInt32LE(0x401001, wrongReturn.S);
  assert.throws(() => wrongReturn.binding.services.platformCall('FindFirstFileW', wrongReturn.args, {scratchBase: wrongReturn.S}), /return word/);
  assert.equal(wrongReturn.binding.consumedEvents, 0);
});

test('explicit successful FindFirstFileW contract writes defined fields/NUL names while preserving poisoned reserved words and string tails', {skip: !available}, async () => {
  const {lineage} = await fixture(), event = lineage.bindingObservations.services.find(row => row.name === 'find-first');
  const expected = Buffer.from(event.outputHex, 'hex'), nativeArgs = Buffer.from(event.argumentsHex, 'hex'), args = [nativeArgs.readUInt32LE(), nativeArgs.readUInt32LE(4)];
  for (let trial = 0; trial < 16; trial++) {
    const bytes = Buffer.alloc(624, 0xa6); for (let index = 0; index < 592; index++) bytes[16 + index] = (trial * 83 + index * 37) & 255;
    const bound = createCapturedMemory([{address: event.outputAddress - 16, bytes}]);
    const result = applyObservedSuccessfulFindFirst(bound.memory, event, args);
    assert.equal(result.preimageMatched, false);
    for (let offset = 0; offset < 592; offset++) {
      const defined = result.definedSpans.some(row => offset >= row.offset && offset < row.offset + row.length);
      assert.equal(bound.memory.readUInt8(event.outputAddress + offset), defined ? expected[offset] : bytes[16 + offset]);
    }
    assert.equal((~(bound.memory.readUInt32LE(event.outputAddress) >>> 4)) & 1, 1, 'The genuine4a3ac0 attribute consumer sees an ordinary file.');
    assert.deepEqual(bound.span(event.outputAddress - 16, 16), bytes.subarray(0, 16));
    assert.deepEqual(bound.span(event.outputAddress + 592, 16), bytes.subarray(608));
    assert.deepEqual(result.notCompared.map(row => [row.offset, row.length]), [[36, 8], [78, 486], [590, 2]]);
  }
  //Constructed contract boundary for a reparse record, not another runtime claim.
  const tagged = Buffer.from(expected); tagged.writeUInt32LE(tagged.readUInt32LE() | 0x400); tagged.writeUInt32LE(0xa000000c, 36);
  const bound = createCapturedMemory([{address: event.outputAddress, bytes: Buffer.alloc(592, 0xdd)}]);
  const proof = applyObservedSuccessfulFindFirst(bound.memory, {...event, outputHex: tagged.toString('hex')}, args);
  assert.ok(proof.definedSpans.some(row => row.offset === 36 && row.length === 4));
  assert.equal(bound.memory.readUInt32LE(event.outputAddress + 36), 0xa000000c);
  assert.equal(bound.memory.readUInt32LE(event.outputAddress + 40), 0xdddddddd);
  const invalid = Buffer.from(expected); invalid.fill(0x41, 44, 564);
  for (const [changed, values] of [[{...event, actualReturnEax: 0xffffffff}, args], [event, [args[0], args[1] + 4]], [{...event, outputHex: invalid.toString('hex')}, args]]) {
    const memory = createCapturedMemory([{address: event.outputAddress, bytes: Buffer.alloc(592, 0x5c)}]);
    assert.throws(() => applyObservedSuccessfulFindFirst(memory.memory, changed, values), /contract differs|bounded NUL/);
    assert.deepEqual(memory.span(event.outputAddress, 592), Buffer.alloc(592, 0x5c));
  }
});

test('opt-in typed successful file outputs complete actual v9 cached factory with all16660 declared data bytes and EAX matching', {skip: !available}, async () => {
  const {capture, configuration, pair} = await fixture();
  const result = attemptNativeRecoveryFactoryReplay(capture, pair, configuration, {bindObservedServices: true, typedSuccessfulFindFirst: true});
  assert.equal(result.complete, true); assert.equal(result.stop, undefined); assert.equal(result.matchedFullFactory, false);
  assert.equal(result.consumedExternalEvents, 16); assert.equal(result.expectedExternalEvents, 16);
  assert.equal(result.outputComparison.matched, true); assert.equal(result.outputComparison.comparedBytes, 16660);
  assert.equal(result.outputComparison.sourceEax, result.outputComparison.originalEax);
  assert.equal(result.outputComparison.comparisons.length, 17);
  assert.equal(result.privateOutputPreimages.length, 3);
  assert.deepEqual(result.privateOutputPreimages.map(row => row.preimageMatched), [true, false, false]);
  const inner = result.privateOutputPreimages[2];
  assert.ok(inner.notCompared.every(row => row.sourcePreimageHex !== row.originalAfterHex), 'Private padding differences stay explicit.');
  assert.deepEqual(result.checkpoints.map(row => [row.comparedBytes, row.matched]), [[2472, true]]);
  assert.equal(result.cache.matched, true); assert.equal(result.cache.comparedEntries, 44);
  for (const [id, offset] of [['recovery-audio-created-source', 0x960], ['recovery-audio-manager-region', 0xc4]]) {
    const changed = {...capture, snapshots: capture.snapshots.map(snapshot => {
      if (snapshot.ordinal !== 313) return snapshot;
      const ranges = new Map(snapshot.ranges), row = ranges.get(id), bytes = Buffer.from(row.bytes);
      bytes[offset] ^= 1; ranges.set(id, {...row, bytes}); return {...snapshot, ranges};
    })};
    const divergent = attemptNativeRecoveryFactoryReplay(changed, pair, configuration, {bindObservedServices: true, typedSuccessfulFindFirst: true});
    assert.equal(divergent.complete, true);
    assert.equal(divergent.outputComparison.matched, false, 'Finished output must never seed source or a GetCurrentThreadId answer.');
    assert.equal(divergent.outputComparison.comparisons.find(row => row.id === id).difference.offset, offset);
  }
});
