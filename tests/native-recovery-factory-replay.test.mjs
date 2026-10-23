import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {attemptNativeRecoveryFactoryReplay, inspectNativeRecoveryFactoryCache} from '../tools/lib/native-recovery-factory-replay.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v8-20261023';
const available = existsSync(`${directory}/trace.jsonl`);
let input;
async function fixture() {
  return input ??= (async () => {
    const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
    const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
    assert.equal(pairs.length, 1);
    return {capture, configuration, pair: pairs[0]};
  })();
}

test('factory stop and cache input boundary retain the actual Win32 CALL and cache prologue', async () => {
  const {evidence, instructions} = await readInstructionEvidence(['11607-audio-sample-graph-4a3ac0.json', '11622-audio-sample-graph-4a7b40.json'], {directory: 'analysis/native-simulation/results'});
  assert.ok(evidence.every(row => row.subject.digest.sha256 === REDUX_SHA256));
  const at = address => instructions.find(row => row.address === address);
  assert.deepEqual(at(0x4a3b1e), {address: 0x4a3b1e, op: 'CALL', args: ['dword ptr [0x0056e084]']});
  assert.deepEqual(at(0x4a3b24), {address: 0x4a3b24, op: 'CMP', args: ['EAX', '-0x1']});
  for (const [address, name] of [[0x4a7b46, 'EBX'], [0x4a7b47, 'ESI'], [0x4a7b48, 'EDI']]) assert.deepEqual(at(address), {address, op: 'PUSH', args: [name]});
  assert.deepEqual(at(0x4a7b56), {address: 0x4a7b56, op: 'MOV', args: ['ECX', 'dword ptr [EAX]']});
});

test('original v8 factory runs real caller descriptor producers and stops before its unobserved file query', {skip: !available}, async () => {
  const {capture, configuration, pair} = await fixture();
  const result = attemptNativeRecoveryFactoryReplay(capture, pair, configuration);
  assert.equal(result.complete, false);
  assert.equal(result.matchedFullFactory, false);
  assert.equal(result.descriptorProducer.comparedBytes, 0x460);
  assert.equal(result.descriptorProducer.matched, true);
  assert.equal(result.description.name, 'SFX_PINKPURP');
  assert.equal(result.description.streaming, false);
  assert.equal(result.stop.name, 'FindFirstFileW');
  assert.equal(result.stop.returnAddress, pair.moduleBaseAddress + 0xa3b24);
  assert.deepEqual(result.stop.args, [0x4fe468, 0x4fde18]);
  assert.equal(result.stop.entryEsp, 0x4fde0c);
  assert.equal(result.stop.path, '..\\IDXData\\Redux\\Sound\\SFX_PINKPURP.wav');
  assert.equal(result.calls.length, 24);
  assert.ok(result.calls.slice(0, -1).every(row => row.kind === 'CRT'));
  assert.equal(result.allocationPreimage.file, 'snapshot-000240-range-038.bin');
  assert.equal(result.allocationPreimage.sha256, '3c0ae51927d50b0b889e41eb3915c738e92d4463bb6a78fc056747fc7a68b1ca');
  assert.deepEqual(result.inputSnapshots, {parent: 233, caller: 238, allocator: 240, immutableLiterals: 241});
});

test('original v8 cache scan runs all real path inputs and rejects changed producers', {skip: !available}, async () => {
  const {capture, pair} = await fixture();
  const result = inspectNativeRecoveryFactoryCache(capture, pair);
  assert.equal(result.matched, true);
  assert.equal(result.comparedEntries, 44);
  assert.equal(result.sourceResult, 0x10dffa48);
  assert.equal(result.entries[0].file, 'snapshot-000243-range-039.bin');
  assert.equal(result.entries.at(-1).file, 'snapshot-000286-range-039.bin');
  assert.equal(result.entries.at(-1).path, '..\\idxdata\\redux\\sound\\sfx_pinkpurp.wav');
  const corrupt = id => ({...capture, snapshots: capture.snapshots.map(snapshot => {
    if (snapshot.ordinal !== 244) return snapshot;
    const ranges = new Map(snapshot.ranges), row = ranges.get(id), bytes = Buffer.from(row.bytes);
    bytes[0] ^= 1; ranges.set(id, {...row, bytes}); return {...snapshot, ranges};
  })});
  assert.throws(() => inspectNativeRecoveryFactoryCache(corrupt('recovery-audio-cache-requested-path'), pair), /requested input changes/);
  assert.throws(() => inspectNativeRecoveryFactoryCache(corrupt('recovery-audio-cache-slot'), pair), /initial actual vector/);
});
