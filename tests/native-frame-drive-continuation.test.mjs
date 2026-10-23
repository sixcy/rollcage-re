import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeDriveContinuation, executeNativeDriveContinuation, nativeDriveOwnedRegions, nativeFrameDriveInputRegions,
  mergeNativeDriveModuleAliases, nativeDriveObservedInputRegions, replayNativeDriveFrame} from '../tools/lib/native-frame-drive-continuation.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from '../tools/check-native-frame-replay.mjs';
import {replayNativeFrameSequence} from '../tools/lib/native-frame-sequence.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), session = 0x100000, config = 0x101000, header = 0x102000, wormhole = 0x103000, material = 0x104000, esp = 0x9000;
  const put = (address, value) => memory.writeUInt32LE(value >>> 0, address);
  put(0x5ecb1c, session); put(0x5ecefc, config); put(session + 0x57c, 4); memory[session + 0x54d] = 6;
  memory[session + 0x554] = 1; memory[config + 0x28] = 1; put(0x90b990, header); put(0x80b5e0, wormhole); put(0x90a548, 288);
  put(0x5e8890, 0x12345678); memory[material + 12] = 1; put(0x6e6cac, 0x99999999); put(0x82e900, 6);
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c, body = 0x200000 + index * 0x10000;
    put(record, body); put(record + 0x7c, 99); put(body + 0x68, 65536); put(body + 0x198, material);
    put(body + 0x710, index ? 0 : 0x40); memory[body + 0x68c] = memory[body + 0x68d] = 255;
    memory.writeUInt16LE(index, body + 0x65e); put(body + 0x6a8, 0x60000); put(body + 0x6ac, 0x60000); put(body + 0x6bc, 0xffffffff);
  }
  for (let index = 0; index < 24; index++) put(0x9034a0 + index * 4, 0x300000 + index * 0x200);
  const source = {memory, span: (address, length) => memory.subarray(address, address + length), manifest: {moduleBaseAddress: 0x400000, observed: {participantCount: 6}}};
  const pair = {before: {registers: {esp}}, after: {registers: {esp, ebx: 0x118899, ebp: 0}}};
  return {source, pair, memory, session, config, header, wormhole, esp};
}

test('complete existing coordinator follows genuine surface production and accounts for inactive wormhole and enabled periodic gate', async () => {
  const proof = await createNativeDriveContinuation(); assert.equal(proof.evidence.evidenceIds.length, 4);
  const f = fixture(), result = executeNativeDriveContinuation(f);
  assert.equal(result.stage, 'complete'); assert.equal(result.calls.filter(row => row.stages).length, 6);
  assert.deepEqual(result.gates.map(row => [row.stage, row.called]), [['499de0', false], ['49ac30', true], ['469fd0', true]]);
  assert.equal(result.gates.at(-1).enabled, true, 'The real periodic procedure ran and returned before600.');
  for (let index = 0; index < 6; index++) {
    const body = 0x200000 + index * 0x10000;
    assert.equal(f.memory.readUInt32LE(body + 0x6a8), 0x60000 + (index ? 0x5000 : 0x3000) - 1024);
    assert.equal(f.memory.readUInt32LE(body + 0x6ac), 0x60000);
    assert.equal(f.memory.readUInt32LE(0x909300 + index * 0x30c + 0x7c), 0, 'Genuine target stage ran, beyond drive arithmetic.');
  }
  assert.equal(f.memory.readUInt32LE(0x6e6cac), 0, 'Genuine time-effect stage ran.');
  assert.equal(f.memory.readUInt32LE(f.esp), 0x45109c);
  assert.equal(nativeDriveOwnedRegions(f).reduce((sum, row) => sum + row.length, 0), 192);
  assert.equal(nativeDriveOwnedRegions(f).filter(row => row.id.includes('front-and-base')).length, 6);
});

test('real coordinator owns age expiry/minimum/clamp semantics rather than a synthetic decay-only producer', () => {
  const f = fixture(), body = 0x200000;
  f.memory.writeUInt32LE(0x40000, body + 0x6a8);
  f.memory.writeUInt16LE(2, body + 0x6a0); f.memory.writeUInt16LE(150, body + 0x6a2); f.memory.writeUInt32LE(0x80000, body + 0x6ac);
  executeNativeDriveContinuation(f);
  assert.equal(f.memory.readUInt32LE(body + 0x6a8), 0x80000);
  assert.equal(f.memory.readUInt32LE(body + 0x6ac), 0x60000); assert.equal(f.memory.readUInt16LE(body + 0x6a0), 0);
  assert.equal(f.memory.readUInt32LE(0x210000 + 0x6a8), 0x65000, 'Expiry breaks the first pass before later cars decay.');
});

test('enabled procedural path or active missing child context is never silently skipped', () => {
  const f = fixture(); f.memory.writeUInt32LE(1, f.wormhole + 0x188); f.memory.writeUInt32LE(1, 0x5ed02c);
  assert.throws(() => executeNativeDriveContinuation(f), error => {
    assert.equal(error.nativeDriveContinuationProgress.stage, 'procedural-and-wormhole-gates');
    assert.ok(error.nativeDriveContinuationProgress.gates[0].called); return true;
  });
});

