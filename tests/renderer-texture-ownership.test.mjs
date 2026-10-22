import test from 'node:test';
import assert from 'node:assert/strict';
import {assignRendererTextureResource, acquireRendererTextureIndex} from '../src/renderer-texture-ownership.mjs';
import {verifyRendererTextureOwnership} from '../tools/verify-renderer-texture-ownership-instructions.mjs';

test('texture assignment preserves destination vtable and packed padding', () => {
  const memory = Buffer.alloc(0x2000, 0x93), input = 0x100, output = 0x1000; memory.fill(0x6a, input, input + 0x460);
  assert.equal(assignRendererTextureResource(output, input, {memory}), output);
  assert.equal(memory.readUInt32LE(output), 0x93939393); assert.equal(memory[output + 13], 0x93); assert.equal(memory[output + 0x41d], 0x93); assert.equal(memory[output + 0x45e], 0x93);
  assert.equal(memory.readUInt32LE(output + 0x438), 0x6a6a6a6a); assert.equal(memory[output + 0x45d], 0x6a);
});
test('texture acquisition requires an explicit native temporary stack', () => {assert.throws(() => acquireRendererTextureIndex(0, 0, {memory: Buffer.alloc(128)}), /native entry ESP/);});
test('real texture/integer constructors connect through queue exhaustion, acquisition and aliased assignment', async () => {const report = await verifyRendererTextureOwnership({scenarios: 2, output: null}); assert.equal(report.matched, true); assert.equal(report.actualGameCalls['520ee0'], 270); assert.equal(report.actualGameCalls['513640'], 4);});
