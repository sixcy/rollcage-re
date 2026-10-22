import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateRacePhaseState, aggregateRaceInput} from '../src/race-phase-state.mjs';
import {updateRaceAudioListeners, setRaceAudioVolume, setRaceSerialVolume, updateRaceMusicState} from '../src/race-phase-audio.mjs';
import {startRaceLaunch, applyRaceLaunchImpulse} from '../src/race-launch-state.mjs';

export const phaseAddresses = {session: 0x30000, other: 0x34000, settings: 0x38000, body: 0x40000, listener: 0x60000, vectors: 0x70000, device: 0x78000, target: 0x78100, vtable: 0x78200, targetVtable: 0x78300, output: 0x80000, stack: 0x9000};
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const large = [0x48b7d0, 0x478fa0, 0x477310, 0x445b70, 0x4702c0, 0x4a0420];
const counters = [-2147483648, -1, 0, 1, 6, 7, 14, 15, 29, 30, 31, 49, 50, 59, 60, 61, 62, 63, 149, 150, 199, 200, 201, 2147483647];

export function createRacePhaseFixture(fixture, constants = []) {
  const a = phaseAddresses, memory = Buffer.alloc(0xa00000), phase = fixture % 14 - 1, count = [0, 1, 3][Math.floor(fixture / 19) % 3];
  memory.fill(0xa5, a.stack - 0x1000, a.stack + 64);
  for (const item of constants) Buffer.from(item.normalized_result.bytes_hex, 'hex').copy(memory, Number(item.normalized_result.address));
  put(memory, 0x5ecb1c, a.session); put(memory, 0x5ecefc, a.settings); put(memory, 0x90a548, Math.imul(fixture + 1, 0x1f437));
  memory[a.settings + 0x41a] = fixture % 2; put(memory, 0x6e6c04, fixture % 3); word(memory, a.settings + 0x42c, 640); word(memory, a.settings + 0x42e, 480); put(memory, 0x91d338, 256); put(memory, 0x70ea94, 0x88000); put(memory, 0x70ea98, 0x88100);
  const network = [0, 1, 7, 0x81, 0xc7, 0x200c7][Math.floor(fixture / 23) % 6]; put(memory, 0x6eafe0, network); put(memory, 0x6e9f70, -1); put(memory, 0x6e675c, fixture % 3); put(memory, 0x5eb518, fixture % 2); put(memory, 0x6ea69c, fixture * 8);
  for (const session of [a.session, a.other]) {
    put(memory, session + 0x57c, phase); put(memory, session + 0x580, counters[Math.floor(fixture / 14) % counters.length]);
    memory[session + 0x54d] = count; memory[session + 0x551] = [0, 1, 3, 4, 8][Math.floor(fixture / 7) % 5]; memory[session + 0x54f] = fixture % 3;
    memory[session + 0x58c] = Math.floor(fixture / 11) % 3; word(memory, session + 0x58e, [-1, 0, 1, 5][Math.floor(fixture / 29) % 4]); memory[session + 0x58b] = fixture & 1;
    for (let index = 0; index < 6; index++) memory[session + index + 8] = [0, 14, 15, 255][(fixture + index) % 4];
    word(memory, session + 0xa7c, [-32768, -1, 0, 16000, 32767][fixture % 5]); word(memory, session + 0xa7e, [-32768, 0, 12000, 32767][fixture % 4]);
  }
  for (let index = 0; index < 6; index++) {
    const body = a.body + index * 0x1000, record = 0x909300 + index * 0x30c, offset = index * 0x67c;
    put(memory, record, body); memory[record + 0x1c] = (Math.floor(fixture / 336) + index) % 2; put(memory, record + 0x2c, fixture * 157); put(memory, record + 0x30, -1); word(memory, body + 0x65e, index); word(memory, record + 0x25e, 0x87);
    put(memory, body + 0x6b0, [-1, 0, 1, 511, 512, 1499, 65536][(fixture + index) % 7]); memory[body + 0x64d] = [0, 1, 127, 255][(fixture + index) % 4];
    word(memory, body + 0x6a0, fixture % 2); word(memory, body + 0x6a2, fixture % 5); word(memory, body + 0x6aa, [0, 9, 12, 32767][fixture % 4]); memory[body + 0x709] = fixture & 255;
    for (let wheel = 0; wheel < 4; wheel++) memory[body + 0x324 + wheel * 200] = fixture % 3 ? 1 : wheel & 1;
    word(memory, body + 0xc8, 0); word(memory, body + 0xce, 4096); word(memory, body + 0xd4, 0); for (let axis = 0; axis < 3; axis++) put(memory, body + 0x40 + axis * 4, (fixture * (axis + 1) * 97) % 0x100000);
    memory[body + 0x70b] = fixture % 2; memory[body + 0x71e] = fixture % 20; memory[body + 0x6b4] = fixture % 3;
    put(memory, 0x6e7880 + offset, 1); for (const source of [0x6e7ac4, 0x6e78b0]) {put(memory, source + offset, fixture % 2 ? 0x800 : 0x100010); put(memory, source + offset + 4, 0x03020100);}
    for (let history = 0; history < 64; history++) {put(memory, 0x6e7bd8 + offset + history * 12, fixture * 8 - history); put(memory, 0x6e7bdc + offset + history * 12, history === 0 ? 0x800 : 0);}
  }
  put(memory, 0x7130b0, fixture % 4 - 1); put(memory, 0x712fbc, 0x7fff); put(memory, 0x91e744, fixture % 2 ? 1 : 0); put(memory, 0x91e740, 0x31); put(memory, 0x714b08, a.device); put(memory, a.device, a.vtable); put(memory, a.target, a.targetVtable);
  put(memory, a.vtable + 0x48, 0x700048); put(memory, a.vtable + 0x5c, 0x70005c); put(memory, a.targetVtable + 0xc, 0x70000c); put(memory, 0x56e0d4, 0x700100); put(memory, 0x6e6b30, 0x12345678); word(memory, 0x6e6bd8, fixture % 4); memory[a.settings + 0x410] = fixture % 2; put(memory, a.settings + 0x404, fixture % 2); put(memory, 0x5ecdb8, 24);
  memory.writeFloatLE(2 ** -20, 0x5ecdb4); memory.writeFloatLE(30 * 2 ** -20, 0x5ecdb0);
  put(memory, 0x6f2408, a.listener); put(memory, 0x6f240c, a.listener + 16);
  for (let index = 0; index < 4; index++) {
    const record = 0x849490 + index * 0x54, position = a.vectors + index * 0x100, velocity = position + 16, rotation = position + 32;
    memory[record - 16] = (fixture + index) % 4 ? 1 : 0; word(memory, record - 14, fixture % 2);
    for (const [field, value] of [[0, position], [16, velocity], [32, rotation], [-12, position], [-8, velocity], [-4, rotation]]) put(memory, record + field, (fixture + index + field) % 3 ? value : 0);
    for (let axis = 0; axis < 3; axis++) {put(memory, position + axis * 4, (fixture + axis) * 65537); put(memory, velocity + axis * 4, (fixture - axis) * 17001);}
    for (let axis = 0; axis < 9; axis++) word(memory, rotation + axis * 2, (fixture * 511 + axis * 29) & 65535);
    put(memory, a.listener + index * 4, fixture % 7 === index ? 0 : a.output + index * 0x100);
  }
  put(memory, 0x5e8890, 0x47f37031);
  return {memory, fixture, phase, entryEcx: (0x12340000 | fixture) | 0, scratchBase: a.stack};
}

