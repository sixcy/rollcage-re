import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';
import {resumeNativeRaceDispatchReturn} from '../src/native-race-dispatch-return.mjs';

export async function verifyNativeRaceDispatchReturnInstructions({output} = {}) {
  const parent = await readInstructionEvidence(['001-frame-parent.json', '015-main-loop-assembly.json'], {directory: 'analysis/physics-clock-elevated-20261022/results'});
  const child = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  assert.ok([...parent.evidence, ...child.evidence].every(e => e.subject.digest.sha256 === REDUX_SHA256));
  const rows = [...parent.instructions.filter(row => row.address >= 0x450e30 && row.address <= 0x450e4d),
    parent.instructions.find(row => row.address === 0x440cd5), child.instructions.find(row => row.address === 0x450e50)].sort((a, b) => a.address - b.address);
  const totals = [0, 1, 2, 3, 0x7fffffff, 0x80000000, 0xffffffff], iterations = [0, 1, 2, 3, 0x7ffffffe, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff];
  let fixtures = 0, siblings = 0, returned = 0, instructionVisits = 0, failureCases = 0; const reached = new Set();
  for (const base of [0x400000, 0x730000]) {
    const delta = base - 0x400000, actual = p => p + delta;
    const instructions = rows.map(row => ({...row, address: actual(row.address), args: row.args.map(arg =>
      (row.op === 'CALL' || row.op.startsWith('J')) && /^0x[0-9a-f]+$/i.test(arg) ? `0x${actual(Number(arg)).toString(16)}` : arg)}));
    const machine = new BoundedX86(instructions, {entry: actual(0x450e38)});
    for (const total of totals) for (const iteration of iterations) for (const childResult of [0, 1, 0x80000000, 0xffffffff]) {
      const P = 0x9004, bytes = Buffer.alloc(64, 0x69), stack = P - 16;
      const words = [[P - 4, 0x01020304], [P, total ^ 0x5a5a5a5a], [P + 4, 0x909300], [P + 8, 0x6e66b0],
        [P + 12, 0x80f220], [P + 16, 0x902040], [P + 20, 0x91cdb0], [P + 24, actual(0x440cd5)]];
      for (const [address, value] of words) bytes.writeUInt32LE(value >>> 0, address - stack);
      const source = createCapturedMemory([{address: stack, bytes}]), interpreted = createCapturedMemory([{address: stack, bytes}]);
      const registers = {EAX: childResult, EBX: 0x11111111, ECX: 0x22222222, EDX: 0x33333333, EBP: 0x44444444, ESI: iteration, EDI: total};
      const eflags = 0x200202 | (fixtures & 0x8d5), runtime = {memory: source.memory, moduleBaseAddress: base, scratchBase: P,
        entryRegisters: {...registers, ESP: P, EIP: actual(0x450e38)}, eflags};
      const result = resumeNativeRaceDispatchReturn(runtime);
      machine.bytes = interpreted.memory; machine.r = {...Object.fromEntries(Object.entries(registers).map(([key, value]) => [key, value | 0])), ESP: P};
      machine.z = Boolean(eflags & 64); machine.s = Boolean(eflags & 128); machine.o = Boolean(eflags & 2048); machine.c = Boolean(eflags & 1); machine.p = Boolean(eflags & 4); machine.a = Boolean(eflags & 16);
      let stop;
      machine.onInstruction = address => {
        if ([actual(0x450e50), actual(0x440cd5)].includes(address)) {stop = address; throw Error('Dispatch boundary reached without executing next child/caller.');}
        instructionVisits++; reached.add(address);
      };
      assert.throws(() => machine.run(100), /Dispatch boundary reached without executing next child\/caller/);
      assert.equal(result.registers.eip, stop); assert.equal(result.kind, stop === actual(0x450e50) ? 'sibling' : 'returned');
      for (const [name, value] of Object.entries(result.registers)) if (name !== 'eip') assert.equal(value, machine.r[name.toUpperCase()] >>> 0, `fixture${fixtures} ${name}`);
      assert.deepEqual(source.span(stack, 64), interpreted.span(stack, 64), `fixture${fixtures} exact stack`);
      const status = (machine.c ? 1 : 0) | (machine.p ? 4 : 0) | (machine.a ? 16 : 0) | (machine.z ? 64 : 0) | (machine.s ? 128 : 0) | (machine.o ? 2048 : 0);
      const expectedFlags = ((eflags & ~0x8d5) | status) >>> 0;
      assert.equal((result.flags.value & result.flags.knownMask) >>> 0, (expectedFlags & result.flags.knownMask) >>> 0, `fixture${fixtures} known flags`);
      assert.equal(result.childExecuted, false);
      if (result.kind === 'sibling') siblings++; else returned++;
      if (!childResult) {failureCases++; assert.equal(result.arithmeticFlags.auxiliary, null); assert.equal(result.flags.knownMask, 0xffffffef);}
      fixtures++;
    }
  }
  const report = {schemaVersion: 1, matched: true, targetSha256: REDUX_SHA256,
    authority: 'constructed-inputs-with-retained-original-instructions', evidenceIds: [...parent.evidence, ...child.evidence].map(e => e.evidence_id),
    fixtures, siblings, returned, failureCases, instructionVisits, reachedInstructions: reached.size,
    compared: ['All supplied/derived known GPRs', 'Exact64-byte caller/argument/return stack', 'Defined status flags and preserved incoming EFLAGS bits'],
    limits: ['Next450e50 entry and outer440cd5 are observation boundaries: neither child nor caller executes in this checker.',
      'TEST auxiliary carry is architecturally undefined and deliberately excluded on the failed-child exit.',
      'Synthetic total0/signed-boundary states exercise the suffix independently; this does not assert native450d60 reaches all such combinations.',
      'No new original-process outer-return observation or continuous tick proof.']};
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, ...extra] = process.argv.slice(2); if (extra.length) throw Error('Usage: node tools/verify-native-race-dispatch-return-instructions.mjs [NEW_REPORT_PATH]');
  console.log(JSON.stringify(await verifyNativeRaceDispatchReturnInstructions({output})));
}
