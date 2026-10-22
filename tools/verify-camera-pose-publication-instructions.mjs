import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {publishCameraPose} from '../src/camera-pose-publication.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(program.instructions);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const STACK = 0x9000, SESSION = 0x50000, CFG = 0x52000, ROWS = 0x40000, MAP = 0x43000, BUCKET = 0x45000, BODY = 0x100000, TARGET = 0x110000, OWNER = 0x120000, CONTROL = 0x121000, POSE = 0x130000, NAME = 0x131000, APP = 0x140000, HEAD = 0x150000, VIEW = 0x160000;
const reached = new Set(), visits = {}; let steps = 0, aliases = 0, allocations = 0, casts = 0, seed = 0x41a6c0ab, numericBeforeTail;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
machine.onInstruction = (address, state) => {reached.add(address); if ([0x41a6c0, 0x42f8c0, 0x406c70, 0x474850, 0x474600].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x474600) numericBeforeTail = [0x14, 0x18, 0x1c, 0x20, 0x24, 0x28].map(offset => state.bytes.readInt32LE(STACK - 44 + offset));};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), from = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(from, from + size)).copy(m.bytes, dest); m.r.EAX = dest;});
for (const address of [0x569330, 0x56934e, 0x56933c, 0x568a60, 0x56932a]) machine.entries.delete(address);
const fixtures = Number(process.argv[2] ?? 1200), speeds = [-32768, -1, 0, 299, 300, 301, 424, 425, 426, 449, 450, 451, 524, 525, 526, 32767];
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 2048, STACK + 128);
  put(memory, 0x5ecb1c, SESSION); put(memory, 0x5ecefc, CFG); memory[CFG + 0x95] = fixture & 1; memory[SESSION + 0x587] = (fixture >> 1) & 1;
  word(memory, CFG + 0x42c, [640, 1920, 480][fixture % 3]); word(memory, CFG + 0x42e, [480, 1080, 640][fixture % 3]); memory[CFG + 0x41a] = (fixture >> 2) & 1; put(memory, 0x6e6c04, fixture % 3);
  put(memory, 0x6e6388, 0x200000); put(memory, 0x6efb3c, fixture % 3 ? VIEW : 0); memory.write('0 Player\0', VIEW + 20); put(memory, VIEW + 36, 8); put(memory, VIEW + 40, 15); put(memory, VIEW + 0x8c, 640); put(memory, VIEW + 0x90, 480);
  if (fixture % 5 === 0) {put(memory, VIEW + 20, VIEW + 0x200); put(memory, VIEW + 40, 63); memory.write('A heap-backed viewport\0', VIEW + 0x200);}
  put(memory, OWNER, TARGET); put(memory, OWNER + 0x18, CONTROL); put(memory, CONTROL, BODY); put(memory, CONTROL + 4, TARGET); word(memory, TARGET + 0x668, speeds[fixture % speeds.length]);
  for (const offset of [0, 4, 8]) {put(memory, TARGET + 0x34 + offset, random()); put(memory, POSE + offset, random()); put(memory, CONTROL + 8 + offset, random()); put(memory, BODY + 0x34 + offset, random());}
  put(memory, 0x902eec, BODY); put(memory, BODY + 4, 0); put(memory, BODY + 12, BUCKET); word(memory, BUCKET + 8, 1);
  put(memory, 0x909254, ROWS); put(memory, 0x909278, BUCKET);
  for (let row = 0; row < 256; row++) {word(memory, ROWS + row * 16, 0xff00); word(memory, ROWS + row * 16 + 2, 255); put(memory, ROWS + row * 16 + 12, MAP); word(memory, MAP + row * 2, 0);}
  put(memory, 0x6efb38, APP); put(memory, APP + 0x7c, HEAD); for (const offset of [0, 4, 8]) put(memory, HEAD + offset, HEAD); word(memory, HEAD + 12, 0x101);
  put(memory, 0x56e220, 0x5a000); put(memory, 0x56e210, 0x5a010); put(memory, 0x56e470, 0x5a010);
  memory.write(fixture % 4 < 2 ? '\0' : fixture % 7 ? '0 Player\0' : 'A heap-backed viewport\0', NAME); put(memory, 0x91ce90, (fixture >> 1) & 2);
  const pose = fixture % 7 === 0 ? BODY + 0x34 : fixture % 11 === 0 ? TARGET + 0x34 : POSE, smooth = fixture % 3;
  if (pose !== POSE) aliases++;
  const sourceLog = [], nativeLog = [], allocator = (m, log) => {let cursor = 0x180000; return size => {const address = cursor; cursor += (size + 15) & ~15; m.fill(0xa5, address, cursor); log.push(['allocate', size, address]); return address;};};
  const sourceAllocate = allocator(memory, sourceLog), nativeAllocate = allocator(machine.bytes, nativeLog);
  const math = (operation, value, log) => {const result = Math.fround(Math[operation](value)); log.push([operation, value, result]); return result;};
  const integer = (value, log) => {const result = !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value)); log.push(['integer', value, result.toString()]); return result;};
  const runtime = {memory, scratchBase: STACK, handlers: {allocate: sourceAllocate, free: p => sourceLog.push(['free', p]), dynamicCast: (...args) => {sourceLog.push(['dynamicCast', ...args.slice(0, 5)]); return APP;}, projectionMath: (operation, value) => math(operation, value, sourceLog), projectionInteger: value => integer(value, sourceLog)}};
  machine.externalCalls.set(0x5a000, m => {allocations++; m.r.EAX = nativeAllocate(m.bytes.readUInt32LE(m.r.ESP));}); machine.externalCalls.set(0x5a010, m => nativeLog.push(['free', m.bytes.readUInt32LE(m.r.ESP)]));
  machine.externalCalls.set(0x56932a, m => {casts++; nativeLog.push(['dynamicCast', ...[0, 4, 8, 12, 16].map(offset => m.bytes.readInt32LE(m.r.ESP + offset))]); m.r.EAX = APP;});
  for (const [address, operation] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) machine.externalCalls.set(address, m => {const result = math(operation, m.floatFromBits(m.lowFloatBits('XMM0')), nativeLog); m.scalarBits.delete('XMM0'); m.qwords.delete('XMM0'); m.scalars.XMM0 = result;});
  machine.externalCalls.set(0x568a60, m => {const result = integer(m.floatFromBits(m.lowFloatBits('XMM0')), nativeLog); m.r.EAX = Number(BigInt.asIntN(32, result)); m.r.EDX = Number(BigInt.asIntN(32, result >> 32n));});
  machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); // Explicit synthetic thread exception chain.
  publishCameraPose(OWNER, pose, smooth, NAME, runtime);
  machine.entry = 0x41a6c0; machine.r.ECX = OWNER; machine.r.EDX = pose; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, smooth); put(machine.bytes, STACK + 8, NAME); steps += machine.run(200000); assert.equal(machine.fs0, 0, 'Thread exception chain restored');
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${fixture} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  assert.deepEqual(sourceLog, nativeLog, `${fixture} ordered genuine library services`);
  assert.deepEqual([0x14, 0x18, 0x1c, 0x20, 0x24, 0x28].map(offset => memory.readInt32LE(STACK - 44 + offset)), numericBeforeTail, `${fixture} numeric locals before tail frame reuse`);
}
const report = {method: 'Complete41a6c0 pose publication, with actual402d10 ready-singleton/406c70 map insertion and smoothing,42f8c0 full aspect/projection and474850/474600 spatial remove/reinsert tail. All mapped bytes>=10000h, defined numeric parent locals before tail474600 reuses their stack frame, and ordered CRT services match. Lower spatial saved-register/argument-stack residue is not compared. Signed speed boundaries, alternate threshold/config flags, empty/named/current inline/heap names, application route gate, direct/smoothed scalar, pose aliases to target/camera body, wrapped coordinates/offsets and valid raw spatial registry. Only genuine allocation/free/memcpy, RTTI, compiler cookie, atan/sin/cos and float-to-int64 services. Declared host f32 math outputs do not prove original CRT bit identity; no original process execution. Application initial construction is separately checked; full camera parent remains open.', fixtures, aliases, allocations, casts, calls: visits, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/camera-pose-publication-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