export function createRacePhaseServices(context, log) {
  const {memory, fixture} = context, a = phaseAddresses;
  const game = (id, request) => {
    const normalized = [id];
    if (id === 0x445b70 || id === 0x4702c0) normalized.push(request.ecx);
    if (id === 0x4a0420) normalized.push(request.ecx, request.args, memory.subarray(request.edx, request.edx + request.args[0]).toString('hex'));
    if (id === 0x48b7d0) {normalized.push(request.ecx, request.edx, request.args); put(memory, 0x91d338, 512);}
    log.push(normalized);
    if (fixture % 17 === 0) {put(memory, 0x5ecb1c, a.other); memory[a.other + 0x54d] = (fixture % 3);}
    if (id === 0x4a0420) {put(memory, memory.readUInt32LE(0x5ecb1c) + 0x580, fixture + 9); return fixture % 2;}
    if (id === 0x478fa0 && fixture % 31 === 0) {put(memory, a.stack - 16, fixture - 9); put(memory, a.stack - 12, 8);}
    if (id === 0x4702c0) put(memory, 0x6eafe0, memory.readInt32LE(0x6eafe0) & ~0x40);
    return 0;
  };
  return {
    ...Object.fromEntries(large.map(id => [`call${id.toString(16)}`, request => game(id, request)])),
    audioDeviceCall(address, method, args) {
      log.push(['audio', address, method, args]);
      if (method === 0x48) return a.target;
      if (method === 0xc && fixture % 13 === 0) {put(memory, 0x5ecb1c, a.other); memory.writeFloatLE(0.25, 0x5ea3c4);}
      return 1;
    },
    writeFile(request) {log.push(['write', request.handle, memory.subarray(request.buffer, request.buffer + request.length).toString('hex'), request.overlapped]); put(memory, request.written, request.length); return 1;},
  };
}

