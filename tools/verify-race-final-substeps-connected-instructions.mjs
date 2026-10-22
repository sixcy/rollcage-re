import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createDynamicLightFixture, lightAddresses} from './verify-dynamic-light-state-instructions.mjs';
import {createVehicleFeedbackFixture, createVehicleFeedbackServices, feedbackAddresses} from './verify-vehicle-audio-connected-instructions.mjs';
import {initializeVehicleHapticsConstants} from '../src/vehicle-haptics.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const mapEntries = [0x40b2a0, 0x40c0a0, 0x40b220, 0x40b6b0, 0x40b9d0, 0x40b5b0, 0x40b2f0, 0x40b370], arities = [2, 0, 1, 1, 3, 2, 1, 2];

//All40 other450e50 game stages are explicit boundaries in this comparison.
//The actual final-stage defaults execute in their real caller stack/substeps.
export async function verifyRaceFinalSubstepsConnected({fixtures = 240, output = 'analysis/race-final-substeps-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions, {entry: 0x450e50});
  const own = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const targets = [...new Set(own.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => ![0x44d960, 0x42b530].includes(address));
  assert.equal(targets.length, 40);
  //The complete evidence loader also contains some boundary implementations.
  //Remove only these explicitly declared entry points from this interpreter's
  //dispatch map so it reaches the stated boundary, rather than silently
  //executing an unrelated wider scope before the connected stages under test.
  for (const address of [...targets, ...mapEntries]) machine.entries.delete(address);
  const switchEvidence = JSON.parse(await readFile('analysis/native-simulation/results/1178-dynamic-stage-switch.json', 'utf8')).structuredContent;
  const visits = new Map(), executed = new Set(), watched = new Set([0x450e50, 0x44d960, 0x42b530, 0x407380, 0x44d7a0, 0x44df50, 0x44d8a0]);
  machine.onInstruction = address => {executed.add(address); if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)));
  let steps = 0, descriptors = 0, creates = 0, updates = 0, boundaryCalls = 0;
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createDynamicLightFixture(fixture), {memory} = source, a = feedbackAddresses, light = lightAddresses;
    Buffer.from(switchEvidence.normalized_result.bytes_hex, 'hex').copy(memory, Number(switchEvidence.normalized_result.address));
    initializeVehicleHapticsConstants(memory);
    //The device fixture provides declared platform/cache storage, not light or
    //race constructors. Its ranges do not replace the light spatial fixture.
    const deviceFixture = createVehicleFeedbackFixture(fixture);
    deviceFixture.memory.copy(memory, a.manager, a.manager, a.deviceVtable + 0x100);
    for (const address of [0x714b54, 0x6f2360]) put(memory, address, deviceFixture.memory.readInt32LE(address));
    source.body = a.body; source.record = 0x909300;
    put(memory, 0x5ecb1c, a.session); memory[a.session + 0x54d] = 1; put(memory, a.session + 0x57c, 4);
    put(memory, source.record, a.body); memory[source.record + 0x258] = 2; memory.writeInt16LE(fixture % 5 - 1, source.record + 0x25c);
    for (const body of [a.body, a.other]) {put(memory, body + 0x11c, -1); memory.writeInt16LE([0, 200, 1000, -1, -32768, 32767][fixture % 6], body + 0x668);}
    put(memory, 0x5ecefc, 0x38000); put(memory, 0x90b990, 0x39000);
    put(memory, 0x714b08, 0x270000); put(memory, 0x270000, 0x271000); put(memory, 0x27105c, 0x72005c);
    //The isolated light oracle retains a scripted-body mutation contract.
    //Here type1 has the real queued-position consumer; the raw VM is a
    //separate open bridge, not an admitted no-op inside this connected scope.
    for (let index = 1; index < memory.readUInt32LE(0x80f20c); index++) put(memory, 0x80f520 + index * 64 + 0x30, 0);
    const sourceLog = [], nativeLog = [], sourceServices = createVehicleFeedbackServices(source, sourceLog);
    machine.reset(); memory.copy(machine.bytes);
    const nativeServices = createVehicleFeedbackServices({...source, memory: machine.bytes}, nativeLog);
    const boundary = (bytes, log, address) => {
      log.push(['game-boundary', address]);
      //A live speed producer before feedback; its own algorithm is verified
      //elsewhere. The parent must consume the changed field this same tick.
      if (address === 0x443d90) bytes.writeInt16LE((fixture * 131) << 16 >> 16, bytes.readUInt32LE(source.record) + 0x668);
      return 0;
    };
    const handlers = {...sourceServices, audioManagerCall: (manager, method, args) => sourceLog.push(['audio-manager', manager, method, args])};
    for (const address of targets) {
      handlers[`call${address.toString(16)}`] = () => boundary(memory, sourceLog, address);
      machine.externalCalls.set(address, m => {m.r.EAX = boundary(m.bytes, nativeLog, address);});
    }
    machine.externalCalls.set(0x72005c, m => {nativeLog.push(['audio-manager', m.r.ECX >>> 0, 0x5c, [m.bytes.readInt32LE(m.r.ESP)]]); m.r.ESP += 4;});
    for (let index = 0; index < mapEntries.length; index++) machine.externalCalls.set(mapEntries[index], m => {const args = Array.from({length: arities[index]}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4)); m.r.EAX = nativeServices.hapticContainerCall(mapEntries[index], {memory: m.bytes, ecx: m.r.ECX >>> 0, args, scratchBase: m.r.ESP - 4}); m.r.ESP += arities[index] * 4;});
    machine.externalCalls.set(0x710014, m => {m.r.EAX = nativeServices.deviceCall(m.r.ECX >>> 0, 0x14, [m.bytes.readInt32LE(m.r.ESP), m.bytes.readInt32LE(m.r.ESP + 4)]); m.r.ESP += 8;});
    for (const method of [0x34, 0x40, 0x44]) machine.externalCalls.set(0x710000 + method, m => {const count = method === 0x34 ? 1 : 2, args = Array.from({length: count}, (_, i) => method === 0x34 ? m.bytes.readInt32LE(m.r.ESP) : m.bytes.readUInt32LE(m.r.ESP + i * 4)); m.r.EAX = nativeServices.deviceCall(m.r.ECX >>> 0, method, args); m.r.ESP += count * 4;});
    put(machine.bytes, 0x56e210, 0x710100); machine.externalCalls.set(0x710100, m => nativeServices.free(m.bytes.readUInt32LE(m.r.ESP)));
    const ranges = [[a.body, 0x4000], [a.other, 0x4000], [a.session, 0x800], [source.record, 0x30c], [a.mapBase, 0x70000], [0x80f20c, 0x1718], [0x90b688, 80], [light.bands, 0x3000], [light.bodies, 0x28000], [0x5ec958, 4], [0x91d360, 20], [0x91d3e4, 8], [0x91d448, 12], [0x91cdc0, 44], [0x90a548, 4], [0x6e675c, 4], [0x5ecdb0, 12], [0x6e6bd4, 4]];
    for (let tick = 0; tick < 4; tick++) {
      const iteration = tick % 2, expected = runRaceUpdate(iteration, 2, {...source, handlers});
      machine.entry = 0x450e50; machine.r.EDX = iteration; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, 2);
      try {
        steps += machine.run(2_000_000); assert.equal(machine.r.EAX, expected); assert.deepEqual(nativeLog, sourceLog);
        for (const [address, length] of ranges) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, i) => value !== memory[address + i]); assert.fail(`fixture${fixture}/tick${tick} byte0x${(address + offset).toString(16)}`);}
      } catch (error) {console.error({fixture, tick, sourceLog: sourceLog.slice(-6), nativeLog: nativeLog.slice(-6)}); throw error;}
    }
    descriptors += sourceLog.filter(call => call[0] === 'device' && [0x40, 0x44].includes(call[2])).length;
    creates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x34).length;
    updates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x44).length;
    boundaryCalls += sourceLog.filter(call => call[0] === 'game-boundary').length;
  }
  const report = {method: 'Actual450e50 caller with actual44d960 and42b530 defaults, reached spatial/terrain/transform/allocation and407380 cache/effect callees. Four persistent alternating intermediate/final substeps. Other40 outer game stages remain explicit boundary contracts, including a speed-field mutation consumed by feedback; type1 attached-script pointers are explicitly zero, queued positions remain populated. Library containers/device/audio virtual/compiler services explicit; original process/hardware/render observations and whole-tick closure not claimed.', targetSha256: program.sha256, availableRetainedInstructions: program.instructions.length, executedInstructions: executed.size, evidence: program.references.map(item => item.evidence), fixtures, parentCalls: fixtures * 4, instructionSteps: steps, descriptors, creates, updates, boundaryCalls, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {const {evidence, ...summary} = await verifyRaceFinalSubstepsConnected(); console.log(JSON.stringify(summary));}
