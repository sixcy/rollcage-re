import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createPlacedModelEffectFixture} from './verify-placed-model-effect-update-instructions.mjs';
import {updateTerrainPointAnimation} from '../src/terrain-point-animation.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {};
let steps = 0, debris = 0, particles = 0, aliases = 0, seed = 0x44a7a0ab;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
machine.onInstruction = address => {reached.add(address); if ([0x44a7a0, 0x4286e0, 0x435df0, 0x4748d0].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x44aa42) debris++; if (address === 0x44ab4c) particles++;};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
const fixtures = Number(process.argv[2] ?? 600), ticks = 4;
for (let fixture = 0; fixture < fixtures; fixture++) {
  const f = createPlacedModelEffectFixture(program, fixture), {memory} = f, rows = 0x6a0000, vertices = 0x6b0000, ranges = 0x6c0000, count = [0, 1, 8, 255, 256, 512][fixture % 6], stack = 0x9000 + fixture % 3 * 0x200;
  const pack = memory.readUInt32LE(0x90b990); memory[pack + 0xfc] = fixture % 19 ? 1 : 0; put(memory, 0x90b994, rows); put(memory, 0x90b998, count); put(memory, pack + 0x118, ranges); memory[pack + 0x11c] = fixture % 9;
  put(memory, 0x80f210, [0, 1, 63, 64, 65, -1][fixture % 6]); put(memory, 0x5ec958, [0, 1, -1, 0x7fffffff, random()][fixture % 5]); put(memory, 0x919140, random());
  for (let index = 0; index < 512; index++) {
    const row = rows + index * 24, target = fixture % 13 === 0 && index < 4 ? row + 4 : fixture % 13 === 1 && index < 4 ? 0x5ed030 + index * 16 : vertices + index * 8;
    if (target < vertices) aliases++;
    put(memory, row, target); for (let lane = 0; lane < 3; lane++) word(memory, row + 4 + lane * 2, random());
    word(memory, row + 16, [-32768, -1, 0, 41, 42, 63, 85, 127, 32767][(fixture + index) % 9]); word(memory, row + 18, random()); memory[row + 20] = [0, 1, 2, 3, 255][index % 5]; memory[row + 21] = [0, 1, 12, 32, 255][fixture % 5];
    if (target >= vertices) {word(memory, target, index % 10); word(memory, target + 2, -8); word(memory, target + 4, index % 10); word(memory, target + 6, random());}
  }
  for (let i = 0; i < 8; i++) {word(memory, ranges + i * 8, i % 3); word(memory, ranges + i * 8 + 2, i % 3 + 1); memory[ranges + i * 8 + 4] = i % 2;}
  if (fixture % 7 === 0) put(memory, 0x902b8c, -1);
  machine.reset(); memory.copy(machine.bytes);
  for (let tick = 0; tick < ticks; tick++) {
    updateTerrainPointAnimation({memory, scratchBase: stack}); machine.entry = 0x44a7a0; machine.r.ESP = stack; put(machine.bytes, stack, -1);
    steps += machine.run(2_000_000);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${tick} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  }
}
const report = {method: 'Complete44a7a0 mutable24-byte terrain-point rows, dirty ranges, RNG debris/free-active queues and actual435df0 particle allocation/spatial registration. All mapped bytes>=10000h compare after persistent calls; signed phase wrap/thresholds, all four speed modes, masked amplitude shifts, table/row-target aliases, pool exhaustion/reuse, dirty cap/duplicate and count0..512 domains. Only compiler cookie external. Upstream row constructor is a separate ongoing scope; input scene/pool/row storage is explicit, not supplied game answers. No original process execution.', fixtures, ticks, calls: fixtures * ticks, aliases, debris, particles, executedInstructions: reached.size, instructionSteps: steps, visits, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/terrain-point-animation-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
