import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {chooseCameraMode, findNearestCameraParticipant, initializeCameraPolicyConstants} from '../src/camera-mode-policy.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000));
const initialized = Buffer.alloc(baseline.length); initializeCameraPolicyConstants(initialized);
assert.deepEqual(initialized.subarray(0x570500, 0x570540), baseline.subarray(0x570500, 0x570540), 'Public camera constants match independent original byte evidence');
const machine = new BoundedX86(program.instructions), memory = Buffer.alloc(baseline.length), reached = new Set(), histogram = {};
let seed = 0x41a170ab, steps = 0, lengthCalls = 0, aliases = 0, fallback = 0;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
machine.onInstruction = address => {reached.add(address); if (address === 0x41c9c0) lengthCalls++; if (address === 0x41a43a) fallback++;};
const fixtures = Number(process.argv[2] ?? 4000), stack = 0x9000, session = 0x50000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); const index = fixture % 4, camera = 0x91ff80 + index * 0x184, count = 1 + fixture % 8;
  put(memory, 0x5ecb1c, session); memory[session + 0x54d] = count; memory[session + 0x552] = fixture % 3 ? 0 : 4; memory[session + 0x58c] = fixture % 3;
  put(memory, 0x5ec958, random() || 1); put(memory, camera, fixture % 18); put(memory, camera + 0x178, fixture % 5 ? -1 : fixture % count);
  word(memory, camera + 0x3a, [-1, 0, 1, 32767][fixture % 4]); put(memory, 0x5ec120 + index * 4, fixture % count);
  put(memory, 0x91ce90, random()); for (const p of [0x849482, 0x8494d6, 0x84952a, 0x84957e]) put(memory, p, random());
  for (let participant = 0; participant < 8; participant++) {
    const body = 0xa0000 + participant * 0x1000; put(memory, 0x909300 + participant * 0x30c, body); memory[0x90931d + participant * 0x30c] = (fixture + participant) % 8;
    memory[body + 0x718] = (fixture + participant) % 3 ? 10 : 8; memory[body + 0x64f] = (fixture + participant) % 3; word(memory, body + 0xcc, [-1, 0, 1][(fixture + participant) % 3]);
    for (let axis = 0; axis < 3; axis++) {
      put(memory, body + 0x34 + axis * 4, fixture % 4 ? (participant * 3 + axis) << 18 : random());
      put(memory, body + 0x68 + axis * 4, [0, 0x1ffff, 0x20000, 0x400000, 0x7fffffff, -2147483648, random()][(fixture + participant + axis) % 7]);
    }
  }
  if (fixture % 17 === 0) {
    //A real input vector shares the root's diagnostic globals. This changes
    //later policy reads only through the actual reached arithmetic producer.
    put(memory, 0x909300, 0x91d45c - 0x68); aliases++;
  }
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x41a170; machine.r.EDX = index; machine.r.ESP = stack; put(machine.bytes, stack, -1);
  chooseCameraMode(index, {memory, scratchBase: stack}); steps += machine.run(100000);
  compare(fixture, 'policy');
  const frame = stack - 60;
  for (let offset = 0x10; offset <= 0x38; offset += 4) assert.equal(memory.readInt32LE(frame + offset), machine.bytes.readInt32LE(frame + offset), `${fixture} numeric local${offset.toString(16)}`);
  histogram[memory.readInt32LE(camera)] = (histogram[memory.readInt32LE(camera)] ?? 0) + 1;

  //Separate nearest-point domain includes zero participants, ties, output
  //aliasing input/world data and all signed32 coordinate wrap boundaries.
  baseline.copy(memory); put(memory, 0x5ecb1c, session); memory[session + 0x54d] = fixture % 9;
  const point = 0x58000, output = fixture % 5 === 0 ? point : fixture % 5 === 1 ? 0xa0034 : 0x59000;
  for (let axis = 0; axis < 3; axis++) put(memory, point + axis * 4, random());
  for (let participant = 0; participant < 8; participant++) {
    const body = 0xa0000 + participant * 0x1000; put(memory, 0x909300 + participant * 0x30c, body);
    for (let axis = 0; axis < 3; axis++) put(memory, body + 0x34 + axis * 4, fixture % 4 ? random() : memory.readInt32LE(point + axis * 4));
  }
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x417880; machine.r.ECX = point; machine.r.EDX = output; machine.r.ESP = stack; put(machine.bytes, stack, -1);
  findNearestCameraParticipant(point, output, {memory, scratchBase: stack}); steps += machine.run(10000); compare(fixture, 'nearest');
  for (const offset of [-24, -20, -16, -12, -8, -4]) assert.equal(memory.readInt32LE(stack + offset), machine.bytes.readInt32LE(stack + offset), `${fixture} nearest numeric local${offset}`);
}
function compare(fixture, phase) {
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${phase} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
}
const report = {method: 'Actual41a170 complete random camera mode/participant policy plus417880 nearest participant, using actual41c9c0/41ca60 and original570500/switch tables. All mapped bytes>=10000h plus every policy numeric local and defined nearest numeric local compare. Persistent shared RNG, six-attempt fallback, signed cooldown/orientation, nearby participants, finish ranking/ties, mode durations, mode14 cleanup, wrapped coordinates and root-global/output aliases. Finite domain:1..8 participants for random selection with nonzero starting RNG; nearest includes0. Original seed0/absent-participant nontermination is not replaced by a fallback. No game contracts or original process execution. Full4180a0 and world constructors remain open.', fixtures, calls: fixtures * 2, lengthCalls, fallback, aliases, histogram, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-mode-policy-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