export async function verifyRacePhaseState({fixtures = 6000, helpers = 2000, output = 'analysis/race-phase-state-instruction-check.json'} = {}) {
  const directory = 'analysis/native-simulation/results';
  const own = await readInstructionEvidence(['901-race-clock-gate-assembly.json', '911-race-phase-mode4-init-assembly.json', '913-race-phase-input-transition-assembly.json', '915-race-phase-audio-start-assembly.json', '917-race-phase-audio-fade-a-assembly.json', '919-race-phase-audio-fade-b-assembly.json', '921-race-phase-body-launch-assembly.json', '925-race-phase-network-status-assembly.json', '934-race-phase-launch-reset-assembly.json', '936-race-phase-volume-refresh-assembly.json', '938-race-phase-music-transition-assembly.json', '971-race-phase-audio-update-assembly.json', '973-race-phase-common-input-assembly.json', '465-input-packet-transform-assembly.json', '137-lap-bookkeeping-assembly.json', '128-lap-advance-notification-assembly.json', '143-lap-time-pack-assembly.json', '149-event-emitter-assembly.json', '151-effect-dispatch-assembly.json'], {directory});
  const math = await readInstructionEvidence(['133-sqrt-lookup-assembly.json', '211-sqrt-leading-zeros-assembly.json']);
  const constants = await Promise.all(['932-race-phase-switch.json', '129-lap-time-digit-switch.json', '147-lap-time-pack-switch.json', '974-race-phase-serial-conversion.json', '975-race-phase-serial-scale.json', '976-race-phase-float-scale.json', '978-race-phase-listener-scales.json'].map(async name => {const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);}));
  const instructions = [...own.instructions, ...math.instructions], machine = new BoundedX86(instructions), sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')), a = phaseAddresses;
  const visits = new Map(), watched = new Set([0x47f370, 0x479360, 0x42a4e0, 0x4843a0, 0x484dd0, 0x484440, 0x48d6e0, 0x48d490, 0x471800, 0x484b20, 0x484510, 0x484880, 0x42b330, 0x433200, 0x449be0, 0x4459f0, 0x445d40, 0x484bb0, 0x40ea40, 0x432e70]);
  let steps = 0, gameContracts = 0, writes = 0, audioCalls = 0, cookies = 0;
  const contractVisits = new Map();
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  machine.externalCalls.set(0x568a50, m => {const address = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes.readUInt32LE(m.r.ESP + 4), length = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(value & 255, address, address + length); m.r.EAX = address;});
  const ranges = [[a.session, 0x8000], [a.body, 0x6000], [a.listener, 32], [a.output, 0x400], [0x849480, 0x160], [0x5ecb1c, 4], [0x5ea3c4, 4], [0x5ecdb0, 12], [0x6e6ba4, 4], [0x6e6bd4, 8], [0x6e7880, 0x2800], [0x6eafe0, 4], [0x712fbc, 4], [0x7130b0, 4], [0x909300, 6 * 0x30c], [0x91e740, 8], [0x91d45c, 8], [0x91d338, 4]];
  for (let fixture = 0; fixture < fixtures + helpers; fixture++) {
    const source = createRacePhaseFixture(fixture, constants), sourceLog = [], nativeLog = [], sourceHandlers = createRacePhaseServices(source, sourceLog);
    machine.reset(); source.memory.copy(machine.bytes); sqrt.values.forEach((value, index) => machine.bytes.writeUInt16LE(value, 0x5eb290 + index * 2));
    const nativeHandlers = createRacePhaseServices({...source, memory: machine.bytes}, nativeLog);
    for (const id of large) machine.externalCalls.set(id, m => {const arity = id === 0x4a0420 ? 2 : id === 0x48b7d0 ? 5 : 0, args = Array.from({length: arity}, (_, index) => m.bytes.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeHandlers[`call${id.toString(16)}`]({memory: m.bytes, ecx: m.r.ECX, edx: m.r.EDX, args}); gameContracts++; contractVisits.set(id, (contractVisits.get(id) ?? 0) + 1);});
    for (const method of [0x48, 0x5c, 0xc]) machine.externalCalls.set(0x700000 + method, m => {const args = [method === 0xc ? m.bytes.readFloatLE(m.r.ESP) : m.bytes.readInt32LE(m.r.ESP)]; m.r.EAX = nativeHandlers.audioDeviceCall(m.r.ECX >>> 0, method, args); m.r.ESP += 4; audioCalls++;});
    machine.externalCalls.set(0x700100, m => {nativeHandlers.writeFile({memory: m.bytes, handle: m.bytes.readUInt32LE(m.r.ESP), buffer: m.bytes.readUInt32LE(m.r.ESP + 4), length: m.bytes.readUInt32LE(m.r.ESP + 8), written: m.bytes.readUInt32LE(m.r.ESP + 12), overlapped: m.bytes.readUInt32LE(m.r.ESP + 16)}); m.r.ESP += 20; m.r.EAX = 1; writes++;});
    let expected, checkReturn = true;
    if (fixture < fixtures) {expected = updateRacePhaseState({...source, handlers: sourceHandlers}); machine.entry = 0x47f370; machine.r.ECX = source.entryEcx;}
    else {
      const index = fixture % 7, value = [-32768, -1, 0, 1, 16000, 32767][fixture % 6];
      machine.entry = [0x42b330, 0x484880, 0x484dd0, 0x484440, 0x4843a0, 0x48d6e0, 0x48d490][index];
      if (index === 0) expected = aggregateRaceInput(source);
      if (index === 1) updateRaceAudioListeners(source);
      if (index === 2) setRaceAudioVolume(value, {...source, handlers: sourceHandlers});
      if (index === 3) setRaceSerialVolume(value, {...source, handlers: sourceHandlers});
      if (index === 4) updateRaceMusicState(value, {...source, handlers: sourceHandlers});
      if (index === 5) {expected = startRaceLaunch(0x909300, fixture % 5, fixture % 8, {...source, handlers: sourceHandlers}); put(machine.bytes, a.stack + 4, fixture % 8);}
      if (index === 6) applyRaceLaunchImpulse(a.body, value, source);
      checkReturn = index === 0 || index === 5;
      machine.r.ECX = index === 5 ? 0x909300 : index === 6 ? a.body : value; machine.r.EDX = index === 5 ? fixture % 5 : value;
    }
    machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    try {
      steps += machine.run(1_000_000); if (checkReturn) assert.equal(machine.r.EAX | 0, expected, `return${fixture}`); assert.deepEqual(nativeLog, sourceLog, `calls${fixture}`);
      for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(source.memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== source.memory[address + index]); assert.fail(`fixture${fixture} entry${machine.entry.toString(16)} byte${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${source.memory[address + offset]}`);}
    } catch (error) {console.error({fixture, entry: machine.entry.toString(16), phase: source.phase, sourceLog, nativeLog}); throw error;}
  }
  const report = {method: 'Complete47f370 phase/countdown/clock parent with actual479360 mode4 indicator positioning,42a4e0,42b330/433200 input aggregate,449be0/4459f0/445d40 lap bookkeeping,484bb0/40ea40 emitter missing-bank gate,48d6e0/48d490 launch,471800 condition,4843a0/484510 music,484dd0/484b20/484880 volume/listener state and484440 serial-volume arithmetic. Remaining game parents48b7d0 UI allocation,478fa0 completion UI,477310 pause,445b70 results,4702c0 network lifecycle and generic mode1 transport4a0420 are explicit state-mutating contracts. Platform audio virtual calls/WriteFile, compiler memset/security-cookie are declared services; no original process/device/network execution. Full mutable body/session/record/packet/listener/audio/clock/replay/root globals, meaningful returns and service arguments/order compared; original switch/float bytes mapped.', evidence: [...own.evidence, ...math.evidence, ...constants].map(item => item.evidence_id), instructions: instructions.length, parentFixtures: fixtures, helperFixtures: helpers, gameContracts, contractVisits: Object.fromEntries([...contractVisits].map(([address, count]) => [`0x${address.toString(16)}`, count])), audioCalls, writes, cookieChecks: cookies, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRacePhaseState()));
