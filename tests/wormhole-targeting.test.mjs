import test from 'node:test';
import assert from 'node:assert/strict';
import {createWormholeTargetFixture, wormholeTargetAddresses as a, verifyWormholeTargeting} from '../tools/verify-wormhole-targeting-instructions.mjs';
import {selectWormholeTarget, clampWormholeVelocity, updateWormholeChase, updateWormholeCapture} from '../src/wormhole-targeting.mjs';
test('target selection wraps progression and leaves sentinel1 when no forward candidate exists', () => {
  const r = createWormholeTargetFixture(), m = r.memory; m[a.session + 0x54d] = 2; m.writeInt32LE(65530, 0x909324); m.writeInt32LE(10, 0x909630); selectWormholeTarget(a.owner, a.body, r); assert.equal(m.readUInt32LE(a.body + 0x198), a.target);
  m.writeInt32LE(32000, 0x909630); selectWormholeTarget(a.owner, a.body, r); assert.equal(m.readUInt32LE(a.body + 0x198), a.target);
  m.writeInt32LE(33000, 0x909630); selectWormholeTarget(a.owner, a.body, r); assert.equal(m.readUInt32LE(a.body + 0x198), 1);
});
test('velocity clamp is per signed lane and chase expires at300', () => {
  const r = createWormholeTargetFixture(), m = r.memory; [-0xf0000, 0x1234, 0xf0000].forEach((v, i) => m.writeInt32LE(v, a.first + i * 4)); clampWormholeVelocity(a.first, r); assert.deepEqual([0, 4, 8].map(o => m.readInt32LE(a.first + o)), [-0xe0000, 0x1234, 0xe0000]);
  m.writeInt32LE(299, a.body + 0x180); assert.equal(updateWormholeChase(a.body, r), 1); assert.equal(m.readInt32LE(a.body + 0x188), 4); assert.equal(m.readInt32LE(a.body + 0x180), 0);
});
test('capture tick60 stores the actual basis and enters mode80', () => {const r = createWormholeTargetFixture(), m = r.memory; m.writeInt32LE(a.target, a.body + 0x198); m.writeInt32LE(59, a.body + 0x180); updateWormholeCapture(a.body, r); assert.equal(m.readInt32LE(a.body + 0x188), 128); assert.equal(m.readInt32LE(a.body + 0x1d8), 65536);});
test('targeting game graph matches retained instructions without game handlers', async () => {assert.equal((await verifyWormholeTargeting({fixtures: 140, output: null})).matched, true);});
