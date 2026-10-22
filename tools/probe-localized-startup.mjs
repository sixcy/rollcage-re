import assert from 'node:assert/strict';
import {readFile, open, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseIndex} from '../src/archive-index.mjs';
import {decodeGT20} from '../src/gt20.mjs';
import {initializeRawGameArchive} from '../src/game-resource-files.mjs';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {initializeLocalizedRaceMessages} from '../src/localized-startup.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createGameImageServices} from './lib/game-image-fixtures.mjs';
import {createArchiveDiagnosticServices} from './verify-archive-diagnostics-instructions.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const localizationLanguages = ['ENGLISH', 'FRENCH', 'GERMAN', 'ITALIAN', 'SPANISH', 'JAPANESE'];
export async function loadInstalledLocalization(installation = 'C:/Program Files (x86)/Psygnosis/Rollcage') {
  const index = await readFile(path.join(installation, 'IDXData/Rollcage.idx')), file = await open(path.join(installation, 'IDXData/Rollcage.img'), 'r');
  try {
    const entries = parseIndex(index, (await file.stat()).size), entry = entries[8], stored = Buffer.alloc(entry.storedBytes); await file.read(stored, 0, stored.length, entry.offset);
    const decoded = entry.storedBytes === entry.decodedBytes ? stored : decodeGT20(stored).data; assert.equal(decoded.length, entry.decodedBytes);
    const imageWindow = Buffer.alloc(entry.offset + stored.length); stored.copy(imageWindow, entry.offset);
    return {index, imageWindow, decoded, entry, decodedSha256: hash(decoded), storedSha256: hash(stored), limits: 'Original IDX and compressed resource8 window at its original IMG offset; no other IMG reads are admitted by this fixture.'};
  } finally {await file.close();}
}
export function createLocalizationArchiveServices(memory, installed) {
  const base = createGameImageServices(memory, {allocationBase: 0x300000, allocationLimit: 0x580000}), diagnostic = createArchiveDiagnosticServices(memory), files = new Map(), calls = []; let nextHandle = 0x1234;
  const string = p => {let e = p; while (memory[e]) e++; return memory.toString('latin1', p, e);};
  return {calls, diagnosticCalls: diagnostic.calls, libraryCall(name, args, runtime) {
    calls.push([name, ...args]);
    if (name === 'fopen') {
      const filename = string(args[0]).toLowerCase(), data = filename.endsWith('.idx') ? installed.index : filename.endsWith('.img') ? installed.imageWindow : null;
      if (!data) return diagnostic.libraryCall(name, args, runtime);
      const handle = nextHandle++; files.set(handle, {data, cursor: 0, index: filename.endsWith('.idx')}); return handle;
    }
    if (name === 'fclose') {assert.ok(files.has(args[0]), 'Known archive file handle'); files.delete(args[0]); return 0;}
    if (name === 'fseek') {const file = files.get(args[0]); assert.ok(file); assert.equal(args[2], 0); file.cursor = args[1]; return 0;}
    if (name === 'fread') {
      const file = files.get(args[3]); assert.ok(file); const size = args[1] * args[2];
      if (!file.index) {assert.equal(file.cursor, installed.entry.offset); assert.equal(size, installed.entry.storedBytes);}
      file.data.copy(memory, args[0], file.cursor, file.cursor + size); file.cursor += size; return args[2];
    }
    if (['vsnprintf', 'fputs', 'fflush'].includes(name)) return diagnostic.libraryCall(name, args, runtime);
    if (name === 'strncpy') {let i = 0; for (; i < args[2] && memory[args[1] + i]; i++) memory[args[0] + i] = memory[args[1] + i]; memory.fill(0, args[0] + i, args[0] + args[2]); return args[0];}
    return base.libraryCall(name, args, runtime);
  }};
}
export function independentInstalledMessageRows(decoded, language) {
  const text = decoded.toString('latin1'), keyStart = text.indexOf('STRING(PC_IN_GAME_MESSAGES)'), keyEnd = text.indexOf('STRING(', keyStart + 1), section = text.slice(keyStart, keyEnd < 0 ? undefined : keyEnd);
  assert.ok(keyStart >= 0); const match = new RegExp('\\b' + language + '[\\t\\r\\n ]*\\[[\\t ]*\\r?\\n').exec(section);
  if (!match) return [];
  const begin = keyStart + match.index + match[0].length, end = text.indexOf(']', begin), rows = []; let cursor = begin;
  for (;;) {const delimiter = text.indexOf('~~', cursor); if (delimiter < 0 || delimiter >= end) break; rows.push(decoded.subarray(cursor, delimiter)); cursor = delimiter + 2; if (text[cursor] === '\r') cursor++; if (text[cursor] === '\n') cursor++;}
  return rows;
}
export async function probeLocalizedStartup({installation, output = 'analysis/localized-startup-installed-probe.json'} = {}) {
  const installed = await loadInstalledLocalization(installation), program = await loadRetainedNativeProgram(), memory = Buffer.alloc(0xa00000); program.initializeMemory(memory);
  memory.write('Rollcage.img\0', 0x100000); memory.writeUInt32LE(0x200000, 0x5ecb1c); memory.writeUInt32LE(0x12345678, 0x5e8890); memory.writeInt32LE(0, 0x5e8114);
  const services = createLocalizationArchiveServices(memory, installed), runtime = {memory, scratchBase: 0x9000, entryRegisters: {ESI: 0, EDI: 0, EBX: 0, EBP: 0}, services};
  assert.equal(memory.readInt16LE(0x5e8008), -1, 'Original archive initial mode');
  initializeRawGameArchive(0x100000, installed.index.length / 16, runtime); loadProcessedLocalization(runtime);
  const data = memory.readUInt32LE(0x6e65f4), expected = Buffer.from(installed.decoded);
  for (let i = 0; i < expected.length; i++) {if (expected[i] < 32 && expected[i] !== 9) expected[i] = 1; if (expected[i] === 126 && expected[i + 1] === 126) expected[i] = 0;}
  assert.deepEqual(memory.subarray(data, data + expected.length), expected, 'Complete actual decoded and preprocessed resource');
  const languages = [];
  for (let language = 0; language < localizationLanguages.length; language++) {
    memory.writeUInt16LE(language, 0x6e65f0); initializeLocalizedRaceMessages(runtime);
    const rows = independentInstalledMessageRows(installed.decoded, localizationLanguages[language]), results = [];
    for (let index = 0; index < 43; index++) {
      const pointer = memory.readUInt32LE(0x70ea00 + index * 4); let end = pointer; while (memory[end]) end++;
      const actual = memory.subarray(pointer, end), row = rows[index] ?? Buffer.from(' '); assert.deepEqual(actual, row.subarray(0, 255), localizationLanguages[language] + ' row' + index); results.push({bytes: actual.length, sha256: hash(actual)});
    }
    languages.push({language: localizationLanguages[language], originalRows: rows.length, matched: true, rows: results});
  }
  const report = {matched: true, originalProcessExecuted: false, resource: 8, decodedBytes: installed.decoded.length, decodedSha256: installed.decodedSha256, storedSha256: installed.storedSha256, actualArchiveStartup401000: true, actualLoadingAndPreprocessing439090: true, actualMessagePacking479420: true, languages, limits: installed.limits + ' Actual game algorithms with declared CRT file/allocator/format services and caller session/language roots; language selection UI and original-process execution are outside this installed-data probe.'};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {const report = await probeLocalizedStartup({installation: process.argv[2]}); console.log(JSON.stringify({matched: report.matched, bytes: report.decodedBytes, sha256: report.decodedSha256, languages: report.languages.map(({language, originalRows}) => ({language, originalRows}))}));}
