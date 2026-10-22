import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createProtocolFixture, createProtocolServiceFixture, installProtocolInstructionServices} from './verify-game-network-protocol-instructions.mjs';
import {prepareNetworkRaceTimes, sendNetworkRaceSnapshot, publishNetworkRaceResults, endDisconnectedNetworkSession, retireNetworkParticipant, disconnectNetworkSession, removeNetworkPeer, announceNetworkCountdown} from '../src/network-session-retirement.mjs';
import {handleFailedProtocolPeer} from '../src/game-network-protocol.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function createNetworkRetirementFixture(fixture, memory) {
  const runtime = {...createProtocolFixture(fixture, memory), nativeEntryRegisters: {edi: 0, esi: 0, ebp: 0, ebx: 0}}, session = 0x210000, settings = 0x200000;
  put(memory, 0x5ecb1c, session); put(memory, 0x5ecefc, settings); put(memory, 0x5eb518, fixture % 19 === 0 ? 1 : 0); put(memory, 0x6e6b34, fixture % 7 === 0 ? 1 : 0); put(memory, 0x6eafe0, [0, 0x87, 0xc7, 0x200c7][Math.floor(fixture / 9) % 4]);
  put(memory, 0x6e9f70, fixture % 2 ? 0xffffffff : 0); put(memory, 0x6e9f6c, 1); put(memory, 0x6eaab8, 99); put(memory, 0x6e6b4c, 1); put(memory, 0x6e9f68, fixture % 9 - 2); put(memory, 0x9020a0, 0); put(memory, 0x5ec958, fixture * 17171 + 1); put(memory, 0x91ffb4, fixture * 613);
  memory[session + 0x54d] = fixture % 11 === 0 ? 0 : 6; memory[session + 0x551] = fixture % 3; memory[session + 0x586] = 3; put(memory, session + 0x57c, [4, 5, 6, 7, 8][Math.floor(fixture / 36) % 5]); put(memory, session + 0x580, 733);
  for (let i = 0; i < 6; i++) {
    const body = 0x220000 + i * 0x1000, controller = 0x300000 + i * 0x20000, record = 0x909300 + i * 0x30c;
    memory[session + i] = i < fixture % 7 ? 0 : 8; memory[settings + 0x8c + i] = fixture % 5 ? 1 : 0; memory[session + 8 + i] = i + 10;
    put(memory, record, body); memory[record + 0x249] = fixture % 3 === 0 || i < fixture % 6 ? 1 : 0; memory[record + 0x1c] = 1 + i % 5; memory[record + 0x1d] = i + 1; put(memory, record + 0x24, i * 3000 + (fixture % 13 ? 16384 : 0));
    for (const offset of [0x2c, 0x30, 0x34]) put(memory, record + offset, (6 - i) * 100000 + fixture * 13);
    put(memory, body + 0x660, controller); put(memory, controller + 0x1e880, [0, 2, 5][i % 3]); put(memory, controller + 0x4e28, controller + 8);
    for (const header of [0, 0x4e30, 0x14c24, 0x19a50]) put(memory, controller + header + 4, 4096);
    for (let axis = 0; axis < 3; axis++) memory[body + 0x708 + axis] = (fixture + i * 7 + axis * 19) & 255;
    memory.writeUInt16LE((fixture * 31 + i) & 65535, body + 0x710); put(memory, 0x6e7884 + i * 0x67c, i < fixture % 7 ? 1 : 0);
  }
  put(memory, 0x56e114, 0xa20010); put(memory, 0x56e0fc, 0xa20014);
  return runtime;
}
export async function verifyNetworkSessionRetirement({fixtures = 900, output = 'analysis/network-session-retirement-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), entries = [0x445b70, 0x4702c0, 0x472560, 0x46fef0, 0x46f860, 0x470ea0, 0x49f4f0, 0x4723f0, 0x49fcd0];
  const files = ['3415-wormhole-network-peer-removal-assembly.json', '3452-wormhole-network-46fef0-assembly.json', '3454-wormhole-network-472560-assembly.json', '3464-wormhole-peer-retirement-470ea0-assembly.json', '3466-wormhole-peer-retirement-445b70-assembly.json', '3468-wormhole-peer-retirement-4702c0-assembly.json', '3470-wormhole-peer-retirement-49f4f0-assembly.json', '3472-network-session-4723f0-assembly.json'];
  const own = await readInstructionEvidence(files, {directory: 'analysis/native-simulation/results'}), reached = new Set(), visits = {}; let steps = 0, cookies = 0, statusCalls = 0;
  let currentInstruction;
  const nextAddress = new Map(program.instructions.slice(0, -1).map((instruction, i) => [instruction.address, program.instructions[i + 1].address]));
  machine.onInstruction = p => {currentInstruction = p; steps++; reached.add(p); if (entries.includes(p) || p === 0x42ab90) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, state => {assert.equal(state.r.ECX, state.bytes.readInt32LE(0x5e8890)); /*Compiler CALL/RET net ESP is zero, but its real return slot remains observable in the next packet.*/ put(state.bytes, state.r.ESP - 4, nextAddress.get(currentInstruction)); cookies++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createNetworkRetirementFixture(fixture, memory), selector = fixture % entries.length, ecx = fixture % 8, entry = entries[selector];
    //4723f0 throttle/gate domain only: actual A3 receiver and reliable waiting
    //remain separate protocol branches, excluded explicitly from this check.
    if (selector === 7) {put(memory, 0x6eafe0, fixture % 2 ? 0x87 : 0); put(memory, 0x6e675c, 0); put(memory, 0x6eaab0, 100);}
    const js = createProtocolServiceFixture(fixture, memory); runtime.services = {...js.services, networkCall(object, method, args, r) {if (method === 0x6c) {js.trace.push({name: 'network', object: object >>> 0, method, args: args.map(v => v >>> 0)}); return 3;} return js.services.networkCall(object, method, args, r);}};
    machine.reset(); memory.copy(machine.bytes); const native = createProtocolServiceFixture(fixture, machine.bytes), normal = native.services.networkCall;
    native.services.networkCall = (object, method, args, r) => {if (method === 0x6c) {statusCalls++; native.trace.push({name: 'network', object: object >>> 0, method, args: args.map(v => v >>> 0)}); return 3;} return normal(object, method, args, r);}; installProtocolInstructionServices(machine, native);
    let result, edx = 0, args = [];
    try {
      if (selector === 0) prepareNetworkRaceTimes(ecx, runtime);
      else if (selector === 1) result = sendNetworkRaceSnapshot(runtime);
      else if (selector === 2) result = publishNetworkRaceResults(runtime);
      else if (selector === 3) endDisconnectedNetworkSession(runtime);
      else if (selector === 4) retireNetworkParticipant(ecx, runtime);
      else if (selector === 5) result = disconnectNetworkSession(runtime);
      else if (selector === 6) result = removeNetworkPeer(ecx, runtime);
      else if (selector === 7) result = announceNetworkCountdown(ecx, 0, runtime);
      else {args = [0x11111111 + fixture % 6, 0x22222222 + fixture % 6]; result = handleFailedProtocolPeer(...args, runtime);}
      machine.entry = entry; machine.r.ESP = runtime.scratchBase; machine.r.ECX = ecx; machine.r.EDX = edx; put(machine.bytes, runtime.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, runtime.scratchBase + 4 + i * 4, v)); machine.run(3_000_000);
      if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0);
      if (!memory.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (memory[p] === machine.bytes[p]) p++; const offsets = []; for (let q = 0x180008; q < 0x180540 && offsets.length < 20; q++) if (memory[q] !== machine.bytes[q]) offsets.push([q.toString(16), memory[q], machine.bytes[q]]); console.error({offsets}); throw Error(`Mismatch0x${p.toString(16)} JS=${memory.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
      assert.deepEqual(native.trace, js.trace);
    } catch (error) {console.error({fixture, entry: entry.toString(16), phase: memory.readInt32LE(0x21057c), visits}); throw error;}
  }
  const report = {method: 'Actual participant retirement46f860, recursive disconnect46fef0/470ea0/49f4f0, result policy472560, finish-time projection/rank RNG445b70 and snapshot4702c0 through real replay codec, fixed division/time packing and protocol send/account/clock. All mapped bytes>=10000h and ordered network/performance services compared; synthetic coherent six-participant records/controllers. 4723f0 gate/throttle only; A3 local receiver and reliable wait remain explicit excluded protocol domains. No original execution.', targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, failedStatusCalls: statusCalls, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyNetworkSessionRetirement()));
