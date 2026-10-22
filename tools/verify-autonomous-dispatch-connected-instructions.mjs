import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createConnectedPlannerFixture, loadConnectedPlannerInstructionSet} from './verify-autonomous-route-planner-connected-instructions.mjs';
import {runAutonomousDispatch, initializeAutonomousDispatchTables} from '../src/autonomous-dispatch.mjs';
import {updateAutonomousRouteControl} from '../src/autonomous-route-control.mjs';
import {updateVehicleInputBlock, updateVehicleControlState, updateVehicleMotionState} from '../src/vehicle-control-state.mjs';
import skillTable from '../src/finish-skill-tables.json' with {type: 'json'};
import sqrtTable from '../src/sqrt-table.json' with {type: 'json'};

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export function createConnectedDispatchFixture(fixture) {
  const context = createConnectedPlannerFixture(fixture), {memory, body} = context, record = 0x909300;
  initializeAutonomousDispatchTables(memory);
  Buffer.from(skillTable.hex, 'hex').copy(memory, 0x570680); sqrtTable.values.forEach((value, index) => word(memory, 0x5eb290 + index * 2, value));
  const modes = [0, 0, 0x20, 0x40, 0x80, 0x100, 0x200, 1, 2, 0x80, 0x100, 0x200], mode = modes[fixture % modes.length];
  const timer = [0, 19, 20, 29, 30, 59, 60, 119, 120, 121, 65535][Math.floor(fixture / modes.length) % 11];
  word(memory, body + 0x6c4, mode); word(memory, body + 0x6c6, timer); memory[body + 0x6d9] = fixture % 6;
  memory[body + 0x6e8] = [0, 119, 120, 149, 150, 255][fixture % 6]; memory[body + 0x6e9] = fixture % 4 ? 0 : 30;
  let clock = [0, 120, 240, 349, 350, 377, 378, 480, 0x7fffffff, 0xfffffffe][Math.floor(fixture / 12) % 10];
  if (fixture % 24 === 1) clock = 481;
  memory.writeUInt32LE(clock, 0x90a548); memory.writeUInt32LE(fixture % 3 ? (clock - 1) >>> 0 : clock, 0x6e6510);
  const session = memory.readUInt32LE(0x5ecb1c); put(memory, session + 0x57c, [2, 4, 6][fixture % 3]); put(memory, session + 0x580, [59, 150, 300, 1000][fixture % 4]);
  memory[session + 0x551] = fixture % 5 === 0 ? 4 : 0;
  //A shared-frame type2 event can be disabled after its actual five-point walk.
  const events = memory.readUInt32LE(memory.readUInt32LE(0x90b990) + 0xf8), event = events + 24;
  word(memory, event, 2); word(memory, event + 2, 10); memory[event + 4] = 2; memory[event + 5] = 1;
  memory[memory.readUInt32LE(0x90b990) + 0xf6] = 4;
  memory[body + 0x68c] = [-1, 0, 1, 2, 3, 4, 5, 6, 7][fixture % 9] & 255; memory[body + 0x68d] = [-1, 7, 6, 5, 4, 3, 2, 1, 0][fixture % 9] & 255;
  word(memory, body + 0x6e4, [0, 49, 100, 32767][fixture % 4]); word(memory, body + 0x6e6, [0, 50, 101, 32767][fixture % 4]);
  word(memory, record + 0x6a, 1 + fixture % 2); put(memory, record + 0x7c, 4); put(memory, record + 0x74, 0xb8000); put(memory, record + 0x5c, 900 * 65536); put(memory, record + 0x60, 0); put(memory, record + 0x64, 300 * 65536);
  for (let index = 0; index < 24; index++) put(memory, 0x9034a0 + index * 4, 0x60000 + (6 + index) * 0x400);
  memory[body + 0x718] = 8; put(memory, body + 0x660, 0); put(memory, body + 0x724, 0); memory[body + 0x708] = 128; memory[body + 0x720] = 16; word(memory, record + 0x25e, 0);
  if (fixture % 24 === 1) {
    word(memory, body + 0x6c4, 0); memory[body + 0x6d9] = 5; memory[body + 0x68c] = 2; memory[body + 0x68d] = 7; word(memory, body + 0x6e4, 20); word(memory, body + 0x6e6, 21);
    memory[record + 0x249] = 0; put(memory, session + 0x57c, 4); put(memory, session + 0x580, 1000);
  }
  return {...context, mode, timer, initialClock: clock};
}

