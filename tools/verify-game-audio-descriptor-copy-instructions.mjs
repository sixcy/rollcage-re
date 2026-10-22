import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createGameAudioCopyServices} from './lib/game-audio-copy-fixtures.mjs';
import {copyGameAudioDescriptor} from '../src/game-audio-descriptor-copy.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const reached = new Set(), fixtures = Number(process.argv[2] ?? 1400), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const returns = new Map([[0x40d8d2, 0x40d8d8], [0x40d8e8, 0x40d8ee], [0x40d909, 0x40d90f]]);
machine.onInstruction = p => {reached.add(p); if (returns.has(p)) put(machine.bytes, machine.r.ESP - 4, returns.get(p));};
let steps = 0, totalCalls = 0, aliases = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0xa5); program.initializeMemory(memory); const S = [0x9000, 0x9200, 0x9400][fixture % 3], input = fixture % 11 ? 0x110000 : 0;
  for (let i = 0; i < 0x460; i++) memory[input + i] = i * 7 + fixture & 255;
  memory.write('TestSample\0', input); memory.write('BANK\0', input + 24); memory.write('Sound.wav\0', input + 48, 'utf16le');
  put(memory, S, -1); put(memory, S + 4, input);
  const output = [0x100000, input, input + 1, Math.max(0, input - 3), input + 4, S - 0x460, S + 32][fixture % 7];
  if (fixture % 7) aliases++;
  put(memory, 0x56e21c, 0x760000); put(memory, 0x56e47c, 0x760010);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const services = m => createGameAudioCopyServices(m, {onCall(name) {if (fixture % 13 === 0 && name === 'wcsncpy_s') put(m, 0x5e8890, fixture ^ 0x12345678);}});
  const source = services(memory), native = services(machine.bytes), registers = {EBX: fixture + 0x123400, EDI: fixture + 0x432100};
  for (const [address, name] of [[0x760000, 'strncpy_s'], [0x760010, 'wcsncpy_s']]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.libraryCall(name, [0, 4, 8, 12].map(o => state.bytes.readUInt32LE(state.r.ESP + o)), {scratchBase: state.r.ESP - 4});
  });
  const result = copyGameAudioDescriptor(output, input, {memory, scratchBase: S, entryRegisters: registers, services: source});
  machine.entry = 0x40d8c0; machine.r.ESP = S; machine.r.ECX = output; Object.assign(machine.r, registers);
  try {
    steps += machine.run(10000); assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.equal(machine.fs0, 0x12345678);
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((value, i) => value !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes[p]} source${memory[p]}`);}
    assert.deepEqual(source.calls, native.calls, 'Secure copies and exact entry ESP');
  } catch (error) {console.error({fixture, output, input, source: source.calls, native: native.calls}); throw error;}
  totalCalls += source.calls.length;
}
const path = 'src/game-audio-descriptor-copy.mjs';
const report = {matched: true, method: 'Actual40d8c0 descriptor strings and live forward DWORD/byte copy. Entire memory, including low/null input/output and admitted descriptor/saved-register/argument frame aliases, EAX, TLS and ordered genuine secure-copy CRT requests/callee ESP compare. External CALL return stores are actual CPU producers explicitly published by the native observer. CRT copy overlap/terminator behavior is a declared fixture contract, not original CRT internals. Sample allocation, asynchronous WAV resolution, bank/device objects and complete audio startup remain separate.', fixtures, aliases, totalCalls, instructionSteps: steps, reachedInstructions: reached.size, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, evidence: program.references.filter(r => /9108-/.test(r.path)), targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/game-audio-descriptor-copy-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify({...report, evidence: undefined}));
