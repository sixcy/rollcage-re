import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {constructRendererStockName, insertRendererTargetPointer, registerRendererTarget} from '../src/renderer-target-registration.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererTargetRegistration({fixtures = 2000, output = 'analysis/renderer-target-registration-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(); let calls = 0, steps = 0;
  machine.onInstruction = p => reached.add(p);
  const S = 0x9000, OWNER = 0x100000, DATA = 0x110000, KEY = 0x120000, TARGETS = 0x130000, OUT = 0x140000;
  const string = (m, p, value) => {m.write(value, p); m[p + value.length] = 0; put(m, p + 16, value.length); put(m, p + 20, 15);};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), sourceTrace = [], nativeTrace = [], selector = fixture % 4, runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9200);
    const size = fixture % 5, spare = fixture % 3 ? 2 : 0, vector = OWNER + 0x2c;
    put(m, vector, DATA); put(m, vector + 4, DATA + size * 4); put(m, vector + 8, DATA + (size + spare) * 4);
    string(m, KEY, fixture % 3 ? 'Matched' : 'Absent');
    for (let i = 0; i < 5; i++) {put(m, DATA + i * 4, TARGETS + i * 0x100); string(m, TARGETS + i * 0x100 + 20, i === size >> 1 ? 'Matched' : 'Other');}
    put(m, OUT, 0x12345678);
    const imports = [['operatorNew', 0x56e220, 0xf1000000], ['operatorDelete', 0x56e210, 0xf1000004], ['operatorDeleteArray', 0x56e470, 0xf1000004]];
    for (const [, p, v] of imports) put(m, p, v); put(m, 0x56e478, 0xf1000008);
    const services = (memory, trace) => {let cursor = 0x180000; const libraryCall = (name, args) => {if (name === 'operatorNew') {const output = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, output, cursor); trace.push(['allocate', args[0], output]); return output;} trace.push(['free', args[0]]);}; return {libraryCall, allocate: size => libraryCall('operatorNew', [size]), free: p => libraryCall('operatorDelete', [p])};};
    runtime.services = services(m, sourceTrace); runtime.handlers = runtime.services;
    let entry, ecx, args, action;
    if (selector < 2) {entry = selector ? 0x402ec0 : 0x402e80; ecx = KEY; args = []; action = () => constructRendererStockName(KEY, !!selector, runtime);}
    else if (selector === 2) {entry = 0x518060; ecx = vector; const position = DATA + (fixture % (size + 1)) * 4, input = fixture % 7 === 0 && size ? DATA + (size - 1) * 4 : OUT; args = [OUT + 4, position, 0, input]; action = () => insertRendererTargetPointer(ecx, ...args, runtime);}
    else {entry = 0x517d70; ecx = OWNER; args = [TARGETS + 0x800, fixture % 11 === 0 ? 0 : KEY, 0]; action = () => registerRendererTarget(ecx, ...args, runtime);}
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    machine.externalCalls.set(0xf1000000, x => {x.r.EAX = native.allocate(ptr(x.bytes, x.r.ESP));}); machine.externalCalls.set(0xf1000004, x => native.free(ptr(x.bytes, x.r.ESP)));
    const move = x => {const output = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), count = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + count)).copy(x.bytes, output); x.r.EAX = output;}; machine.externalCalls.set(0xf1000008, move); machine.externalCalls.set(0x568a48, move);
    machine.externalCalls.set(0x568a50, x => {const p = ptr(x.bytes, x.r.ESP); x.bytes.fill(x.bytes[x.r.ESP + 4], p, p + ptr(x.bytes, x.r.ESP + 8)); x.r.EAX = p;});
    try {
      action(); machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = S; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      assert.deepEqual(nativeTrace, sourceTrace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16), sourceTrace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual402e80/402ec0 stock-name constructors and517d70 target registration with actual518060 insertion, capacity/allocation/fill helpers,401c90 comparisons and40ebc0 append. Empty/nonempty vectors, full/spare capacity, first/interior/end insertions, aliased input pointers and named/null-key registration; all mapped memory>=10000h and ordered genuine CRT allocation/free, no game mocks/original execution.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererTargetRegistration({fixtures: Number(process.argv[2] ?? 2000)})));
