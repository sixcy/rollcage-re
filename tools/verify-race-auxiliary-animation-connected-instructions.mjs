import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createAuxiliaryAnimationFixture, auxiliaryAnimationAddresses as a} from './verify-vehicle-auxiliary-animation-instructions.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

export async function verifyRaceAuxiliaryAnimationConnected({fixtures = 240, output = 'analysis/race-auxiliary-animation-connected-full-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), own = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const contracts = [...new Set(own.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x416400);
  assert.equal(contracts.length, 41); for (const address of contracts) machine.entries.delete(address);
  const config = 0x1d0000, scene = 0x1d1000, manager = 0x1d2000, vtable = 0x1d3000, service = 0x730000, alternate = a.control + 0x1000;
  let steps = 0, boundaryCalls = 0, nestedCalls = 0; const reached = new Set(), visits = {}, watched = new Set([0x450e50, 0x416400, 0x416510, 0x416fa0, 0x4168d0, 0x416c50, 0x4165c0, 0x416620, 0x4166d0, 0x417210, 0x4167f0]);
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x416400) {assert.equal(machine.r.ESP, a.stack - 20); assert.equal(machine.r.ECX, a.record); nestedCalls++;}};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createAuxiliaryAnimationFixture(fixture, memory);
    memory[a.session + 0x54d] = 1; put(memory, a.session + 0x57c, 4); put(memory, 0x5ecefc, config); put(memory, 0x90b990, scene); put(memory, 0x714b08, manager); put(memory, manager, vtable); put(memory, vtable + 0x5c, service);
    memory[a.body + 0x718] = 1; put(memory, a.body + 0x690, 0); word(memory, a.control + 0x40, 50); word(memory, a.control + 0x42, 6); memory[a.control + 0x38] = fixture % 4 === 1 ? 6 : 0; memory[a.control + 0x39] = fixture % 3 ? 0 : 4; memory[a.control + 0x3b] = fixture % 2 ? 64 : 0;
    memory.copy(memory, alternate, a.control, a.control + 0x4c); machine.reset(); memory.copy(machine.bytes);
    const sourceLog = [], nativeLog = []; let tick = 0;
    const boundary = (bytes, log, address) => {
      log.push(address);
      if (address === 0x42a9a0) {put(bytes, a.body + 0x714, tick % 3); put(bytes, a.body + 0x710, [0, 0x10000, 0x20000, 0x4000][tick % 4]);}
      if (address === 0x47ccc0) {const mask = [15, 7, 0, 15][(fixture + tick) % 4]; for (let wheel = 0; wheel < 4; wheel++) bytes[a.body + 0x324 + wheel * 200] = mask >>> wheel & 1;}
      if (address === 0x443d90) put(bytes, a.body + 0x34, 10 * 65536 + tick * 4096);
      if (address === 0x41d2b0 && tick === 2) put(bytes, a.record + 0x18, alternate);
      return 0;
    };
    const handlers = {};
    for (const address of contracts) {handlers[`call${address.toString(16)}`] = () => boundary(memory, sourceLog, address); machine.externalCalls.set(address, m => {m.r.EAX = boundary(m.bytes, nativeLog, address);});}
    handlers.audioManagerCall = (object, method, args) => sourceLog.push([object, method, args]);
    machine.externalCalls.set(service, m => {nativeLog.push([m.r.ECX >>> 0, 0x5c, [m.bytes.readInt32LE(m.r.ESP)]]); m.r.ESP += 4;});
    for (; tick < 4; tick++) {
      const expected = runRaceUpdate(tick % 2, 2, {...runtime, handlers});
      machine.entry = 0x450e50; machine.r.EDX = tick % 2; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, 2); steps += machine.run(3000000);
      assert.equal(machine.r.EAX, expected); assert.deepEqual(nativeLog, sourceLog);
      const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`outer animation fixture${fixture}/tick${tick} byte0x${(0x10000 + offset).toString(16)} native${native[offset]} JS${source[offset]}`);}
    }
    boundaryCalls += sourceLog.filter(value => typeof value === 'number').length;
  }
  const report = {method: 'Actual450e50 outer caller→default416400 with every reached auxiliary animation,numeric,raw track-basis and spatial descendant. Actual native callee entry S-20 and record pointer asserted at every call. Four persistent outer substeps take explicit earlier-stage held/edge/contact/position changes and a live control-pointer replacement after41d2b0. All mapped memory at or above10000h compared. Other41 direct game stages are declared caller contracts and final manager virtual service is explicit; this is stage integration,not complete race-frame or constructor/runtime-producer equivalence. No original-process execution.', targetSha256: program.sha256, evidence: own.evidence.map(item => item.evidence_id), fixtures, parentCalls: fixtures * 4, nestedCalls, executedInstructions: reached.size, instructionSteps: steps, boundaryCalls, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new output filename.');}}
  return report;
}
if (process.argv[1] && import.meta.url ===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceAuxiliaryAnimationConnected()));
