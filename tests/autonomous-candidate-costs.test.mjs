import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupSqrt} from '../src/fixed-integer.mjs';
import yaw from '../src/yaw-table.json' with {type: 'json'};
import {evaluateAutonomousPositionCost, evaluateAutonomousBodyDistanceCost, evaluateAutonomousObstacleCost, intersectsAutonomousObstacle, evaluateAutonomousRouteCost} from '../src/autonomous-candidate-costs.mjs';

const BODY = 0x10000, FROM = 0x20000, TO = 0x20010, DELTA = 0x20020, LENGTH = 0x20030, INVERSE = 0x20034, OBJECT = 0x30000, MODEL = 0x40000, LIST = 0x50000, POLYGONS = 0x60000, POLYGON = 0x61000, PLANES = 0x62000, VERTICES = 0x63000, GROUP = 0x70000, POINTS = 0x71000, STACK = 0x9000;
const put = (memory, address, values) => values.forEach((value, axis) => memory.writeInt16LE(value, address + axis * 2));
function fixture() {
  const memory = Buffer.alloc(0xa00000);
  yaw.values.forEach((value, index) => memory.writeInt16LE(value, 0x5ed030 + index * 2));
  memory[BODY + 0x6ec] = 32; memory[0x6e650e] = 1; memory.writeUInt32LE(1, 0x6e651c); memory.writeUInt32LE(LIST, 0x849a5c); memory.writeUInt32LE(OBJECT, LIST); memory[LIST + 6] = 1;
  memory.writeUInt32LE(OBJECT, 0x920b40); memory.writeUInt32LE(1, 0x920b44); memory.writeUInt32LE(POLYGONS, 0x920b48); memory.writeUInt32LE(POLYGON, POLYGONS);
  memory.writeUInt32LE(MODEL, OBJECT + 0x10); memory.writeUInt32LE(PLANES, OBJECT + 0x2c); memory.writeUInt16LE(20, MODEL + 0x32); memory.writeUInt16LE(0x100, MODEL + 0x38); memory.writeUInt32LE(VERTICES + 8, MODEL + 0x40);
  memory.writeInt32LE(50 * 65536, OBJECT + 0x34); memory.writeInt32LE(2500, 0x920ec0); memory.writeInt32LE(2500, 0x920da0);
  put(memory, FROM, [0, 0, 0]); put(memory, TO, [100, 0, 0]); put(memory, DELTA, [100, 0, 0]); memory.writeInt32LE(-1, LENGTH); memory.writeInt32LE(0, INVERSE);
  memory.writeUInt32LE(GROUP, 0x9092a0); memory.writeUInt16LE(5, GROUP); memory.writeUInt32LE(POINTS, GROUP + 8);
  for (let point = 0; point < 5; point++) put(memory, POINTS + point * 16, [point * 100, 0, 0]);
  return {memory, scratchBase: STACK};
}

test('gated position scoring initializes root cache but leaves short delta untouched', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x6ec] = 0; memory.fill(0xa5, STACK - 12, STACK - 6);
  assert.equal(evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 0, runtime), 0);
  assert.equal(memory.readInt32LE(STACK - 16), -1); assert.equal(memory.readInt32LE(STACK - 20), 0); assert.equal(memory.subarray(STACK - 12, STACK - 6).toString('hex'), 'a5a5a5a5a5a5');
});

test('position delta wraps each short and rejects squared lengths below4', () => {
  const runtime = fixture(), {memory} = runtime;
  put(memory, FROM, [32760, 0, 0]); put(memory, TO, [-32760, 0, 0]);
  evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 0, runtime); assert.equal(memory.readInt16LE(STACK - 12), 16);
  put(memory, FROM, [0, 0, 0]); put(memory, TO, [1, 1, 1]); memory.writeInt32LE(123, 0x91d45c);
  assert.equal(evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 0, runtime), 0); assert.equal(memory.readInt32LE(STACK - 16), -1); assert.equal(memory.readInt32LE(0x91d45c), 123);
});

