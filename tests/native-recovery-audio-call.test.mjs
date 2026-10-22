import test from 'node:test';
import assert from 'node:assert/strict';
import {callNativeRecoveryAudio, publishNativeRecoveryAudioCall, nativeRecoveryAudioCallLayout} from '../src/native-recovery-audio-call.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createNativeFrameSoundBindings} from '../tools/lib/native-frame-sound.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';

const numericalContext = decodePhysicsNumericalContext({x87ControlWord: 0x7f, mxcsr: 0x1f80});
const incoming = {ebx: 0x12340000, ebp: 0x70123456, esi: 0x234500c4, edi: 0x23450000};
const nativeStack = {entryRegisters: incoming};
const moduleBaseAddress = 0x400000;
const evidenceNames = ['098-post-frame-body-states-assembly.json', '149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json'];

test('retained parent PUSH/CALL publishes all seven words including surviving ring ECX', async () => {
  const {evidence, instructions} = await readInstructionEvidence(evidenceNames, {directory: 'analysis/native-simulation/results'});
  assert.ok(evidence.every(row => row.subject.digest.sha256 === 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const machine = new BoundedX86(instructions, {entry: 0x47cf54, fpuPrecisionBits: 24});
  for (const offset of [0, 4, 8, 12]) for (const registerEcx of [0, 0x7fffffff, 0xfedcba98]) {
    machine.reset();
    const parentEntryEsp = 0x9200 + offset, layout = nativeRecoveryAudioCallLayout(parentEntryEsp);
    machine.bytes.fill(0xa5, parentEntryEsp - 256, parentEntryEsp + 16);
    Object.assign(machine.r, {ESP: layout.parentFrame, ECX: registerEcx | 0, EDX: 0x12345678,
      ...Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key.toUpperCase(), value | 0]))});
    const source = Buffer.from(machine.bytes);
    machine.onInstruction = address => {if (address === 0x484bb0) throw Error('recovery-emitter-entry');};
    assert.throws(() => machine.run(), /At 0x484bb0: recovery-emitter-entry/);
    const request = publishNativeRecoveryAudioCall({memory: source, parentEntryEsp, registerEcx, nativeStack, moduleBaseAddress});
    assert.equal(request.scratchBase, machine.r.ESP); assert.equal(machine.r.ECX, 43); assert.equal(machine.r.EDX, 0);
    assert.deepEqual(source.subarray(parentEntryEsp - 256, parentEntryEsp + 16), machine.bytes.subarray(parentEntryEsp - 256, parentEntryEsp + 16));
    assert.equal(source.readUInt32LE(layout.entryEsp + 20), registerEcx >>> 0);
    assert.equal(source.readUInt32LE(layout.entryEsp), 0x47cf6e);
    assert.deepEqual(request.nativeStack.entryRegisters, incoming);
  }
});

test('retained parent/emitter/absent-bank dispatcher match shared stack through emitter preRET', async () => {
  const {instructions} = await readInstructionEvidence(evidenceNames, {directory: 'analysis/native-simulation/results'});
  const machine = new BoundedX86(instructions, {entry: 0x47cf54, fpuPrecisionBits: 24});
  //Synthetic naturally absent43 slot, not the populated owner in real captures.
  for (const offset of [0, 4, 8, 12]) {
    machine.reset(); const parentEntryEsp = 0x9200 + offset, registerEcx = 0x93456789;
    machine.bytes.fill(0xa5, parentEntryEsp - 320, parentEntryEsp + 16);
    machine.bytes.writeUInt32LE(0x10000, 0x6f2414); machine.bytes.writeUInt32LE(0x10100, 0x6f2418);
    Object.assign(machine.r, {ESP: parentEntryEsp - 100, ECX: registerEcx | 0,
      ...Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key.toUpperCase(), value | 0]))});
    const source = Buffer.from(machine.bytes), binding = createNativeFrameSoundBindings({memory: source, moduleBaseAddress, numericalContext});
    machine.onInstruction = address => {if (address === 0x484c70) throw Error('recovery-emitter-preRET');};
    assert.throws(() => machine.run(), /At 0x484c70: recovery-emitter-preRET/);
    assert.equal(callNativeRecoveryAudio({memory: source, parentEntryEsp, registerEcx, nativeStack, moduleBaseAddress,
      soundRuntime: binding.soundRuntime, dispatch40ea40: binding.dispatch40ea40}), machine.r.EAX);
    assert.deepEqual(source.subarray(parentEntryEsp - 320, parentEntryEsp + 16), machine.bytes.subarray(parentEntryEsp - 320, parentEntryEsp + 16));
    assert.deepEqual(source.subarray(0x10000, 0x10100), machine.bytes.subarray(0x10000, 0x10100));
  }
});

