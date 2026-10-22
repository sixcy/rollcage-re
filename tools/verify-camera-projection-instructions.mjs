import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import constants from '../src/camera-projection-constants.json' with {type: 'json'};
import {initializeCameraProjectionConstants, updateCameraProjectionRatios, updateCameraClipPlanes, updateCameraProjection, updateCameraAspectProjection} from '../src/camera-projection.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(program.instructions);
const initialized = Buffer.alloc(baseline.length); initializeCameraProjectionConstants(initialized);
for (const table of constants.tables) {const address = Number(table.address), size = table.bytes_hex.length / 2; assert.deepEqual(initialized.subarray(address, address + size), baseline.subarray(address, address + size), 'Original projection constants');}
const put = (m, p, v) => m.writeInt32LE(v | 0, p), STACK = 0x9000, MANAGER = 0x30000, ROOTS = 0x31000, ROOT = 0x32000, VIEWS = 0x33000, VIEWPORT = 0x34000, CFG = 0x35000;
const reached = new Set(), entries = [0x42f820, 0x426e20, 0x431dc0, 0x42f8c0], functions = [updateCameraProjectionRatios, updateCameraClipPlanes, updateCameraProjection, updateCameraAspectProjection];
let steps = 0, mathCalls = 0, integerCalls = 0, aliases = 0, seed = 0x426e20ab;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
machine.onInstruction = address => reached.add(address);
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), from = m.bytes.readUInt32LE(m.r.ESP + 4), count = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(from, from + count)).copy(m.bytes, dest); m.r.EAX = dest;});
const fixtures = Number(process.argv[2] ?? 1800), dimensions = [0, 1, 479, 480, 640, 1080, 1920, 65535, -1, -2147483648, 2147483647], distances = [0, 1, -1, 103, 104, 105, 512, 32767, -32768, 65535, -2147483648, 2147483647];
function string(object) {memory.write('0 Player\0', object, 'latin1'); put(memory, object + 16, 8); put(memory, object + 20, 15);}
function int64(value) {return !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));}
for (let fixture = 0; fixture < fixtures; fixture++) for (let query = 0; query < 4; query++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 1024, STACK + 128);
  put(memory, 0x6e6388, MANAGER); put(memory, 0x5ecefc, CFG); memory[CFG + 0x41a] = fixture & 1; put(memory, 0x6e6c04, fixture % 3);
  const width = dimensions[fixture % dimensions.length], height = dimensions[Math.trunc(fixture / dimensions.length) % dimensions.length];
  memory.writeUInt16LE(width & 65535, CFG + 0x42c); memory.writeUInt16LE(height & 65535, CFG + 0x42e);
  put(memory, MANAGER + 0x2c, ROOTS); put(memory, MANAGER + 0x30, ROOTS + (fixture % 3 ? 4 : 0)); put(memory, ROOTS, ROOT); string(ROOT + 20);
  put(memory, ROOT + 0x40, VIEWS); put(memory, ROOT + 0x44, VIEWS + 4); put(memory, VIEWS, VIEWPORT); string(VIEWPORT + 20); put(memory, VIEWPORT + 0x8c, width); put(memory, VIEWPORT + 0x90, height);
  put(memory, 0x6efb3c, fixture % 2 ? VIEWPORT : 0);
  if (fixture % 13 === 0) {put(memory, 0x6efb3c, 0x6fb440 - 0x8c); put(memory, 0x6fb440, width); put(memory, 0x6fb444, height); aliases++;}
  for (const address of [0x91ce94, 0x91ceac, 0x91cda0, 0x91d324, 0x91d328, 0x91d340, 0x91d33c, 0x91d594]) put(memory, address, random());
  const sourceLog = [], nativeLog = [];
  const math = (operation, value, log) => {const result = Math.fround(Math[operation](value)); log.push([operation, value, result]); return result;};
  const integer = (value, log) => {const result = int64(value); log.push(['floatToInt64', value, result.toString()]); return result;};
  const runtime = {memory, scratchBase: STACK, handlers: {projectionMath: (operation, value) => math(operation, value, sourceLog), projectionInteger: value => integer(value, sourceLog)}};
  for (const [address, operation] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) {
    machine.entries.delete(address); machine.externalCalls.set(address, m => {mathCalls++; const result = math(operation, m.floatFromBits(m.lowFloatBits('XMM0')), nativeLog); m.scalarBits.delete('XMM0'); m.qwords.delete('XMM0'); m.scalars.XMM0 = result;});
  }
  machine.entries.delete(0x568a60); machine.externalCalls.set(0x568a60, m => {integerCalls++; const result = integer(m.floatFromBits(m.lowFloatBits('XMM0')), nativeLog); m.r.EAX = Number(BigInt.asIntN(32, result)); m.r.EDX = Number(BigInt.asIntN(32, result >> 32n));});
  machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); machine.entry = entries[query]; machine.r.ESP = STACK; put(machine.bytes, STACK, -1);
  const distance = fixture % 4 ? distances[fixture % distances.length] : random(); machine.r.ECX = distance;
  let expected;
  if (query === 1) {
    const values = [0, -0, 1, -1, 480.5, 640.25, 1e-40, 1e20, Infinity, -Infinity, NaN];
    const x = fixture % 5 ? 0 : values[fixture % values.length], y = fixture % 7 ? 0 : values[Math.trunc(fixture / 7) % values.length];
    const w = fixture % 3 ? width : values[fixture % values.length], h = fixture % 3 ? height : values[Math.trunc(fixture / 11) % values.length], scale = values[Math.trunc(fixture / 3) % values.length];
    [x, y, w, h].forEach((value, i) => {machine.scalars[`XMM${i}`] = Math.fround(value);}); machine.bytes.writeFloatLE(scale, STACK + 4);
    expected = updateCameraClipPlanes(x, y, w, h, scale, runtime);
  } else expected = functions[query](distance, runtime);
  steps += machine.run(100000); assert.equal(machine.fs0, 0, 'Thread exception chain restored'); assert.equal(machine.r.EAX | 0, expected | 0, `${fixture}/${query} EAX`);
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture}/${query} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  assert.deepEqual(sourceLog, nativeLog, `${fixture}/${query} ordered CRT arguments/results`);
  const planeEntry = query === 1 ? STACK : query === 2 ? STACK - 28 : query === 3 ? STACK - 44 : null;
  if (planeEntry !== null) {
    const frame = planeEntry - 52;
    //42f8c0's final tail42f820 reuses the plane frame; its standalone numeric
    //locals are checked under426e20 and431dc0 before that separate reuse.
    if (query !== 3) for (const offset of [0xc, 0x10, 0x18, 0x1c, 0x20, 0x24, 0x28, 0x2c, 0x38]) assert.equal(memory.readUInt32LE(frame + offset), machine.bytes.readUInt32LE(frame + offset), `${fixture}/${query} plane numeric${offset.toString(16)}`);
  }
}
const report = {method: 'Actual42f8c0 aspect wrapper,431dc0 projection globals,42f820 ratios/451210 division and426e20 clipping planes, using complete renderer/string search callees. All mapped bytes>=10000h, EAX, defined standalone/431dc0 plane numeric locals and ordered genuine CRT atan/sin/cos/float-to-int64 service arguments/results compare. Signed-low16/wrapped32, configured doubling, missing/present renderer roots, current viewport alias, portrait/landscape/zero/signed-extreme dimensions, clamp104, fractional/subnormal/infinite/NaN plane inputs covered. Library math uses declared f32 host outputs in this check; no assertion of original CRT bit identity, FP exception state or original process execution. Full camera parent and renderer producers remain open.', fixtures, calls: fixtures * 4, aliases, mathCalls, integerCalls, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-projection-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
