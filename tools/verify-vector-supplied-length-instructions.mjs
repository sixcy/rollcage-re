import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {normalizeRawFixedVectorWithLength} from '../src/raw-vector-normalization.mjs';

const program = await loadRetainedNativeProgram(), baseline = program.initializeMemory(Buffer.alloc(0xa00000)), memory = Buffer.alloc(baseline.length), machine = new BoundedX86(program.instructions), reached = new Set();
const STACK = 0x9000, put = (m, p, v) => m.writeInt32LE(v | 0, p); let steps = 0, faults = 0, aliases = 0, seed = 0x492d10ab;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
machine.onInstruction = address => {steps++; reached.add(address);};
const fixtures = Number(process.argv[2] ?? 4000), divisors = [0, 1, 2, -1, -2, 3, -3, 65536, 256, 2147483647, -2147483648];
for (let fixture = 0; fixture < fixtures; fixture++) {
  baseline.copy(memory); memory.fill(0x36, STACK - 128, STACK + 32);
  const vector = [0x30000, 0x91d45c, STACK - 16, STACK - 20, STACK - 24][fixture % 5]; if (vector !== 0x30000) aliases++;
  for (const offset of [0, 4, 8]) put(memory, vector + offset, random());
  const length = fixture % 4 ? divisors[fixture % divisors.length] : random();
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x492d10; machine.r.ECX = vector; machine.r.EDX = length; machine.r.ESP = STACK; put(machine.bytes, STACK, -1);
  let sourceError, nativeError, result;
  try {result = normalizeRawFixedVectorWithLength(vector, length, {memory, scratchBase: STACK, nativeEntryRegisters: {ESI: 0, EBX: 0}});} catch (error) {sourceError = error;}
  try {machine.run(1000);} catch (error) {nativeError = error;}
  const kind = error => !error ? null : /(?:division|IDIV).*zero/i.test(error.message) ? 'zero' : /(?:overflows|overflow)/i.test(error.message) ? 'overflow' : 'unexpected';
  assert.equal(kind(sourceError), kind(nativeError), `${fixture} fault class`); assert.notEqual(kind(sourceError), 'unexpected', sourceError?.message);
  if (sourceError) faults++; else assert.equal(machine.r.EAX, result);
  assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000), `${fixture} mapped memory`);
  for (const offset of [-24, -20, ...(sourceError ? [] : [-8, -4])]) assert.equal(memory.readInt32LE(STACK + offset), machine.bytes.readInt32LE(STACK + offset), `${fixture} numeric${offset}`);
}
const report = {method: 'Actual492d10 supplied-length normalization and real41c990 signed64/Q16 division. All mapped bytes>=10000h, return EAX, numeric inverse/component/division locals and pre-fault writes compare. Signed32 divisors, divide-zero/quotient-overflow, extreme components and shared-global/private-numeric aliases. Private aliases include real direct-call return-address publication and explicitly supplied saved ESI/EBX inputs; caller return-slot corruption excluded. No game/library mocks or original process execution.', fixtures, aliases, faults, executedInstructions: reached.size, instructionSteps: steps, evidence: program.references.map(r => r.evidence), matched: true};
await writeFile('analysis/vector-supplied-length-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
