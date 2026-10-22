import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateVehicleAudio, initializeVehicleAudioTables} from '../src/vehicle-audio.mjs';
import {initializeVehicleHapticsConstants} from '../src/vehicle-haptics.mjs';

export const feedbackAddresses = {body: 0x10000, other: 0x20000, session: 0x30000, pack: 0x40000, material: 0x43000, bank: 0x50000, stack: 0x9000, sound: 0x100000, channels: 0x200000, sources: 0x210000, vtable: 0x250000, effects: 0x240000, vectors: 0x230000, manager: 0x260000, device: 0x261000, managerVtable: 0x262000, deviceVtable: 0x263000, mapBase: 0x300000};
const methods = [4, 8, 12, 0x14, 0x20, 0x2c, 0x34, 0x38, 0x3c, 0x48, 0x50, 0x54, 0x58, 0x5c], SOURCE_METHOD = 0x700000, DEVICE_METHOD = 0x710000;
const mapEntries = [0x40b2a0, 0x40c0a0, 0x40b220, 0x40b6b0, 0x40b9d0, 0x40b5b0, 0x40b2f0, 0x40b370], mapArity = [2, 0, 1, 1, 3, 2, 1, 2];
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export function createVehicleFeedbackFixture(fixture) {
  const memory = Buffer.alloc(0xa00000), a = feedbackAddresses, index = fixture % 6, audio = 0x713190 + index * 40, horn = 0x713280 + index * 16, record = 0x909300 + index * 0x30c;
  initializeVehicleHapticsConstants(memory); initializeVehicleAudioTables(memory); memory.fill(0x51, a.stack - 4096, a.stack + 64);
  put(memory, 0x5ecb1c, a.session); put(memory, 0x90b98c, a.pack); put(memory, a.pack, 0x41000); put(memory, 0x41000, 0x42000); memory[0x42004] = fixture % 2 ? 2 : 0;
  put(memory, record, a.body); memory[record + 0x258] = fixture % 4; word(memory, record + 0x25c, fixture % 5 - 1);
  put(memory, a.session + 0x57c, fixture % 3 === 0 ? 2 : 4); word(memory, a.session + 0x61c, 1); memory[a.session + 0x585] = 1; memory[a.session + index + 0x1c] = fixture % 7; put(memory, a.session + 0x724, fixture % 2);
  put(memory, 0x811180, fixture % 3 === 0 ? 1 : 0); put(memory, 0x811184, a.other); put(memory, 0x81118c, 40000); put(memory, 0x5eced4, -1); put(memory, 0x5eced0, 127); put(memory, 0x90a548, 1000 + fixture * 4); memory[0x6e6bdc] = 43;
  for (const body of [a.body, a.other]) {
    memory[body + 0x4b4] = fixture % 4 === 0 ? 0 : 1; memory[body + 0x57c] = fixture % 5 === 0 ? 0 : 1; memory[body + 0x64d] = [0, 33, 128, 255][fixture % 4]; memory[body + 0x64f] = fixture % 2;
    put(memory, body + 0x5f8, [0, 3, 7, 30][fixture % 4] * 65536); put(memory, body + 0x530, fixture % 2 ? -10 * 65536 : 0); put(memory, body + 0x5d4, [0, 7000, 14000, -5000][fixture % 4] * 256); put(memory, body + 0x50c, 5000 * 256); put(memory, body + 0x6b0, 8000 * 16);
    for (const offset of [0x3e8, 0x4b0, 0x578, 0x640]) put(memory, body + offset, fixture % 2 ? 150000 : 50000);
    for (const [offset, value] of [[0xc4, 4096], [0xca, 0], [0xd0, 0]]) word(memory, body + offset, value);
    put(memory, body + 0x680, fixture % 2 ? -80000 : 80000); put(memory, body + 0x684, 0); put(memory, body + 0x688, 0); put(memory, body + 0x1d0, a.material); put(memory, body + 0x1ec, a.material + 32); put(memory, body + 0x11c, fixture % 5 === 0 ? -1 : 0);
    memory[body + 0x6b4] = fixture % 3; memory[body + 0x718] = [8, 9, 10][fixture % 3]; put(memory, body + 0x710, fixture % 2 ? 0x20 : 0); put(memory, body + 0x714, 0x20); memory[body + 0x71e] = fixture % 13; memory[body + 0x722] = fixture % 2; memory[body + 0x70a] = fixture % 3 ? 0 : 1; word(memory, body + 0x66f, 0xe0); put(memory, body + 0x3e74, -1);
    for (let axis = 0; axis < 3; axis++) {put(memory, body + 0x34 + axis * 4, (axis + 1) * 65536); put(memory, body + 0x68 + axis * 4, (axis - 1) * 65536);}
  }
  memory[a.material + 12] = fixture % 3; memory[a.material + 44] = fixture % 27;
  put(memory, audio, [0, 7000, 14000][fixture % 3] * 65536); for (const offset of [4, 8, 12, 16, 20]) put(memory, audio + offset, fixture % 4 ? 127 : a.channels + (offset / 4) * 16);
  word(memory, audio + 24, [0, 8500, -1000][fixture % 3]); word(memory, audio + 26, [0, 1000, 15000][fixture % 3]); word(memory, audio + 28, fixture % 6); word(memory, audio + 30, fixture % 4); memory[audio + 32] = fixture % 3; memory[audio + 33] = fixture % 5; memory[audio + 34] = fixture % 27; word(memory, audio + 36, 10000); word(memory, audio + 38, [0, 1, 5][fixture % 3]);
  put(memory, horn, 255); put(memory, horn + 8, 127); put(memory, horn + 12, 1000 + fixture * 4);
  put(memory, 0x6f2414, a.bank); put(memory, 0x6f2418, a.bank + 64 * 4); put(memory, 0x6e6bd4, fixture % 5 === 0 ? 0 : 1); memory.writeFloatLE(2 ** -20, 0x5ecdb4); memory.writeFloatLE(30 * 2 ** -20, 0x5ecdb0);
  for (let code = 0; code < 64; code++) {
    const sound = a.sound + code * 0x500, channel = a.channels + code * 16, source = a.sources + code * 0x100, vector = a.vectors + code * 16;
    put(memory, a.bank + code * 4, sound); put(memory, sound + 4, vector); put(memory, sound + 8, vector + 4); put(memory, sound + 12, vector + 4); put(memory, vector, channel); put(memory, sound + 0x488, 1); put(memory, sound + 0x48c, 0); put(memory, channel, source); put(memory, source, a.vtable); put(memory, source + 0x10000, a.vtable);
  }
  methods.forEach(method => put(memory, a.vtable + method, SOURCE_METHOD + method)); put(memory, 0x714b54, a.manager); put(memory, a.manager, a.managerVtable); put(memory, a.managerVtable + 0x14, DEVICE_METHOD + 0x14); put(memory, a.device, a.deviceVtable); for (const method of [0x34, 0x38, 0x3c, 0x40, 0x44]) put(memory, a.deviceVtable + method, DEVICE_METHOD + method);
  put(memory, 0x6f2360, a.mapBase - 0x1000); memory.write('Rollcage reverb\0', 0x5d0388, 'ascii'); put(memory, 0x5e8890, 0x17b842a0);
  return {memory, fixture, body: a.body, index, audio, horn, record, scratchBase: a.stack};
}