test('explicit module aliases merge compatible overlap/adjacency and reject guessed translations', () => {
  assert.deepEqual(mergeNativeDriveModuleAliases([{address: 0x902020, targetAddress: 0xbe2020, length: 4}, {address: 0x902024, targetAddress: 0xbe2024, length: 4},
    {address: 0x902020, targetAddress: 0xbe2020, length: 8}], 0x6e0000), [{address: 0x902020, targetAddress: 0xbe2020, length: 8}]);
  assert.throws(() => mergeNativeDriveModuleAliases([{address: 0x902020, targetAddress: 0xbe2024, length: 4}], 0x6e0000), /observed module identity/);
  const snapshot = {ranges: [{address: 0xbe2020, bytes: Buffer.alloc(8)}]};
  const observed = nativeDriveObservedInputRegions(snapshot, 0x6e0000);
  assert.deepEqual(observed.map(row => row.preferredAddress), [0x902020]);
  assert.ok(!observed.some(row => row.preferredAddress === 0x80b5e0), 'Missing native bytes are never synthesized.');
  assert.equal(nativeFrameDriveInputRegions.find(row => row.preferredAddress === 0x82e880).length, 128);
});

const retained = 'analysis/native-physics-local/startup-20261022/hidden-moving-frames-capture';
test('old narrow original capture fails on actual ASLR wormhole root after genuine surface prefix', {skip: !existsSync(`${retained}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(retained), configuration = JSON.parse(await readFile(`${retained}/configuration.json`));
  const pairing = pairNativeFrameSnapshots(capture, configuration), pair = pairing.pairs[0], source = await replayNativeDriveFrame(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress});
  assert.throws(() => executeNativeDriveContinuation({source, pair}), error => {
    assert.equal(error.nativeDriveDependency.kind, 'missing-captured-input');
    assert.equal(error.nativeDriveDependency.address, source.manifest.moduleBaseAddress + 0x40b5e0);
    assert.equal(error.nativeDriveDependency.length, 4); assert.equal(error.nativeDriveContinuationProgress.calls.length, 6); return true;
  });
  assert.equal(source.manifest.aliases.filter(row => 0x902020 >= row.address && 0x902028 <= row.address + row.length).length, 1);
  const before = createCapturedMemory([...pair.before.ranges.values()]);
  assert.equal(before.memory.readUInt32LE(source.manifest.moduleBaseAddress + 0x50a548), 288, 'Retained inputs stay unchanged.');
});

const completeRetained = 'analysis/native-physics-local/startup-20261022/drive-feedback-v1-20261023';
test('original moving three-frame capture carries complete source coordinator drive outputs without captured resets', {skip: !existsSync(`${completeRetained}/trace.jsonl`)}, async () => {
  const sourceContinuation = await createNativeDriveContinuation();
  const capture = await loadPhysicsCapture(completeRetained, {expectedSha256: sourceContinuation.evidence.targetSha256});
  const configuration = JSON.parse(await readFile(`${completeRetained}/configuration.json`)), pairing = pairNativeFrameSnapshots(capture, configuration);
  const {report} = await replayNativeFrameSequence(pairing.pairs, {frameOptions: pairing.options, replayFrame: replayNativeDriveFrame, sourceContinuation, coveragePolicy: 'initial-observation'});
  assert.equal(report.matched, true); assert.equal(report.frames, 3); assert.equal(report.sourceContinuation.comparedBytes, 384);
  assert.equal(report.sourceContinuation.changedNativeBytes, 126); assert.equal(report.externallyPatchedBytes, 211903); assert.equal(report.abiRefreshedBytes, 8200);
  assert.ok(report.cases.every(row => row.comparedBytes === 4902122 && row.matched));
  assert.deepEqual(report.cases[0].nativeScenario.identity.before.activeVehicleTypes, [6,5,4,1,0,2]);
  for (const transition of report.transitions) {
    const produced = transition.sourceContinuation;
    assert.equal(produced.mismatchBytes, 0); assert.equal(produced.comparedBytes, 192); assert.equal(produced.regions.length, 36);
    assert.equal(produced.execution.stage, 'complete');
    assert.deepEqual(produced.execution.gates.map(row => [row.stage, row.called]), [['499de0', false], ['49ac30', true], ['469fd0', true]]);
    assert.equal(produced.execution.gates[0].mode, 0); assert.equal(produced.execution.gates[0].enabled, true); assert.equal(produced.execution.gates[2].enabled, true);
    assert.ok(produced.execution.inputs.every(row => row.captured));
    for (const range of transition.patchRanges) for (const [offset, length] of range.externalRuns) {
      const address = range.address + offset;
      assert.ok(produced.regions.every(row => address + length <= row.address || address >= row.address + row.length));
    }
  }
});
