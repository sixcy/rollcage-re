import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {bindArchiveDiagnosticServices} from './verify-archive-diagnostics-instructions.mjs';
import {loadInstalledLocalization, createLocalizationArchiveServices, localizationLanguages} from './probe-localized-startup.mjs';
import {initializeRawGameArchive} from '../src/game-resource-files.mjs';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {initializeLocalizedRaceMessages} from '../src/localized-startup.mjs';

export async function verifyLocalizationInstalled({installation, languages = 6, onOperation, output = 'analysis/localization-installed-instruction-check.json'} = {}) {
  const installed = await loadInstalledLocalization(installation), program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000;
  program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); memory.write('Rollcage.img\0', 0x100000); memory.writeUInt32LE(0x200000, 0x5ecb1c); memory.writeUInt32LE(0x12345678, 0x5e8890); memory.writeInt32LE(0, 0x5e8114);
  machine.reset(); memory.copy(machine.bytes); const native = createLocalizationArchiveServices(machine.bytes, installed); bindGameImageServices(machine, native); bindArchiveDiagnosticServices(machine, native); machine.bytes.writeUInt32LE(0x590800, 0x56e22c); machine.externalCalls.set(0x590800, m => {m.r.EAX = native.libraryCall('strncpy', [0, 4, 8].map(i => m.bytes.readUInt32LE(m.r.ESP + i)));});
  machine.externalCalls.set(0x568980, m => {m.r.ESP -= m.r.EAX;}); let cookies = 0;
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)); cookies++;}); machine.bytes.copy(memory);
  const source = createLocalizationArchiveServices(memory, installed), registers = {EBX: 0x303030, EBP: 0x313131, ESI: 0x323232, EDI: 0x333333}, runtime = {memory, scratchBase: S, entryRegisters: registers, services: source};
  let steps = 0, lookups = 0, decodes = 0; const reached = new Set(); machine.onInstruction = p => {reached.add(p); if (p === 0x439780) lookups++; if (p === 0x401380) decodes++;};
  const operations = [[0x401000, () => initializeRawGameArchive(0x100000, installed.index.length / 16, runtime), [0x100000, installed.index.length / 16]], [0x439090, () => loadProcessedLocalization(runtime), []], ...Array.from({length: languages}, (_, language) => [0x479420, () => {memory.writeUInt16LE(language, 0x6e65f0); machine.bytes.writeUInt16LE(language, 0x6e65f0); initializeLocalizedRaceMessages(runtime);}, []])];
  for (let operation = 0; operation < operations.length; operation++) {
    const [entry, invoke, args] = operations[operation]; invoke(); machine.entry = entry; machine.r.ESP = S; Object.assign(machine.r, registers); machine.bytes.writeInt32LE(-1, S); args.forEach((value, i) => machine.bytes.writeInt32LE(value, S + 4 + i * 4)); steps += machine.run(250000000);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000);
    if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`operation${operation} entry${entry.toString(16)} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
    const relevant = calls => calls.filter(([name]) => name !== 'strrchr'); //401000's byte-search is already computed directly in its actual reference.
    assert.deepEqual(relevant(source.calls), relevant(native.calls), `operation${operation} ordered CRT file/allocator/copy/format requests`); assert.deepEqual(source.diagnosticCalls, native.diagnosticCalls);
    onOperation?.({operation, entry: entry.toString(16), instructionSteps: steps});
  }
  const report = {matched: true, operations: operations.length, languages: localizationLanguages.slice(0, languages), actualLocalizationCalls: lookups, actualGt20Decodes: decodes, nativeCookieChecks: cookies, decodedBytes: installed.decoded.length, decodedSha256: installed.decodedSha256, instructionSteps: steps, reachedInstructions: reached.size, targetSha256: program.sha256, domain: 'Persistent actual401000 archive startup→439090/401140/401160/401380 resource8 load+preprocessing→479420/439780/439610/439580 for original installed language data. Every mapped byte>=10000h and ordered CRT file/allocator/copy/format requests match; pure strrchr is directly computed in401000 and excluded from service-order logs. Original IDX and resource8 IMG window remain read-only. Session and language roots plus CRT file/allocator/compiler guards are explicit; no original game process or language-UI producer claim.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyLocalizationInstalled({onOperation: value => console.log(JSON.stringify(value))})));
