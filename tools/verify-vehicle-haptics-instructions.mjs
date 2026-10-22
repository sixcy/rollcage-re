import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {applyVehicleHapticEffect, stopVehicleHapticEffect, applyVehicleDirectionalHaptics, applyVehicleConstantHaptics, initializeVehicleHapticsConstants} from '../src/vehicle-haptics.mjs';
import constantEvidence from '../src/vehicle-haptics-constants.json' with {type: 'json'};
const own = await readInstructionEvidence(['751-vehicle-haptics-407380-assembly.json', '753-vehicle-haptics-4074e0-assembly.json', '755-vehicle-haptics-407570-assembly.json', '757-vehicle-haptics-407670-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(own.instructions), STACK = 0x9000, MANAGER = 0x10000, DEVICE = 0x11000, MANAGER_VT = 0x12000, DEVICE_VT = 0x13000, SENTINEL = 0x30000, OUTER = 0x31000, MAP = 0x40000, OLD_HEADER = 0x41000, NEW_HEADER = 0x42000, NODES = 0x43000, SERVICE = 0x70000;
const entries = [0x407380, 0x4074e0, 0x407570, 0x407670], mapEntries = [0x40b2a0, 0x40c0a0, 0x40b220, 0x40b6b0, 0x40b9d0, 0x40b5b0, 0x40b2f0, 0x40b370], arities = [2, 0, 1, 1, 3, 2, 1, 2], methods = [0x34, 0x38, 0x3c, 0x40, 0x44];
let seed = 0x407380ad, steps = 0, created = 0, updated = 0, stopped = 0, clears = 0, descriptors = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const fixtures = 10000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const memory = machine.bytes; initializeVehicleHapticsConstants(memory); memory.fill(0x36, STACK - 256, STACK + 64);
  memory.writeUInt32LE(MANAGER, 0x714b54); memory.writeUInt32LE(MANAGER_VT, MANAGER); memory.writeUInt32LE(SERVICE + 0x14, MANAGER_VT + 0x14); memory.writeUInt32LE(DEVICE_VT, DEVICE); methods.forEach(method => memory.writeUInt32LE(SERVICE + method, DEVICE_VT + method));
  memory.writeUInt32LE(SENTINEL, 0x6f2360); memory.writeUInt32LE(OLD_HEADER, MAP); memory.writeUInt32LE(fixture % 4, MAP + 4); for (const header of [OLD_HEADER, NEW_HEADER]) {for (const offset of [0, 4, 8]) memory.writeUInt32LE(header, header + offset); memory.writeUInt16LE(0x101, header + 12);}
  const entryIndex = fixture % 4, deviceId = [-1, 0, 1, 2, 127, -128][random(6)], type = [-2, -1, 0, 1, 2, 4][random(6)], value = [-2147483648, -36001, -1, 0, 1, 9000, 27000, 36000, 36001, 2147483647][random(10)], gain = [-2147483648, -20000, -10000, -1, 0, 1, 9999, 10000, 20000, 2147483647][random(10)], descriptor = Buffer.alloc(20);
  for (let component = 0; component < 5; component++) descriptor.writeFloatLE(Math.fround((random(201) - 100) / 100), component * 4);
  const source = Buffer.from(memory), sourceLog = [], nativeLog = [];
  const runtimeFor = (bytes, log, entryStack) => {
    let outerExists = fixture % 3 !== 0, allocated = 0; const nodes = new Map();
    if (fixture % 3 === 1) {nodes.set(type, NODES); nodes.set(1, NODES); bytes.writeUInt32LE(0x12345678, NODES + 20);}
    const put = (p, value) => bytes.writeInt32LE(value | 0, p), read = p => bytes.readUInt32LE(p);
    const runtime = {memory: bytes, scratchBase: entryStack, handlers: {}};
    runtime.handlers.hapticContainerCall = (entry, request) => {
      const {ecx, args} = request; log.push(['container', entry, [0x40b2a0, 0x40b220, 0x40c0a0].includes(entry) ? null : ecx, args]);
      if (entry === 0x40b2a0) {put(args[0], outerExists ? OUTER : read(0x6f2360)); return args[0];}
      if (entry === 0x40c0a0) return NEW_HEADER;
      if (entry === 0x40b220) {outerExists = true; return MAP;}
      if (entry === 0x40b6b0) {nodes.clear(); clears++; return 0;}
      if (entry === 0x40b9d0) return 0;
      if (entry === 0x40b5b0) {const key = bytes.readInt32LE(args[1]); put(args[0], nodes.get(key) ?? read(MAP)); return args[0];}
      if (entry === 0x40b2f0) {const key = bytes.readInt32LE(args[0]); if (!nodes.has(key)) {const node = NODES + (++allocated) * 64; nodes.set(key, node); put(node + 16, key); put(node + 20, 0);} return nodes.get(key) + 20;}
      if (entry === 0x40b370) {for (const [key, pointer] of nodes) if (pointer === args[1]) nodes.delete(key); put(args[0], args[1]); return args[0];}
      throw Error('Unadmitted std::map operation');
    };
    runtime.handlers.free = pointer => log.push(['free', pointer]);
    runtime.handlers.deviceCall = (pointer, method, args) => {
      const actual = method === 0x40 || method === 0x44 ? [args[0], bytes.subarray(args[1], args[1] + 20).toString('hex')] : args;
      log.push(['device', pointer, method, actual]);
      if (method === 0x14) return fixture % 7 === 0 ? 0 : DEVICE;
      if (method === 0x34) {created++; if (fixture % 19 === 0) put(entryStack - 20, 7); return fixture + 100;}
      if (method === 0x44) updated++;
      if (method === 0x3c) {stopped++; if (fixture % 5 === 0) for (const pointer of nodes.values()) put(pointer + 20, fixture + 500);}
      if (method === 0x40 || method === 0x44) descriptors++;
      return 0x12345678;
    };
    return runtime;
  };
  const coreStack = STACK - (entryIndex === 2 ? 56 : entryIndex === 3 ? 48 : 0), sourceRuntime = runtimeFor(source, sourceLog, coreStack), nativeRuntime = runtimeFor(memory, nativeLog, coreStack);
  let expected;
  if (entryIndex === 0) {sourceRuntime.scratchBase = STACK; expected = applyVehicleHapticEffect(deviceId, type, descriptor, sourceRuntime);}
  else if (entryIndex === 1) {sourceRuntime.scratchBase = STACK; stopVehicleHapticEffect(deviceId, sourceRuntime);}
  else if (entryIndex === 2) {sourceRuntime.scratchBase = STACK; applyVehicleDirectionalHaptics(deviceId, value, gain, sourceRuntime);}
  else {sourceRuntime.scratchBase = STACK; applyVehicleConstantHaptics(deviceId, value, gain, sourceRuntime);}
  for (let index = 0; index < mapEntries.length; index++) machine.externalCalls.set(mapEntries[index], m => {const args = Array.from({length: arities[index]}, (_, index) => memory.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeRuntime.handlers.hapticContainerCall(mapEntries[index], {memory, ecx: m.r.ECX >>> 0, args, scratchBase: m.r.ESP - 4}); m.r.ESP += arities[index] * 4;});
  machine.externalCalls.set(SERVICE + 0x14, m => {m.r.EAX = nativeRuntime.handlers.deviceCall(m.r.ECX >>> 0, 0x14, [memory.readInt32LE(m.r.ESP), memory.readInt32LE(m.r.ESP + 4)]); m.r.ESP += 8;});
  for (const method of methods) machine.externalCalls.set(SERVICE + method, m => {const count = method === 0x40 || method === 0x44 ? 2 : 1, args = Array.from({length: count}, (_, index) => method === 0x34 ? memory.readInt32LE(m.r.ESP + index * 4) : memory.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeRuntime.handlers.deviceCall(m.r.ECX >>> 0, method, args); m.r.ESP += count * 4;});
  memory.writeUInt32LE(SERVICE + 0x100, 0x56e210); machine.externalCalls.set(SERVICE + 0x100, m => nativeRuntime.handlers.free(memory.readUInt32LE(m.r.ESP)));
  machine.externalCalls.set(0x56933c, m => {m.scalars.XMM0 = Math.fround(Math.cos(m.scalars.XMM0)); m.integerVectors.delete('XMM0');}); machine.externalCalls.set(0x56934e, m => {m.scalars.XMM0 = Math.fround(Math.sin(m.scalars.XMM0)); m.integerVectors.delete('XMM0');});
  machine.entry = entries[entryIndex]; machine.r.ECX = deviceId; machine.r.EDX = entryIndex === 0 ? type : value; machine.r.ESP = STACK; memory.writeUInt32LE(0xffffffff, STACK);
  if (entryIndex === 0) descriptor.copy(memory, STACK + 4); else if (entryIndex >= 2) memory.writeInt32LE(gain, STACK + 4);
  steps += machine.run();
  try {if (entryIndex === 0) assert.equal(machine.r.EAX & 255, expected, `AL${fixture}`); assert.deepEqual(nativeLog, sourceLog, `library/device calls${fixture}`); for (const [p, n] of [[0x30000, 0x15000], [STACK + 4, entryIndex === 0 ? 20 : entryIndex === 2 ? 4 : 0]]) assert.deepEqual(memory.subarray(p, p + n), source.subarray(p, p + n), `state${fixture}/${p.toString(16)}`);} catch (error) {console.error({fixture, entry: entries[entryIndex].toString(16), type, value, gain, sourceLog, nativeLog}); throw error;}
}
const libraryEvidence = await Promise.all(['758-haptics-map-find.json', '760-haptics-map-slot.json', '762-haptics-map-lower-bound.json', '764-haptics-map-handle.json', '766-haptics-map-erase.json', '768-haptics-map-header.json', '771-haptics-container-clear.json', '772-haptics-container-destroy.json'].map(async name => {const reply = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);}));
const report = {method: 'Complete407380 cache/create/update parent,4074e0 stop/remove parent,407570 directional float32/trig adapter and407670 constant-force float32 adapter. std::map lookup/slot/erase/header/clear/destroy,operator delete,imported cosf/sinf and device virtual methods are explicit library service contracts; game lifetime/handle/descriptor decisions are actual. Compares library/device order and exact20-byte descriptor bytes,meaningfulAL,status,map/header/handle state and live type/handle reload probes. No original process or hardware execution.', evidence: [...own.evidence, ...constantEvidence, ...libraryEvidence].map(item => item.evidence_id), instructions: own.instructions.length, fixtures, perEntryFixtures: fixtures / 4, created: created / 2, updated: updated / 2, stopped: stopped / 2, clears: clears / 2, descriptors: descriptors / 2, instructionSteps: steps, matched: true};
await writeFile('analysis/vehicle-haptics-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));

