import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {constructRendererString, destroyRendererString, ensureRendererString, appendRendererString, appendRendererStringSlice, formatRendererString, ensureRendererWideString, assignRendererWideString, assignRendererWideStringSlice, constructRendererWideString, cacheRendererWideString} from '../src/renderer-startup-strings.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererStartupStrings({fixtures = 1000, output = 'analysis/renderer-startup-strings-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(); let calls = 0, steps = 0;
  const S = 0x9000, OBJECT = 0x100000, OTHER = 0x101000, INPUT = 0x110000, HEAP = 0x150000, entries = [0x401f10, 0x401f70, 0x4054b0, 0x4a30a0, 0x4a31e0, 0x4a2b40, 0x40b8a0, 0x40b710, 0x40b600, 0x4066c0, 0x4a29e0]; machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) for (let selector = 0; selector < entries.length; selector++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9500); m.fill(0xa7, OBJECT, OTHER + 32); m.fill(0x93, HEAP, HEAP + 0x1000);
    const initialize = (object, length, heap) => {const capacity = length < 16 ? 15 : length | 15, data = capacity >= 16 ? heap : object; if (data !== object) put(m, object, data); for (let i = 0; i < length; i++) m[data + i] = 65 + i % 26; m[data + length] = 0; put(m, object + 16, length); put(m, object + 20, capacity); put(m, object + 24, 0); return data;};
    let currentData = initialize(OBJECT, fixture % 60, HEAP); initialize(OTHER, fixture % 47, HEAP + 0x400); const text = fixture % 9 ? `Format:${fixture % 3}` : ''; m.write(`${text}\0`, INPUT);
    if (selector >= 6 && selector < 10) {
      const initializeWide = (object, length, heap) => {const capacity = length < 8 ? 7 : length | 7, data = capacity >= 8 ? heap : object; if (data !== object) put(m, object, data); for (let i = 0; i < length; i++) m.writeUInt16LE(0x400 + i, data + i * 2); m.writeUInt16LE(0, data + length * 2); put(m, object + 16, length); put(m, object + 20, capacity); put(m, object + 24, 0); return data;};
      currentData = initializeWide(OBJECT, fixture % 30, HEAP); initializeWide(OTHER, fixture % 23, HEAP + 0x400);
    }
    if (selector === 1 && fixture % 3 === 0) put(m, OBJECT + 24, HEAP + 0x800);
    const imports = [['operatorNew', 0x56e220, 0xf1000000], ['operatorDelete', 0x56e210, 0xf1000004], ['operatorDeleteArray', 0x56e470, 0xf1000008], ['_vsnprintf', 0x56e228, 0xf100000c], ['operatorNewArray', 0x56e474, 0xf1000010]]; for (const [, p, v] of imports) put(m, p, v); put(m, 0x56e0c0, 0xf1000014); put(m, 0x56e478, 0xf1000018);
    const services = (memory, log) => {let cursor = 0x200000; return {libraryCall(name, args) {
      log.push([name, args.map(v => v >>> 0)]);
      if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}
      if (name === '_vsnprintf') {const format = memory.toString('latin1', args[2], memory.indexOf(0, args[2])), text = `${format}/${memory.readInt32LE(args[3])}`; memory.write(`${text}\0`, args[0]); return text.length;}
    }, platformCall(name, args) {assert.equal(name, 'MultiByteToWideChar'); log.push([name, args]); if (fixture % 13 === 0) return 0; for (let i = 0; i < Math.min(args[3], args[5]); i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}};};
    runtime.services = services(m, trace);
    let args, action, mask = -1;
    if (selector === 0) {args = [fixture % 7 === 0 ? 0 : INPUT]; action = () => constructRendererString(OBJECT, args[0], runtime);}
    else if (selector === 1) {args = []; action = () => destroyRendererString(OBJECT, runtime); mask = 0;}
    else if (selector === 2) {args = [fixture % 90, fixture % 3]; action = () => ensureRendererString(OBJECT, ...args, runtime);}
    else if (selector === 3) {args = [fixture % 2 && fixture % 60 ? currentData + fixture % (fixture % 60) : INPUT, fixture % 9]; action = () => appendRendererString(OBJECT, ...args, runtime);}
    else if (selector === 4) {args = [fixture % 2 ? OBJECT : OTHER, 0, fixture % 3 ? fixture % 35 : -1]; const length = ptr(m, args[0] + 16); args[1] = fixture % (length + 1); action = () => appendRendererStringSlice(OBJECT, ...args, runtime);}
    else if (selector === 5) {args = [OBJECT, INPUT, fixture * -7919]; action = () => formatRendererString(OBJECT, INPUT, [args[2]], runtime);}
    else if (selector === 6) {args = [fixture % 70, 0]; action = () => ensureRendererWideString(OBJECT, args[0], runtime);}
    else if (selector === 7) {args = [fixture % 2 && fixture % 30 ? currentData + (fixture % (fixture % 30)) * 2 : HEAP + 0x400, fixture % 11]; action = () => assignRendererWideString(OBJECT, ...args, runtime);}
    else if (selector === 8) {args = [fixture % 2 ? OBJECT : OTHER, 0, fixture % 3 ? fixture % 20 : -1]; const n = ptr(m, args[0] + 16); args[1] = fixture % (n + 1); action = () => assignRendererWideStringSlice(OBJECT, ...args, runtime);}
    else if (selector === 9) {args = [fixture % 7 === 0 ? 0 : INPUT]; action = () => constructRendererWideString(OBJECT, args[0], runtime);}
    else {args = []; action = () => cacheRendererWideString(OBJECT, runtime);}
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    for (const [name, , target] of imports) machine.externalCalls.set(target, x => {const n = name === '_vsnprintf' ? 4 : 1, args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)), result = native.libraryCall(name, args); if (result !== undefined) x.r.EAX = result;});
    machine.externalCalls.set(0x568980, x => {x.r.ESP -= x.r.EAX;});
    const move = x => {const target = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), n = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + n)).copy(x.bytes, target); x.r.EAX = target;}; machine.externalCalls.set(0x568a48, move);
    machine.externalCalls.set(0xf1000018, move); machine.externalCalls.set(0xf1000014, x => {const args = Array.from({length: 6}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.platformCall('MultiByteToWideChar', args); x.r.ESP += 24;});
    try {const result = action(); machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = OBJECT; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      if (mask) assert.equal(machine.r.EAX & mask, result & mask); assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 20).toString('hex')} native=${machine.bytes.subarray(p, p + 20).toString('hex')}`);}
    } catch (error) {console.error({fixture, selector, args, trace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual narrow string ctor/dtor/ensure/append/slice/format and wide ensure/assignment/slice/construction/cached ACP conversion, with actual growth/copy/truncate/erase descendants. Inline/heap/growth/shrink/clear and self/interior aliases. All mapped>=10000h,returns,exactordered genuine CRT allocation/delete/_vsnprintf and platform MultiByteToWideChar requests; syntheticFS restore. No game mocks/original execution; this is string-helper closure, not full renderer failure/bootstrap closure.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererStartupStrings({fixtures: Number(process.argv[2] ?? 1000)})));
