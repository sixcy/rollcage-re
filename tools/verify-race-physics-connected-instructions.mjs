import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from './lib/post-frame-runtime-fixtures.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const baseReal = [0x4749e0, 0x42a6e0, 0x42a9a0, 0x49bbc0, 0x443d90, 0x48d680];

export async function verifyRacePhysicsConnected({fixtures = 48, frames = 6, withPostFrame = false, withPresentation = false, output = 'analysis/race-physics-connected-instruction-check.json'} = {}) {
  if (withPresentation && !withPostFrame) throw Error('Presentation chain requires the connected recovery context.');
  const real = new Set([...baseReal, ...(withPostFrame ? [0x44f050, 0x47ccc0] : []), ...(withPresentation ? [0x41d2b0, 0x414060, 0x481200, 0x494140] : [])]);
  const retained = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/vehicle-filter-listing.json', 'analysis/native-simulation/results/1454-vehicle-filter-bytes.json');
  const program = {...retained, instructions: [...retained.instructions, ...listing.instructions]}, machine = new BoundedX86(program.instructions);
  const own = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const targets = [...new Set(own.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => !real.has(address));
  assert.equal(targets.length, withPresentation ? 30 : withPostFrame ? 34 : 36);
  for (const address of targets) machine.entries.delete(address);
  let steps = 0, boundaryCalls = 0, filterCalls = 0; const reached = new Set(), visits = {};
  const watched = new Set([...real, 0x450e50, 0x42a870, 0x488910, 0x475450, 0x41e080, 0x499e90, 0x41c080, 0x436698, 0x475d96, 0x47d040, 0x47d440, 0x47d900, 0x436920]);
  let stack = 0x9000;
  machine.onInstruction = (address, m) => {
    reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;
    if (address === 0x4749e0) assert.equal(m.r.ESP, stack - 20);
    if (address === 0x41e080) {assert.equal(m.r.ESP, stack - 20 - 52); filterCalls++;}
    if ([0x488910, 0x41c080, 0x499e90].includes(address)) assert.equal(m.r.ESP, stack - 20 - 56);
    if (withPostFrame && address === 0x47ccc0) assert.equal(m.r.ESP, stack - 20);
    if (withPostFrame && address === 0x47d040) assert.equal(m.r.ESP, stack - 20 - 120);
  };
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)));
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createSimulationVehicleFixture(program, fixture, {vehicleCount: 1 + fixture % 2, interacting: fixture % 3 === 0, extraBodyStorage: withPostFrame ? [{address: 0x70f130, length: 0x3e78}] : []}), {memory, extraAddresses: a} = f;
    stack = 0x9000 + (fixture % 3) * 0x200;
    const postFrame = withPostFrame ? configurePostFrameFixture(f, fixture, stack - 20, {forcePrepass: true}) : undefined;
    put(memory, a.session + 0x57c, 4); memory[a.session + 0x586] = 3;
    put(memory, 0x714b08, 0x9d000); put(memory, 0x9d000, 0x9e000); put(memory, 0x9e05c, 0x7e0000);
    for (const [index, vehicle] of f.vehicles.entries()) {
      const body = vehicle.body.address, packet = 0x9b000 + index * 16;
      memory[body + 0x718] = 0; put(memory, body + 0x660, 0); put(memory, body + 0x724, packet); memory[packet + 1] = 0x41;
      memory[body + 0x720] = 16; memory[body + 0x721] = fixture % 32; memory[body + 0x722] = 0;
      put(memory, body + 0x690, 0); put(memory, 0x909300 + index * 0x30c + 0x25e, 0);
      if (withPresentation) for (let wheel = 0; wheel < 4; wheel++) {
        //Declared linked-object storage; actual41d2b0 publishes each pose before
        //494140 consumes the rear pair. Native41caf0 construction is separately
        //verified and is not substituted for by these fixture allocations.
        put(memory, body + 0x324 + wheel * 200 + 0x6c, 0xa1000 + index * 0x1000 + wheel * 0x200);
      }
    }
    if (f.vehicles.length === 2 && fixture % 5 === 0) {
      put(memory, f.bodies[0].address + 0x690, f.bodies[1].address); memory[f.bodies[0].address + 0x698] = 100;
    }
    machine.reset(); memory.copy(machine.bytes); machine.fpuRounding = 'nearest-even';
    const nativeLog = [], sourceLog = [], handlers = {};
    for (const address of targets) {
      handlers[`call${address.toString(16)}`] = () => {sourceLog.push(address); return 0;};
      machine.externalCalls.set(address, m => {nativeLog.push(address); m.r.EAX = 0;});
    }
    handlers.audioManagerCall = (object, method, args) => sourceLog.push([object, method, args]);
    machine.externalCalls.set(0x7e0000, m => {nativeLog.push([m.r.ECX >>> 0, 0x5c, [m.bytes.readInt32LE(m.r.ESP)]]); m.r.ESP += 4;});
    for (let frame = 0; frame < frames; frame++) {
      // External clock and digital command samples are declared frame inputs.
      for (const bytes of [memory, machine.bytes]) {
        put(bytes, 0x90a548, fixture + frame * 17);
        for (const [index, vehicle] of f.vehicles.entries()) put(bytes, vehicle.body.address + 0x710, [0x40, 0x8040, 0x2040, 0x80, 0][(fixture + frame + index) % 5]);
      }
      f.context.selectionCounter = fixture + frame * 17;
      const expected = runRaceUpdate(frame % 2, 2, {memory, scratchBase: stack, roundingMode: 'nearest-even', physics: {context: f.context, vehicles: f.vehicles}, postFrame, handlers});
      machine.entry = 0x450e50; machine.r.EDX = frame % 2; machine.r.ESP = stack; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, 2);
      try {
        steps += machine.run(4000000); assert.equal(machine.r.EAX, expected); assert.deepEqual(nativeLog, sourceLog);
        const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
        if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`race physics fixture${fixture}/frame${frame}/byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
      } catch (error) {console.error({fixture, frame, visits}); throw error;}
    }
    boundaryCalls += sourceLog.filter(value => typeof value === 'number').length;
  }
  const method = withPresentation
    ? 'Actual450e50 input/linked-controls→full4749e0 physics→44f050→47ccc0 rejection/recovery→speed/surface→41d2b0 linked-wheel poses→414060→481200 rawterrain ground projection→494140 paired wheel histories. Populated contacts, respawns, particles, collision filters and history/renderer state share one persistent address space. Every mapped byte>=10000h matches after every outer call; real nested stacks asserted. Other30 direct stages and manager service are explicit contracts; attachment traversal queue and pending-model-effect rows are empty in this corpus. Linked-object storage, scene/session/pools and input samples are declared inputs; constructor/AI/scene startup and a whole race remain unproven.'
    : withPostFrame
    ? 'Actual450e50 controls/linked-input→4749e0 fullphysics→44f050→47ccc0 prepass/route/query/placement/progression/ring/sound→443d90 speed→48d680 surface. Actual rejection comes from sector-height prepass, not injected respawn answers. One/two persistent vehicles, real terrain/pair/filter/effect calls, alternate nested stacks. Every mapped byte>=10000h matches after each race call; private stack excluded. Other34 direct stages and manager service remain explicit contracts;44f050 has an empty render-traversal queue. Clock and digital input samples and constructed scene/session/pool data remain declared inputs, not native loader or whole-game proof.'
    : 'Actual450e50→42a6e0/42a870→49bbc0→42a9a0→4749e0→443d90→48d680 connected controls/physics/speed/surface chain, including every reached physics/wheel/query/filter/effect child. One/two persistent interacting vehicles, alternate outer entry stacks, real nested frame/filter/wheel entry ESP asserted, digital/linked input changes, terrain/pair contacts and populated effect pools. ALL mapped bytes above10000h compare after every caller frame; private stack excluded. Other36 direct outer stages and manager virtual service remain explicit boundary contracts. Clock and digital command samples are declared external inputs; constructor/scene/session/device producers are synthetic inputs, not whole-tick or original-process proof.';
  const report = {method, targetSha256: program.sha256, evidence: own.evidence.map(item => item.evidence_id), fixtures, frames, parentCalls: fixtures * frames, executedInstructions: reached.size, instructionSteps: steps, filterCalls, boundaryCalls, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRacePhysicsConnected()));
