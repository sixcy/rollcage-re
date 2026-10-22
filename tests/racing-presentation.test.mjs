import test from 'node:test';
import assert from 'node:assert/strict';
import {SoloController} from '../tools/track-viewer/solo-controller.mjs';
import {interpolateRacingPresentation} from '../tools/track-viewer/solo-presentation.mjs';
import {Navigation} from '../tools/track-viewer/navigation.mjs';
import {SOLO_STEP_SECONDS} from '../src/solo-session.mjs';

const identity = [1,0,0,0,1,0,0,0,1];
const yaw = angle => [Math.cos(angle),0,Math.sin(angle),0,1,0,-Math.sin(angle),0,Math.cos(angle)];
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);
function state(tick, recovered = false) {
  const cars = Array.from({length: 6}, (_, index) => {
    const parts = Array.from({length: 5}, (_, part) => Object.freeze({position: Object.freeze([tick * 10 + index * 100 + part, part, index]), rotation: Object.freeze(identity.slice())}));
    return Object.freeze({index, vehicleType: index, recoveries: recovered && index === 0 ? 1 : 0,
      position: parts[0].position, rotation: parts[0].rotation, parts: Object.freeze(parts)});
  });
  return Object.freeze({...cars[0], ticks: tick, cars: Object.freeze(cars), worldObjects: Object.freeze([
    Object.freeze({placementIndex: 7, visible: true, position: Object.freeze([tick * 2,0,0]), rotation: Object.freeze(identity.slice())})
  ])});
}
function fixture() {
  let tick = 0, recovered = false, pending = false;
  const session = {get snapshot() {return state(tick, recovered);}, step() {tick++; if (pending) {recovered = true; pending = false;}},
    requestRecovery() {pending = true;}, reset() {tick = 0; recovered = pending = false;}, dispose() {}};
  return new SoloController(session);
}

test('render interpolation moves all thirty car parts and scenery without changing either physics state', () => {
  const before = state(1), after = state(2), saved = JSON.stringify([before, after]);
  const result = interpolateRacingPresentation(before, after, 0.25);
  for (const [index, car] of result.cars.entries()) for (const [part, pose] of car.parts.entries()) close(pose.position[0], 12.5 + index * 100 + part);
  assert.deepEqual(result.position, result.cars[0].position); assert.equal(result.ticks, 2);
  close(result.worldObjects[0].position[0], 2.5);
  assert.equal(JSON.stringify([before, after]), saved);
  assert.equal(interpolateRacingPresentation(before, after, 1), after);
});

test('rotation interpolation uses the short arc without shrinking rotating cars and preserves scenery scale', () => {
  const before = state(0), after = state(1);
  const rotated = rotation => ({...after, cars: [{...after.cars[0], parts: [{position: [0,0,0], rotation}]}], parts: [{position: [0,0,0], rotation}]});
  const a = rotated(yaw(0)), b = rotated(yaw(Math.PI / 2));
  const middle = interpolateRacingPresentation(a, b, 0.5).rotation;
  middle.forEach((value, index) => close(value, yaw(Math.PI / 4)[index]));
  for (let column = 0; column < 3; column++) close(Math.hypot(middle[column], middle[column + 3], middle[column + 6]), 1);
  const seam = interpolateRacingPresentation(rotated(yaw(179 * Math.PI / 180)), rotated(yaw(-179 * Math.PI / 180)), 0.5).rotation;
  close(seam[0], -1); close(seam[8], -1);
  const scaled = {...after, worldObjects: [{...after.worldObjects[0], rotation: identity.map(value => value * 0.5)}]};
  const shrunk = interpolateRacingPresentation(before, scaled, 0.5).worldObjects[0].rotation;
  shrunk.forEach((value, index) => close(value, identity[index] * 0.75));
});

test('recovery and visibility changes snap only the affected object instead of drawing a teleport trail', () => {
  const before = state(0), after = state(1, true), result = interpolateRacingPresentation(before, after, 0.5);
  assert.equal(result.cars[0], after.cars[0]); close(result.cars[1].position[0], 105);
  const hidden = {...after, worldObjects: [{...after.worldObjects[0], visible: false}]};
  assert.equal(interpolateRacingPresentation(before, hidden, 0.5).worldObjects[0], hidden.worldObjects[0]);
});

test('display cadence changes only interpolation while physics stays30Hz and camera translation stays locked to the drawn car', () => {
  for (const rate of [24,30,60,144]) {
    const control = fixture(), camera = new Navigation(); control.start();
    for (let frame = 1; frame <= rate; frame++) {
      control.advance(1 / rate);
      const shown = control.renderSnapshot, elapsed = frame / rate;
      close(shown.position[0], Math.max(0, elapsed / SOLO_STEP_SECONDS - 1) * 10, 1e-7);
      const physicalBefore = JSON.stringify(control.snapshot);
      camera.follow(shown, 1 / rate);
      assert.deepEqual(camera.target, [shown.position[0], -shown.position[1] + 25, -shown.position[2]]);
      assert.equal(JSON.stringify(control.snapshot), physicalBefore);
    }
    assert.equal(control.snapshot.ticks, 30); close(control.snapshot.position[0], 300);
  }
});

test('pause, stepping, reset and resume publish exact poses and discard old interpolation history', () => {
  const control = fixture(); control.start(); control.advance(SOLO_STEP_SECONDS * 1.5);
  close(control.renderSnapshot.position[0], 5); close(control.snapshot.position[0], 10);
  control.pause(); assert.deepEqual(control.renderSnapshot, control.snapshot);
  control.start(); close(control.renderSnapshot.position[0], 10);
  control.advance(SOLO_STEP_SECONDS / 2); close(control.renderSnapshot.position[0], 10);
  control.requestRecovery(); control.advance(SOLO_STEP_SECONDS / 2);
  assert.equal(control.snapshot.recoveries, 1); close(control.renderSnapshot.position[0], 20);
  control.pause(); control.stepFrame(); assert.deepEqual(control.renderSnapshot, control.snapshot);
  control.reset(); assert.deepEqual(control.renderSnapshot, state(0));
  control.start(); assert.deepEqual(control.renderSnapshot, state(0));
});

test('the controller forwards the selected recovery index without restarting a running race', () => {
  let requested, tick = 0;
  const control = new SoloController({get snapshot() {return state(tick);}, step() {tick++;},
    requestRecovery(index) {requested = index;}, reset() {tick = 0;}, dispose() {}});
  control.start(); control.advance(SOLO_STEP_SECONDS / 2);
  control.requestRecovery(4);
  assert.equal(requested, 4); assert.equal(control.state, 'running'); assert.equal(tick, 0);
  control.advance(SOLO_STEP_SECONDS / 2); assert.equal(tick, 1);
  control.pause(); control.requestRecovery(2);
  assert.equal(requested, 2); assert.equal(control.state, 'paused'); assert.equal(tick, 2);
});
