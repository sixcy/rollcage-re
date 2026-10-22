import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {formatGameDiagnostic, appendGameDiagnostic, openGameDiagnosticLog} from '../src/archive-diagnostics.mjs';
export const diagnosticString = (m, p) => {let e = p; while (m[e]) e++; return m.toString('latin1', p, e);};
export function createArchiveDiagnosticServices(memory, {failOpen = false, mutateStream = false} = {}) {
  const calls = [];
  return {calls, libraryCall(name, args) {
    if (name === 'vsnprintf') {
      const [destination, capacity, format, argumentsAddress] = args; let n = 0;
      const text = diagnosticString(memory, format).replace(/%([%sdux])/g, (_, kind) => {if (kind === '%') return '%'; const value = memory.readUInt32LE(argumentsAddress + n++ * 4); return kind === 's' ? diagnosticString(memory, value) : kind === 'd' ? String(value | 0) : kind === 'u' ? String(value) : value.toString(16);});
      const bytes = Buffer.from(text, 'latin1'); bytes.copy(memory, destination, 0, capacity); if (bytes.length < capacity) memory[destination + bytes.length] = 0;
      calls.push([name, ...args, text]); return bytes.length < capacity ? bytes.length : -1;
    }
    if (name === 'fopen') {calls.push([name, ...args, diagnosticString(memory, args[0]), diagnosticString(memory, args[1])]); return failOpen ? 0 : 0x765432;}
    if (name === 'fputs') {calls.push([name, diagnosticString(memory, args[0]), args[1]]); if (mutateStream) memory.writeUInt32LE(0x345678, 0x6e4908); return 1;}
    if (name === 'fflush') {calls.push([name, ...args]); return 0;}
    throw Error(`Unadmitted diagnostic fixture CRT ${name}.`);
  }};
}
export function bindArchiveDiagnosticServices(machine, services) {
  for (const [address, name, count] of [[0x5688ae, 'vsnprintf', 4], [0x5688a8, 'fputs', 2], [0x5685c2, 'fflush', 1], [0x5685c8, 'fopen', 2]]) machine.externalCalls.set(address, m => {m.r.EAX = services.libraryCall(name, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4)));});
}
export async function verifyArchiveDiagnostics({fixtures = 360, output = 'analysis/archive-diagnostics-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000;
  let steps = 0, formatted = 0, fileWrites = 0; const reached = new Set(); machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, 0x1000, S + 128);
    const put = (p, v) => memory.writeInt32LE(v | 0, p), variant = Math.floor(fixture / 3), entry = [0x401300, 0x4012c0, 0x401260][fixture % 3];
    put(0x5e8114, variant % 7 ? 1 : 0); put(0x5e8118, variant & 1); put(0x6e4908, variant % 4 ? 0x123456 : 0); put(0x6e490c, variant & 2);
    memory.write('Value%s:%d%%\0', 0x100000); memory.write((variant % 9 ? 'Text' + variant : 'Long'.repeat(600)) + '\0', 0x110000);
    put(S + 4, fixture % 3 ? 0x110000 : 0x100000); put(S + 8, 0x110000); put(S + 12, -123 - fixture);
    machine.reset(); memory.copy(machine.bytes);
    const options = {failOpen: variant % 5 === 0, mutateStream: variant % 3 === 0}, source = createArchiveDiagnosticServices(memory, options), native = createArchiveDiagnosticServices(machine.bytes, options); bindArchiveDiagnosticServices(machine, native);
    const registers = {EBX: 0x123456 + fixture, ESI: 0x234567 + fixture, EDI: 0x345678 + fixture}, runtime = {memory, scratchBase: S, entryRegisters: registers, services: source};
    if (entry === 0x401300) formatGameDiagnostic(0x100000, runtime); else if (entry === 0x4012c0) appendGameDiagnostic(0x110000, runtime); else openGameDiagnosticLog(runtime);
    machine.entry = entry; machine.r.ESP = S; Object.assign(machine.r, registers); machine.bytes.writeInt32LE(-1, S); steps += machine.run(1000000);
    assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000), `fixture${fixture} all mapped memory`);
    assert.deepEqual(source.calls, native.calls, `fixture${fixture} exact ordered CRT requests and complete formatted output`);
    if (entry === 0x401300) assert.deepEqual(memory.subarray(S - 0x7d0, S), machine.bytes.subarray(S - 0x7d0, S), 'Actual2000-byte diagnostic local');
    formatted += source.calls.filter(([name]) => name === 'vsnprintf').length; fileWrites += source.calls.filter(([name]) => name === 'fputs').length;
  }
  const report = {fixtures, formattedCalls: formatted, fileWrites, instructionSteps: steps, reachedInstructions: reached.size, matched: true, domain: 'Actual401300→4012c0→401260 with original lazy-open/header/live-stream/truncation policies. All mapped memory>=10000h, full2000-byte formatter local and complete ordered CRT formatting/open/write/flush requests match. Genuine CRT implementations are explicit services; no original process or real log file writes.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyArchiveDiagnostics()));
