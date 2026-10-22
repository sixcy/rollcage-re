import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeFrameScenario} from '../tools/lib/native-frame-scenario.mjs';

function fixture() {
  const records = 0x10000000, clock = 0x11000000, body = 0x20000000;
  const manifest = {observed: {participantCount: 2}, requiredRegions: [{id: 'participant-records', address: records, length: 2 * 0x30c}, {id: 'clock', address: clock, length: 4}]};
  const snapshot = after => {
    const participants = Buffer.alloc(2 * 0x30c), time = Buffer.alloc(4);
    const bodies = Array.from({length: 2}, (_, index) => {
      const bytes = Buffer.alloc(0x180), address = body + index * 0x4000;
      participants.writeUInt32LE(address, index * 0x30c); bytes.writeUInt32LE(0x1c03);
      if (index === 1) {bytes.writeInt32LE(-65536, 0x68); bytes.writeInt32LE(after ? 100 : 200, 0x34);}
      return {address, bytes};
    });
    time.writeUInt32LE(228);
    return {ranges: new Map([['records', {address: records, bytes: participants}], ['clock', {address: clock, bytes: time}], ...bodies.map((row, i) => [String(i), row])])};
  };
  return {pair: {before: snapshot(false), after: snapshot(true)}, manifest};
}

test('native scenario distinguishes stationary support from observed velocity and translation', () => {
  const {pair, manifest} = fixture(), result = inspectNativeFrameScenario(pair, manifest);
  assert.equal(result.available, true); assert.equal(result.logicalClockBefore, 228);
  assert.equal(result.movingVehiclesBefore, 1); assert.equal(result.movingVehiclesAfter, 1); assert.equal(result.translatedVehicles, 1);
  assert.deepEqual(result.vehicles[0].velocityBeforeQ16, [0,0,0]);
  assert.deepEqual(result.vehicles[1].positionDeltaQ16, [-100,0,0]);
  assert.match(result.limits[1], /not evidence/);
});

test('native scenario reports unavailable metadata and rejects missing body bytes or invalid counts', () => {
  const {pair, manifest} = fixture();
  assert.equal(inspectNativeFrameScenario(pair, {requiredRegions: []}).available, false);
  assert.throws(() => inspectNativeFrameScenario(pair, {...manifest, observed: {participantCount: 7}}), /Invalid native scenario/);
  pair.after.ranges.delete('1');
  assert.throws(() => inspectNativeFrameScenario(pair, manifest), /Uncaptured native memory/);
});

test('native participant replacement retains separate identities instead of fabricating displacement', () => {
  const {pair, manifest} = fixture(), first = pair.after.ranges.get('0');
  first.address += 0x8000; pair.after.ranges.get('records').bytes.writeUInt32LE(first.address);
  const result = inspectNativeFrameScenario(pair, manifest);
  assert.equal(result.vehicles[0].sameBody, false); assert.equal(result.vehicles[0].positionDeltaQ16, null);
});
