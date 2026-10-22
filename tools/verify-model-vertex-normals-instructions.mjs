import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {buildModelVertexNormals, initializeModelVertexNormals} from '../src/model-vertex-normals.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set();
machine.onInstruction = address => reached.add(address);
const MODEL = 0x20000, FACES = 0x30000, OUTPUT = 0x50000, STACK = 0x9000, ALLOC = 0x5a0100;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
let seed = 0x41e910aa, steps = 0, aliases = 0, faults = 0, cacheHits = 0;
const random = n => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n;};
const fixtures = Number(process.argv[2] ?? 1200);
for (let fixture = 0; fixture < fixtures; fixture++) for (const parent of [false, true]) {
  machine.reset(); const native = machine.bytes; native.fill(0x36); native.fill(0, STACK - 512, STACK + 32); native.fill(0, 0, 16);
  put(native, 0x56e258, ALLOC); native.fill(0, MODEL, MODEL + 0x300);
  for (let child = 0; child < 3; child++) {
    const model = MODEL + child * 0x100, vertices = fixture % 19 === 0 ? 0 : 1 + random(7), count = fixture % 23 === 0 ? 128 : random(20), faces = FACES + child * 0x1000;
    word(native, model + 4, vertices); word(native, model + 6, count); put(native, model + 12, faces);
    for (let i = 0; i < count; i++) {
      const lanes = fixture % 23 === 0 ? [1, 1, 1, 1] : Array.from({length: 4}, () => random(vertices + 2));
      put(native, faces + i * 8, lanes[0] | lanes[1] << 8 | lanes[2] << 16 | lanes[3] << 24);
      put(native, faces + i * 8 + 4, fixture % 23 === 0 ? 0x7fffffff : random(0xffffffff));
    }
  }
  if (parent) {word(native, MODEL + 0x1c, fixture % 3 ? 0x100 : 0); word(native, MODEL + 0x1e, fixture % 4 ? 0x200 : 0); if (fixture % 7 === 0) {put(native, MODEL + 0x48, OUTPUT); cacheHits++;}}
  let output = OUTPUT;
  if (!parent && fixture % 11 === 0) {output = FACES; aliases++;}
  if (!parent && fixture % 17 === 0) {output = MODEL + 4; word(native, MODEL + 6, 0); aliases++;}
  const source = Buffer.from(native), sourceLog = [], nativeLog = [];
  const allocate = (m, log, size) => {const result = fixture % 29 === 0 ? 0 : OUTPUT; log.push([size, result]); return result;};
  let sourceError, nativeError;
  try {if (parent) initializeModelVertexNormals(MODEL, {memory: source, scratchBase: STACK, allocate: size => allocate(source, sourceLog, size)}); else buildModelVertexNormals(MODEL, output, {memory: source, scratchBase: STACK});} catch (error) {sourceError = error;}
  machine.externalCalls.set(ALLOC, state => {state.r.EAX = allocate(native, nativeLog, native.readUInt32LE(state.r.ESP));});
  machine.externalCalls.set(0x568a50, state => {const p = native.readUInt32LE(state.r.ESP), value = native.readInt32LE(state.r.ESP + 4), size = native.readUInt32LE(state.r.ESP + 8); native.fill(value & 255, p, p + size); state.r.EAX = p;});
  machine.entry = parent ? 0x41e850 : 0x41e910; machine.r.ESP = STACK; machine.r.ECX = MODEL; machine.r.EDX = output; put(native, STACK, -1);
  try {steps += machine.run();} catch (error) {nativeError = error;}
  try {
    assert.equal(!!nativeError, !!sourceError, `matching fault native=${nativeError?.message} source=${sourceError?.message}`);
    assert.deepEqual(nativeLog, sourceLog, 'allocation'); assert.deepEqual(native.subarray(0x10000), source.subarray(0x10000), 'all mapped bytes>=10000h');
    assert.deepEqual(native.subarray(0, 0x1000), source.subarray(0, 0x1000), 'null output writes');
  } catch (error) {console.error({fixture, parent, output: output.toString(16), nativeError, sourceError}); throw error;}
  if (nativeError) faults++;
}
const report = {method: 'Actual41e850 base/relative-child lazy cache construction and41e910 packed polygon incidence/normalization versus retained original x86 with actual41c9c0/41ca60/41c990 descendants. No game helpers mocked; CRT malloc/memset are explicit services. All mapped bytes>=10000h plus null allocation output and allocation requests compare. Synthetic triangle/quad/repeated/missing vertex references, zero vertices/faces, signed packed normal values, large-sum reduction, output/face/count aliases, child combinations and cache hits; no original-process execution. Private stack aliases beyond the admitted output cases remain open.', evidence: program.references.map(e => e.evidence), fixtures, calls: fixtures * 2, aliases, faults, cacheHits, instructionsReached: reached.size, instructionSteps: steps, matched: true};
await writeFile('analysis/model-vertex-normals-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
