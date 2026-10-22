import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {setApplicationViewportEnabled} from '../src/application-viewports.mjs';

export async function verifyApplicationViewports({fixtures = 1000, output = 'analysis/application-viewports-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), reached = new Set();
  const STACK = 0x9000, APP = 0x100000, HEAD = 0x110000, NAME = 0x120000, put = (m, p, v) => m.writeInt32LE(v | 0, p); let steps = 0, calls = 0;
  machine.onInstruction = address => reached.add(address);
  const servicesFor = (m, fixture) => {
    let cursor = 0x200000; const trace = [];
    return {trace, allocate(size) {const output = cursor; cursor += size + 15 & ~15; m.fill(0xa5, output, cursor); trace.push(['allocate', size]); if (fixture % 7 === 0) put(m, STACK + 8, 2); return output;}, free(address) {trace.push(['free', address]);}};
  };
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX, x.bytes.readInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a48, x => {const target = x.bytes.readUInt32LE(x.r.ESP), source = x.bytes.readUInt32LE(x.r.ESP + 4), length = x.bytes.readUInt32LE(x.r.ESP + 8); Buffer.from(x.bytes.subarray(source, source + length)).copy(x.bytes, target); x.r.EAX = target;});
  machine.externalCalls.set(0x568a50, x => {const target = x.bytes.readUInt32LE(x.r.ESP), value = x.bytes[x.r.ESP + 4], length = x.bytes.readUInt32LE(x.r.ESP + 8); x.bytes.fill(value, target, target + length); x.r.EAX = target;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0xa5, STACK - 0x1000, STACK + 32); put(memory, APP + 0x7c, HEAD);
    for (const offset of [0, 4, 8]) put(memory, HEAD + offset, HEAD); memory.writeUInt16LE(0x101, HEAD + 12);
    put(memory, 0x56e220, 0xf1000000); put(memory, 0x56e210, 0xf1000010); put(memory, 0x56e470, 0xf1000010); put(memory, 0x5e8890, fixture * 13579);
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const source = servicesFor(memory, fixture), native = servicesFor(machine.bytes, fixture), runtime = {memory, scratchBase: STACK, handlers: source};
    machine.externalCalls.set(0xf1000000, x => {x.r.EAX = native.allocate(x.bytes.readUInt32LE(x.r.ESP));}); machine.externalCalls.set(0xf1000010, x => native.free(x.bytes.readUInt32LE(x.r.ESP)));
    const names = ['', '0 Player', 'A viewport with heap backed name', 'Rear View Mirror', 'Cinematic Window', '0 Player', ''];
    for (let turn = 0; turn < names.length; turn++) {
      const name = names[(fixture + turn) % names.length], enabled = [-1, 0, 1, 2, -2147483648][(fixture + turn) % 5], pointer = turn === 0 && fixture % 3 === 0 ? 0 : NAME;
      for (const bytes of [memory, machine.bytes]) {bytes.fill(0, NAME, NAME + 256); bytes.write(name, NAME, 'latin1'); put(bytes, STACK + 4, pointer); put(bytes, STACK + 8, enabled);}
      setApplicationViewportEnabled(APP, pointer, enabled, runtime); machine.entry = 0x406b80; machine.r.ESP = STACK; machine.r.ECX = APP; put(machine.bytes, STACK, -1); steps += machine.run(1000000); calls++;
      assert.equal(machine.fs0, 0); assert.deepEqual(native.trace, source.trace);
      const a = machine.bytes.subarray(0x10000), b = memory.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, i) => v !== b[i]); assert.fail(`fixture${fixture}/turn${turn} diff${(p + 0x10000).toString(16)} native${a[p]} source${b[p]}`);}
      assert.deepEqual(machine.bytes.subarray(STACK - 44, STACK - 12), memory.subarray(STACK - 44, STACK - 12));
    }
  }
  const report = {method: 'Actual406b80 named viewport enabled writer with actual405310/string growth and404fa0/map lookup/insertion/rotations. All mapped memory>=10000h, defined key/cookie locals, allocation/free sequence and FS restoration; null/empty/heap strings, duplicate names and allocator mutation of live flag arguments. Only CRT memory/allocation/cookie boundaries; no game mocks or original execution.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyApplicationViewports({fixtures: Number(process.argv[2] ?? 1000)})));
