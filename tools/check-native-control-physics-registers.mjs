import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from './lib/native-control-capture.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {loadRelocatedAudioFixture} from './lib/relocated-audio-fixtures.mjs';
import {deriveControlPhysicsRegisterCandidates, deriveNativePhysicsEntryRegisters} from './lib/native-control-physics-registers.mjs';
import {replayNativeControlPrefix} from './lib/native-frame-control-continuation.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

export async function auditNativeControlPhysicsRegisters(input, {output = null, expectedRegisters = null} = {}) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const pairing = pairNativeControlSnapshots(capture, JSON.parse(await readFile(path.join(input, 'configuration.json'))));
  assert.equal(pairing.pairs.length, 1); const pair = pairing.pairs[0];
  const derived = deriveControlPhysicsRegisterCandidates(pair.before);
  const evidence = await readInstructionEvidence(['310-race-step-parent-assembly.json', '312-race-handling-scale-assembly.json',
    '277-vehicle-state-42a9a0-assembly.json', '289-vehicle-state-494f60-assembly.json', '287-vehicle-state-429f30-assembly.json',
    '199-race-progress-pass-assembly.json'], {directory: 'analysis/native-simulation/results'});
  assert.ok(evidence.evidence.every(row => row.subject?.digest?.sha256 === REDUX_SHA256));
  const original = await loadRelocatedAudioFixture(pair.moduleBaseAddress), cookie = original.actual(0x5e8890);
  const cookieCode = original.memory.subarray(original.actual(0x568162), original.actual(0x568162) + 10);
  assert.equal(cookieCode.subarray(0, 2).toString('hex'), '3b0d'); assert.equal(cookieCode.readUInt32LE(2), cookie);
  assert.equal(cookieCode.subarray(6).toString('hex'), '7502f3c3');
  const expected = expectedRegisters ?? pair.after.registers;
  const registers = Object.entries(derived.candidates).map(([register, candidate]) => ({register, candidate, observed: Number(expected[register]), matched: candidate === Number(expected[register])}));
  const report = {schemaVersion: 1, method: 'conditional-input-only-prephysics-register-diagnostic', targetSha256: REDUX_SHA256,
    captureDirectory: path.resolve(input), beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, tid: pair.before.tid, logicalClock: pair.logicalClock,
    evidenceIds: evidence.evidence.map(row => row.evidence_id), cookieSuccessCode: {preferredAddress: 0x568162, actualAddress: original.actual(0x568162), bytesHex: cookieCode.toString('hex'),
      semantics: 'CMP ECX,[actual security cookie]; JNZ failure; REP RET. Success preserves ECX and the other general registers.'},
    ...derived, matchedConditionalCandidates: registers.every(row => row.matched), registers,
    finalVolatileDerivation: {eax: 'Active420500 returns live participant count minus removed records; neutral nonempty branch returns count. Other branches require their actual incoming/live values.',
      edx: 'Active420500 returns leader progress after genuine449640; neutral nonempty branch returns end-record pointer. Zero/removal branches retain branch-dependent earlier EDX.',
      v3ProducerGap: 'Leader record progress changes3484 to3555 between actual entry and physics entry. Entry-only leader progress predicts10d9ch, whereas actual EDX10de3h needs the missing449640 producer. Those output values are diagnostic observations, never candidate inputs.'},
    limits: ['The full source V3 prefix still stops42a6e0. Matching these conditional candidates does not prove completed source register derivation or authorize their use as a closed physics context.',
      'Actual after registers are comparison values only. EFLAGS, x87 status, MXCSR status and full private stack/CPU ABI are not derived.',
      'No original game launch, observed child-result injection, or shared control-helper change occurs.']};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
}

export async function auditSourceDerivedControlPhysicsRegisters(input, {output = null, transformExpected = null} = {}) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const pairing = pairNativeControlSnapshots(capture, JSON.parse(await readFile(path.join(input, 'configuration.json'))));
  assert.equal(pairing.pairs.length, 1); const pair = pairing.pairs[0];
  const source = replayNativeControlPrefix(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress});
  assert.equal(source.report.stop, '0x4749e0'); assert.ok(source.report.parentTrace);
  const derived = deriveNativePhysicsEntryRegisters({memory: source.memory, moduleBaseAddress: pair.moduleBaseAddress,
    parentEntryEsp: Number(pair.before.registers.esp), parentEntryEdx: Number(pair.before.registers.edx), trace: source.report.parentTrace});
  const expected = transformExpected ? transformExpected({...pair.after.registers}) : pair.after.registers;
  const registers = Object.entries(derived.registers).map(([register, computed]) => ({register, computed, observed: Number(expected[register]), matched: computed === Number(expected[register])}));
  const report = {schemaVersion: 1, method: 'completed-source-prephysics-register-derivation', targetSha256: REDUX_SHA256,
    captureDirectory: path.resolve(input), beforeOrdinal: pair.before.ordinal, afterOrdinal: pair.after.ordinal, tid: pair.before.tid,
    logicalClock: pair.logicalClock, moduleBaseAddress: pair.moduleBaseAddress, sourcePrefixComplete: true,
    matchedDerivedRegisters: registers.every(row => row.matched), requiredContextRegistersMatched: registers.filter(row => ['ebx', 'ebp'].includes(row.register)).every(row => row.matched),
    sourceParentTrace: source.report.parentTrace, derived, registers,
    limits: ['All derived values come from completed source parent control flow, its live source memory and original450e50 input ESP/EDX; actual4749e0 registers are comparison only.',
      'This report does not execute4749e0 physics. EAX/EDX, status flags and full private ABI remain omitted.',
      'Matching required EBX/EBP permits a source-derived body-effect entry context; it does not alone prove a joined prefix/physics output comparison.']};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return {report, source, pair};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, mode] = process.argv.slice(2); if (!input || !output || mode !== undefined && mode !== '--source') throw Error('Usage: node tools/check-native-control-physics-registers.mjs CAPTURE_DIRECTORY NEW_REPORT_JSON [--source]');
  const report = mode === '--source' ? (await auditSourceDerivedControlPhysicsRegisters(input, {output})).report : await auditNativeControlPhysicsRegisters(input, {output});
  console.log(JSON.stringify(mode === '--source' ? {matchedDerivedRegisters: report.matchedDerivedRegisters, requiredContextRegistersMatched: report.requiredContextRegistersMatched, registers: report.registers, unresolved: report.derived.unresolved}
    : {matchedConditionalCandidates: report.matchedConditionalCandidates, completeSourceDerivation: report.completeSourceDerivation, registers: report.registers, unresolved: report.unresolved}));
}
