import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {findRawArchiveResource} from '../src/game-resource-files.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';
function fixture(payload, {originalBytes = payload.length, duplicate = false, alias = false} = {}) {
  const memory = Buffer.alloc(0xa00000), file = Buffer.alloc(0x400), index = 0x110000;
  payload.copy(file, 0x40); payload.copy(file, 0x180); memory.writeUInt32LE(index, 0x717388); memory.writeUInt32LE(0x41, 0x717380); memory.writeUInt32LE(0x1234, 0x6e4900);
  for (const [id, offset, bytes] of [[8, 0x180, originalBytes], [9, 0x40, payload.length]]) {const p = index + id * 16; memory.writeUInt32LE(offset, p); memory.writeUInt32LE(bytes, p + 4); memory.writeUInt32LE(bytes, p + 8); memory.writeInt16LE(3, p + 12); memory.writeInt16LE(id === 8 && duplicate ? 9 : 0, p + 14);}
  const services = createGameImageServices(memory, {file, allocationBase: alias ? 0x6e65d0 : 0x300000, allocationLimit: alias ? 0x6e6700 : 0x380000});
  return {memory, services, runtime: {memory, scratchBase: 0x9000, services}, index};
}
test('actual resource loading preprocesses controls and overlapping tilde markers while preserving TAB', () => {
  const {memory, runtime} = fixture(Buffer.from('Z\0\t\n~~A~~~', 'latin1')); loadProcessedLocalization(runtime);
  const p = memory.readUInt32LE(0x6e65f4); assert.deepEqual([...memory.subarray(p, p + 10)], [90, 1, 9, 1, 0, 126, 65, 0, 0, 126]);
});
test('preprocessing uses the original metadata size independently of the nearest duplicate read', () => {
  const {memory, runtime, services} = fixture(Buffer.from([0, 1, 2, 3, 4, 5]), {originalBytes: 2, duplicate: true}); loadProcessedLocalization(runtime);
  const p = memory.readUInt32LE(0x6e65f4); assert.equal(memory.readUInt32LE(0x6e65e4), 2); assert.deepEqual([...memory.subarray(p, p + 6)], [1, 1, 2, 3, 4, 5]);
  assert.ok(services.calls.some(([name, , offset]) => name === 'fseek' && offset === 0x40));
});
test('preprocessing captures count before an aliased buffer changes the live global', () => {
  const payload = Buffer.alloc(32, 2); payload.writeUInt32LE(32, 20); const {memory, runtime} = fixture(payload, {alias: true}); loadProcessedLocalization(runtime);
  assert.equal(memory.readUInt32LE(0x6e65e4), 0x01010120); assert.equal(memory[0x6e65d0 + 31], 1);
});
test('metadata queries use signed16 indices without choosing a duplicate', () => {
  const {memory, index} = fixture(Buffer.alloc(0)); assert.equal(findRawArchiveResource(-1, {memory}), index - 16); assert.equal(findRawArchiveResource(0x10008, {memory}), index + 128);
});