export function stepConnectedDispatch(context, tick) {
  const {memory, body, scratchBase, initialClock} = context;
  memory.writeUInt32LE((initialClock + tick) >>> 0, 0x90a548);
  put(memory, body + 0x70c, memory.readInt32LE(body + 0x710));
  runAutonomousDispatch(body, {memory, scratchBase});
  updateAutonomousRouteControl(body, {memory, scratchBase});
  updateVehicleInputBlock(body, 0, {memory, scratchBase});
  updateVehicleControlState(body, {memory});
  updateVehicleMotionState(0x909300, {memory});
}

export async function verifyConnectedDispatch({fixtures = 240, ticks = 12, output = 'analysis/autonomous-dispatch-connected-instruction-check.json'} = {}) {
  const base = await loadConnectedPlannerInstructionSet(), directory = 'analysis/native-simulation/results', filenames = await readdir(directory);
  const ids = [301, 204, 252, 254, 256, 258, 265, 267, 320, 321, 322, 323, 341, 342, 343, 380, 382, 384, 386, 388, 390, 392, 394, 396, 398, 400, 402, 420, 422, 424, 426, 428, 430, 432, 436, 438, 442, 203, 209, 210, 215, 216, 218, 220, 221, 222, 223, 224, 226, 227, 229, 230, 232, 234, 236, 238, 239, 241, 273, 277, 279, 293, 128];
  const names = ids.map(id => {const name = filenames.find(name => name.startsWith(`${id}-`) && name.endsWith('-assembly.json')); if (!name) throw Error(`Missing dispatch connected dependency${id}`); return name;});
  const own = await readInstructionEvidence(names, {directory}), math = await readInstructionEvidence(['221-fixed-sqrt-assembly.json']);
  const byAddress = new Map();
  for (const instruction of [...base.instructions, ...own.instructions, ...math.instructions]) {const prior = byAddress.get(instruction.address); if (prior) assert.deepEqual(instruction, prior, `conflicting retained0x${instruction.address.toString(16)}`); else byAddress.set(instruction.address, instruction);}
  const tableNames = ['250-autonomous-dispatch-switches.json', '259-autonomous-mode40-switch.json', '263-autonomous-start-timer-switch.json', '260-autonomous-start-probabilities.json', '268-autonomous-pickup-use-shifts.json', '403-profile-countdown-switch.json', '404-profile-tier-switch.json', '405-profile-bit200-switch.json', '406-profile-proximity-switch.json', '407-profile-thresholds.json', '433-autonomous-weapon-dispatch-tables.json', '439-autonomous-weapon-item00-rng-switch.json', '440-autonomous-weapon-item07-rng-switch.json', '434-autonomous-weapon-threshold-tables.json', '129-lap-time-digit-switch.json'];
  const extraTables = await Promise.all(tableNames.map(async name => {const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8')); return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);}));
  const tables = [...base.tables, ...extraTables], instructions = [...byAddress.values()].sort((first, second) => first.address - second.address), machine = new BoundedX86(instructions);
  const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8')), skill = JSON.parse(await readFile('src/finish-skill-tables.json', 'utf8'));
  const visits = new Map(), modeCounts = {}, controls = {throttle: 0, brake: 0, steering: 0, firstSlot: 0, secondSlot: 0}, specialTargets = Array(6).fill(0);
  const watched = new Set([0x410220, 0x41f900, 0x4355c0, 0x421430, 0x4103f0, 0x47fc20, 0x47ff20, 0x41f0d0, 0x47ffb0, 0x4311e0, 0x430930, 0x430970, 0x430ae0, 0x410780, 0x410f80, 0x411340, 0x410930, 0x411ba0, 0x410c90, 0x431750, 0x431520, 0x430fc0, 0x42a6e0, 0x42a870, 0x42a9a0, 0x443d90]);
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  let steps = 0, compilerCookieChecks = 0, sharedEventDisables = 0, rngChanges = 0;
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890), 'compiler cookie'); compilerCookieChecks++;}); machine.externalCalls.set(0x5684da, () => {throw Error('Compiler range failure reached');});
  const execute = (entry, ecx, edx = 0) => {machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000); machine.entry = entry; steps += machine.run(2_000_000);};
  const ranges = [[0x10000, 0x18000], [0x30000, 0x20000], [0x50000, 0x70000], [0x909300, 6 * 0x30c], [0x91f1c0, 0x4e0], [0x6fb3a0, 160], [0x6e650e, 18], [0x920b40, 0x500], [0x7136d0, 128], [0x80df20, 104], [0x6e6cc0, 8], [0x5ea4d4, 8], [0x570680, 113], [0x91d45c, 8]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const context = createConnectedDispatchFixture(fixture), {memory, body, initialClock} = context;
    Buffer.from(skill.hex, 'hex').copy(memory, 0x570680); sqrt.values.forEach((value, index) => word(memory, 0x5eb290 + index * 2, value));
    for (const table of tables) Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(memory, Number(table.normalized_result.address));
    machine.reset(); memory.copy(machine.bytes); const initialSeed = memory.readInt32LE(0x5ea4d4), event = memory.readUInt32LE(memory.readUInt32LE(0x90b990) + 0xf8) + 24;
    for (let tick = 0; tick < ticks; tick++) {
      const previousMode = memory.readUInt16LE(body + 0x6c4) & 0x3ff; modeCounts[previousMode] = (modeCounts[previousMode] ?? 0) + 1;
      stepConnectedDispatch(context, tick);
      machine.bytes.writeUInt32LE((initialClock + tick) >>> 0, 0x90a548); put(machine.bytes, body + 0x70c, machine.bytes.readInt32LE(body + 0x710));
      try {
        execute(0x410220, body); execute(0x431750, body); execute(0x42a6e0, body, 0); execute(0x42a9a0, body); execute(0x443d90, 0x909300);
        for (const [address, length] of ranges) {
          const actual = machine.bytes.subarray(address, address + length), expected = memory.subarray(address, address + length);
          if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`fixture${fixture}/tick${tick}/mode${previousMode.toString(16)}:0x${(address + offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
        }
      } catch (error) {console.error({fixture, tick, initialMode: context.mode.toString(16), previousMode: previousMode.toString(16), initialTimer: context.timer, initialClock}); throw error;}
      const bits = memory.readUInt32LE(body + 0x710); if (bits & 64) controls.throttle++; if (bits & 128) controls.brake++; if (bits & 0xa000) controls.steering++; if (bits & 4) controls.firstSlot++; if (bits & 8) controls.secondSlot++;
      specialTargets[memory[body + 0x6c9]]++;
    }
    if (memory[event + 5] === 0) sharedEventDisables++; if (memory.readInt32LE(0x5ea4d4) !== initialSeed) rngChanges++;
  }
  const report = {method: 'Complete410220 with actual scheduled41f900,shared4355c0,recovery/connectivity/modes,421430 full planner and4103f0 full weapon policy. Persistent synthetic producer memory runs sequential dispatcher ticks followed by actual431750 route control,42a6e0 autonomous digital input,42a9a0 handling and443d90 next-tick speed/timers. No mocked game calls; only compiler cookie/range service admitted. Positions/velocities/routes/registration/device-free input setup are explicit fixture inputs; no physics or constructor claim. Compares full body/session/record/model/source/candidate/nearby/forecast/graph/RNG and handling-table storage after every tick.', evidence: [...base.own.evidence, ...base.math.evidence, ...own.evidence, ...math.evidence, ...tables].map(item => item.evidence_id), instructions: instructions.length, fixtures, ticksPerFixture: ticks, dispatcherTicks: fixtures * ticks, totalOuterCalls: fixtures * ticks * 5, instructionSteps: steps, compilerCookieChecks, sharedEventDisables, rngChanges, modeCounts, controls, specialTargets, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyConnectedDispatch()));

