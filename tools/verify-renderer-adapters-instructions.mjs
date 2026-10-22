import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {appendRendererAdapter, enumerateRendererAdapters, selectRendererDisplayMode} from '../src/renderer-adapters.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererAdapters({fixtures = 1500, output = 'analysis/renderer-adapters-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let calls = 0, steps = 0;
  const S = 0x9000, MANAGER = 0x100000, DEVICE = 0x110000, VTABLE = 0x120000, CAPS = 0x130000, VALUES = 0x140000, ROWS = 0x150000;
  machine.onInstruction = p => {reached.add(p); if ([0x510d40, 0x5110b0, 0x513140, 0x5135d0, 0x513c80].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) for (let selector = 0; selector < 3; selector++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x7000, 0x9500);
    put(m, MANAGER + 0x368, DEVICE); put(m, DEVICE, VTABLE); put(m, MANAGER + 0x488, CAPS); put(m, CAPS, fixture % 4); put(m, CAPS + 0x534, 1);
    for (const method of [0x10, 0x38, 0x14, 0x18, 0x1c, 0x24]) put(m, VTABLE + method, 0xf0000000 + method);
    put(m, 0x56e220, 0xf1000000); put(m, 0x56e210, 0xf1000004); put(m, 0x56e2a8, 0xf1000008);
    const services = (memory, log) => {let cursor = 0x200000; return {
      libraryCall(name, args) {
        log.push([name, args.map(v => v >>> 0)]);
        if (name === 'operatorNew') {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}
        if (name === 'strcpy_s') {let i = 0; while (i < args[1] && memory[args[2] + i]) {memory[args[0] + i] = memory[args[2] + i]; i++;} assert(i < args[1]); memory[args[0] + i] = 0; return 0;}
      },
      direct3DCall(object, method, args) {
        log.push(['Direct3D', method, args.map(v => v >>> 0)]);
        if (method === 0x10) return fixture % 9;
        if (method === 0x38) {
          const output = args[3], index = args[1]; if (fixture % 13 === index) return -1;
          put(memory, output, 1); put(memory, output + 0x1c, 0x90400); for (const [o, v] of [[0x20, 0x70], [0x28, 0x88], [0x34, 0x88], [0x2c, 0x13], [0x30, 0x2f], [0x3c, 0x4005], [0x4c, 5], [0x94, 8], [0x98, 8], [0xc4, 0xfffe0200], [0xcc, 0xffff0200]]) put(memory, output + o, v);
          if (index !== 0 && index % 3 === 0) put(memory, output + [0x20, 0x94, 0xc4][fixture % 3], 0); return 0;
        }
        if (method === 0x14) {if (fixture % 11 === args[1]) return -1; memory.write(`driver${args[1]}\0`, args[3], 'latin1'); memory.write(`Adapter ${args[1]}\0`, args[3] + 0x200, 'latin1'); return 0;}
        if (method === 0x18) return fixture % 8;
        if (method === 0x1c) {const index = args[3], p = args[4]; if ((fixture + index) % 11 === 0) return -1;
          const rows = [[640, 480, 60, 22], [320, 240, 60, 23], [800, 600, 75, 22], [640, 480, 75, 22], [1024, 768, 60, 21], [0, 0, 0, 22], [-2147483648, -1, 120, 22]];
          rows[index % rows.length].forEach((v, i) => put(memory, p + i * 4, v)); return 0;}
        if (method === 0x24) return fixture % 17 === args[4] ? -1 : 0;
        throw Error('Unexpected COM method.');
      }
    };};
    runtime.services = services(m, trace);
    let entry, ecx, args, action, mask = 0xff;
    if (selector === 0) {
      [640, 480, [16, 24, 32, 0][fixture % 4], [0, 60, 75, 120][fixture % 4]].forEach((v, i) => put(m, VALUES + i * 4, v));
      if (fixture % 19 === 0) {put(m, VALUES, 0x7fffffff); put(m, VALUES + 4, 0x7fffffff);}
      entry = 0x5110b0; ecx = MANAGER; args = [VALUES, fixture % 23 === 0 ? VALUES : VALUES + 4, VALUES + 8, VALUES + 12, fixture % 3]; action = () => selectRendererDisplayMode(ecx, ...args, runtime);
    } else if (selector === 1) {entry = 0x510d40; ecx = MANAGER; args = []; action = () => enumerateRendererAdapters(ecx, runtime); mask = -1;}
    else {entry = 0x513140; ecx = MANAGER + 0x47c; put(m, ecx, ROWS); put(m, ecx + 4, ROWS + 2 * 0x53c); put(m, ecx + 8, ROWS + (fixture % 2 ? 2 : 4) * 0x53c); for (let i = 0; i < 3 * 0x53c; i++) m[ROWS + i] = i * 37 + fixture & 255; args = [ROWS + (fixture % 3) * 0x53c]; action = () => appendRendererAdapter(ecx, args[0], runtime); mask = 0;}
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    machine.externalCalls.set(0xf1000000, x => {x.r.EAX = native.libraryCall('operatorNew', [ptr(x.bytes, x.r.ESP)]);}); machine.externalCalls.set(0xf1000004, x => native.libraryCall('operatorDelete', [ptr(x.bytes, x.r.ESP)]));
    machine.externalCalls.set(0xf1000008, x => {x.r.EAX = native.libraryCall('strcpy_s', [ptr(x.bytes, x.r.ESP), ptr(x.bytes, x.r.ESP + 4), ptr(x.bytes, x.r.ESP + 8)]);});
    machine.externalCalls.set(0x568a50, x => {const p = ptr(x.bytes, x.r.ESP); x.bytes.fill(x.bytes[x.r.ESP + 4], p, p + ptr(x.bytes, x.r.ESP + 8)); x.r.EAX = p;});
    for (const [method, n] of [[0x10, 1], [0x38, 4], [0x14, 4], [0x18, 3], [0x1c, 5], [0x24, 6]]) machine.externalCalls.set(0xf0000000 + method, x => {const args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = native.direct3DCall(args[0], method, args); x.r.ESP += n * 4;});
    try {const result = action(); machine.entry = entry; machine.r.ESP = S; machine.r.ECX = ecx; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      if (mask) assert.equal(machine.r.EAX & mask, result & mask); assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, selector, entry: entry.toString(16), trace: trace.slice(-8), nativeTrace: nativeTrace.slice(-8)}); throw error;}
  }
  const report = {method: 'Actual510d40 adapter enumeration and full acceptance filters/53c record/vector ownership, actual513140 and all growth/copy children,actual5110b0 mode selection with original510f60 table branches. Populated COM adapter/capability/mode records, supported/rejected/error results, aliasing and allocation. All mapped bytes>=10000h, defined returns, exact ordered CRT/Direct3D requests, synthetic FS restoration; no game mocks or original process/device execution.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererAdapters({fixtures: Number(process.argv[2] ?? 1500)})));
