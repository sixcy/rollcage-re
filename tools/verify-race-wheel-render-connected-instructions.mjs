import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createWheelRenderFixture, wheelRenderAddresses} from './verify-wheel-render-state-instructions.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
export async function verifyRaceWheelRenderConnected({fixtures = 240, output = 'analysis/race-wheel-render-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
  const own = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const targets = [...new Set(own.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x41d2b0);
  assert.equal(targets.length, 41);
  for (const address of targets) machine.entries.delete(address);
  const a = wheelRenderAddresses, session = 0x150000, config = 0x151000, scene = 0x152000, manager = 0x153000, vtable = 0x154000, service = 0x730000;
  let steps = 0, boundaryCalls = 0; const reached = new Set(), visits = {};
  const watched = new Set([0x450e50, 0x41d2b0, 0x41d460, 0x432680, 0x433400, 0x41d610, 0x4334b0]);
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWheelRenderFixture(fixture, memory);
    put(memory, 0x5ecb1c, session); memory[session + 0x54d] = 1; put(memory, session + 0x57c, 4);
    put(memory, 0x5ecefc, config); put(memory, 0x90b990, scene); put(memory, 0x909300, a.body);
    put(memory, 0x714b08, manager); put(memory, manager, vtable); put(memory, vtable + 0x5c, service);
    machine.reset(); memory.copy(machine.bytes);
    const nativeLog = [], sourceLog = [];
    let tick = 0;
    const boundary = (bytes, log, address) => {
      log.push(address);
      // The earlier-stage contract deliberately changes inputs consumed by
      // actual wheel preparation later in the same outer frame.
      if (address === 0x443d90) {
        const body = bytes.readUInt32LE(0x909300);
        put(bytes, body + 0x644, (fixture - 120) * 811 + tick * 65537);
        put(bytes, body + 0x34, fixture * 0x10000 + tick * 0x4000);
        put(bytes, body + 0x324 + 0x78, fixture * 4097 - tick * 113);
      }
      return 0;
    };
    const handlers = {};
    for (const address of targets) {
      handlers[`call${address.toString(16)}`] = () => boundary(memory, sourceLog, address);
      machine.externalCalls.set(address, m => {m.r.EAX = boundary(m.bytes, nativeLog, address);});
    }
    handlers.audioManagerCall = (object, method, args) => sourceLog.push([object, method, args]);
    machine.externalCalls.set(service, m => {nativeLog.push([m.r.ECX >>> 0, 0x5c, [m.bytes.readInt32LE(m.r.ESP)]]); m.r.ESP += 4;});
    for (; tick < 4; tick++) {
      const expected = runRaceUpdate(tick % 2, 2, {...runtime, handlers});
      machine.entry = 0x450e50; machine.r.EDX = tick % 2; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, 2);
      steps += machine.run(1000000); assert.equal(machine.r.EAX, expected); assert.deepEqual(nativeLog, sourceLog);
      const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
      if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`fixture${fixture}/tick${tick}/byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
    }
    boundaryCalls += sourceLog.filter(value => typeof value === 'number').length;
  }
  const report = {method: 'Actual450e50 outer caller with actual41d2b0 and every numeric wheel-render descendant, using the actual nested stack. Four persistent substeps, live earlier-stage steering/position/spin mutations and aliased output/source bodies. All mapped memory above10000h compared; private stack excluded. Other41 direct game stages remain declared boundary contracts; final manager virtual service explicit. Source-owned body/wheel/render storage, not constructor or whole-frame closure. No original-process execution.', targetSha256: program.sha256, evidence: own.evidence.map(item => item.evidence_id), fixtures, parentCalls: fixtures * 4, executedInstructions: reached.size, instructionSteps: steps, boundaryCalls, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceWheelRenderConnected()));
