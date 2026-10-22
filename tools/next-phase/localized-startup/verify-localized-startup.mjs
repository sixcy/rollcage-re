import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from '../../lib/retained-native-program.mjs';
import {BoundedX86} from '../../lib/bounded-x86.mjs';
import {initializeLocalizedRaceMessages} from './localized-startup.mjs';

const string = (m, p) => {let e = p; while (m[e]) e++; return m.toString('latin1', p, e);};
const setString = (m, p, value) => {const b = Buffer.from(value, 'latin1'); b.copy(m, p); m[p + b.length] = 0;};
export async function verifyLocalizedStartup({fixtures = 24, languageOnly = false, onFixture, output = 'analysis/localized-startup-next-phase-alias-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, frame = S - 0x1114, SOURCE = 0x200000;
  let steps = 0, cookieChecks = 0, lookups = 0, copies = 0, truncations = 0; const reached = new Set();
  machine.onInstruction = p => {reached.add(p); if (p === 0x439780) lookups++;};
  machine.externalCalls.set(0x568980, m => {m.r.ESP -= m.r.EAX;});
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890), 'Actual native security-cookie argument'); cookieChecks++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, 0x1000, S + 128);
    assert.equal(string(memory, 0x5d3454), 'PC_IN_GAME_MESSAGES');
    const kind = languageOnly ? 2 : fixture % 12, language = languageOnly ? fixture % 6 : Math.floor(fixture / 2) % 6, session = kind === 9 ? 0x5ebffc : kind === 10 ? 0x70dec0 : 0x100000;
    memory.fill(0xa5, session, session + 0x1400); memory.writeUInt32LE(session, 0x5ecb1c); memory.writeUInt32LE(0x12345678 ^ fixture, 0x5e8890); memory.writeUInt16LE(language, 0x6e65f0);
    const rows = Array.from({length: kind === 3 ? 0 : kind === 4 ? 2 : 43}, (_, i) => kind === 5 && i < 3 ? String(i).padStart(2, '0') + 'X'.repeat(254) : kind === 6 ? 'R'.repeat(44) : kind === 7 && i < 9 ? i % 3 ? 'Z'.repeat(255) : 'Q'.repeat(256) : (kind === 8 && i === 3) || (kind === 9 && i === 0) ? '' : kind === 11 ? 'E'.repeat(47) : `Row${i} marker\x01 tail`);
    const languages = ['ENGLISH', 'FRENCH', 'GERMAN', 'ITALIAN', 'SPANISH', 'JAPANESE'];
    let text = '@STRING(' + (kind === 1 ? 'MISSING_KEY' : 'PC_IN_GAME_MESSAGES') + ')\n[\n';
    for (const [n, name] of languages.entries()) text += name + '\n[\n' + rows.map(row => (languageOnly && row ? String.fromCharCode(65 + n) + row.slice(1) : row) + '\0~').join('') + ']\n';
    text += ']\n'; setString(memory, SOURCE, text); memory.writeUInt32LE(kind === 0 ? 0 : SOURCE, 0x6e65f4); memory.writeUInt32LE(Buffer.byteLength(text, 'latin1'), 0x6e65e4);
    memory.writeUInt32LE(0x590800, 0x56e22c);
    machine.reset(); memory.copy(machine.bytes); const nativeCalls = [], sourceCalls = [];
    const services = (m, calls) => ({libraryCall(name, [destination, source, size]) {
      calls.push([name, destination, source, size]); if (name === 'memcpy') Buffer.from(m.subarray(source, source + size)).copy(m, destination);
      else {let i = 0; for (; i < size && m[source + i]; i++) m[destination + i] = m[source + i]; m.fill(0, destination + i, destination + size);}
      return destination;
    }});
    const nativeServices = services(machine.bytes, nativeCalls), sourceServices = services(memory, sourceCalls);
    for (const [address, name] of [[0x568a48, 'memcpy'], [0x590800, 'strncpy']]) machine.externalCalls.set(address, m => {m.r.EAX = nativeServices.libraryCall(name, [0, 4, 8].map(o => m.bytes.readUInt32LE(m.r.ESP + o)));});
    const registers = {EBX: 0x303030 + fixture, EBP: 0x313131 + fixture, ESI: 0x323232 + fixture, EDI: 0x333333 + fixture};
    initializeLocalizedRaceMessages({memory, scratchBase: S, entryRegisters: registers, services: sourceServices});
    machine.entry = 0x479420; machine.r.ESP = S; Object.assign(machine.r, registers); machine.bytes.writeInt32LE(-1, S); steps += machine.run(80000000);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000);
    if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture} kind${kind} language${language} diff0x${(offset + 0x10000).toString(16)} native${expected[offset]} source${actual[offset]}`);}
    assert.deepEqual(memory.subarray(frame + 16, S - 4), machine.bytes.subarray(frame + 16, S - 4), 'Actual parent-owned string buffers');
    assert.equal(memory.readUInt32LE(S - 4), machine.bytes.readUInt32LE(S - 4), 'Actual parent cookie producer');
    assert.deepEqual(sourceCalls, nativeCalls, 'Ordered real CRT copies and their exact addresses');
    const sentinel = memory.readUInt32LE(0x70ea00 + 43 * 4); for (let i = 43; i < 64; i++) assert.equal(memory.readUInt32LE(0x70ea00 + i * 4), sentinel);
    assert.equal(string(memory, sentinel), ' ');
    if (kind === 0 || kind === 1) for (let i = 0; i < 43; i++) assert.equal(string(memory, memory.readUInt32LE(0x70ea00 + i * 4)), ' ');
    if (kind === 2) assert.equal(string(memory, memory.readUInt32LE(0x70ea00)), (languageOnly ? String.fromCharCode(65 + language) : 'R') + 'ow0 marker tail');
    if (kind === 11) assert.equal(memory.readUInt32LE(0x70ea00 + 39 * 4), session + 0xb20, 'Exact arena-end equality rejects the row');
    copies += nativeCalls.filter(([name]) => name === 'memcpy').length; truncations += nativeCalls.filter(([name]) => name === 'strncpy').length;
    onFixture?.(fixture);
  }
  const parentEvidence = await Promise.all(['9013-startup-child-479420-procedure_pseudo_code.json', '9014-startup-child-479420-procedure_assembly.json'].map(async file => JSON.parse(await readFile('analysis/native-simulation/results/' + file)).structuredContent.evidence_id));
  const report = {matched: true, prototype: 'tools/next-phase/localized-startup/localized-startup.mjs', targetSha256: program.sha256, parentEvidence, fixtures, distinctLanguagePayloads: languageOnly, actualLocalizationCalls: lookups, copies, truncations, nativeCookieChecks: cookieChecks, instructionSteps: steps, reachedInstructions: reached.size, domain: 'Actual479420→439780→439610→439580; full mapped bytes>=10000h, all parent-owned string scratch/cookie bytes and ordered CRT copies. Six language selections, missing roots/keys/rows, truncation/arena-boundary behavior, live session reloads and arena/message-table overlap. Existing processed localization input is caller supplied. Stack-probe/security-cookie/strncpy/memcpy are explicit compiler/CRT fixtures; no original process execution or localization preprocessing claim.'};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyLocalizedStartup()));