export function createVehicleFeedbackServices(context, log) {
  const {memory, fixture, body, record} = context, a = feedbackAddresses, maps = new Map(), status = new Map(); let allocatedMaps = 0, allocatedNodes = 0;
  const read = address => memory.readUInt32LE(address), write = (address, value) => put(memory, address, value);
  const mapForAddress = address => [...maps.values()].find(map => map.address === address);
  const obtain = id => {
    if (!maps.has(id)) {const address = a.mapBase + (++allocatedMaps) * 0x1000, header = address + 0x100; write(address, header); write(address + 4, 0); for (const offset of [0, 4, 8]) write(header + offset, header); maps.set(id, {address, header, outerNode: address + 0x200, nodes: new Map()});}
    return maps.get(id);
  };
  return {
    sourceCall(pointer, method, args) {
      const index = (((pointer - a.sources) / 0x100) | 0) & 63;
      const normalized = args.map(value => Buffer.isBuffer(value) ? method === 0x54 ? [value.toString('ascii', 0, value.indexOf(0)), value.subarray(24).toString('hex')] : value.toString('hex') : value);
      log.push(['source', pointer, method, normalized]);
      if (method === 4 && fixture % 11 === 0) write(a.channels + index * 16, a.sources + 0x10000 + index * 0x100);
      if (method === 0x14 && fixture % 7 === 0) memory[body + 0x66f] = 0xe0;
      if (method === 0x38) return fixture % 2;
      if (method === 0x50) return status.get(pointer) ?? (fixture % 3 === 0 ? 0 : 1);
      if (method === 0x54) status.set(pointer, 1);
      if (method === 0x58) return a.effects + index * 64;
      return 0;
    },
    hapticContainerCall(entry, request) {
      const {ecx, args} = request; log.push(['container', entry, [0x40b2a0, 0x40b220, 0x40c0a0].includes(entry) ? null : ecx, args]);
      if (entry === 0x40b2a0) {const map = maps.get(memory.readInt32LE(args[1])); write(args[0], map?.outerNode ?? read(0x6f2360)); return args[0];}
      if (entry === 0x40c0a0) {const header = a.mapBase + 0x50000 + allocatedMaps * 0x1000; for (const offset of [0, 4, 8]) write(header + offset, header); return header;}
      if (entry === 0x40b220) return obtain(memory.readInt32LE(args[0])).address;
      const map = mapForAddress(ecx);
      if (entry === 0x40b6b0) {map.nodes.clear(); return 0;}
      if (entry === 0x40b9d0) return 0;
      if (entry === 0x40b5b0) {write(args[0], map.nodes.get(memory.readInt32LE(args[1])) ?? read(map.address)); return args[0];}
      if (entry === 0x40b2f0) {const key = memory.readInt32LE(args[0]); if (!map.nodes.has(key)) {const node = a.mapBase + 0x60000 + (++allocatedNodes) * 64; map.nodes.set(key, node); write(node + 16, key); write(node + 20, 0);} return map.nodes.get(key) + 20;}
      if (entry === 0x40b370) {for (const [key, node] of map.nodes) if (node === args[1]) map.nodes.delete(key); write(args[0], args[1]); return args[0];}
      throw Error('Unexpected standard-container service');
    },
    deviceCall(pointer, method, args) {
      log.push(['device', pointer, method, method === 0x40 || method === 0x44 ? [args[0], memory.subarray(args[1], args[1] + 20).toString('hex')] : args]);
      if (method === 0x14) return fixture % 17 === 0 ? 0 : a.device;
      if (method === 0x34) return 0x1000 + allocatedNodes;
      if (method === 0x3c) {for (const map of maps.values()) for (const node of map.nodes.values()) write(node + 20, read(node + 20) + 1);}
      if ((method === 0x40 || method === 0x44) && fixture % 13 === 0) {write(record, a.other); word(memory, record + 0x25c, 5);}
      return 0;
    },
    free(pointer) {log.push(['free', pointer]);},
  };
}

