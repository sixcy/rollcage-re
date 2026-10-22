import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {selectRaceViewportParticipants, layoutRaceViewports} from '../src/race-viewport-layout.mjs';

export async function verifyRaceViewportLayout({fixtures = 5000, entries = [0x471770, 0x42ef80], output = 'analysis/race-viewport-layout-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), reached = new Set();
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), STACK = 0x9000, SESSION = 0x120000, CONFIG = 0x122000, AUX = 0x124000; let steps = 0, calls = 0;
  machine.onInstruction = address => reached.add(address);
  for (let fixture = 0; fixture < fixtures; fixture++) for (const entry of entries) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0xa5, 0x7000, 0x9100); memory.fill(0xa5, 0x909300, 0x90a548);
    put(memory, 0x5ecb1c, SESSION); put(memory, 0x5ecefc, CONFIG); put(memory, 0x90b990, AUX); put(memory, 0x6f9bfc, 0x12345678);
    const mode = [0, 1, 2, 3, 4, 5, 255][fixture % 7], width = [0, 1, 4, 5, 320, 640, 1920, 65535][fixture % 8], height = [0, 1, 3, 240, 480, 1080, 65535][fixture % 7];
    memory[SESSION + 0x552] = mode; memory.writeUInt16LE(width, CONFIG + 0x42c); memory.writeUInt16LE(height, CONFIG + 0x42e);
    memory[AUX + 0x30] = fixture & 255; memory[AUX + 0x31] = fixture * 11 & 255; memory[AUX + 0x32] = fixture * 37 & 255; memory[0x91d50e] = fixture * 43 & 255; memory[0x91d510] = fixture * 71 & 255;
    put(memory, 0x6eafe0, fixture % 2 ? 16 : 0); put(memory, 0x6e9f70, [-1, 0, 1, 2, 5, 6, -2147483648, 2147483647][fixture % 8]);
    for (let i = 0; i < 6; i++) put(memory, 0x6e7884 + i * 0x67c, [-1, 0, 1, 2][fixture >> i & 3]);
    for (let i = 0; i < 4; i++) put(memory, 0x5ec120 + i * 4, 0x12340000 + i);
    const indices = fixture % 5 === 0 ? [0, 0, 0, 0] : [fixture % 6, (fixture + 1) % 6, (fixture + 3) % 6, (fixture + 5) % 6];
    //Default switch cases permit a mapped raw record to overlap the live local
    //index. This is a raw arithmetic alias probe, not an ordinary participant.
    if (entry === 0x42ef80 && mode === 0 && fixture % 11 === 0) {
      const target = STACK - 36 + 0x10; let inverse = 1n; const mask = (1n << 30n) - 1n;
      for (let i = 0; i < 8; i++) inverse = inverse * (2n - 195n * inverse) & mask;
      indices[0] = Number((BigInt((target - 0x909308) >>> 0) >> 2n) * inverse & mask);
    }
    const runtime = {memory, scratchBase: STACK, entryRegisters: {ECX: indices[0], ESI: fixture * -17}};
    machine.reset(); memory.copy(machine.bytes); machine.r.ECX = indices[0]; machine.r.EDX = indices[1]; machine.r.ESI = runtime.entryRegisters.ESI; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); put(machine.bytes, STACK + 4, indices[2]); put(machine.bytes, STACK + 8, indices[3]);
    if (entry === 0x471770) selectRaceViewportParticipants(runtime); else layoutRaceViewports(...indices, runtime);
    machine.entry = entry; steps += machine.run(10000); calls++;
    const a = machine.bytes.subarray(0x10000), b = memory.subarray(0x10000);
    if (!a.equals(b)) {const p = a.findIndex((v, i) => v !== b[i]); assert.fail(`fixture${fixture}/entry${entry.toString(16)} diff${(p + 0x10000).toString(16)} native${a[p]} source${b[p]}`);}
    if (entry === 0x42ef80) for (const offset of [0x10, 0x14, 0x18, 0x1c, 0x20]) assert.equal(machine.bytes.readInt32LE(STACK - 36 + offset), memory.readInt32LE(STACK - 36 + offset));
  }
  const report = {method: 'Actual471770 participant selection and42ef80 four-argument viewport layout, original SIMD/switch bytes, all mapped memory>=10000h and defined layout locals. Network active-peer capacity/local-ID boundaries, all layout modes, unsigned16 resolution extremes, repeated indices and mapped raw record/local alias. No external calls, mocks or original process execution.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRaceViewportLayout({fixtures: Number(process.argv[2] ?? 5000)})));
