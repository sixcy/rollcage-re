import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createInstalledSoloWorldFixture} from '../tools/lib/solo-world-installed-fixtures.mjs';
import {stepRawScriptedMotion} from '../src/raw-scripted-motion.mjs';
import {updateRaceObjects} from '../src/race-object-update.mjs';
const installed = existsSync('C:/Program Files (x86)/Psygnosis/Rollcage/IDXData/Rollcage.idx');

test('installed LEV1 constructs all five actual scripted objects and five render particles in original placement order', {skip: !installed}, async () => {
  const {memory, runtime, world, ptr} = await createInstalledSoloWorldFixture(1);
  assert.equal(world.skippedPlacements.length, 0); assert.equal(world.authoredObjects.length, 5); assert.equal(world.renderParticles.length, 5);
  assert.deepEqual(world.authoredObjects.map(row => row.placementIndex), [4, 13, 27, 77, 108]);
  assert.equal(ptr(0x91e778), 5); assert.equal(memory.readUInt16LE(0x902bc4), 5);
  assert.deepEqual(world.authoredObjects.map(row => ptr(row.bodyAddress) & 511), [25, 25, 20, 25, 25]);
  for (let index = 0; index < 5; index++) {
    const row = world.authoredObjects[index], body = row.bodyAddress;
    assert.equal(ptr(ptr(0x91e77c) + index * 4), body); assert.ok(ptr(body) & 0x2000); assert.equal(world.authoredBodyAt(body).address, body);
    const before = memory.subarray(body + 0x68, body + 0x74).toString('hex');
    stepRawScriptedMotion(body, runtime);
    assert.notEqual(memory.subarray(body + 0x68, body + 0x74).toString('hex'), before);
  }
});

test('installed LEV8 publishes native type35 shapes and keeps both type32 emitters outside physical registration', {skip: !installed}, async () => {
  const {memory, runtime, world, ptr} = await createInstalledSoloWorldFixture(8);
  assert.equal(world.skippedPlacements.length, 0); assert.equal(world.authoredObjects.length, 10); assert.equal(world.renderParticles.length, 20);
  assert.equal(memory.readUInt16LE(0x902bc4), 8);
  const empty = world.authoredObjects.filter(row => (ptr(row.bodyAddress) & 511) === 32);
  assert.equal(empty.length, 2); assert.ok(empty.every(row => ptr(row.bodyAddress + 0x10) === 0xffffffff));
  assert.ok(empty.every(row => world.authoredBodyAt(row.bodyAddress).bytes.length === 0x188));
  const object = world.authoredObjects.find(row => (ptr(row.bodyAddress) & 511) === 35).bodyAddress;
  assert.equal(memory[object + 0x10c], 1); assert.equal(ptr(object + 0x148), 0x40fe30);
  for (let tick = 0; tick < 340; tick++) updateRaceObjects(runtime);
  assert.ok(ptr(0x902b88) > 0, 'Type32 uses its actual debris producer.');
});

test('installed LEV13 four-shape scripted object reaches its native route action debris producer', {skip: !installed}, async () => {
  const {memory, runtime, world, ptr} = await createInstalledSoloWorldFixture(13), row = world.authoredObjects.find(row => (ptr(row.bodyAddress) & 511) === 29), object = row.bodyAddress;
  assert.equal(memory[object + 0x10c], 4); assert.equal(ptr(object + 0x148), 0x46e4e0);
  const before = ptr(0x902b88);
  for (let tick = 0; tick < 70; tick++) stepRawScriptedMotion(object, runtime);
  assert.ok(ptr(0x902b88) > before); assert.ok(memory[object + 0x13e] >= 3);
});
