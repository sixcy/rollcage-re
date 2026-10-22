import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from './lib/post-frame-runtime-fixtures.mjs';
import {runRawPostFrameBodyStates} from '../src/raw-respawn-state.mjs';

const put = (memory, p, value) => memory.writeInt32LE(value | 0, p);
export async function verifyRawRespawnState({fixtures = 96, frames = 3, output = 'analysis/raw-respawn-state-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), calls = {};
  const watched = new Set([0x47ccc0, 0x47e180, 0x47d040, 0x47d710, 0x47d440, 0x47d900, 0x436920, 0x435df0, 0x474670, 0x424ff0, 0x423ab0, 0x484bb0, 0x44a2e0, 0x417210, 0x449760, 0x4284d0, 0x474850, 0x46a2d0]);
  let instructionSteps = 0, respawns = 0, retirements = 0, stack;
  machine.onInstruction = (address, m) => {
    reached.add(address); if (watched.has(address)) calls[address.toString(16)] = (calls[address.toString(16)] ?? 0) + 1;
    if (address === 0x47d040) assert.equal(m.r.ESP, stack - 120);
    if (address === 0x47d440) assert.equal(m.r.ESP, stack - 124);
    if (address === 0x47d900) assert.equal(m.r.ESP, stack - 104);
  };
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const count = 1 + (fixture >> 2) % 2, vehicle = fixture % 4 !== 0;
    const f = createSimulationVehicleFixture(program, fixture, {vehicleCount: count, models: fixture % 3 === 0, vehicleFilters: false, extraBodyStorage: [{address: 0x70f130, length: 0x3e78}]}), {memory, views} = f;
    stack = 0x9000 + fixture % 3 * 0x200;
    const runtime = configurePostFrameFixture(f, fixture, stack, {ordinary: !vehicle});
    if (!vehicle && [0, 12].includes(fixture % 16)) for (const [index, body] of f.bodies.entries()) {
      put(memory, body.address, getType(memory, body.address, index % 2 ? 21 : 7));
      const controller = memory.readUInt32LE(body.address + 0x164); memory[controller + 5] = index; memory[controller + 4] = 1; memory[0x849940 + index] = 1;
    }
    if (!vehicle && fixture % 16 === 4) for (const body of f.bodies) put(memory, body.address, getType(memory, body.address, 4));
    if (!vehicle && fixture % 16 === 8) for (const body of f.bodies) put(memory, body.address, getType(memory, body.address, 33));
    machine.reset(); memory.copy(machine.bytes); machine.fpuRounding = 'nearest-even';
    for (let frame = 0; frame < frames; frame++) {
      for (const bytes of [memory, machine.bytes]) {
        put(bytes, 0x90a548, fixture * 100 + frame * 16);
        for (const body of f.bodies) put(bytes, body.address + 0x128, 32);
      }
      const result = runRawPostFrameBodyStates(runtime); respawns += result.respawnedBodies; retirements += result.retiredBodies;
      machine.entry = 0x47ccc0; machine.r.ESP = stack; put(machine.bytes, stack, -1);
      try {
        instructionSteps += machine.run(4000000);
        const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
        if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`post-frame${fixture}/${frame} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
      } catch (error) {console.error({fixture, frame, calls}); throw error;}
    }
  }
  const report = {method: 'Whole47ccc0 with actual47e180 prepass, stored-route nearest/second selection,41e3f0 orientation,47d040/47d710 obstruction with raw geometry children,47d440 placement,47d900/436920 particle ring, spatial pools and484bb0 sound dispatch. Persistent one/two ordinary/vehicle bodies; session modes0/3/8, actual44a2e0/checkpoint417210 basis/449760 completion. All mapped bytes>=10000h compared after every call, private stack excluded. Security cookie is the only admitted service. Scene, routes, registry and effects are constructed input state. Includes actual type7/21 and inactive-type33 physical retirement and type4 early-stop/controller writes; active-type33 effects have separate retirement checks. Not original-process or whole-race proof.', targetSha256: program.sha256, fixtures, frames, parentCalls: fixtures * frames, respawns, retirements, executedInstructions: reached.size, instructionSteps, actualCalls: calls, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
function getType(memory, body, type) {return memory.readInt32LE(body) & ~511 | type;}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRawRespawnState()));
