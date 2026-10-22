import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateRawLinearVelocity} from '../src/raw-linear-velocity.mjs';

const own = await readInstructionEvidence(['2407-body-stage-479b30.json'], {directory: 'analysis/native-simulation/results'});
const math = await readInstructionEvidence(['221-fixed-sqrt-assembly.json', '217-wheel-capacity-curve-assembly.json']);
const machine = new BoundedX86([...own.instructions, ...math.instructions]), memory = Buffer.alloc(0xa00000), stack = 0x9000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), reached = new Set(); let steps = 0, faults = 0, aliases = 0, clamped = 0, seed = 0x479b30ab;
const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
let definedLocals;
machine.onInstruction = address => {
  reached.add(address); if (address === 0x479c61) clamped++;
  if (address === 0x479b41) for (const offset of [-8, -4]) definedLocals.add(offset);
  if (address === 0x479bf1) for (const offset of [-20, -16, -12]) definedLocals.add(offset);
  if (address === 0x479c07) for (const offset of [-24, -8, -4]) definedLocals.add(offset);
};
const fixtures = 8000;
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); machine.reset(); definedLocals = new Set(); memory.fill(0x36, stack - 128, stack + 32);
  const body = [0x10000, 0x91d45c - 0x68, 0x91d460 - 0xa8, 0x91d45c - 0x40][fixture % 17] ?? 0x10000;
  if (body !== 0x10000) aliases++;
  memory.fill(0x5a, body, body + 0x180);
  const boundary = [0, 1, -1, 0x490000, 0x490001, -0x490001, 0x7fffffff, -2147483648, 0x800000, 0x960000];
  for (let axis = 0; axis < 3; axis++) put(memory, body + 0x40 + axis * 4, fixture % 4 ? boundary[(fixture + axis * 3) % boundary.length] : random());
  put(memory, body + 0xa8, [0, 32768, 65536, -65536, 0x7fffffff, random()][fixture % 6]);
  put(memory, body + 0xac, [0, 32768, 65536, 131072, -65536, 0x7fffffff, random()][fixture % 7]);
  memory.copy(machine.bytes); let sourceError, nativeError;
  try {updateRawLinearVelocity(body, {memory, scratchBase: stack});} catch (error) {sourceError = error;}
  machine.entry = 0x479b30; machine.r.ECX = body + 0x34; machine.r.ESP = stack; put(machine.bytes, stack, -1);
  try {steps += machine.run(20000);} catch (error) {nativeError = error;}
  assert.equal(!!nativeError, !!sourceError, `fault parity ${fixture}: ${nativeError?.message} / ${sourceError?.message}`);
  if (sourceError) {assert.match(sourceError.message, /division|quotient/); assert.match(nativeError.message, /IDIV/); faults++;}
  const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`fixture${fixture} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  //Only numerical slots that the executed branch defined are compared; saved
  //registers and return addresses are ABI data, not fabricated source locals.
  //Use native entry visits rather than final velocities to identify branches.
  //The entire candidate scratch span includes gaps containing saved registers.
  for (const offset of definedLocals) assert.equal(memory.readInt32LE(stack + offset), machine.bytes.readInt32LE(stack + offset), `local${fixture}/${offset}`);
}
const report = {method: 'Full479b30 with actual signed41ca60 root and41c990 divide. ALL mapped bytes>=10000h including pre-fault state compare; signed momentum/mass/inverse-mass boundaries, native abs(INT_MIN), overflowed sums, root-global/body aliases and matched arithmetic faults. Numerical inverse-mass locals compared; ABI saved registers/returns excluded. Synthetic instruction evidence, no original-process execution.', fixtures, faults, aliases, clampCalls: clamped, executedInstructions: reached.size, instructionSteps: steps, evidence: [...own.evidence, ...math.evidence].map(e => e.evidence_id), matched: true};
await writeFile('analysis/raw-linear-velocity-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