test('body-distance scoring caches the actual lookup root and integer reciprocal', () => {
  const runtime = fixture(), {memory} = runtime;
  assert(evaluateAutonomousBodyDistanceCost(FROM, DELTA, 0, 10, 99, 0, 10000, LENGTH, INVERSE, runtime) < 0);
  assert.equal(memory.readInt32LE(LENGTH), lookupSqrt(10000)); assert.equal(memory.readInt32LE(INVERSE), Math.trunc(65536 / lookupSqrt(10000)));
  memory.writeInt32LE(123, LENGTH); memory.writeInt32LE(456, INVERSE);
  evaluateAutonomousBodyDistanceCost(FROM, DELTA, 0, 10, 99, 0, 10000, LENGTH, INVERSE, runtime);
  assert.equal(memory.readInt32LE(LENGTH), 123); assert.equal(memory.readInt32LE(INVERSE), 456);
});

test('classification2 and3 increase the near body penalty using native integer ramps', () => {
  const runtime = fixture(), {memory} = runtime;
  const costs = [1, 2, 3].map(type => {memory[LIST + 6] = type; return evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 0, runtime);});
  assert(costs[0] < 0); assert(costs[1] < costs[0]); assert(costs[2] < costs[1]);
});

test('distance prefilter is inclusive at both caller-distance and segment upper bounds', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(99, 0x920ec0); memory.writeInt32LE(0x1234, 0x91d45c);
  assert.equal(evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 100, runtime), 0); assert.equal(memory.readInt32LE(0x91d45c), 0x1234);
  memory.writeInt32LE(10201, 0x920ec0); assert.equal(evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 100, runtime), 0);
  memory.writeInt32LE(10200, 0x920ec0); assert(evaluateAutonomousPositionCost(BODY, FROM, TO, 10, 99, 100, runtime) < 0);
});

test('zero plane count accepts, zero polygon count and first null pointer reject', () => {
  const runtime = fixture(), {memory} = runtime;
  assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 1);
  memory.writeUInt32LE(0, 0x920b44); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 0);
  memory.writeUInt32LE(2, 0x920b44); memory.writeUInt32LE(0, POLYGONS); memory.writeUInt32LE(POLYGON, POLYGONS + 4);
  assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 0);
});

test('packed plane rejection uses strict endpoint separation and radius expansion', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(0, OBJECT + 0x34); memory.writeUInt32LE(1 << 16, POLYGON + 0x10); memory.writeUInt32LE(256 << 20, PLANES + 4);
  put(memory, FROM, [20, 0, 0]); put(memory, TO, [30, 0, 0]); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 0);
  put(memory, TO, [0, 0, 0]); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 1);
  put(memory, TO, [30, 0, 0]); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 21, 0, runtime), 1);
});

test('inverse yaw rotates world segment into the packed model-plane frame', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(0, OBJECT + 0x34); memory[OBJECT + 0x199] = 64; memory.writeUInt32LE(1 << 16, POLYGON + 0x10); memory.writeUInt32LE(256 << 20, PLANES + 4);
  put(memory, FROM, [0, 0, 20]); put(memory, TO, [0, 0, 30]); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 1);
  put(memory, FROM, [0, 0, -20]); put(memory, TO, [0, 0, -30]); assert.equal(intersectsAutonomousObstacle(FROM, TO, OBJECT, 0, 0, runtime), 0);
});

test('obstacle type5 is skipped and the original interpolation may become positive', () => {
  const runtime = fixture(), {memory} = runtime;
  assert.equal(evaluateAutonomousObstacleCost(FROM, TO, 10, 99, 0, runtime), -836);
  memory[OBJECT + 0x19a] = 5; assert.equal(evaluateAutonomousObstacleCost(FROM, TO, 10, 99, 0, runtime), 0);
  memory[OBJECT + 0x19a] = 0; memory.writeInt32LE(10000, 0x920da0);
  assert(evaluateAutonomousObstacleCost(FROM, TO, 10, 99, 0, runtime) > 0);
});

test('route wrapper stops at open endpoints and follows independent9092a0 table', () => {
  const runtime = fixture(), {memory} = runtime;
  assert.equal(evaluateAutonomousRouteCost(BODY, 0, 4, FROM, 10, 99, runtime), 0);
  const expected = evaluateAutonomousPositionCost(BODY, POINTS, POINTS + 16, 10, 99, 0, {memory, scratchBase: STACK - 256});
  assert.equal(evaluateAutonomousRouteCost(BODY, 0, 0, FROM, 10, 99, runtime), expected);
  memory[GROUP + 2] = 1; assert.equal(evaluateAutonomousRouteCost(BODY, 0, 0, FROM, 10, 99, runtime), 0);
});
