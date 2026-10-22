import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetworkRetirementFixture, verifyNetworkSessionRetirement} from '../tools/verify-network-session-retirement-instructions.mjs';
import {prepareNetworkRaceTimes, retireNetworkParticipant, endDisconnectedNetworkSession, removeNetworkPeer, announceNetworkCountdown} from '../src/network-session-retirement.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), fixture = n => createNetworkRetirementFixture(n, Buffer.alloc(0xa00000));
test('zero progress gets the native estimated-time sentinel and packed unknown time', () => {
  const r = fixture(13), m = r.memory; m[0x21054d] = 1; m[0x210551] = 0; put(m, 0x909324, 0); prepareNetworkRaceTimes(1, r);
  assert.equal(m.readUInt32LE(0x909334), 0x0fffffff); assert.equal(m.readUInt32LE(0x21002c), 0x595999); assert.equal(m[0x210010], 1);
});
test('ordinary phase8 formatting skips final total while preserving native field order', () => {
  const r = fixture(1), m = r.memory; m[0x21054d] = 1; put(m, 0x21057c, 8); put(m, 0x21002c, 0x12345678); const original = m.readInt32LE(0x909334);
  prepareNetworkRaceTimes(0, r); assert.equal(m.readInt32LE(0x909334), original); assert.equal(m.readUInt32LE(0x21002c), 0x12345678); assert.notEqual(m.readUInt32LE(0x210024), 0);
});
test('disconnect phase6 distinguishes an unfinished peer from a finished session', () => {
  for (const unfinished of [false, true]) {const r = fixture(1), m = r.memory; put(m, 0x6eafe0, 0); put(m, 0x6e6b34, 0); put(m, 0x21057c, 6); put(m, 0x9020a0, 99); for (let i = 0; i < 6; i++) m[0x909549 + i * 0x30c] = 1; if (unfinished) m[0x909549] = 0; endDisconnectedNetworkSession(r); assert.equal(m.readInt32LE(0x21057c), unfinished ? 8 : 7); assert.equal(m.readInt32LE(0x210580), 0); assert.equal(m.readInt32LE(0x9020a0), 0);}
});
test('retirement finishes the race and flushes real replay controllers twice', () => {
  const r = fixture(54), m = r.memory; put(m, 0x6eafe0, 0); retireNetworkParticipant(5, r); assert.equal(m.readInt32LE(0x21057c), 6); assert.equal(m[0x225718], 8);
  for (let i = 0; i < 6; i++) assert.equal(m.readInt32LE(0x300000 + i * 0x20000 + 0x1e880), 0);
  assert.equal(m.readInt32LE(0x91ce90) & 2, 2); assert.equal(m.readUInt16LE(0x91ffb2), (54 * 613 + 1) & 65535);
});
test('peer removal clamps the live count and clears addresses even under gameplay suppression', () => {
  const r = fixture(19), m = r.memory; put(m, 0x6e7880, 1); put(m, 0x6e9f68, 0); assert.equal(removeNetworkPeer(0, r), 1); assert.equal(m.readInt32LE(0x6e9f68), 0); assert.equal(m.readBigUInt64LE(0x6e788c), 0n); assert.equal(removeNetworkPeer(-1, r), 0);
});
test('countdown throttle returns before requiring network services', () => {
  const r = fixture(1), m = r.memory; put(m, 0x6eafe0, 7); put(m, 0x6e675c, 129); put(m, 0x6eaab0, 100); assert.equal(announceNetworkCountdown(5, 0, r), 1); put(m, 0x6eafe0, 0x87); assert.equal(announceNetworkCountdown(5, 0, r), 0);
});
test('actual session-retirement descendants match retained instructions and ordered services', async () => {assert.equal((await verifyNetworkSessionRetirement({fixtures: 90, output: null})).matched, true);});
