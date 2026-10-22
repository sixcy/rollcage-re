import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeGameDiagnosticTables, formatGameInteger, formatGameDiagnostic, printGameDiagnostic, reportGameDiagnostic, writeGameDiagnostic, findDiagnosticResource, openDiagnosticFile, appendDiagnosticFile, truncateDiagnosticFile} from '../src/game-diagnostics.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), text = (m, p) => m.toString('latin1', p, m.indexOf(0, p)), string = (m, p, v) => {m.write(v, p, 'latin1'); m[p + Buffer.byteLength(v, 'latin1')] = 0;};
const a = {stack: 0x9000, input: 0x100000, output: 0x110000, va: 0x120000, string: 0x130000};
const imports = [
  ['OutputDebugStringA', 0x56e118, 1, true], ['SHGetFolderPathA', 0x56e4f4, 5, true], ['CopyFileA', 0x56e108, 3, true], ['GetSystemTime', 0x56e120, 1, true], ['sprintf', 0x56e224, 6, false], ['vsprintf', 0x56e274, 3, false], ['CreateFileA', 0x56e0d0, 7, true], ['GetLastError', 0x56e0e4, 0, true], ['Sleep', 0x56e0cc, 1, true], ['CloseHandle', 0x56e0bc, 1, true], ['SetFilePointer', 0x56e0e0, 4, true], ['WriteFile', 0x56e0d4, 5, true], ['free', 0x5e8004, 1, false], ['isdigit', 0x56e238, 1, false], ['atoi', 0x56e230, 1, false], ['printf', 0x56e234, 2, false], ['exit', 0x56e278, 1, false],
];
export function createDiagnosticServiceFixture(fixture, memory) {
  const trace = []; let attempts = 0, handles = 0;
  const call = (name, raw) => {
    const args = raw.map(value => value >>> 0), event = {name, args};
    if (['OutputDebugStringA', 'CreateFileA'].includes(name)) event.text = text(memory, args[0]);
    if (name === 'CopyFileA') event.text = [text(memory, args[0]), text(memory, args[1])];
    if (name === 'WriteFile') event.data = memory.subarray(args[1], args[1] + args[2]).toString('hex');
    trace.push(event);
    if (name === 'SHGetFolderPathA') {string(memory, args[4], 'C:\\Fixture Documents'); return 0;}
    if (name === 'GetSystemTime') {for (let i = 0; i < 8; i++) memory.writeUInt16LE([2026, 10, 3, 21, 12, 34, 56, 789][i], args[0] + i * 2); return 0;}
    if (name === 'CreateFileA') {
      attempts++; if ((fixture % 5 === 1 && attempts === 1) || fixture % 5 === 2) return -1;
      const handle = 0x4567 + handles++;
      if (fixture % 4 === 3) {put(memory, 0x6e6708, 1); put(memory, 0x90c0a0 + (handles + 5) * 8, handle);}
      return handle;
    }
    if (name === 'GetLastError') return fixture % 5 === 2 ? 5 : 33;
    if (name === 'WriteFile') {put(memory, args[3], args[2]); return 1;}
    return 1;
  };
  const crtCall = (name, raw) => {
    const args = raw.map(value => value >>> 0);
    if (name === 'isdigit') return args[0] >= 48 && args[0] <= 57 ? 1 : 0;
    if (name === 'atoi') return Number.parseInt(text(memory, args[0]), 10) | 0;
    if (name === 'sprintf') {const result = `${String(args[2]).padStart(2, '0')}:${String(args[3]).padStart(2, '0')}:${String(args[4]).padStart(2, '0')}.${String(args[5]).padStart(3, '0')} `; string(memory, args[0], result); return result.length;}
    if (name === 'vsprintf') {const result = text(memory, args[1]); string(memory, args[0], result); return result.length;}
    trace.push({name, args}); if (name === 'exit' || name === '__report_rangecheckfailure') throw Error(`Nonreturning service ${name}`); return 0;
  };
  return {trace, services: {platformCall: call, crtCall}};
}
export async function verifyGameDiagnostics({fixtures = 2000, output = 'analysis/game-diagnostics-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), own = await readInstructionEvidence(['3171-wormhole-bad-packet-diagnostic-assembly.json', '3181-wormhole-log-formatter-assembly.json', '3183-wormhole-log-output-assembly.json', '3185-wormhole-fatal-diagnostic-assembly.json', '3197-wormhole-log-file-open-assembly.json', '3199-wormhole-log-file-append-assembly.json', '3401-wormhole-log-integer-format-assembly.json', '3403-wormhole-log-fatal-adapter-assembly.json', '3429-wormhole-log-create-file-assembly.json', '3431-wormhole-log-append-open-assembly.json', '3433-wormhole-log-resource-index-assembly.json', '3435-wormhole-log-resource-close-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0, cookies = 0, calls = 0; const reached = new Set(), visits = {}, entries = [0x42c0f0, 0x42c2a0, 0x42bfb0, 0x4893e0, 0x489b80, 0x447c50, 0x489360, 0x4795a0, 0x4796d0, 0x479750];
  machine.onInstruction = p => {steps++; reached.add(p); if (entries.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)); initializeGameDiagnosticTables(memory); memory.fill(0x69, a.stack - 0x1000, a.stack + 128); memory.fill(0x93, 0x90c0a0, 0x90cb60); put(memory, 0x6e6708, 0);
    const which = fixture % entries.length, entry = entries[which], format = ['plain diagnostic', 's=%5s n=%08d i=%i u=%u x=%X small=%x o=%o b=%b p=%p c=%c %%', '\r\n', 'one\r\n\n', ''][Math.floor(fixture / 10) % 5];
    string(memory, a.input, format); string(memory, a.string, ['A', '12345', 'abcdef'][fixture % 3]); string(memory, 0x7134a0, 'C:\\Existing Diagnostics.txt'); put(memory, 0x6e6c90, fixture & 1);
    const va = [a.string, -2147483648, -1, -1, 0xabcdef, 0x1234, 511, 31, 0x1234, 65]; va.forEach((v, i) => put(memory, a.va + i * 4, v)); put(memory, 0x6f9bf8, a.va);
    for (let i = 0; i < imports.length; i++) put(memory, imports[i][1], 0xa10000 + i * 4);
    machine.reset(); memory.copy(machine.bytes); const js = createDiagnosticServiceFixture(fixture, memory), native = createDiagnosticServiceFixture(fixture, machine.bytes), runtime = {memory, scratchBase: a.stack, services: js.services};
    for (let i = 0; i < imports.length; i++) {const [name, , count, stdcall] = imports[i]; machine.externalCalls.set(0xa10000 + i * 4, m => {const args = Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4)); m.r.EAX = (['sprintf', 'vsprintf', 'free', 'isdigit', 'atoi', 'printf', 'exit'].includes(name) ? native.services.crtCall : native.services.platformCall)(name, args); if (stdcall) m.r.ESP += count * 4;});}
    let ecx = a.input, edx = 0, args = [], result;
    try {
      if (which === 0) {ecx = a.output; edx = [0, -1, -2147483648, 0xabcdef, 31][Math.floor(fixture / 10) % 5]; args = [[100, 105, 117, 88, 120, 98, 111, 112, 255][Math.floor(fixture / 50) % 9], [0, 1, 8, 16, 33][Math.floor(fixture / 450) % 5]]; result = formatGameInteger(ecx, edx, args[0], args[1], runtime);}
      else if (which === 1) result = formatGameDiagnostic(ecx, runtime);
      else if (which === 2) {args = [a.input, ...va]; printGameDiagnostic(a.input, va, runtime);}
      else if (which === 3) {string(memory, a.input, 'Bad network wormhole data.'); string(machine.bytes, a.input, 'Bad network wormhole data.'); args = [a.input]; reportGameDiagnostic(a.input, [], runtime);}
      else if (which === 4) writeGameDiagnostic(a.input, runtime);
      else if (which === 5) result = findDiagnosticResource(ecx, runtime);
      else if (which === 6) result = openDiagnosticFile(ecx, 0xc0000000, 2, runtime);
      else if (which === 7) {edx = 0x40000000; result = openDiagnosticFile(ecx, 0xc0000000, 3, runtime);}
      else if (which === 8) {edx = a.string; args = [3]; appendDiagnosticFile(ecx, edx, 3, runtime);}
      else truncateDiagnosticFile(runtime);
      machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((v, i) => put(machine.bytes, a.stack + 4 + i * 4, v)); machine.run(3_000_000); calls++;
      if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0);
      assert.deepEqual(native.trace, js.trace, `services${fixture}`);
      const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`fixture${fixture}/entry${entry.toString(16)} byte0x${(offset + 0x10000).toString(16)} native${actual[offset]} JS${expected[offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16), trace: {native: native.trace, js: js.trace}}); throw error;}
  }
  const report = {method: 'Actual game formatter/integer formatter42c2a0/42c0f0, diagnostic42bfb0/4893e0, logger489b80, file adapters479750/4796d0/489360/4795a0 and resource lookup/free447c50/401230. Original switch/literal bytes, game width/prefix/sign/newline/rotation/retry/ownership choices; all mapped memory>=10000h and exact ordered Windows/CRT service requests compared. Deterministic declared Windows debug/path/time/file and CRT services only; no host file/device/process execution. Valid bounded integer widths<=33; negative/overflowing formatter stack domains are explicit limits. Fatal exit adapter retained but not part of returning-call fixtures.', targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameDiagnostics()));
