import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {findRawArchiveResource} from '../src/game-resource-files.mjs';

export async function verifyLocalizationResource({fixtures = 240, output = 'analysis/localization-resource-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, INDEX = 0x110000;
  let steps = 0, reads = 0, metadataQueries = 0; const reached = new Set(); machine.onInstruction = p => {reached.add(p); if (p === 0x401160) reads++; if (p === 0x401140) metadataQueries++;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, 0x1000, S + 128);
    const put = (p, v) => memory.writeInt32LE(v | 0, p), kind = fixture % 7, alias = kind === 6, file = Buffer.alloc(0x300);
    let payload = Buffer.from('Raw\0\x01\x02\t\n\r~~One~~~Two~~~~End~', 'latin1');
    if (kind === 0) payload = Buffer.alloc(0);
    if (kind === 1) payload = Buffer.from(Array.from({length: 256}, (_, i) => i));
    if (kind === 2 || kind === 3) payload = Buffer.from('First\r\n~~Second\0~~~Third~~~Tail~', 'latin1');
    if (alias) {payload = Buffer.alloc(32, 2); payload.writeUInt32LE(32, 20);}
    payload.copy(file, 0x40); payload.copy(file, 0x180);
    put(0x717388, INDEX); put(0x717380, kind === 2 || kind === 3 ? 0x41 : 0x180); put(0x6e4900, 0x1234); put(0x6e65f4, fixture & 1 ? 0x2f0000 : 0);
    for (const [index, offset] of [[8, 0x180], [9, 0x40]]) {
      const p = INDEX + index * 16; put(p, offset); put(p + 4, payload.length); put(p + 8, payload.length); memory.writeInt16LE(3, p + 12); memory.writeInt16LE(index === 8 && (kind === 2 || kind === 3) ? 9 : 0, p + 14);
    }
    if (kind === 2) put(INDEX + 8 * 16 + 8, Math.min(16, payload.length));
    machine.reset(); memory.copy(machine.bytes);
    const options = {file, allocationBase: alias ? 0x6e65d0 : 0x300000, allocationLimit: alias ? 0x6e6700 : 0x380000}, native = createGameImageServices(machine.bytes, options); bindGameImageServices(machine, native); machine.bytes.copy(memory); const source = createGameImageServices(memory, options);
    const registers = {ESI: 0x123456 + fixture}; loadProcessedLocalization({memory, scratchBase: S, entryRegisters: registers, services: source});
    machine.entry = 0x439090; machine.r.ESP = S; machine.r.ESI = registers.ESI; machine.bytes.writeInt32LE(-1, S); steps += machine.run(1000000);
    assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000), `fixture${fixture} complete mapped bytes`);
    assert.deepEqual(source.calls, native.calls, `fixture${fixture} exact allocation/free/seek/read order`);
    assert.equal(findRawArchiveResource(-1, {memory}), INDEX - 16, '401140 uses signed16 metadata index');
    assert.equal(findRawArchiveResource(0x10008, {memory}), INDEX + 128, '401140 truncates metadata index to signed16');
  }
  const report = {fixtures, actualResourceReads: reads, actualMetadataQueries: metadataQueries, instructionSteps: steps, reachedInstructions: reached.size, matched: true, domain: 'Actual439090→401140/401160 preprocessing producer. Full mapped bytes>=10000h and ordered CRT alloc/free/seek/read match. All controlbytes,TAB,overlapping tilde markers, empty input, nearest duplicate versus original metadata size, and allocation naturally aliasing live count globals. Raw resource fixtures; real compressed installed resource8 is checked separately. No original execution.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyLocalizationResource()));
