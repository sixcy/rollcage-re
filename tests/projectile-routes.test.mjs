import test from 'node:test';
import assert from 'node:assert/strict';
import {findProjectileParticipantRoute, updateProjectileRoute} from '../src/projectile-routes.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p), body = 0x20000, group = 0x30000, points = 0x40000, graph = 0x50000, target = 0x60000, pack = 0x70000, session = 0x71000;
  put(0x90b98c, pack); put(pack + 0x94, graph); put(pack + 0x60, group); put(0x5ecb1c, session); memory[session + 0x54d] = 1; memory[0x90931d] = 1; put(0x909300, target); put(0x909354, group + 12); put(0x909358, 2);
  for (let i = 0; i < 12; i++) {const g = group + i * 12; word(g, 8); memory[g + 5] = i; put(g + 8, points + i * 256); put(graph + i * 8, 1 << i | 1 << i + 1); for (let j = 0; j < 8; j++) word(points + i * 256 + j * 16, j * 100);}
  put(body + 0x6cc, group); put(body + 0x6d4, group); word(body + 0x6d0, 1); word(body + 0x6d8, 2); word(body + 0x6d2, 1); memory.fill(0x77, body + 0x6bc, body + 0x6c8); memory[body + 0x6bc] = 255; put(body + 0x198, target);
  return {memory, scratchBase: 0x9000, body, group, graph, points, target, put, word, read: p => memory.readInt32LE(p)};
}
test('same-group route returns participant point without replacing stale path', () => {
  const f = fixture(); f.put(0x909354, f.group); assert.equal(findProjectileParticipantRoute(f.body, f), 2); assert.equal(f.memory[f.body + 0x6bc], 255); assert.equal(f.read(f.body + 0x198), f.target);
});
test('direct adjacency publishes destination and terminator but returns minus one', () => {
  const f = fixture(); assert.equal(findProjectileParticipantRoute(f.body, f), -1); assert.deepEqual([...f.memory.subarray(f.body + 0x6bc, f.body + 0x6bf)], [1, 255, 0x77]);
});
test('multi-hop search copies intermediate nodes and preserves the route group identity', () => {
  const f = fixture(); for (let i = 0; i < 4; i++) f.put(f.graph + i * 8, 1 << i + 1); f.put(0x909354, f.group + 36); assert.equal(findProjectileParticipantRoute(f.body, f), -1); assert.deepEqual([...f.memory.subarray(f.body + 0x6bc, f.body + 0x6c0)], [1, 2, 3, 255]); assert.equal(f.memory.readUInt16LE(f.body + 0x6da), 3);
});
test('visited state persists between depth attempts and can prune a reachable self-loop graph', () => {
  const f = fixture(); f.put(0x909354, f.group + 36); findProjectileParticipantRoute(f.body, f); assert.equal(f.memory[f.body + 0x6bc], 255);
});
test('more than eight route steps leaves stale path untouched', () => {
  const f = fixture(); f.put(0x909354, f.group + 9 * 12); findProjectileParticipantRoute(f.body, f); assert.equal(f.memory[f.body + 0x6bc], 255); assert.equal(f.memory[f.body + 0x6bd], 0x77);
});
test('mode target proximity returns one before replacing the current route', () => {
  const f = fixture(); const before = Buffer.from(f.memory.subarray(f.body + 0x6bc, f.body + 0x6dc)); assert.equal(updateProjectileRoute(f.body, 1, f), 1); assert.deepEqual(f.memory.subarray(f.body + 0x6bc, f.body + 0x6dc), before);
});
test('farther pending endpoint preserves all existing route fields', () => {
  const f = fixture(); f.word(f.body + 0x36, 100); const before = Buffer.from(f.memory.subarray(f.body + 0x6bc, f.body + 0x6dc)); assert.equal(updateProjectileRoute(f.body, 0, f), 0); assert.deepEqual(f.memory.subarray(f.body + 0x6bc, f.body + 0x6dc), before);
});
