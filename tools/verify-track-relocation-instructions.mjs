import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {relocateRaceTrackPointers} from '../src/track-relocation.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
const fixtures = Number(process.argv[2] ?? 1200), S = 0x9000, H = 0x100000, END = 0x44c71e;
const reached = new Set(); let steps = 0, baseAliases = 0, colorAliases = 0, sectorAliases = 0;
machine.onInstruction = address => {if (address === END) throw Error('TRACK_RELOCATION_SPAN_END'); reached.add(address); steps++;};
for (let fixture = 0; fixture < fixtures; fixture++) {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); memory.fill(0x36, S - 256, S + 32);
  const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  const base = fixture & 1 ? H : 0x180000, aliasBase = fixture % 13 === 0, aliasColor = !aliasBase && fixture % 17 === 0, aliasSector = !aliasBase && fixture % 19 === 0;
  put(0x90b970, base); put(0x90b990, H);
  memory.writeFloatLE(2, 0x5dc888); memory.writeFloatLE(255, 0x5dca40);
  for (const offset of [0x4c, 0x24, 0x14, 0x7c, 0x80, 0x18, 0x34, 0x40, 0x3c, 0x20, 0x6c, 0x70, 0xa8, 0xa4, 0x9c, 0x44, 0x74, 0xf0, 0xe4, 0xe8, 0xf8, 0x100, 0x118, 0xd4, 0x90, 0xc0, 0xec, 0x108, 0x10c, 0xd0]) put(H + offset, 0x4000 + offset * 16);
  put(H + 0x88, 0x2900); put(H + 0x8c, 0x2000); put(H + 0x98, 0x2800); put(H + 0x1c, 0x3000); put(H + 0x68, 0x9000); put(H + 0xc4, 0x9900); put(H + 0x50, -1024 + fixture);
  memory[H + 0x79] = fixture % 5; word(H + 0x66, fixture % 5); word(H + 0x2c, fixture % 5); put(H + 0x10, fixture % 4);
  for (let i = 0; i < 5; i++) put(base + 0x2008 + i * 12, i * 16 - fixture * 4);
  const colors = base + 0x44c0, models = base + 0x4180, sectors = base + 0x4140;
  for (let i = 0; i < 20; i++) memory[colors + i] = fixture * 37 + i * 31 & 255;
  for (let i = 0; i < 5; i++) {
    const model = 0x300000 + i * 0x800; put(models + i * 4, fixture % 3 === i ? 0 : model - base);
    for (const offset of [0xc, 0x18, 0x40]) put(model + offset, fixture * 127 - offset);
    put(model + 0x44, fixture & 1 ? 0 : 0x1c0); word(model + 0xa, 0xabcd);
    for (const [index, relative] of [0x200, 0x400].entries()) {
      word(model + 0x1c + index * 2, fixture & 1 << index ? relative : 0);
      put(model + relative + 0x18, -128); put(model + relative + 0xc, 256); put(model + relative + 0x44, fixture % 3 ? 0x100 : 0);
    }
    const sector = 0x400000 + i * 0x200; put(sectors + i * 4, sector - base);
    for (const offset of [0x50, 0x54, 0x28, 0x3c, 0x58, 0x2c, 0x40, 0x5c, 0x30, 0x44, 0x20, 0x48, 0x38]) put(sector + offset, fixture * 31 - offset);
    put(sector + 0x4c, [0, 1, -1, 0x7fffffff, -2147483648][fixture % 5]);
  }
  if (aliasBase) {baseAliases++; put(H + 0x8c, 0x90b968 - base); memory[H + 0x79] = 1; word(H + 0x66, 0); word(H + 0x2c, 0); put(H + 0x10, 0);}
  if (aliasColor) {colorAliases++; put(H + 0x4c, H + 0x4c - base); word(H + 0x66, 1);}
  if (aliasSector) {sectorAliases++; put(H + 0x14, H + 0x14 - base); put(H + 0x10, 1);}
  machine.reset(); memory.copy(machine.bytes);
  const result = relocateRaceTrackPointers(H, base, {memory, scratchBase: S});
  machine.entry = 0x44c46a; machine.r.ESI = H; machine.r.EDI = base; machine.r.ESP = S - 76;
  assert.throws(() => machine.run(100000), error => error.message === 'At 0x44c71e: TRACK_RELOCATION_SPAN_END', `fixture${fixture} reaches exact original span end`);
  assert.equal(machine.r.EDI >>> 0, result.base >>> 0); assert.equal(machine.r.EBP | 0, result.modelAuxiliary | 0);
  for (const offset of [0x48, 0x3c, 0x28, 0x44, 0x30, 0x38, 0x24]) assert.equal(machine.bytes.readInt32LE(S - 76 + offset), memory.readInt32LE(S - 76 + offset), `fixture${fixture} original local+${offset.toString(16)}`);
  const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
  if (!actual.equals(expected)) {const i = actual.findIndex((v, j) => v !== expected[j]); assert.fail(`fixture${fixture} byte0x${(i + 0x10000).toString(16)} native${actual[i]} source${expected[i]}`);}
}
const paths = ['src/track-relocation.mjs', 'tools/verify-track-relocation-instructions.mjs', 'tools/lib/bounded-x86.mjs'];
const sourceSnapshot = await Promise.all(paths.map(async path => ({path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')})));
const report = {method: 'Exact bounded original44c2b0 section44c46a through44c71d; stop before44c71e with an explicit diagnostic trap, not an invented native return/callee. No game or library calls inside this section. Compares every mapped byte>=10000h, seven parent local words, captured/live base and auxiliary-base registers. Synthetic tables cover empty/nonempty route/model/sector lists, duplicate-child selection, conditional null relative pointers, clamped RGB with retained alpha, wrapping signed indices and live global/color/sector-table aliases. Original surrounding loader, valid authored provenance, allocation/image/material/body/registry graphs remain open; internal helper not yet bound inside a complete runtime loader. No original-process execution.', targetSHA256: program.sha256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, baseAliases, colorAliases, sectorAliases, sourceSnapshot, evidence: program.references.filter(r => /068-loader|1264-light-native-map-producer-assembly|732-world-resource-loader-assembly/.test(r.path)), matched: true};
await writeFile('analysis/track-relocation-instruction-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({fixtures, reachedInstructions: reached.size, instructionSteps: steps, baseAliases, colorAliases, sectorAliases, matched: true}));