test('sparse ASLR stack keeps real caller registers and relocates only module return literals', () => {
  const parentEntryEsp = 0x30001234, moduleBaseAddress = 0x6e0000, bank = 0x45000000;
  const {memory} = createCapturedMemory([{address: parentEntryEsp - 512, bytes: Buffer.alloc(768, 0x5a)},
    {address: 0x9d2414, bytes: Buffer.alloc(8)}, {address: bank, bytes: Buffer.alloc(256)}],
  {aliases: [{address: 0x6f2414, targetAddress: 0x9d2414, length: 8}]});
  memory.writeUInt32LE(bank, 0x6f2414); memory.writeUInt32LE(bank + 256, 0x6f2418);
  const binding = createNativeFrameSoundBindings({memory, moduleBaseAddress, numericalContext});
  assert.equal(callNativeRecoveryAudio({memory, parentEntryEsp, registerEcx: 0xf1234567, nativeStack, moduleBaseAddress,
    dispatch40ea40: binding.dispatch40ea40}), 127);
  const {entryEsp, emitter} = nativeRecoveryAudioCallLayout(parentEntryEsp);
  assert.equal(memory.readUInt32LE(entryEsp), 0x75cf6e); assert.equal(memory.readUInt32LE(emitter.dispatchEntry), 0x764c5d);
  assert.equal(memory.readUInt32LE(entryEsp + 20), 0xf1234567);
  assert.equal(memory.readUInt32LE(emitter.savedEbp), incoming.ebp);
  assert.equal(memory.readUInt32LE(emitter.frame), incoming.edi);
  assert.equal(memory.readUInt32LE(emitter.frame + 4), incoming.esi);
  assert.equal(memory.readUInt32LE(0x6f2414), bank);
});

test('actual populated adaptive owner remains an explicit unsupported source/service boundary', () => {
  const memory = Buffer.alloc(0xa00000), parentEntryEsp = 0x9200, sound = 0x20000, bank = 0x10000;
  memory.writeUInt32LE(bank, 0x6f2414); memory.writeUInt32LE(bank + 256, 0x6f2418);
  memory.writeUInt32LE(sound, bank + 43 * 4); memory.writeInt32LE(0, sound + 0x488);
  const nativeTls = {sehWord: 0x12345678}, binding = createNativeFrameSoundBindings({memory, moduleBaseAddress, numericalContext, nativeTls});
  assert.throws(() => callNativeRecoveryAudio({memory, parentEntryEsp, registerEcx: 0x71234567, nativeStack, moduleBaseAddress,
    soundRuntime: binding.soundRuntime, dispatch40ea40: binding.dispatch40ea40}), /adaptive sound-channel selection requires its complete source\/allocation\/vector stack services/);
  assert.equal(memory.readUInt32LE(bank + 43 * 4), sound);
  assert.equal(memory.readUInt32LE(nativeRecoveryAudioCallLayout(parentEntryEsp).entryEsp + 20), 0x71234567);
  assert.equal(memory.readInt32LE(sound + 0x464), 6);
  assert.notEqual(nativeTls.sehWord, 0x12345678, 'The reached real SEH prefix is preserved on unsupported child entry.');
});

test('missing ABI/module/stack evidence fails before publishing a partial caller', () => {
  const memory = Buffer.alloc(0xa00000, 0x5a), runtime = {memory, parentEntryEsp: 0x9200, registerEcx: 1, nativeStack, moduleBaseAddress};
  for (const edit of [{registerEcx: undefined}, {moduleBaseAddress: undefined}, {nativeStack: {entryRegisters: {...incoming, ebx: undefined}}}, {parentEntryEsp: 132}]) {
    const before = Buffer.from(memory.subarray(0x9000, 0x9300));
    assert.throws(() => publishNativeRecoveryAudioCall({...runtime, ...edit}), /Recovery audio requires/);
    assert.deepEqual(memory.subarray(0x9000, 0x9300), before);
  }
  const sparse = createCapturedMemory([{address: 0x9180, bytes: Buffer.alloc(4)}]).memory;
  assert.throws(() => publishNativeRecoveryAudioCall({...runtime, memory: sparse}), /Uncaptured/);
  assert.throws(() => callNativeRecoveryAudio({...runtime, soundRuntime: {memory: Buffer.alloc(16)}}), /share actual memory/);
});
