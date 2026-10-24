import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {inspectSceneryCollisions} from '../src/scenery-collision-info.mjs';

test('collision status counts authored enabled shapes separately for each placement configuration',()=>{
  const source=sceneryFixture();let info=inspectSceneryCollisions(source.geometry,source.texture);
  assert.equal(info.get(0).status,'enabled');assert.equal(info.get(0).activeShapes,1);assert.equal(info.get(0).kinds.point,1);
  source.geometry[0x1343]=5;info=inspectSceneryCollisions(source.geometry,source.texture);
  assert.equal(info.get(0).status,'disabled');assert.equal(info.get(0).settingsDisabled,1);assert.equal(info.get(0).geometryDisabled,0);
  assert.equal(info.get(1).status,'enabled','A different placement retains its own enabled configuration');
});
test('zero geometry counts remain distinguishable from a disabled configuration',()=>{
  const source=sceneryFixture();source.geometry.writeUInt32LE(0,0x12d8+16);const info=inspectSceneryCollisions(source.geometry,source.texture).get(0);
  assert.equal(info.status,'disabled');assert.equal(info.totalShapes,1);assert.equal(info.activeShapes,0);assert.equal(info.geometryDisabled,1);assert.equal(info.settingsDisabled,0);
});
test('unsupported collision and invalid active configuration slots remain unknown rather than falsely disabled',()=>{
  let source=sceneryFixture();source.geometry.write('MODL',0x1140);assert.equal(inspectSceneryCollisions(source.geometry,source.texture).get(0).status,'unknown');
  source=sceneryFixture();source.geometry.writeUInt32LE(15,0x12d8+12);const result=inspectSceneryCollisions(source.geometry,source.texture).get(0);assert.equal(result.status,'unknown');assert.match(result.reason,/configuration slot/);
});
