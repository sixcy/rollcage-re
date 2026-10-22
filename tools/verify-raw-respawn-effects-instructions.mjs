import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {emitRawRespawnParticle, emitRawVehicleRespawnRing} from '../src/raw-respawn-state.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set();
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
let instructionSteps = 0, inputAliases = 0;
machine.onInstruction = address => reached.add(address);
const compare = (memory, label) => {
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`${label} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
};
const fixtures = 256;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const f = createSimulationVehicleFixture(program, fixture, {vehicleCount: 1, vehicleFilters: false}), {memory} = f, particle = memory.readUInt32LE(0x6e65b4);
  const position = fixture % 4 === 0 ? particle + 0x9c : 0x74000, velocity = fixture % 4 === 1 ? particle + 0x94 : fixture % 4 === 2 ? particle + 0x9c : 0x74020;
  if (position !== 0x74000 || velocity !== 0x74020) inputAliases++;
  const colorMode = [-1, 0, 1, 2, -2147483648][fixture % 5], typeMode = [0, 1, -1, 2147483647][fixture % 4], stack = 0x9000 + fixture % 3 * 0x200;
  [0, -1, 10 * 65536].forEach((value, axis) => put(memory, position + axis * 4, value));
  [32768, -65537, 65536].forEach((value, axis) => put(memory, velocity + axis * 4, value));
  machine.reset(); memory.copy(machine.bytes);
  const result = emitRawRespawnParticle(position, velocity, colorMode, typeMode, {memory});
  machine.entry = 0x436920; machine.r.ESP = stack; machine.r.ECX = position; machine.r.EDX = velocity; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, colorMode); put(machine.bytes, stack + 8, typeMode);
  instructionSteps += machine.run(); compare(memory, `particle${fixture}`); assert.equal(machine.r.ECX | 0, result.registerEcx);
  const body = f.bodies[0].address, code = [-1, 0, 1, 2, 3][fixture % 5];
  const ring = emitRawVehicleRespawnRing(body, code, {memory, scratchBase: stack});
  machine.entry = 0x47d900; machine.r.ESP = stack; machine.r.ECX = body; machine.r.EDX = code; put(machine.bytes, stack, -1);
  instructionSteps += machine.run(); compare(memory, `ring${fixture}`); assert.equal(machine.r.ECX | 0, ring.registerEcx);
}
const report = {method: 'Actual436920 and47d900 into real435df0 allocator and474670 spatial lookup/registration. Every color/type branch, code2 body-byte preservation, alternate entry stacks and aliased particle position/velocity inputs are compared against retained instructions. ALLmappedbytes>=10000h compare after both calls and defined leakedECX matches; private stack excluded. Constructed scene/pool inputs, no external calls or original process execution.', targetSha256: program.sha256, fixtures, particleCalls: fixtures, ringCalls: fixtures, ringParticles: fixtures * 16, inputAliases, executedInstructions: reached.size, instructionSteps, matched: true};
await writeFile('analysis/raw-respawn-effects-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
