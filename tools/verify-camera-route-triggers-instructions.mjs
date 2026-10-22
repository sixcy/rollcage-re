import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {measureCameraLineDistance, selectCameraTrigger} from '../src/camera-route-triggers.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(baseline.length);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x41a960ab, steps = 0, accepted = 0, projections = 0, aliases = 0;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const reached = new Set(), visits = {}; machine.onInstruction = address => {reached.add(address); if ([0x417ee0, 0x417880, 0x41a960, 0x41c9c0, 0x41c910, 0x492030].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
const fixtures = Number(process.argv[2] ?? 3000), stack = 0x9000, session = 0x50000, a = 0x58000, b = 0x58100, c = 0x58200;
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, stack - 512, stack + 64);
  for (let axis = 0; axis < 3; axis++) {put(memory, a + axis * 4, fixture % 3 ? [100, 5, 0][axis] * 65536 : random()); put(memory, b + axis * 4, 0); put(memory, c + axis * 4, fixture % 4 ? (axis === fixture % 3 ? [0, 256, 512, 1024, 8191][fixture % 5] * 65536 : 0) : random());}
  const output = [0x59000, a + 4, b, c + 8, 0x91d45c, stack - 48 + 0x18, stack - 48 + 0x10][fixture % 7]; if (output !== 0x59000) aliases++;
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x41a960; machine.r.ECX = a; machine.r.EDX = b; machine.r.ESP = stack; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, c); put(machine.bytes, stack + 8, output);
  const expected = measureCameraLineDistance(a, b, c, output, {memory, scratchBase: stack}); steps += machine.run(100000); assert.equal(machine.r.EAX | 0, expected, `${fixture} projection return`); compare(fixture, 'projection');
  if (expected !== -1) projections++;
  for (const offset of [0x10, 0x14, 0x18, 0x1c, 0x20, 0x24, 0x28, 0x2c, 0x34, 0x38]) assert.equal(memory.readInt32LE(stack - 48 + offset), machine.bytes.readInt32LE(stack - 48 + offset), `${fixture} projection numeric${offset.toString(16)}`);

  baseline.copy(memory); memory.fill(0x36, stack - 512, stack + 64);
  const index = fixture % 4, camera = 0x91ff80 + index * 0x184, participants = 1 + fixture % 8, triggerCount = fixture % 7;
  put(memory, 0x5ecb1c, session); memory[session + 0x54d] = participants; memory[session + 0x552] = fixture % 3 ? 0 : 4; memory[session + 0x58c] = fixture % 3; put(memory, 0x6e6550, triggerCount);
  for (let view = 0; view < 4; view++) put(memory, 0x91ff80 + view * 0x184, (fixture + view) % 19);
  word(memory, camera + 0x32, fixture % 11 ? 60 : 59); word(memory, camera + 0x3a, fixture % 13 ? 0 : 1); put(memory, camera + 0x11c, fixture % 17 ? 0 : -540); put(memory, 0x90a548, [539, 540, 1000, -1][fixture % 4]); put(memory, camera + 0x178, fixture % 5 ? -1 : fixture % participants);
  for (let participant = 0; participant < participants; participant++) {
    const body = 0x60000 + participant * 0x1000, record = 0x909300 + participant * 0x30c; put(memory, record, body); memory[record + 0x1d] = (participant + fixture) % 7; memory[body + 0x718] = fixture % 5 ? 10 : 8;
    put(memory, body + 0x34, (100 + participant * 200) * 65536); put(memory, body + 0x38, fixture % 5 * 65536); put(memory, body + 0x3c, 0); put(memory, body + 0x68, [0, 7, 8, 9][fixture % 4] * 65536);
  }
  for (let ordinal = 0; ordinal < triggerCount; ordinal++) {
    const row = 0x91f6c0 + ordinal * 56; put(memory, row, (ordinal + fixture) % 3 === 0 ? 0 : 1);
    put(memory, row + 4, ordinal * 100 * 65536); put(memory, row + 8, 0); put(memory, row + 12, 0);
    put(memory, row + 16, (ordinal * 100 + 1024) * 65536); put(memory, row + 20, 0); put(memory, row + 24, 0);
  }
  const participantOut = 0x59000, triggerOut = fixture % 5 ? 0x59004 : participantOut;
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x417ee0; machine.r.ECX = participantOut; machine.r.EDX = triggerOut; machine.r.ESP = stack; put(machine.bytes, stack, -1); put(machine.bytes, stack + 4, index);
  const selected = selectCameraTrigger(index, participantOut, triggerOut, {memory, scratchBase: stack}); steps += machine.run(100000); assert.equal(machine.r.EAX | 0, selected, `${fixture} trigger return`); compare(fixture, 'trigger'); accepted += selected;
  for (const offset of [0x10, 0x14, 0x18, 0x1c, 0x20, 0x28]) assert.equal(memory.readInt32LE(stack - 36 + offset), machine.bytes.readInt32LE(stack - 36 + offset), `${fixture} trigger numeric${offset.toString(16)}`);
}
function compare(fixture, phase) {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${phase} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}}
const report = {method: 'Complete41a960 line projection/perpendicular distance and417ee0 authored camera-trigger selection, with actual417880/41bef0/41c910/41c990/492030/41c9c0/41ca60. All mapped bytes>=10000h, return values, defined numeric parent locals and overwritten caller arguments compare. Covers direction length/fraction/return boundaries, zero/overflow vectors, input/output/global/private-local aliases, age/unsigned clock/cooldown/mode gates, split views, finished-rank eligibility, nearest ties, velocity threshold and ordered output aliases. Trigger fixtures supply1..8 valid participant bodies; their constructors and full4180a0 positioning remain open. No game contracts or original process execution.', fixtures, calls: fixtures * 2, aliases, projections, accepted, executedInstructions: reached.size, instructionSteps: steps, visits, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-route-triggers-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