export async function verifyVehicleAudioConnected({fixtures = 1200, ticks = 3, output = 'analysis/vehicle-audio-connected-instruction-check.json'} = {}) {
  const directory = 'analysis/native-simulation/results';
  const own = await readInstructionEvidence(['271-vehicle-state-485300-assembly.json', '701-vehicle-sound-start-assembly.json', '703-vehicle-sound-stop-assembly.json', '705-vehicle-sound-volume-assembly.json', '707-vehicle-sound-active-assembly.json', '149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json', '153-sound-channel-selection-assembly.json', '155-sound-playback-setup-assembly.json', '158-sound-channel-position-assembly.json', '160-sound-reverb-parameters-assembly.json', '162-sound-descriptor-copy-assembly.json', '751-vehicle-haptics-407380-assembly.json', '753-vehicle-haptics-4074e0-assembly.json', '755-vehicle-haptics-407570-assembly.json', '757-vehicle-haptics-407670-assembly.json'], {directory});
  const nameCopy = await readInstructionEvidence(['774-audio-name-copy-assembly.json'], {directory});
  own.instructions.push(...nameCopy.instructions); own.evidence.push(...nameCopy.evidence);
  const byAddress = new Map(); for (const instruction of own.instructions) {const prior = byAddress.get(instruction.address); if (prior) assert.deepEqual(prior, instruction); else byAddress.set(instruction.address, instruction);}
  const instructions = [...byAddress.values()].sort((a, b) => a.address - b.address), machine = new BoundedX86(instructions), a = feedbackAddresses;
  const visits = new Map(), watched = new Set([0x485300, 0x484cb0, 0x484bb0, 0x40ea40, 0x40db20, 0x40d6d0, 0x40e5e0, 0x40ce20, 0x405e30, 0x484d10, 0x484d30, 0x484d90, 0x407380, 0x4074e0, 0x407570, 0x407670]); let steps = 0, compilerChecks = 0, sourceCalls = 0, hapticCreates = 0, hapticUpdates = 0, hapticStops = 0, reverbs = 0;
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); compilerChecks++;});
  const copyService = DEVICE_METHOD + 0x104;
  machine.externalCalls.set(copyService, m => {const destination = m.bytes.readUInt32LE(m.r.ESP), size = m.bytes.readUInt32LE(m.r.ESP + 4), from = m.bytes.readUInt32LE(m.r.ESP + 8), limit = m.bytes.readUInt32LE(m.r.ESP + 12); let count = 0; while (count < Math.min(limit, size - 1) && m.bytes[from + count]) count++; m.bytes.copy(m.bytes, destination, from, from + count); m.bytes[destination + count] = 0; m.r.EAX = 0;});
  const ranges = [[a.body, 0x4000], [a.other, 0x4000], [a.session, 0x800], [0x713190, 0x150], [0x909300, 6 * 0x30c], [0x5eced0, 8], [a.sound, 64 * 0x500], [a.channels, 0x50000], [a.mapBase, 0x70000]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createVehicleFeedbackFixture(fixture), sourceLog = [], nativeLog = [], sourceHandlers = createVehicleFeedbackServices(source, sourceLog);
    machine.reset(); machine.fs0 = 0; source.memory.copy(machine.bytes); const native = {...source, memory: machine.bytes}, nativeHandlers = createVehicleFeedbackServices(native, nativeLog); // Explicit synthetic exception chain.
    for (const method of methods) machine.externalCalls.set(SOURCE_METHOD + method, m => {
      const stack = m.r.ESP; let args = [], cleanup = 0;
      if ([4, 0x20, 0x2c, 0x38].includes(method)) {args = [m.bytes.readInt32LE(stack)]; cleanup = 4;}
      else if (method === 0x14) {args = [m.bytes.readFloatLE(stack)]; cleanup = 4;}
      else if (method === 8 || method === 12) {const pointer = m.bytes.readUInt32LE(stack); args = [Buffer.from(m.bytes.subarray(pointer, pointer + 16))]; cleanup = 4;}
      else if (method === 0x54) {const pointer = m.bytes.readUInt32LE(stack + 4); args = [m.bytes.readInt32LE(stack), Buffer.from(m.bytes.subarray(pointer, pointer + 76))]; cleanup = 8;}
      else if (method === 0x5c) {args = [{vtable: m.bytes.readUInt32LE(stack), channelAddress: m.bytes.readUInt32LE(stack + 4)}]; cleanup = 24;}
      m.r.EAX = nativeHandlers.sourceCall(m.r.ECX >>> 0, method, args); m.r.ESP += cleanup;
    });
    for (let index = 0; index < mapEntries.length; index++) machine.externalCalls.set(mapEntries[index], m => {const args = Array.from({length: mapArity[index]}, (_, index) => m.bytes.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeHandlers.hapticContainerCall(mapEntries[index], {memory: m.bytes, ecx: m.r.ECX >>> 0, args, scratchBase: m.r.ESP - 4}); m.r.ESP += mapArity[index] * 4;});
    machine.externalCalls.set(DEVICE_METHOD + 0x14, m => {m.r.EAX = nativeHandlers.deviceCall(m.r.ECX >>> 0, 0x14, [m.bytes.readInt32LE(m.r.ESP), m.bytes.readInt32LE(m.r.ESP + 4)]); m.r.ESP += 8;});
    for (const method of [0x34, 0x38, 0x3c, 0x40, 0x44]) machine.externalCalls.set(DEVICE_METHOD + method, m => {const count = method === 0x40 || method === 0x44 ? 2 : 1, args = Array.from({length: count}, (_, index) => method === 0x34 ? m.bytes.readInt32LE(m.r.ESP + index * 4) : m.bytes.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeHandlers.deviceCall(m.r.ECX >>> 0, method, args); m.r.ESP += count * 4;});
    machine.bytes.writeUInt32LE(DEVICE_METHOD + 0x100, 0x56e210); machine.externalCalls.set(DEVICE_METHOD + 0x100, m => nativeHandlers.free(m.bytes.readUInt32LE(m.r.ESP)));
    machine.bytes.writeUInt32LE(copyService, 0x56e21c);
    machine.externalCalls.set(0x56933c, m => {m.scalars.XMM0 = Math.fround(Math.cos(m.scalars.XMM0)); m.integerVectors.delete('XMM0');}); machine.externalCalls.set(0x56934e, m => {m.scalars.XMM0 = Math.fround(Math.sin(m.scalars.XMM0)); m.integerVectors.delete('XMM0');});
    for (let tick = 0; tick < ticks; tick++) {
      for (const context of [source, native]) {
        put(context.memory, 0x90a548, 1000 + fixture * 4 + tick * 12);
        context.memory[a.body + 0x66f] = tick ? 0 : 0xe0;
        if (tick === 1) context.memory[a.body + 0x710] &= ~0x20;
        if (tick === 2) for (const offset of [0x3e8, 0x4b0, 0x578, 0x640]) put(context.memory, a.body + offset, 1000);
      }
      updateVehicleAudio(a.body, source.index, {...source, handlers: sourceHandlers, reverbScratch: Buffer.alloc(76, 0xa5)});
      machine.entry = 0x485300; machine.r.ECX = a.body; machine.r.EDX = source.index; machine.r.ESP = a.stack; machine.bytes.writeUInt32LE(0xffffffff, a.stack);
      try {
        steps += machine.run(2_000_000); assert.equal(machine.fs0, 0, 'Thread exception chain restored'); assert.deepEqual(nativeLog, sourceLog, `services${fixture}/${tick}`);
        for (const [address, length] of ranges) {const actual = machine.bytes.subarray(address, address + length), expected = source.memory.subarray(address, address + length); if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`fixture${fixture}/tick${tick}:0x${(address + offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}}
      } catch (error) {console.error({fixture, tick, index: source.index, source: sourceLog.slice(-8), native: nativeLog.slice(-8)}); throw error;}
    }
    sourceCalls += sourceLog.filter(call => call[0] === 'source').length; reverbs += sourceLog.filter(call => call[0] === 'source' && call[2] === 0x54).length; hapticCreates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x34).length; hapticUpdates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x44).length; hapticStops += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x3c).length;
  }
  const dataEvidence = await Promise.all(['708-vehicle-audio-tables.json', '709-vehicle-audio-float-constants.json', '710-vehicle-audio-horn-sequences.json', '711-vehicle-audio-one.json', '712-vehicle-audio-minus-one.json', '156-sound-volume-scale.json', '163-sound-reverb-constants.json', '164-sound-position-constants.json', '770-haptics-float-two.json', '758-haptics-map-find.json', '760-haptics-map-slot.json', '762-haptics-map-lower-bound.json', '764-haptics-map-handle.json', '766-haptics-map-erase.json', '768-haptics-map-header.json', '771-haptics-container-clear.json', '772-haptics-container-destroy.json'].map(async name => {
    const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
    return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
  }));
  const report = {method: 'Full 485300 vehicle audio parent connected to all actual sound/emitter/dispatcher/channel/reverb/haptic game defaults, including actual 405e30 name-copy adapter. Populated 64-entry sound bank, fixed allocated round-robin channels, sector/material/horn/session/runtime records and sequential cache create/update/stop paths. Library services are libaudio virtual calls, std::map, operator delete, valid-domain bounded string copying, imported cosf/sinf and compiler-cookie checks. No game mocks or actual device/original-process execution. Exact service arguments/order and body/session/audio/record/bank/channel/effect/map memory compared after each persistent update, with source/record/handle mutation probes.', evidence: [...own.evidence, ...dataEvidence].map(item => item.evidence_id), instructions: instructions.length, fixtures, ticksPerFixture: ticks, parentCalls: fixtures * ticks, instructionSteps: steps, compilerChecks, sourceCalls, reverbInstalls: reverbs, hapticCreates, hapticUpdates, hapticStops, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleAudioConnected()));
