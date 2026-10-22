import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {nativeRecoverySoundCaptureRanges, nativeSelectedSoundChannelCaptureRanges, inspectNativeRecoverySound, nativeRecoverySoundBoundaries} from '../tools/lib/native-recovery-sound.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const BANK = 0x11000000, OWNER = 0x22000000, VECTOR = 0x33000000, CHANNEL = 0x44000000, SOURCE = 0x55000000, VTABLE = 0x7d3f60, MODULE = 0x600000;
function fixture() {
  const rows = [[0x6f2414, 12], [0x6e6bd4, 4], [BANK, 256], [OWNER, 0x490], [VECTOR, 7 * 4], [CHANNEL, 12], [SOURCE, 0x9a8], [VTABLE, 0x60]].map(([address, length]) => ({address, bytes: Buffer.alloc(length)}));
  const {memory} = createCapturedMemory(rows), put = (address, value) => memory.writeUInt32LE(value >>> 0, address);
  put(0x6f2414, BANK); put(0x6f2418, BANK + 256); put(0x6f241c, BANK + 256); put(BANK + 43 * 4, OWNER);
  put(OWNER + 4, VECTOR); put(OWNER + 8, VECTOR + 3 * 4); put(OWNER + 12, VECTOR + 7 * 4); put(OWNER + 0x488, 3); put(OWNER + 0x48c, 2);
  put(VECTOR + 8, CHANNEL); put(CHANNEL, SOURCE); put(SOURCE, VTABLE);
  for (const [method, target] of [[4, 0x4ad170], [0x14, 0x4ad6a0], [0x2c, 0x4ad9e0]]) put(VTABLE + method, target + MODULE - 0x400000);
  return {memory, put, rows, options: {memory, moduleBaseAddress: MODULE}};
}

test('sound43 descriptors use the actual bank slot and selected EDI register roots, without a16-entry capacity claim', () => {
  const ranges = nativeRecoverySoundCaptureRanges();
  assert.deepEqual(ranges.find(row => row.id === 'recovery-sound43-owner'), {id: 'recovery-sound43-owner', rva: '0x2f2414', dereferenceOffsets: ['0', '0xac'], length: 0x490});
  assert.equal(ranges.some(row => row.id.includes('channel-vector')), false);
  assert.deepEqual(nativeRecoverySoundCaptureRanges({includeChannelVector: true}).at(-1).dereferenceOffsets, ['0', '0xac', '4']);
  assert.deepEqual(nativeSelectedSoundChannelCaptureRanges().map(row => [row.baseRegister, row.dereferenceOffsets, row.length]), [['edi', undefined, 12], ['edi', ['0'], undefined], ['edi', ['0', '0'], 0x60]]);
  assert.equal(nativeRecoverySoundBoundaries.selectedRoundRobinChannel, 0x40db80);
  assert.throws(() => nativeRecoverySoundCaptureRanges({maxRegionBytes: 0}), /observation bound/);
});

test('read-only inspection preserves real sound43 owner/channel/source pointers and native voice/reverb gates', () => {
  const f = fixture(), before = f.rows.map(row => Buffer.from(f.memory.subarray(row.address, row.address + row.bytes.length)));
  const report = inspectNativeRecoverySound(f.options);
  assert.equal(report.status, 'identified-xaudio-sample'); assert.equal(report.ownerAddress, OWNER); assert.equal(report.channelAddress, CHANNEL); assert.equal(report.sourceAddress, SOURCE);
  assert.equal(report.channelCount, 3); assert.equal(report.channelCapacity, 7); assert.equal(report.selectedSlot, VECTOR + 8);
  assert.equal(report.sourceMethods['0x4'], 0x6ad170); assert.equal(report.playbackBranch, 'native-null-voice'); assert.equal(report.reverbEnabled, false);
  assert.equal(report.channelBound.nativeCapacityClaim, false);
  f.rows.forEach((row, index) => assert.deepEqual(f.memory.subarray(row.address, row.address + row.bytes.length), before[index]));
  f.put(SOURCE + 0x97c, 0x66000000); f.put(0x6e6bd4, 1);
  const queued = inspectNativeRecoverySound(f.options); assert.equal(queued.playbackBranch, 'deferred-manager-queue'); assert.equal(queued.reverbEnabled, true);
});

test('natural out-of-range/null/adaptive paths remain distinct, and uncaptured owners fail at their actual dependency', () => {
  const f = fixture();
  f.put(0x6f2418, BANK + 43 * 4); assert.equal(inspectNativeRecoverySound(f.options).status, 'native-out-of-range');
  f.put(0x6f2418, BANK + 256); f.put(BANK + 172, 0); assert.equal(inspectNativeRecoverySound(f.options).status, 'native-null-owner');
  f.put(BANK + 172, OWNER); f.put(OWNER + 0x488, 0); assert.equal(inspectNativeRecoverySound(f.options).status, 'adaptive-selection-required');
  f.put(OWNER + 0x488, 3); f.put(VECTOR + 8, 0); assert.equal(inspectNativeRecoverySound(f.options).status, 'native-null-selected-channel');
  f.put(VECTOR + 8, CHANNEL); f.put(BANK + 172, 0x77880000);
  assert.throws(() => inspectNativeRecoverySound(f.options), error => error.soundDependency === 'sound43-owner490');
  f.put(BANK + 172, OWNER);
  assert.throws(() => inspectNativeRecoverySound({...f.options, maxChannelPointers: 3}), /explicit observation bound/);
});

test('retained caller establishes zero positional arguments and exact sound43 code/return boundary', async () => {
  const {instructions} = await readInstructionEvidence(['098-post-frame-body-states-assembly.json', '153-sound-channel-selection-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x47cf5b, 'XOR', ['EDX', 'EDX']], [0x47cf62, 'PUSH', ['-0x1']], [0x47cf66, 'LEA', ['ECX', '[EDX + 0x2b]']], [0x47cf69, 'CALL', ['0x00484bb0']], [0x40db80, 'MOV', ['ECX', 'dword ptr [EDI]']]]) {
    assert.equal(listing.get(address)?.op, op); assert.deepEqual(listing.get(address)?.args, args);
  }
  assert.equal(nativeRecoverySoundBoundaries.returnAddress, 0x47cf6e);
});
