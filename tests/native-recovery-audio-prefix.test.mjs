import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {compareNativeRecoveryAudioPrefix} from '../tools/lib/native-recovery-audio-prefix.mjs';
import {bindCapturedNativeRecovery} from '../tools/lib/native-recovery-context.mjs';
import {verifyRawRespawnState} from '../tools/verify-raw-respawn-state-instructions.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory = 'analysis/native-physics-local/startup-20261022/controlled-recovery-sound-v8-20261023';
test('connected parent derives both ordinary and vehicle caller registers and all seven words from real game producers', async () => {
  const report = await verifyRawRespawnState({fixtures: 16, frames: 2, output: null});
  assert.equal(report.matched, true);
  assert.ok(report.audioCallerComparisons > report.ordinaryAudioCallerComparisons);
  assert.ok(report.ordinaryAudioCallerComparisons > 0);
});

test('retained native parent computes the nonzero ring ECX and complete real audio caller without native output inputs', {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
  const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration), pair = pairs[0];
  assert.equal(pairs.length, 1);
  const result = compareNativeRecoveryAudioPrefix(capture, pair, configuration);
  assert.equal(result.matched, true, JSON.stringify(result.firstDivergence));
  assert.equal(result.comparedArgumentBytes, 28);
  assert.equal(result.registers.length, 7);
  assert.notEqual(result.sourceCalls[0].survivingEcx, 0);
  assert.equal(result.sourceComplete, false);
  assert.equal(result.fullParentOutputCompared, false);
  assert.match(result.sourceError, /adaptive selector reached operatorNew12 at40dc50/);
  assert.ok(Object.isFrozen(result.sourceCalls[0]));
  assert.ok(Object.isFrozen(result.sourceCalls[0].args));
  assert.ok(Object.isFrozen(result.sourceCalls[0].entryRegisters));
  const call = capture.snapshots.find(row => row.ordinal === result.nativeCallOrdinal);
  const changed = {...capture, snapshots: capture.snapshots.map(row => row === call ? {...row, registers: {...row.registers, ebp: (Number(row.registers.ebp) + 1) >>> 0}} : row)};
  assert.equal(compareNativeRecoveryAudioPrefix(changed, pair, configuration).firstDivergence.name, 'ebp');
  const address = Number(call.registers.esp) + 16;
  //Keep native CALL/return words internally consistent, so the independent
  //source producer comparison must detect the changed surviving ring value.
  const changedArguments = {...capture, snapshots: capture.snapshots.map(row => row === call || row.breakpointId === 'recovery-sound-return' ? {...row, ranges: new Map([...row.ranges].map(([id, part]) => {
    const bytes = Buffer.from(part.bytes), offset = address - Number(part.address);
    if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
    return [id, {...part, bytes}];
  }))} : row)};
  assert.equal(compareNativeRecoveryAudioPrefix(changedArguments, pair, configuration).firstDivergence.kind, 'argument-bytes');

  //The rich frame manifest must retain the strict facade's empty-vector rule.
  //A zero extent provides no readable NULL storage, and cannot become generic.
  const empty = [...pair.before.ranges.values()].find(row => !row.bytes.length);
  assert.ok(empty);
  const bound = bindCapturedNativeRecovery(pair.before, {...pair.options, nativeAudio: true});
  assert.throws(() => bound.span(0, 1), /Uncaptured/);
  const invalid = {...pair.before, ranges: new Map([...pair.before.ranges].map(([id, row]) => [id, row === empty ? {...row, rangeMode: 'fixed'} : row]))};
  assert.throws(() => bindCapturedNativeRecovery(invalid, pair.options), /empty|zero|vector/i);
});
