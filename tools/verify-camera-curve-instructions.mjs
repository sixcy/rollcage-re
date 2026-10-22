import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeCameraCurveConstants, initializeCameraCurveFactorials, evaluateCameraCurvePower, evaluateCameraCurve, scaleCameraCurveTemplate} from '../src/camera-curve.mjs';

const program = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/camera-mode-listing.json', 'analysis/native-simulation/results/3518-full-camera-code-bytes.json');
const instructions = [...new Map([...program.instructions, ...listing.instructions].map(i => [i.address, i])).values()].sort((a, b) => a.address - b.address);
const baseline = program.initializeMemory(Buffer.alloc(0xa00000)), literals = Buffer.alloc(baseline.length), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(instructions);
initializeCameraCurveConstants(literals);
for (const [p, n] of [[0x570490, 10], [0x57049c, 10], [0x5704d4, 34], [0x5704a8, 34], [0x57046c, 34], [0x5eabf0, 40]]) assert.deepEqual(literals.subarray(p, p + n), baseline.subarray(p, p + n), 'Public curve constants match independent original bytes');
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x41b8b0ab, steps = 0, aliases = 0, faults = 0, prefixSteps = 0, prefix = false, prefixEnd = false;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
const reached = new Set(); machine.onInstruction = address => {if (prefix && address === 0x419bd0) {prefixEnd = true; throw Error('Selected original prefix boundary419bd0');} reached.add(address); steps++; if (prefix) prefixSteps++;};
const STACK = 0x9000, POINTS = 0x58000, fixtures = Number(process.argv[2] ?? 5000);
baseline.copy(memory); machine.reset(); memory.copy(machine.bytes); initializeCameraCurveFactorials({memory});
machine.entry = 0x419bb0; machine.r.ESP = STACK; prefix = true;
assert.throws(() => machine.run(1000), /Selected original prefix boundary419bd0/); assert(prefixEnd); prefix = false; compare('factorial prefix');
//The independently checked prefix produces the factorials consumed below.
memory.copy(baseline);
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 512, STACK + 64); machine.reset();
  const value = [0, 1, 32768, 65535, 65536, 65537, -65536, -2147483648, random()][fixture % 9], exponent = [fixture % 64, -1, 0x10000, 0x7fffffff][fixture % 4];
  memory.copy(machine.bytes); const expected = evaluateCameraCurvePower(value, exponent, {memory, scratchBase: STACK});
  machine.entry = 0x41b830; machine.r.ECX = value; machine.r.EDX = exponent; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); machine.run(10000); assert.equal(machine.r.EAX | 0, expected); compare(`${fixture}/power`);
  for (const offset of [-8, -4]) assert.equal(memory.readInt32LE(STACK + offset), machine.bytes.readInt32LE(STACK + offset), `${fixture} power numeric${offset}`);

  baseline.copy(memory); memory.fill(0x36, STACK - 512, STACK + 64);
  for (let lane = 0; lane < 15; lane++) put(memory, POINTS + lane * 4, random());
  const output = [0x59000, POINTS, POINTS + 4, POINTS + 12, 0x6f9bc0, 0x6f9bd0, STACK + 8][fixture % 7]; if (output !== 0x59000) aliases++;
  const t = [0, 1, 16384, 32768, 65535, 65536, -1, 131072, random()][fixture % 9];
  if (fixture % 19 === 0) {put(memory, 0x6f9bd0, -2147483648); put(memory, 0x6f9bc0, -1);}
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x41b8b0; machine.r.ECX = POINTS; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, output); put(machine.bytes, STACK + 8, t);
  let sourceError, nativeError;
  try {evaluateCameraCurve(POINTS, output, t, {memory, scratchBase: STACK});} catch (e) {sourceError = e;}
  try {machine.run(100000);} catch (e) {nativeError = e;}
  assert.equal(!!sourceError, !!nativeError, `${fixture} curve fault parity: native${nativeError?.message} source${sourceError?.message}`);
  if (sourceError) {assert.match(sourceError.message, /signed division (?:by zero|overflow)/); assert.match(nativeError.message, /IDIV (?:by zero|overflow)/); assert.equal(/by zero/.test(sourceError.message), /by zero/.test(nativeError.message), 'Same arithmetic fault category'); faults++;}
  compare(`${fixture}/curve${sourceError ? '/fault' : ''}`);
  for (const offset of [0x10, 0x14, 0x18, 0x1c, 0x20, 0x28, 0x2c]) assert.equal(memory.readInt32LE(STACK - 36 + offset), machine.bytes.readInt32LE(STACK - 36 + offset), `${fixture} curve numeric${offset.toString(16)}`);

  baseline.copy(memory); put(memory, 0x5ecb1c, 0x50000); memory[0x50579] = fixture & 255;
  for (let row = 0; row < 5; row++) for (const offset of [0, 2, 4]) word(memory, 0x5eabf0 + row * 8 + offset, random());
  machine.reset(); memory.copy(machine.bytes); scaleCameraCurveTemplate({memory}); machine.entry = 0x41b9f0; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); machine.run(10000); compare(`${fixture}/template`);
}
function compare(label) {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${label} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}}
const report = {method: 'Complete41b830 bounded power,41b8b0 five-point degree-four camera curve and41b9f0 mutable environment-template scaling against original retained instructions. Original4180a0 factorial producer419bb0..419bce independently executed as a prefix stopped before419bd0; this is not an invented native procedure or whole-camera proof. All mapped bytes>=10000h and defined numeric helper locals compare, including partial writes on true signed-division faults. Original mask/scale/template literals independently checked; t endpoints/outside range/overflow, signed32 powers, all256 environment bytes, output/control-point/coefficient/caller-argument aliases. No game/helper contracts or original process execution. Full4180a0 positioning and track startup remain open.', fixtures, calls: fixtures * 3, aliases, faults, factorialPrefixInstructions: prefixSteps, executedInstructions: reached.size, instructionSteps: steps, evidence: [...program.references.map(r => r.evidence), ...listing.evidence], matched: true};
await writeFile('analysis/camera-curve-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
