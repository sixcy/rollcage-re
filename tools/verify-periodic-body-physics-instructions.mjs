import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {initializePeriodicBody, createPeriodicBodyCollisionFilter} from '../src/periodic-body-spawn.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
import {removeBodySpatial} from '../src/body-retirement.mjs';
import {registerRawBodySpatial} from '../src/raw-body-construction.mjs';

const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const retained = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/periodic-body-contact-listing.json', 'analysis/native-simulation/results/2418-spawn-contact-callback-bytes.json');
const program = {...retained, instructions: [...retained.instructions, ...listing.instructions]}, machine = new BoundedX86(program.instructions);
const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
const contracts = [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(p => ![0x4749e0, 0x469fd0].includes(p));
for (const address of contracts) machine.entries.delete(address);
const fixtures = Number(process.argv[2] ?? 24), frames = 80, reached = new Set(), visits = {};
let instructionSteps = 0, retirements = 0, callbacks = 0, contacts = 0, stageStack;
machine.onInstruction = (address, m) => {
  reached.add(address);
  if ([0x469ec0, 0x450e50, 0x469fd0, 0x4749e0, 0x46a140, 0x46a2c0, 0x46a2d0, 0x474b20, 0x424ff0, 0x435f20].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
  if (address === 0x46a2c0) {assert.equal(m.r.ESP, stageStack - 52); callbacks++;}
  if (address === 0x46a2d0) retirements++;
  if (address === 0x474bb0) contacts++;
};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
for (const address of contracts) machine.externalCalls.set(address, m => {m.r.EAX = 0;});
machine.externalCalls.set(0x7e0000, m => {m.r.ESP += 4; m.r.EAX = 0;});
for (let fixture = 0; fixture < fixtures; fixture++) {
  let filter;
  const f = createSimulationVehicleFixture(program, fixture, {vehicleCount: 0, vehicleFilters: false, effects: false, extraBodyStorage: [{address: 0x690000, length: 0x4000}], additionalCollisionFilters: new Map([[0x46a2c0, (...args) => filter(...args)]])});
  const {memory} = f, stack = 0x9000 + fixture % 3 * 0x200;
  f.context.handlers = {...f.context.handlers, removeSpatial: body => removeBodySpatial(body.address, {memory}), insertSpatial: body => registerRawBodySpatial(body.address, {memory})};
  const runtime = {memory, scratchBase: stack}, filterRuntime = {memory, scratchBase: stack - 72};
  filter = createPeriodicBodyCollisionFilter(filterRuntime); f.context.nativeCollisionFilterRuntimes.push(filterRuntime);
  put(memory, 0x70dcf4, 0x680000); memory[f.extraAddresses.session + 0x554] = 1;
  put(memory, 0x9153c4, f.extraAddresses.particles); put(memory, 0x9153d4, f.extraAddresses.particles); put(memory, 0x91900c, f.extraAddresses.particles + 128 * 256);
  put(memory, 0x909300, 0x10000); put(memory, 0x10034, 0); put(memory, 0x10038, -(fixture % 3) * 65536); put(memory, 0x1003c, 0); word(memory, 0x100c8, 128); word(memory, 0x100d4, 128);
  put(memory, f.extraAddresses.session + 0x57c, 4); put(memory, 0x714b08, 0x9d000); put(memory, 0x9d000, 0x9e000); put(memory, 0x9e05c, 0x7e0000);
  put(memory, 0x5ec954, 0); put(memory, 0x6e6af8, 0);
  const handlers = Object.fromEntries(contracts.map(address => [`call${address.toString(16)}`, () => 0])); handlers.audioManagerCall = () => 0;
  machine.reset(); memory.copy(machine.bytes); stageStack = stack - 20;
  const compare = label => {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${label} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}};
  initializePeriodicBody(runtime); machine.entry = 0x469ec0; machine.r.ESP = stack; put(machine.bytes, stack, -1); instructionSteps += machine.run(); compare('constructor');
  for (let frame = 0; frame < frames; frame++) {
    //Clock samples are declared inputs; frame0 reaches the actual random spawn.
    for (const m of [memory, machine.bytes]) put(m, 0x90a548, 601 + frame);
    const result = runRaceUpdate(0, 1, {...runtime, physics: {context: f.context, vehicles: []}, handlers});
    machine.entry = 0x450e50; machine.r.ESP = stack; machine.r.EDX = 0; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, 1);
    try {instructionSteps += machine.run(4_000_000); assert.equal(machine.r.EAX, result); compare(`frame${frame}`);} catch (error) {console.error({fixture, frame, visits}); throw error;}
  }
  assert.equal(memory.readInt32LE(0x903514), 0, `body retired${fixture}`);
}
assert(callbacks > 0, JSON.stringify({visits, contacts, retirements})); assert.equal(retirements, callbacks);
const report = {method: 'Actual469ec0 construction ->450e50 physics-before469fd0 ordering ->random spawn ->persistent full4749e0 falling-body physics ->actual46a2c0 terrain-contact retirement. All physics/game descendants execute;40 other outer stages and audio-manager library service are declared contracts. Full mapped bytes>=10000h compare after each frame; native callback entry stack is checked. Scene and backing pools are constructed inputs. Only compiler cookie within physics is external. No original-process execution or whole-race proof.', targetSha256: program.sha256, fixtures, frames, frameCalls: fixtures * frames, otherOuterContracts: contracts.length, callbacks, retirements, contacts, reachedInstructions: reached.size, instructionSteps, visits, evidence: [...retained.references.map(r => r.evidence), ...listing.evidence], matched: true};
await writeFile('analysis/periodic-body-physics-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
