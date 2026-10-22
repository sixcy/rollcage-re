import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {compareRendererNameBytes, findRendererNamedObject, readRendererViewportExtent} from '../src/renderer-viewports.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(program.instructions);
const put = (m, p, v) => m.writeInt32LE(v | 0, p), STACK = 0x9000, MANAGER = 0x30000, ROOTS = 0x31000, VIEWS = 0x32000, KEY = 0x33000, CFG = 0x34000;
let steps = 0, seed = 0x517e30ab; const reached = new Set(); const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
machine.onInstruction = address => reached.add(address);
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), from = m.bytes.readUInt32LE(m.r.ESP + 4), count = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(from, from + count)).copy(m.bytes, dest); m.r.EAX = dest;});
const fixtures = Number(process.argv[2] ?? 2400);
function string(object, text, heap = false) {const bytes = Buffer.from(text, 'latin1'), data = heap ? object + 0x200 : object; if (heap) put(memory, object, data); bytes.copy(memory, data); memory[data + bytes.length] = 0; put(memory, object + 16, bytes.length); put(memory, object + 20, heap ? 63 : 15);}
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 512, STACK + 64);
  put(memory, 0x6e6388, MANAGER); put(memory, 0x5ecefc, CFG); memory[CFG + 0x41a] = fixture & 1; put(memory, 0x6e6c04, fixture % 3); memory.writeUInt16LE(fixture % 65536, CFG + 0x42c); memory.writeUInt16LE(65535 - fixture % 65536, CFG + 0x42e);
  const count = fixture % 6; put(memory, MANAGER + 0x2c, ROOTS); put(memory, MANAGER + 0x30, ROOTS + count * 4);
  for (let index = 0; index < 6; index++) {
    const root = 0x40000 + index * 0x1000, viewport = 0x50000 + index * 0x1000;
    put(memory, ROOTS + index * 4, root); string(root + 20, index === fixture % 5 ? '0 Player' : ['Other', '0 Player suffix', '0 Playe', 'other', ''][index % 5], !!((fixture + index) & 1));
    put(memory, root + 0x40, VIEWS + index * 16); put(memory, root + 0x44, VIEWS + index * 16 + 4); put(memory, VIEWS + index * 16, viewport); string(viewport + 20, '0 Player', !!(fixture & 1)); put(memory, viewport + 0x8c, random()); put(memory, viewport + 0x90, random());
  }
  string(KEY, fixture % 7 === 0 ? '' : '0 Player', !!(fixture & 1));
  const query = fixture % 4;
  machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); machine.r.ESP = STACK; put(machine.bytes, STACK, -1);
  let expected;
  if (query < 2) {expected = readRendererViewportExtent(!!query, {memory, scratchBase: STACK}); machine.entry = query ? 0x40aeb0 : 0x40ad40;}
  else {const children = query === 3, owner = children ? 0x40000 + fixture % 6 * 0x1000 : MANAGER; expected = findRendererNamedObject(owner, KEY, children, {memory, scratchBase: STACK}); machine.entry = children ? 0x516ed0 : 0x517e30; machine.r.ECX = owner; put(machine.bytes, STACK + 4, KEY);}
  steps += machine.run(100000); assert.equal(machine.fs0, 0, 'Thread exception chain restored'); assert.equal(machine.r.EAX | 0, expected | 0); compare(`${fixture}/viewport`);
  if (query >= 2) assert.equal(memory.readInt32LE(STACK - 4), machine.bytes.readInt32LE(STACK - 4), `${fixture} saved candidate`);
  else for (const offset of [0x14, 0x18, 0x1c, 0x30, 0x34, 0x38, 0x3c]) assert.equal(memory.readInt32LE(STACK - 64 + offset), machine.bytes.readInt32LE(STACK - 64 + offset), `${fixture} key numeric${offset.toString(16)}`);
  //Independent exact-byte comparator domain includes embedded zero/high bytes,
  //null pointers at length0 and mismatches across four-byte block boundaries.
  baseline.copy(memory); const length = fixture % 34;
  for (let index = 0; index < 40; index++) {memory[0x60000 + index] = random() & 255; memory[0x61000 + index] = memory[0x60000 + index];}
  if (fixture % 3) memory[0x61000 + fixture % 40] ^= 128;
  const first = length ? 0x60000 : 0, second = length ? 0x61000 : 0;
  machine.reset(); memory.copy(machine.bytes); expected = compareRendererNameBytes(first, second, length, {memory}); machine.entry = 0x401c90; machine.r.ECX = first; machine.r.EDX = second; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, length); steps += machine.run(10000); assert.equal(machine.r.EAX | 0, expected); compare(`${fixture}/compare`);
}
function compare(label) {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${label} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}}
const report = {method: 'Actual40ad40/40aeb0 renderer dimension getters,517e30/516ed0 named pointer-vector searches,401c90 exact byte comparator and405310 string construction with actual lower string routines. All mapped memory>=10000h, return values and defined caller numeric key/candidate locals compare. Distinct renderer hierarchy, empty/missing root fallback, inline/heap names, prefix/case/empty distinctions, configured doubling, signed dimensions, embedded/high bytes and zero-length null comparison. Matching roots have valid named child viewports as required by original dereference. Only CRT memcpy and compiler cookie services. Renderer construction and full camera/projection remain separately open; no original process execution.', fixtures, calls: fixtures * 2, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/renderer-viewports-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
