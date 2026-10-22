import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeDynamicLightAttenuation, initializeDynamicLightStorage, initializeAuthoredDynamicLights} from '../src/dynamic-light-state.mjs';
import {createDynamicLightConstructionFixture, createDynamicLightHeap, lightConstructionAddresses as a, verifyDynamicLightConstruction} from '../tools/verify-dynamic-light-construction-instructions.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const LIGHT = 0x80f560;
function fixture(index) {
  const context = createDynamicLightConstructionFixture(index), allocations = [];
  return {...context, allocations, handlers: {allocate: createDynamicLightHeap(context, allocations)}};
}

test('attenuation constructor preserves both integer formula regions and cached ownership', () => {
  const context = fixture(2), {memory, allocations} = context;
  initializeDynamicLightAttenuation(context);
  assert.deepEqual(allocations, [4096]);
  for (const [index, value] of [[0, 0x7ffd], [31, 0x7fde], [32, 32733], [1022, 1], [1023, 0]]) assert.equal(memory.readInt32LE(a.attenuation + index * 4), value);
  put(memory, a.attenuation + 128, 123);
  initializeDynamicLightAttenuation({memory});
  assert.equal(memory.readInt32LE(a.attenuation + 128), 123);
  assert.deepEqual(allocations, [4096]);
});

test('storage constructor derives band sizes and resets kind words without clearing adjacent fields', () => {
  const context = fixture(4), {memory} = context;
  initializeDynamicLightStorage(context);
  assert.deepEqual(context.allocations, [4096, 352]);
  assert.deepEqual(Array.from({length: 5}, (_, index) => memory.readUInt32LE(0x80f220 + index * 4)), [0, 64, 128, 224, 352].map(offset => a.bands + offset));
  for (const index of [1, 2, 70]) {
    const address = 0x80f520 + index * 64;
    assert.equal(memory.readUInt16LE(address + 0x24), 0);
    assert.equal(memory.readUInt16LE(address + 0x26), 0x5555);
    assert.equal(memory.readUInt32LE(address), 0x55555555);
  }
  assert.equal(memory.readUInt16LE(0x80f520 + 0x24), 0x5555);
  assert.deepEqual(memory.subarray(a.bands, a.bands + 352), Buffer.alloc(352));
  for (const address of [0x80f20c, 0x80f210, 0x80f214, 0x810920]) assert.equal(memory.readUInt32LE(address), 0);
  assert.deepEqual(memory.subarray(0x80f420, 0x80f520), Buffer.alloc(256));
});

test('storage relocation reloads the captured pack count after allocation without following a replaced global', () => {
  const context = fixture(14), {memory} = context;
  initializeDynamicLightStorage(context);
  assert.deepEqual(context.allocations, [4096, 544]);
  assert.equal(memory.readUInt32LE(0x90b98c), a.otherPack);
  assert.equal(memory.readUInt32LE(a.pack + 16), 3);
  assert.deepEqual(Array.from({length: 5}, (_, index) => memory.readUInt32LE(0x80f220 + index * 4)), [a.bands, a.bands + 64, a.bands + 160, a.bands + 288, 544]);
});

test('authored position and color install slot one while advancing count and search ownership', () => {
  const context = fixture(6), {memory} = context;
  initializeDynamicLightStorage(context); initializeAuthoredDynamicLights(context);
  assert.equal(memory.readUInt32LE(LIGHT + 0x30), 0);
  assert.deepEqual([0, 4, 8].map(offset => memory.readInt32LE(LIGHT + offset)), [0, (6 * 173) << 16, (-6 * 71) << 16]);
  assert.equal(memory.readUInt32LE(LIGHT + 12), 0x3c422a06);
  assert.equal(memory.readUInt32LE(LIGHT + 0x24), 1);
  assert.equal(memory.readUInt16LE(LIGHT + 18), 2);
  assert.equal(memory.readUInt32LE(0x80f20c), 2); assert.equal(memory.readUInt32LE(0x80f214), 2);
  assert.equal(memory.readUInt32LE(a.bands) >>> 22, 1);
});

test('scripted authored lights claim aligned FF mini-bodies without inventing mass or rotation', () => {
  const context = fixture(11), {memory} = context;
  initializeDynamicLightStorage(context); initializeAuthoredDynamicLights(context);
  const body = memory.readUInt32LE(LIGHT + 0x30);
  assert.equal(body, a.arena); assert.equal(memory.readUInt32LE(0x70dcf4), 387);
  assert.equal(memory.readUInt32LE(body), 0xa00f);
  assert.equal(memory.readUInt32LE(body + 0xa8), 0xffffffff);
  assert.equal(memory.readUInt32LE(body + 0xc4), 0xffffffff);
  assert.equal(memory.readUInt16LE(body + 0x10e), 65535);
  assert.equal(memory.readUInt32LE(body + 0x134), a.scripts + 160);
  assert.equal(memory.readUInt32LE(body + 0x138), 0);
  assert.equal(memory.readUInt32LE(body + 0x148), 0);
  assert.equal(memory.readUInt32LE(0x6e6b44), 513);
  assert.deepEqual(memory.subarray(body + 0x16a, body + 0x174), Buffer.alloc(10));
});

test('scripted registration preserves signed count and stops at the native 512 limit', () => {
  const context = fixture(21), {memory} = context;
  initializeDynamicLightStorage(context); initializeAuthoredDynamicLights(context);
  const body = memory.readUInt32LE(LIGHT + 64 + 0x30);
  assert.equal(memory.readUInt32LE(0x6e6b44), 512);
  assert.equal(memory.readUInt32LE(0x70e200 + 511 * 4), body);
  assert.equal(memory.readUInt16LE(body + 0x10e), 511);
  assert.equal(memory.readUInt16LE(memory.readUInt32LE(LIGHT + 128 + 0x30) + 0x10e), 65535);
  const negative = fixture(12);
  initializeDynamicLightStorage(negative); initializeAuthoredDynamicLights(negative);
  const signedBody = negative.memory.readUInt32LE(LIGHT + 64 + 0x30);
  assert.equal(negative.memory.readInt32LE(0x6e6b44), 0);
  assert.equal(negative.memory.readUInt32LE(0x70e1fc), signedBody);
  assert.equal(negative.memory.readUInt16LE(signedBody + 0x10e), 65535);
});

test('null allocator result retains native writes in the explicit address-zero buffer domain', () => {
  const context = fixture(46), {memory} = context;
  initializeDynamicLightAttenuation(context);
  assert.equal(memory.readUInt32LE(0x6e6ca8), 0);
  assert.equal(memory.readUInt32LE(0), 0x7ffd);
  assert.equal(memory.readUInt32LE(4092), 0);
  assert.throws(() => initializeDynamicLightAttenuation({memory: Buffer.alloc(0xa00000)}), /allocate service/);
  assert.throws(() => initializeDynamicLightAttenuation({memory: Buffer.alloc(0xa00000), handlers: {allocate: () => undefined}}), /EAX pointer/);
});

test('complete constructors and range registration match retained native instructions', async () => {
  const report = await verifyDynamicLightConstruction({fixtures: 48, output: null});
  assert.equal(report.matched, true); assert.equal(report.instructions, 349);
  for (const entry of ['0x48ef30', '0x48eeb0', '0x44e220', '0x44d5b0']) assert.ok(report.actualGameCalls[entry] > 0, entry);
});
