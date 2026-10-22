import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeTimeEffectGeometry} from '../src/race-textures.mjs';
export async function verifyRaceTextureGeometry({fixtures = 1200, output = 'analysis/race-texture-geometry-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000; let steps = 0; const reached = new Set(); machine.onInstruction = p => reached.add(p);
  machine.externalCalls.set(0x568a50, m => {const p = m.bytes.readUInt32LE(m.r.ESP), size = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], p, p + size); m.r.EAX = p;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); memory.fill(0xc9, 0x6f4ea0, 0x6f95a0); memory.writeInt32LE([-1, 0, 63, 64, 255, 0x1234, 0x7fff, 0xffff, 0x12345678][fixture % 9], 0x5ed024);
    if (fixture % 7) for (let p = 0x5ed030; p < 0x5ed2b0; p += 2) memory.writeUInt16LE((p * 73 + fixture * 16381) & 65535, p);
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); initializeTimeEffectGeometry({memory, scratchBase: S}); machine.entry = 0x40f310; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); steps += machine.run(1000000);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, matched: true, domain: 'Actual40f310→47c300 full geometry/color/material producer; original and signed-short boundary tables, all mapped bytes>=10000h.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRaceTextureGeometry()));
