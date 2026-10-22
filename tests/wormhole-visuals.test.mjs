import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createWormholeVisualFixture, wormholeVisualAddresses as a, verifyWormholeVisuals} from '../tools/verify-wormhole-visuals-instructions.mjs';
import {createWormholeEffectFixture, wormholeEffectAddresses as b, verifyWormholeEffectLifecycle} from '../tools/verify-wormhole-effect-lifecycle-instructions.mjs';
import {scaleWormholeColor, orientWormholeBody, buildWormholeMesh, initializeWormholeEffectPool, activateWormholeEffects, updateWormholeEffects, removeWormholeEffects} from '../src/wormhole-visuals.mjs';
const program = await loadRetainedNativeProgram(), put = (m, p, value) => m.writeInt32LE(value | 0, p);

test('color helper writes scaled alpha after its DWORD and retains native cross-channel carry', () => {
  const runtime = createWormholeVisualFixture(0), {memory: m} = runtime;
  scaleWormholeColor(0x12345678, 255, a.output, a.output + 3, runtime); assert.equal(m.readUInt32LE(a.output), 0xff335577);
  scaleWormholeColor(0x12345678, -1, a.output, a.output + 3, runtime); assert.equal(m.readUInt32LE(a.output), 0xffff00ff);
});

test('vertical direction is normalized in place but leaves the short matrix unchanged', () => {
  const runtime = createWormholeVisualFixture(0), {memory: m} = runtime;
  [0, 65536, 0].forEach((value, lane) => put(m, a.first + lane * 4, value)); const matrix = Buffer.from(m.subarray(a.output, a.output + 18));
  orientWormholeBody(a.first, a.output, runtime); assert.deepEqual(m.subarray(a.output, a.output + 18), matrix); assert.deepEqual([0, 4, 8].map(offset => m.readInt32LE(a.first + offset)), [0, 65536, 0]);
});

test('mesh alpha increments as a signed short and signed phase bytes use live prefix memory', () => {
  const runtime = createWormholeVisualFixture(0), {memory: m} = runtime;
  put(m, a.body + 0x188, 0x80); m.writeInt16LE(4095, a.body + 0x2a34); m[a.body + 0x341] = 120; m.writeUInt16LE(0x5432, 0x5ed030 - 256);
  buildWormholeMesh(a.body, runtime); assert.equal(m.readInt16LE(a.body + 0x2a34), 4223); assert.equal(m.readUInt16LE(a.body + 0x342), 0x5432);
  buildWormholeMesh(a.body, runtime); assert.equal(m.readInt16LE(a.body + 0x2a34), 4096);
});

test('effect pool uses47 real arena records, preserves lifetime bytes and actual material primitive fields', () => {
  const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeEffectFixture(1, memory), before = memory.readInt32LE(a.body + 0x2a4);
  initializeWormholeEffectPool(a.body, runtime);
  assert.equal(memory.readUInt32LE(0x70dcf4), 1 + 47 * 256); assert.equal(memory.readInt32LE(a.body + 0x2a4), before);
  assert.equal(memory.readUInt32LE(a.body + 0x1e0), b.arena); assert.equal(memory.readUInt32LE(a.body + 0x274), b.arena + 5 * 256); assert.equal(memory.readUInt32LE(a.body + 0x1f4), b.arena + 15 * 256);
  for (const offset of [0x1e0, 0x274, 0x1f4]) {const object = memory.readUInt32LE(a.body + offset); assert.equal(memory.readInt32LE(object), 13); assert.equal(memory.readUInt32LE(object + 4), 0);}
  assert.equal(memory.readUInt32LE(a.body + 0x6b0), 0x8e808080); assert.equal(memory.readUInt16LE(a.body + 0x25f4), 0xbf3f);
});

test('activation staggers spark lifetimes and actual updates eventually publish active sparks before cleanup', () => {
  const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createWormholeEffectFixture(1, memory);
  initializeWormholeEffectPool(a.body, runtime); activateWormholeEffects(a.body, runtime);
  assert.equal(memory.readInt32LE(a.body + 0x2a4), -1511); assert.equal(memory.readInt32LE(a.body + 0x334), -1169); assert.equal(memory.readInt32LE(a.body + 0x33c), 3);
  for (let tick = 0; tick < 64; tick++) updateWormholeEffects(a.body, runtime);
  assert.ok(memory.readInt32LE(a.body + 0x2a4) > 0); assert.ok(memory.readUInt16LE(b.bucket + 10) > 0);
  removeWormholeEffects(a.body, runtime); assert.equal(memory.readUInt16LE(b.bucket + 10), 0);
  for (let index = 0; index < 10; index++) assert.equal(memory.readInt32LE(a.body + 0x2a4 + index * 16), 0);
});

test('orientation, colors, rings, mesh and overlapping outputs match native instructions', async () => {
  const report = await verifyWormholeVisuals({fixtures: 120, output: null}); assert.equal(report.matched, true); assert.equal(report.instructions, 641); assert.ok(report.aliases > 0); assert.deepEqual(report.externalCalls, []);
});

test('actual construction-to-activation-to-persistent-update-to-cleanup lifecycle matches native instructions', async () => {
  const report = await verifyWormholeEffectLifecycle({scenarios: 2, frames: 64, output: null}); assert.equal(report.matched, true); assert.equal(report.cookieChecks, 2); assert.equal(report.actualGameCalls['4901d0'], 94); assert.equal(report.actualGameCalls['49c790'], 2);
});
