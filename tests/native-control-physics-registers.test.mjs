import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveNativePhysicsEntryRegisters} from '../tools/lib/native-control-physics-registers.mjs';
import {auditSourceDerivedControlPhysicsRegisters} from '../tools/check-native-control-physics-registers.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const input = 'analysis/native-physics-local/startup-20261022/control-prefix-v4-20261023';
test('actual V4 completed source parent derives required and supported physics-entry registers without after-register inputs', async () => {
  const {report} = await auditSourceDerivedControlPhysicsRegisters(input);
  assert.equal(report.matchedDerivedRegisters, true); assert.equal(report.requiredContextRegistersMatched, true);
  assert.equal(report.sourcePrefixComplete, true); assert.equal(report.registers.length, 7);
  assert.deepEqual(report.derived.unresolved, ['eax', 'edx', 'eflags', 'fpuStatusWord', 'mxcsr-status']);
  assert.equal(report.sourceParentTrace.handlingCompleted, 6);
  assert.deepEqual(report, JSON.parse(await readFile('analysis/native-control-v4-source-physics-registers-20261023.json')));
});

test('changing only expected physics-entry EBX fails comparison while source-derived register stays6', async () => {
  const {report} = await auditSourceDerivedControlPhysicsRegisters(input, {transformExpected: expected => ({...expected, ebx: Number(expected.ebx) ^ 1})});
  assert.equal(report.matchedDerivedRegisters, false); assert.equal(report.requiredContextRegistersMatched, false);
  assert.deepEqual(report.registers.filter(row => !row.matched), [{register: 'ebx', computed: 6, observed: 7, matched: false}]);
});

test('zero handling and restoration register paths agree with original parent instructions at both image bases', async () => {
  let cases = 0;
  for (const moduleBaseAddress of [0x400000, 0x6e0000]) {
    const fixture = await loadRelocatedAudioFixture(moduleBaseAddress), actual = fixture.actual;
    const machine = new BoundedX86(fixture.instructions), memory = Buffer.from(fixture.memory), session = 0x12000, resource = 0x13000, restoreBase = 0x14000;
    memory.writeUInt32LE(session, actual(0x5ecb1c)); memory.writeUInt32LE(resource, actual(0x90b990));
    memory.writeUInt32LE(0x12345678, actual(0x5e8890)); memory[session + 0x54d] = 0;
    for (const [inputCompleted, audioCompleted] of [[0, 0], [0, 3], [4, 6]]) {
      const trace = {handlingCompleted: 0, inputCompleted, audioCompleted, sessionAfterInput: session, afterObjects: {restorationEnabled: false}};
      const derived = deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress, parentEntryEsp: 0x9000, parentEntryEdx: 7, trace});
      machine.reset(); machine.bytes = Buffer.from(memory); machine.entry = actual(0x450f8d);
      Object.assign(machine.r, {EBX: 99, EBP: 7, ESI: session, EDI: inputCompleted ? actual(0x909300) + inputCompleted * 0x30c : audioCompleted, ESP: 0x8ff0});
      machine.onInstruction = address => {if (address === actual(0x450fb9)) throw Error('declared parent register boundary');};
      assert.throws(() => machine.run(), /declared parent register boundary/);
      for (const name of ['EBX', 'EBP', 'ESI', 'EDI']) assert.equal(machine.r[name] >>> 0, derived.registers[name.toLowerCase()]);
      cases++;
    }
    for (const n of [-3, 0, 3]) {
      const trace = {handlingCompleted: 6, inputCompleted: 6, audioCompleted: 6, sessionAfterInput: session,
        afterObjects: {restorationEnabled: true, restorationCount: n, restorationBase: restoreBase}};
      const derived = deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress, parentEntryEsp: 0x9000, parentEntryEdx: 7, trace});
      memory[resource + 0xfc] = 1; memory.writeInt32LE(n, actual(0x90b998)); memory.writeUInt32LE(restoreBase, actual(0x90b994));
      for (let i = 0; i < 3; i++) memory.writeUInt32LE(0x15000 + i * 16, restoreBase + i * 24);
      machine.reset(); machine.bytes = Buffer.from(memory); machine.entry = actual(0x450fc3);
      Object.assign(machine.r, {EBX: 6, EBP: 7, ESI: session, EDI: actual(0x909300) + 6 * 0x30c, ESP: 0x8ff0});
      machine.onInstruction = address => {if (address === actual(0x451008)) throw Error('declared parent register boundary');};
      assert.throws(() => machine.run(), /declared parent register boundary/);
      for (const name of ['EBX', 'EBP', 'ESI', 'EDI']) assert.equal(machine.r[name] >>> 0, derived.registers[name.toLowerCase()]);
      cases++;
    }
  }
  assert.equal(cases, 12);
});

test('required pair remains available with incomplete optional trace; unknown ESI/EDI are omitted', () => {
  const memory = Buffer.alloc(0xa00000); memory.writeUInt32LE(0x12345678, 0x5e8890);
  const result = deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress: 0x400000, parentEntryEsp: 0x9000, parentEntryEdx: 3, trace: {handlingCompleted: 6}});
  assert.equal(result.registers.ebx, 6); assert.equal(result.registers.ebp, 3);
  assert.equal(result.registers.esi, undefined); assert.equal(result.registers.edi, undefined);
  assert.ok(result.unresolved.includes('esi')); assert.ok(result.unresolved.includes('edi'));
  assert.throws(() => deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress: 0x400000, parentEntryEsp: 0x9000, parentEntryEdx: 3, trace: {handlingCompleted: 256}}), /live byte count/);
});
