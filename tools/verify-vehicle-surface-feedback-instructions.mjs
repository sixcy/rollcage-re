import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateVehicleSurfaceFeedback} from '../src/vehicle-surface-feedback.mjs';
import {createVehicleFeedbackFixture, createVehicleFeedbackServices, feedbackAddresses} from './verify-vehicle-audio-connected-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const mapEntries = [0x40b2a0, 0x40c0a0, 0x40b220, 0x40b6b0, 0x40b9d0, 0x40b5b0, 0x40b2f0, 0x40b370], arities = [2, 0, 1, 1, 3, 2, 1, 2];

export function createSurfaceFeedbackFixture(fixture) {
  const context = createVehicleFeedbackFixture(fixture), {memory} = context, a = feedbackAddresses;
  memory[a.session + 0x54d] = fixture % 4;
  put(memory, 0x909240, 0x60000); put(memory, 0x60000, 0x61000); put(memory, 0x61008, 8); put(memory, 0x61020, 0x65000); memory.writeUInt16LE([0, 5, 20, 26, 1007][fixture % 5], 0x90929c);
  for (let index = 0; index < 3; index++) {
    const body = a.body + index * 0x4000, record = 0x909300 + index * 0x30c;
    put(memory, record, body); memory[record + 0x258] = [0, 1, 2, 3, 127, 128, 255][(fixture + index) % 7]; memory.writeUInt16LE((fixture + index - 3) & 65535, record + 0x25c);
    memory.writeUInt16LE([0, 1, 199, 200, 999, 1000, 32767, -1, -32768][(fixture + index) % 9] & 65535, body + 0x668);
    const row = fixture % 3 - 1, column = (fixture + index) % 5 - 2, query = ((row << 16) | ((column & 255) << 8)) >>> 0;
    put(memory, body + 0x11c, fixture % 5 ? query : -1); put(memory, 0x65000 + (row * 9 + column) * 8 + 4, [0, 5, 20, 26, 1007, 1008, 1023][(fixture + index) % 7] << 22);
    for (let material = 0; material < 4; material++) {const address = 0x68000 + index * 0x100 + material * 16; put(memory, body + 0x198 + material * 0x1c, (fixture + material) % 3 ? address : 0); put(memory, address + 12, ((fixture + material * 7 + index) & 31) << 8);}
  }
  return context;
}

export async function verifyVehicleSurfaceFeedback({fixtures = 4000, output = 'analysis/vehicle-surface-feedback-instruction-check.json'} = {}) {
  const own = await readInstructionEvidence(['1163-race-final-stage-42b530-assembly.json', '751-vehicle-haptics-407380-assembly.json'], {directory: 'analysis/native-simulation/results'}), machine = new BoundedX86(own.instructions), a = feedbackAddresses;
  let steps = 0, descriptors = 0, creates = 0, updates = 0, missingDevices = 0;
  const visits = new Map(); machine.onInstruction = address => {if (address === 0x42b530 || address === 0x407380) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)));
  const ranges = [[a.body, 0xc000], [a.session, 0x800], [0x909300, 6 * 0x30c], [a.mapBase, 0x70000]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createSurfaceFeedbackFixture(fixture), sourceLog = [], nativeLog = [], sourceHandlers = createVehicleFeedbackServices(source, sourceLog);
    machine.reset(); source.memory.copy(machine.bytes); const nativeHandlers = createVehicleFeedbackServices({...source, memory: machine.bytes}, nativeLog);
    for (let index = 0; index < mapEntries.length; index++) machine.externalCalls.set(mapEntries[index], m => {const args = Array.from({length: arities[index]}, (_, index) => m.bytes.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeHandlers.hapticContainerCall(mapEntries[index], {memory: m.bytes, ecx: m.r.ECX >>> 0, args, scratchBase: m.r.ESP - 4}); m.r.ESP += arities[index] * 4;});
    machine.externalCalls.set(0x710014, m => {m.r.EAX = nativeHandlers.deviceCall(m.r.ECX >>> 0, 0x14, [m.bytes.readInt32LE(m.r.ESP), m.bytes.readInt32LE(m.r.ESP + 4)]); m.r.ESP += 8;});
    for (const method of [0x34, 0x40, 0x44]) machine.externalCalls.set(0x710000 + method, m => {const count = method === 0x34 ? 1 : 2, args = Array.from({length: count}, (_, index) => method === 0x34 ? m.bytes.readInt32LE(m.r.ESP) : m.bytes.readUInt32LE(m.r.ESP + index * 4)); m.r.EAX = nativeHandlers.deviceCall(m.r.ECX >>> 0, method, args); m.r.ESP += count * 4;});
    put(machine.bytes, 0x56e210, 0x710100); machine.externalCalls.set(0x710100, m => nativeHandlers.free(m.bytes.readUInt32LE(m.r.ESP)));
    for (let tick = 0; tick < 2; tick++) {
      updateVehicleSurfaceFeedback({...source, handlers: sourceHandlers}); machine.entry = 0x42b530; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
      try {steps += machine.run(1_000_000); assert.deepEqual(nativeLog, sourceLog, `services${fixture}/${tick}`); for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), source.memory.subarray(address, address + length), `memory${fixture}/${tick}/${address.toString(16)}`);} catch (error) {console.error({fixture, tick, sourceLog: sourceLog.slice(-8), nativeLog: nativeLog.slice(-8)}); throw error;}
    }
    descriptors += sourceLog.filter(call => call[0] === 'device' && (call[2] === 0x40 || call[2] === 0x44)).length; creates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x34).length; updates += sourceLog.filter(call => call[0] === 'device' && call[2] === 0x44).length; missingDevices += fixture % 17 === 0 ? 1 : 0;
  }
  const constants = await Promise.all(['1183-final-feedback-scale.json', '1184-final-feedback-one.json', '1185-final-feedback-minus-one.json', '758-haptics-map-find.json', '760-haptics-map-slot.json', '762-haptics-map-lower-bound.json', '764-haptics-map-handle.json', '766-haptics-map-erase.json', '768-haptics-map-header.json', '771-haptics-container-clear.json', '772-haptics-container-destroy.json'].map(async name => JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')).structuredContent));
  const report = {method: 'Complete42b530 final-substep terrain/material/signed-speed feedback parent connected to actual407380 effect cache/create/update. Original constants initialized through vehicle-haptics tables. Explicit std::map/operator-delete and imported device virtual services; no game mocks. Two persistent calls per fixture compare exact20-byte type3/4 descriptors,library/device order and body/session/record/cache bytes. Signed record258 eligibility,packed signed terrain coordinates,threshold/fallback material averaging,signed speed/int division/f32 clamps and live body/device replacement covered. No actual hardware or original-process execution.', evidence: [...own.evidence, ...constants].map(item => item.evidence_id), instructions: own.instructions.length, fixtures, parentCalls: fixtures * 2, descriptors, creates, updates, missingDeviceFixtures: missingDevices, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleSurfaceFeedback()));
