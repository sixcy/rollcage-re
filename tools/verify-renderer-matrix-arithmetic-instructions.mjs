import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeRendererSceneConstants} from '../src/renderer-scene-nodes.mjs';
import {determinantRendererMatrix, invertRendererMatrix, copyTransposedRendererMatrix, transposeRendererMatrix} from '../src/renderer-matrix-arithmetic.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererMatrixArithmetic({fixtures = 2400, output = 'analysis/renderer-matrix-arithmetic-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}, entries = [0x4a55a0, 0x4a5430, 0x52db70, 0x52dc50]; let steps = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = initializeRendererSceneConstants(program.initializeMemory(Buffer.alloc(0xa00000))), matrix = 0x100000, variant = Math.floor(fixture / 4), selector = fixture % 4, outputObject = [0x110000, matrix, matrix + 4][variant % 3], r = {memory: m, scratchBase: [0x9000, 0x9200, 0x9400][variant % 3]};
    m.fill(0x69, 0x7000, 0x9600); for (let i = 0; i < 16; i++) m.writeFloatLE(i % 5 ? ((fixture * 17 + i * 7) % 15 - 7) / 8 : 2 + i / 8, matrix + i * 4); if (variant % 7 === 0) m.fill(0, matrix, matrix + 64); else if (variant % 7 === 1) Buffer.from(m.subarray(matrix, matrix + 16)).copy(m, matrix + 16);
    machine.reset(); m.copy(machine.bytes); let args, result;
    try {
      if (!selector) {args = [variant % 5]; result = determinantRendererMatrix(matrix, args[0], r);}
      else if (selector === 1) {args = [outputObject]; result = invertRendererMatrix(matrix, outputObject, r);}
      else if (selector === 2) {args = [outputObject]; result = copyTransposedRendererMatrix(matrix, outputObject, r);}
      else {args = []; result = transposeRendererMatrix(matrix, r);}
      machine.entry = entries[selector]; machine.r.ESP = r.scratchBase; machine.r.ECX = matrix; put(machine.bytes, r.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, r.scratchBase + 4 + i * 4, v)); machine.run(3_000_000);
      if (!selector) assert.ok(Object.is(machine.scalars.XMM0, result)); else assert.equal(machine.r.EAX, result);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entries[selector].toString(16), outputObject: outputObject.toString(16)}); throw error;}
  }
  const report = {method: 'Actual4a55a0 recursive first-column determinant dimensions0..4,4a5430 live-cofactor inverse including singular identity fallback,52db70 copied transpose and52dc50 in-place transpose through real4021b0. No external/game handlers. All mapped memory>=10000h and actual EAX/XMM0 returns compared. Disjoint,in-place,partial overlap outputs,three native entryESPs and finite/singular matrices. No original process execution.', targetSha256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererMatrixArithmetic()));
