import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {composeRaceViewMatrix, buildRaceViewMatrix, publishRaceViewRotation, publishRaceViewMatrix, initializeRaceViewTransform, initializeRaceView, initializeRaceViewStorage} from '../src/race-view-initialization.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), machine = new BoundedX86(program.instructions), reached = new Set();
initializeWheelRenderTables(baseline); machine.onInstruction = address => reached.add(address);
const STACK = 0x9000, MATRIX = 0x20000, SOURCE = 0x21000, VECTOR = 0x22000, CFG = 0x23000, SESSION = 0x24000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const cases = [[0x432550, composeRaceViewMatrix], [0x42f6f0, buildRaceViewMatrix], [0x431ec0, publishRaceViewRotation], [0x42f7c0, publishRaceViewMatrix], [0x42ec40, initializeRaceViewTransform], [0x42eca0, initializeRaceView], [0x42f2f0, initializeRaceViewStorage]];
let seed = 0x42eca0aa, steps = 0, aliases = 0, mathCalls = 0;
const random = n => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n;};
const fixtures = Number(process.argv[2] ?? 600);
for (let fixture = 0; fixture < fixtures; fixture++) for (const [entry, reference] of cases) {
  machine.reset(); machine.fs0 = 0; baseline.copy(machine.bytes); const native = machine.bytes; native.fill(0x36, STACK - 1024, STACK + 64);
  put(native, 0x5ecefc, CFG); put(native, 0x5ecb1c, SESSION); put(native, 0x6e6388, 0); put(native, 0x6efb3c, 0); put(native, 0x91ceb4, fixture % 2);
  native[CFG + 0x41a] = fixture % 2; put(native, 0x6e6c04, fixture % 3);
  word(native, CFG + 0x42c, [0, 1, 320, 640, 1920, 65535][fixture % 6]); word(native, CFG + 0x42e, [480, 1080, 1, 0, 65535][fixture % 5]);
  word(native, SESSION + 0xa8c, random(65536)); word(native, SESSION + 0xa8e, random(65536));
  for (const base of [MATRIX, SOURCE, 0x91d4e0]) for (let i = 0; i < 16; i++) word(native, base + i * 2, random(65536));
  for (let i = 0; i < 3; i++) put(native, VECTOR + i * 4, random(0xffffffff));
  let matrix = MATRIX, source = SOURCE, vector = VECTOR;
  if (entry === 0x42f6f0 && fixture % 5 === 0) {matrix = SOURCE + 4; aliases++;}
  if (entry === 0x432550 && fixture % 7 === 0) {matrix = 0x91d4e0 + 2; aliases++;}
  if ([0x431ec0, 0x42f7c0].includes(entry) && fixture % 11 === 0) {matrix = 0x91d360 - 2; aliases++;}
  const js = Buffer.from(native), nativeLog = [], sourceLog = [];
  const math = (operation, value, log) => {const result = Math.fround(Math[operation](value)); log.push([operation, value, result]); return result;};
  const integer = (value, log) => {const result = !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value)); log.push(['integer', value, result.toString()]); return result;};
  const runtime = {memory: js, scratchBase: STACK, handlers: {projectionMath: (op, value) => math(op, value, sourceLog), projectionInteger: value => integer(value, sourceLog)}};
  for (const [address, operation] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) {
    machine.entries.delete(address); machine.externalCalls.set(address, state => {mathCalls++; const result = math(operation, state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.scalarBits.delete('XMM0'); state.qwords.delete('XMM0'); state.scalars.XMM0 = result;});
  }
  machine.entries.delete(0x568a60); machine.externalCalls.set(0x568a60, state => {const result = integer(state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.r.EAX = Number(BigInt.asIntN(32, result)); state.r.EDX = Number(BigInt.asIntN(32, result >> 32n));});
  machine.externalCalls.set(0x568162, state => assert.equal(state.r.ECX, native.readInt32LE(0x5e8890), 'compiler cookie'));
  machine.externalCalls.set(0x568a48, state => {const p = native.readUInt32LE(state.r.ESP), from = native.readUInt32LE(state.r.ESP + 4), size = native.readUInt32LE(state.r.ESP + 8); Buffer.from(native.subarray(from, from + size)).copy(native, p); state.r.EAX = p;});
  machine.entry = entry; machine.r.ESP = STACK; machine.r.ECX = matrix; machine.r.EDX = entry === 0x432550 ? matrix : source; put(native, STACK, -1); put(native, STACK + 4, vector);
  if (entry === 0x42f6f0) {put(js, STACK + 4, vector); reference(matrix, source, vector, runtime);}
  else if ([0x432550, 0x431ec0, 0x42f7c0].includes(entry)) reference(matrix, runtime);
  else reference(runtime);
  try {
    steps += machine.run(); assert.equal(machine.fs0, 0, 'TLS restoration'); assert.deepEqual(nativeLog, sourceLog, 'ordered CRT requests/results');
    const nativeState = native.subarray(0x10000), sourceState = js.subarray(0x10000);
    if (!nativeState.equals(sourceState)) {const i = nativeState.findIndex((v, index) => v !== sourceState[index]); assert.fail(`byte0x${(i + 0x10000).toString(16)} native${nativeState[i]} source${sourceState[i]}`);}
  } catch (error) {console.error({fixture, entry: entry.toString(16), matrix: matrix.toString(16), nativeLog, sourceLog}); throw error;}
}
const report = {method: 'Seven original race view/storage, matrix composition and publication algorithms versus retained x86, with actual projection/renderer/string/angle-table descendants and explicit genuine CRT math/conversion/compiler-cookie services. All mapped bytes>=10000h, restored TLS and ordered library inputs/results compare, including the native unwritten matrix padding WORD. Synthetic signed phases/matrices/vectors, overlapped forward copies, live global matrix aliases, missing renderer roots, zero/extreme unsigned dimensions, configured doubling and reflection. Library math uses declared host-f32 results, not an original CRT bit-identity or original-process execution claim. Private aliases beyond this declared domain remain open.', evidence: program.references.map(e => e.evidence), fixtures, calls: fixtures * cases.length, aliases, mathCalls, instructionsReached: reached.size, instructionSteps: steps, matched: true};
await writeFile('analysis/race-view-initialization-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
