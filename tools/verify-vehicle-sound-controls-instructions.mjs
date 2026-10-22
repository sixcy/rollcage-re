import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {startVehicleSound, stopVehicleSound, setVehicleSoundVolume, setVehicleSoundFrequency} from '../src/vehicle-sound-controls.mjs';
const own = await readInstructionEvidence(['701-vehicle-sound-start-assembly.json', '703-vehicle-sound-stop-assembly.json', '705-vehicle-sound-volume-assembly.json', '707-vehicle-sound-active-assembly.json', '149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json', '153-sound-channel-selection-assembly.json', '155-sound-playback-setup-assembly.json', '158-sound-channel-position-assembly.json', '160-sound-reverb-parameters-assembly.json', '162-sound-descriptor-copy-assembly.json'], {directory: 'analysis/native-simulation/results'});
const constants = await Promise.all(['156-sound-volume-scale.json', '163-sound-reverb-constants.json', '164-sound-position-constants.json'].map(async name => {const reply = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);}));
const machine = new BoundedX86(own.instructions), STACK = 0x9000, BANK = 0x1000, SOUND = 0x10000, CHANNEL = 0x20000, SOURCE = 0x30000, VTABLE = 0x40000, EFFECT = 0x50000, POSITION = 0x60000, METHODS = 0x70000;
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890), 'compiler cookie'));
const methods = [4, 8, 12, 0x14, 0x20, 0x2c, 0x34, 0x50, 0x58, 0x5c], fixtures = 10000;
let seed = 0x484cb0ad, steps = 0, starts = 0, invalidStarts = 0, serviceCalls = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); machine.fs0 = 0x12345678; const bytes = machine.bytes; constants.forEach(table => Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(bytes, Number(table.normalized_result.address)));
  bytes.writeUInt32LE(BANK, 0x6f2414); bytes.writeUInt32LE(BANK + 64 * 4, 0x6f2418); bytes.fill(0, BANK, BANK + 64 * 4); for (let index = 0; index < 64; index++) bytes.writeUInt32LE(SOUND, BANK + index * 4);
  bytes.writeUInt32LE(0x21000, SOUND + 4); bytes.writeUInt32LE(0x21004, SOUND + 8); bytes.writeInt32LE(1, SOUND + 0x488); bytes.writeInt32LE(0, SOUND + 0x48c); bytes.writeUInt32LE(CHANNEL, 0x21000);
  bytes.writeUInt32LE(fixture % 11 === 0 ? 0 : SOURCE, CHANNEL); bytes.writeUInt32LE(VTABLE, SOURCE); methods.forEach(method => bytes.writeUInt32LE(METHODS + method, VTABLE + method)); bytes.writeInt32LE(0, 0x6e6bd4);
  for (let axis = 0; axis < 3; axis++) bytes.writeInt32LE((random(2001) - 1000) * 65536, POSITION + axis * 4);
  const entryIndex = fixture % 4, code = [0, 1, 22, 43, 63, 64, 255, -1, 0x1234002b][random(9)], mode = random(0xffffffff) | 0, first = [0, -1, -32768, 32767, 0x3fff, 0x8000, random(0xffffffff) | 0][random(7)], second = [0, -1, -32768, 32767, 0x3fff, random(0xffffffff) | 0][random(6)], position = fixture % 3 ? POSITION : 0, reverb = [0, 1, 2, 257, -255][random(5)], channel = [0, 127, 256, CHANNEL][fixture % 7 === 0 ? 0 : fixture % 7 === 1 ? 1 : fixture % 7 === 2 ? 2 : 3];
  if (entryIndex === 0) bytes.writeUInt32LE(SOURCE, CHANNEL);
  const memory = Buffer.from(bytes), sourceLog = [], nativeLog = [];
  const logCall = (target, log, source, method, args) => {
    log.push([source, method, ...args.map(value => Buffer.isBuffer(value) ? value.toString('hex') : value)]);
    if (method === 4 && fixture % 17 === 0) target.writeUInt32LE(SOURCE + 0x100, CHANNEL);
    return method === 0x50 ? 1 : method === 0x58 ? EFFECT : 0x12345678;
  };
  bytes.writeUInt32LE(VTABLE, SOURCE + 0x100); memory.writeUInt32LE(VTABLE, SOURCE + 0x100);
  const runtime = {memory, handlers: {sourceCall: (source, method, args) => logCall(memory, sourceLog, source, method, args)}, reverbScratch: Buffer.alloc(76)};
  let expected;
  if (entryIndex === 0) expected = startVehicleSound(code, mode, first, second, position, reverb, runtime);
  else if (entryIndex === 1) stopVehicleSound(channel, runtime);
  else if (entryIndex === 2) setVehicleSoundVolume(channel, first, second, runtime);
  else setVehicleSoundFrequency(channel, first, runtime);
  for (const method of methods) machine.externalCalls.set(METHODS + method, m => {
    const stack = m.r.ESP, source = m.r.ECX >>> 0; let args = [], cleanup = 0;
    if ([4, 0x20, 0x2c].includes(method)) {args = [bytes.readInt32LE(stack)]; cleanup = 4;}
    else if (method === 0x14) {args = [bytes.readFloatLE(stack)]; cleanup = 4;}
    else if (method === 8 || method === 12) {const pointer = bytes.readUInt32LE(stack); args = [Buffer.from(bytes.subarray(pointer, pointer + 16))]; cleanup = 4;}
    else if (method === 0x5c) {args = [{vtable: bytes.readUInt32LE(stack), channelAddress: bytes.readUInt32LE(stack + 4)}]; cleanup = 24;}
    m.r.EAX = logCall(bytes, nativeLog, source, method, args); m.r.ESP += cleanup;
  });
  machine.entry = [0x484cb0, 0x484d10, 0x484d30, 0x484d90][entryIndex]; machine.r.ECX = entryIndex === 0 ? code : channel; machine.r.EDX = entryIndex === 0 ? mode : first; machine.r.ESP = STACK; bytes.writeUInt32LE(0xffffffff, STACK);
  if (entryIndex === 0) [first, second, position, reverb].forEach((value, index) => bytes.writeInt32LE(value | 0, STACK + 4 + index * 4)); else if (entryIndex === 2) bytes.writeInt32LE(second, STACK + 4);
  steps += machine.run();
  assert.equal(machine.fs0, 0x12345678, `fixture${fixture} explicit TLS chain restored`);
  try {if (entryIndex === 0) assert.equal(machine.r.EAX, expected, `start return${fixture}`); assert.deepEqual(nativeLog, sourceLog, `services${fixture}`); for (const [address, length] of [[SOUND, 0x490], [CHANNEL, 0x1100], [SOURCE, 0x200]]) assert.deepEqual(bytes.subarray(address, address + length), memory.subarray(address, address + length), `state${fixture}/${address.toString(16)}`);} catch (error) {console.error({fixture, code, mode, first, second, channel}); throw error;}
  if (entryIndex === 0) {starts++; if (expected === 127) invalidStarts++;} serviceCalls += sourceLog.length;
}
const report = {method: 'Complete484cb0/484d10/484d30/484d90 wrappers with actual484bb0→40ea40→40db20/40d6d0/40e5e0 defaults on caller-owned fixed round-robin sound/channel records. Only imported libaudio virtual services admitted; no game mocks or audio/original-process execution. Compares meaningful start return,full sound/channel/source memory and virtual argument/order including nativef32 volume/positional vectors,signed16 inputs,unsigned handle guards,lowCL/DL adapter and live source replacement.', evidence: [...own.evidence, ...constants].map(item => item.evidence_id), instructions: own.instructions.length, fixtures, perEntryFixtures: fixtures / 4, starts, invalidStarts, serviceCalls, instructionSteps: steps, matched: true};
await writeFile('analysis/vehicle-sound-controls-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
