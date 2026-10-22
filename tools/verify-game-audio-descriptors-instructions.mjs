import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeGameAudioDescriptor} from '../src/game-audio-descriptors.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const reached = new Set(), fixtures = Number(process.argv[2] ?? 1200), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const returns = new Map([[0x40ceb1, 0x40ceb7], [0x40cec8, 0x40cece], [0x40ceea, 0x40cef0]]);
machine.onInstruction = p => {reached.add(p); if (returns.has(p)) put(machine.bytes, machine.r.ESP - 4, returns.get(p));};
let steps = 0, calls = 0, aliases = 0;
function services(m, fixture) {
  const log = [];
  return {log, libraryCall(name, args, runtime) {
    log.push([name, ...args, runtime.scratchBase]);
    const [destination, capacity, source, maximum] = args, stride = name === 'wcsncpy_s' ? 2 : 1;
    assert(capacity > 0 && capacity <= 512 && maximum < capacity, 'Admitted CRT fixture capacity');
    const values = []; let i = 0;
    for (; i < maximum; i++) {const value = stride === 2 ? m.readUInt16LE(source + i * 2) : m[source + i]; if (!value) break; values.push(value);}
    if (fixture % 7 === 0 && name === 'strncpy_s' && source === 0x56fe6b) put(m, 0x5e8890, fixture ^ 0x12345678);
    for (i = 0; i < values.length; i++) if (stride === 2) m.writeUInt16LE(values[i], destination + i * 2); else m[destination + i] = values[i];
    if (stride === 2) m.writeUInt16LE(0, destination + i * 2); else m[destination + i] = 0;
    return 0;
  }};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0xa5); program.initializeMemory(memory); const S = [0x9000, 0x9200, 0x9400][fixture % 3]; put(memory, S, -1);
  assert.equal(memory.toString('ascii', 0x5d0320, 0x5d0327), 'DEFAULT'); assert.equal(memory[0x56fe6b], 0); assert.equal(memory.readUInt16LE(0x56feb0), 0);
  const object = [0, 0x100000, 0x100003, 0x5d0300, S - 0x460, S - 0x470, S + 32][fixture % 7]; if (fixture % 7 >= 3) aliases++;
  put(memory, 0x56e21c, 0x760000); put(memory, 0x56e47c, 0x760010);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const source = services(memory, fixture), native = services(machine.bytes, fixture), registers = {EDI: fixture + 0x432100};
  for (const [address, name] of [[0x760000, 'strncpy_s'], [0x760010, 'wcsncpy_s']]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.libraryCall(name, [0, 4, 8, 12].map(o => state.bytes.readUInt32LE(state.r.ESP + o)), {scratchBase: state.r.ESP - 4});
  });
  const result = initializeGameAudioDescriptor(object, {memory, scratchBase: S, entryRegisters: registers, services: source});
  machine.entry = 0x40cea0; machine.r.ESP = S; machine.r.ECX = object; Object.assign(machine.r, registers);
  try {
    steps += machine.run(10000); assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.equal(machine.fs0, 0x12345678);
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((value, i) => value !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes[p]} source${memory[p]}`);}
    assert.deepEqual(source.log, native.log, 'Ordered actual CRT arguments and callee entry ESP');
  } catch (error) {console.error({fixture, object: object.toString(16), source: source.log, native: native.log}); throw error;}
  calls += source.log.length;
}
const path = 'src/game-audio-descriptors.mjs', report = {matched: true, method: 'Full40cea0 original instructions versus actual game-owned sample descriptor defaults. Entire memory, including low/null output and admitted object/native argument/saved-register frame aliases, return, restored TLS and exact ordered CRT arguments/callee entry ESP compare. Explicit declared secure string-copy services snapshot their inputs and append a terminator; original CRT invalid-parameter/debug-fill/undefined-overlap policy is not claimed. Actual CPU external CALL return stores are published explicitly by the interpreter observer. These defaults do not close sample loading, sound-manager virtuals, bank/voice construction, audio startup or original-process execution.', fixtures, aliases, calls, instructionSteps: steps, reachedInstructions: reached.size, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256, evidence: program.references.filter(r => /9087-|9101-|9102-/.test(r.path))};
const output = process.argv[3] ?? 'analysis/game-audio-descriptors-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify({...report, evidence: undefined}));
