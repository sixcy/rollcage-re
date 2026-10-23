import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeRecoveryLeafSnapshots} from '../tools/check-native-recovery-leaf-replay.mjs';
import {replayNativeRecoveryLeaf, compareNativeRecoveryLeafPair} from '../tools/lib/native-recovery-leaf-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

for (const [stage, comparedBytes] of [['query', 4903324], ['apply', 4970512]]) {
  const directory = `analysis/native-physics-local/startup-20261022/controlled-recovery-${stage}-v2-20261023`;
  test(`retained original recovery ${stage} matches complete leaf state and rejects a changed body byte`, {skip: !existsSync(`${directory}/trace.jsonl`)}, async () => {
    const capture = await loadPhysicsCapture(directory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(`${directory}/configuration.json`, 'utf8'));
    const {pairs} = pairNativeRecoveryLeafSnapshots(stage, capture, configuration);
    assert.equal(pairs.length, 1);
    const pair = pairs[0], input = pair.controlledInput;
    assert.equal(input.authority, 'controlled-native-recovery-input');
    assert.equal(input.clock, 228); assert.equal(input.callerRawHit, 229);
    assert.equal(input.guards.filter(row => row.noOp).length, 3);
    assert.equal(input.guards.at(-1).originalBytesHex, '00000000');
    assert.equal(input.guards.at(-1).replacementBytesHex, '20000000');
    const replay = replayNativeRecoveryLeaf(stage, pair.before, {...pair.options, moduleBaseAddress: pair.moduleBaseAddress});
    const result = compareNativeRecoveryLeafPair(stage, pair, replay);
    assert.equal(result.matched, true, JSON.stringify(result.firstDivergence));
    assert.equal(result.comparedBytes, comparedBytes);
    assert.equal(result.registers.length, stage === 'query' ? 6 : 5);
    assert.equal(result.exit.matched, true);
    if (stage === 'query') assert.equal(result.sourceReport.expectedEax, 0, 'The first native placement query rejects this candidate.');

    //Corrupt every overlapping observation of one real body byte. This keeps
    //the capture internally coherent and tests the complete semantic check,
    //rather than merely testing duplicate-range validation or register parity.
    const address = input.bodyAddress + 0x68;
    const ranges = new Map([...pair.after.ranges].map(([id, range]) => {
      const bytes = Buffer.from(range.bytes), offset = address - Number(range.address);
      if (offset >= 0 && offset < bytes.length) bytes[offset] ^= 1;
      return [id, {...range, bytes}];
    }));
    assert.equal(compareNativeRecoveryLeafPair(stage, {...pair, after: {...pair.after, ranges}}, replay).matched, false);
    const registers = {...pair.after.registers, ebx: (Number(pair.after.registers.ebx) ^ 1) >>> 0};
    assert.equal(compareNativeRecoveryLeafPair(stage, {...pair, after: {...pair.after, registers}}, replay).firstDivergence.name, 'ebx');
  });
}
