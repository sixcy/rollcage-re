import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructCameraController, initializeCameraConstructionConstants} from '../src/camera-construction.mjs';
import {updateAuxiliaryAnimationControls} from '../src/vehicle-auxiliary-animation.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000));
const literals = Buffer.alloc(baseline.length); initializeCameraConstructionConstants(literals);
for (const [address, size] of [[0x5eaa40, 132], [0x5eac20, 20], [0x5704cc, 8], [0x570464, 8]]) assert.deepEqual(literals.subarray(address, address + size), baseline.subarray(address, address + size), 'Public camera constants independently match original bytes');
const machine = new BoundedX86(program.instructions), memory = Buffer.alloc(baseline.length), reached = new Set(), visits = {};
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x416180ab, steps = 0, constructors = 0, controls = 0, clears = 0;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const STACK = 0x9000, SESSION = 0x50000, CFG = 0x52000, SPAWNS = 0x30000, ROWS = 0x40000, MAP = 0x43000, BUCKET = 0x45000;
machine.onInstruction = address => {reached.add(address); if ([0x416180, 0x416da0, 0x4798d0, 0x428270, 0x474600].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.externalCalls.set(0x568a50, m => {const p = m.bytes.readUInt32LE(m.r.ESP), value = m.bytes[m.r.ESP + 4], size = m.bytes.readUInt32LE(m.r.ESP + 8); assert.equal(p, 0x91ff80); assert.equal(value, 0); assert.equal(size, 0x610); m.bytes.fill(value, p, p + size); m.r.EAX = p; clears++;});
const fixtures = Number(process.argv[2] ?? 600);
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 0x1000, STACK + 128);
  put(memory, 0x5ecb1c, SESSION); put(memory, 0x5ecefc, CFG); put(memory, 0x909288, SPAWNS); put(memory, 0x902eec, 0x100000); put(memory, 0x70dcf4, 0x60000 + fixture % 4);
  memory[SESSION + 0x551] = fixture % 12; memory[SESSION + 0x58c] = fixture % 3; memory[CFG + 0x84] = fixture % 8; put(memory, 0x91ce90, random());
  for (let index = 0; index < 4; index++) memory[SESSION + 0xa90 + index] = random() & 255;
  put(memory, 0x909254, ROWS); put(memory, 0x909278, BUCKET);
  for (let row = 0; row < 256; row++) {word(memory, ROWS + row * 16, 0xff00); word(memory, ROWS + row * 16 + 2, 255); put(memory, ROWS + row * 16 + 12, MAP); word(memory, MAP + row * 2, 0);}
  put(memory, 0x91e79c, 0x180000); put(memory, 0x91e780, 0x190000); put(memory, 0x91e78c, 0x190100); put(memory, 0x91e790, 0x190200); put(memory, 0x91e794, 255); put(memory, 0x91e784, -1); put(memory, 0x91e798, 0); put(memory, 0x902bc0, 0x1a0000); word(memory, 0x902bc4, 0);
  memory.fill(0x69, 0x180000, 0x180000 + 256 * 72); for (let id = 0; id < 256; id++) memory[0x190000 + id] = id;
  for (let index = 0; index < 8; index++) for (let axis = 0; axis < 3; axis++) word(memory, SPAWNS + index * 8 + axis * 2, random());
  if (fixture % 7 === 0) for (let index = 0; index < 4; index++) {word(memory, 0x5704cc + index * 2, [-32768, -3, 32767, -1][index]); word(memory, 0x570464 + index * 2, [32767, -1, -32768, -3][index]);}
  machine.reset(); memory.copy(machine.bytes);
  for (let turn = 0; turn < 4; turn++) {
    const index = (fixture + turn) % 8, control = 0x909060 + turn * 76, trackedBody = 0x210000 + turn * 0x1000;
    //The native reset is intentionally repeated after a previous view acquired
    //state, verifying the constructor's actual destructive startup ordering.
    put(memory, 0x91ff80, turn); put(machine.bytes, 0x91ff80, turn);
    constructCameraController(index, trackedBody, control, {memory, scratchBase: STACK});
    machine.entry = 0x416180; machine.r.ECX = index; machine.r.EDX = trackedBody; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, control);
    steps += machine.run(200000); constructors++; compare(`${fixture}/constructor${turn}`);
    //Actual416da0 consumes the real preference/target/transition fields just
    //constructed. Input mirrors bind the first two native participant records.
    if (turn < 2) {put(memory, 0x909318 + turn * 0x30c, control); put(machine.bytes, 0x909318 + turn * 0x30c, control);}
    const ticks = fixture < 24 ? 120 : 1;
    for (let tick = 0; tick < ticks; tick++) {
      const view = tick % 7 === 0 ? 14 : tick % 17; put(memory, 0x91ff80, view); put(machine.bytes, 0x91ff80, view);
      const edges = tick % 4, held = [0, 0x10000, 0x20000, 0x4000, 0x34000][(fixture + tick) % 5];
      updateAuxiliaryAnimationControls(control, edges, held, {memory, scratchBase: STACK});
      machine.entry = 0x416da0; machine.r.ECX = control; machine.r.EDX = edges; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, held); steps += machine.run(10000); controls++; compare(`${fixture}/${turn}/controls${tick}`);
    }
  }
}
function compare(label) {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${label} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}}
const report = {method: 'Complete416180 camera physical-body/controller constructor with actual4798d0 derived/math/spatial and428270 shape/free-active-reverse/physical registration. Four persistent constructors per supplied scene, followed by actual416da0 controls/HUD preferences; first24scenes120updates/controller. Original configuration/shape/offset tables independently compared against public initializer, signed spawn extremes, arena low-bit alignment, signed preference/half-short tables, every constructor resetting all four view rows and input mirrors. All mapped bytes>=10000h compare. Only true CRT memset and compiler cookie are services. Valid explicit pool/spatial/storage domain; race-session/track loader and full4180a0 positioning remain separate open scopes. No original process execution.', fixtures, constructors, controls, clears, executedInstructions: reached.size, instructionSteps: steps, visits, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-construction-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
