import test from 'node:test';
import assert from 'node:assert/strict';
import {stepRoutePoint, stepRoutePoints, writeRouteDirection, isRoutePointPassed, findAutonomousRoutePoint} from '../src/autonomous-route-geometry.mjs';
import {readAutonomousSurfaceIndex, updateAutonomousSpeed, limitAutonomousPacing} from '../src/autonomous-speed.mjs';
import {prepareAutonomousTarget, updateAutonomousRouteControl} from '../src/autonomous-route-control.mjs';
import {updateVehicleInputBlock, updateVehicleControlState, updateVehicleMotionState} from '../src/vehicle-control-state.mjs';
import controlTables from '../src/finish-skill-tables.json' with {type: 'json'};

const BODY = 0x10000, PACK = 0x20000, GROUP = 0x21000, POINTS = 0x30000, SESSION = 0x60000, OUT = 0x61000, POSITION = 0x61100, INDEX = 0x61200, SCRATCH = 0x9000;
function fixture(points = [[0, 0, 0], [0, 0, 100], [0, 0, 200]]) {
  const memory = Buffer.alloc(0xa00000);
  memory.writeUInt32LE(PACK, 0x90b98c); memory.writeUInt32LE(GROUP, PACK + 0x60); memory.writeUInt32LE(SESSION, 0x5ecb1c);
  memory.writeUInt16LE(points.length, GROUP); memory.writeUInt32LE(POINTS, GROUP + 8);
  points.forEach((point, index) => {point.forEach((value, axis) => memory.writeInt16LE(value, POINTS + index * 16 + axis * 2)); memory[POINTS + index * 16 + 7] = 125;});
  memory.writeUInt16LE(0x4000, BODY + 0x6c4);
  memory.writeUInt32LE(BODY, 0x909300); memory.writeUInt32LE(GROUP, 0x909354); memory.writeUInt32LE(0, 0x909358);
  [4096, 0, 0, 0, 4096, 0, 0, 0, 4096].forEach((value, index) => memory.writeInt16LE(value, BODY + 0xc4 + index * 2));
  memory[BODY + 0x6f1] = 4;
  return {memory, scratchBase: SCRATCH};
}
const vec = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const put = (memory, address, values) => values.forEach((value, axis) => memory.writeInt32LE(value, address + axis * 4));

test('open endpoint failure retains output bytes; stepping only stores a word', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(0xdeadbeef, OUT);
  assert.equal(stepRoutePoint(GROUP, 2, OUT, runtime), 0); assert.equal(memory.readUInt32LE(OUT), 0xdeadbeef);
  assert.equal(stepRoutePoint(GROUP, 0, OUT, runtime), 1); assert.equal(memory.readUInt32LE(OUT), 0xdead0001);
});
test('reverse and cyclic flags control authored successor and predecessor', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[GROUP + 2] = 255; memory[GROUP + 4] = 1;
  stepRoutePoint(GROUP, 0, OUT, runtime); assert.equal(memory.readUInt16LE(OUT), 2);
  stepRoutePoint(GROUP, 2, OUT, runtime, true); assert.equal(memory.readUInt16LE(OUT), 0);
});
test('multi-step advance commits only after all steps succeed and truncates count', () => {
  const runtime = fixture(), {memory} = runtime; memory.writeUInt32LE(0xdeadbeef, OUT);
  assert.equal(stepRoutePoints(GROUP, 0, 3, OUT, runtime), 0); assert.equal(memory.readUInt32LE(OUT), 0xdeadbeef);
  assert.equal(stepRoutePoints(GROUP, 0, 2, OUT, runtime), 1); assert.equal(memory.readUInt32LE(OUT), 0xdead0002);
  assert.equal(stepRoutePoints(GROUP, 1, 256, OUT, runtime), 1); assert.equal(memory.readUInt32LE(OUT), 0xdead0001);
});
test('route direction at an open endpoint continues the previous segment', () => {
  const runtime = fixture(); writeRouteDirection(OUT, 0, 2, runtime); assert.deepEqual(vec(runtime.memory, OUT), [0, 0, 65500]);
});
test('singleton direction is literal +X but plane test consumes retained scratch', () => {
  const runtime = fixture([[0, 0, 0]]), {memory} = runtime;
  writeRouteDirection(OUT, 0, 0, runtime); assert.deepEqual(vec(memory, OUT), [65536, 0, 0]);
  put(memory, SCRATCH - 24, [65536, 0, 0]); put(memory, POSITION, [-65536, 0, 0]);
  assert.equal(isRoutePointPassed(GROUP, 0, POSITION, runtime), 0);
  put(memory, SCRATCH - 24, [-65536, 0, 0]); assert.equal(isRoutePointPassed(GROUP, 0, POSITION, runtime), 1);
});
test('forward route walk commits its first candidate before its plane test', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(0xa5a50000, INDEX); memory.writeUInt32LE(0xdeadbeef, OUT);
  findAutonomousRoutePoint(GROUP, INDEX, OUT, POSITION, runtime);
  assert.equal(memory.readUInt32LE(INDEX), 0xa5a50001); assert.equal(memory.readUInt32LE(OUT), POINTS + 16);
});
test('49-candidate exhaustion restores initial index and point pointer', () => {
  const runtime = fixture(Array.from({length: 64}, (_, index) => [0, 0, index])), {memory} = runtime;
  memory.writeUInt16LE(0, INDEX);
  put(memory, POSITION, [0, 0, 100 * 65536]);
  findAutonomousRoutePoint(GROUP, INDEX, OUT, POSITION, runtime);
  assert.equal(memory.readUInt16LE(INDEX), 0); assert.equal(memory.readUInt32LE(OUT), POINTS);
});
test('first flagged wheel with null metadata prevents later wheel fallback', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x324] = 1; memory[BODY + 0x324 + 200] = 1;
  memory.writeUInt32LE(OUT, BODY + 0x198 + 28); memory.writeUInt32LE(31 << 8, OUT + 12);
  assert.equal(readAutonomousSurfaceIndex(BODY, runtime), 0);
  memory[BODY + 0x324] = 0; assert.equal(readAutonomousSurfaceIndex(BODY, runtime), 31);
});
test('aligned speed policy honors510 sentinel and strict100-unit braking gap', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt16LE(351, BODY + 0x668);
  updateAutonomousSpeed(BODY, 250, runtime); assert.equal(memory.readUInt32LE(BODY + 0x710), 0x80);
  memory.writeUInt32LE(0, BODY + 0x710); memory.writeInt16LE(350, BODY + 0x668);
  updateAutonomousSpeed(BODY, 250, runtime); assert.equal(memory.readUInt32LE(BODY + 0x710), 0);
  updateAutonomousSpeed(BODY, 510, runtime); assert.equal(memory.readUInt32LE(BODY + 0x710), 0x40);
});
test('pacing begins at exactly-800 and preserves all non-throttle bits', () => {
  const runtime = fixture(), {memory} = runtime, other = 0x909300 + 0x30c;
  memory[BODY + 0x6f1] = 1; memory[BODY + 0x6f3] = 1;
  memory.writeUInt32LE(0x14000, other); memory.writeInt16LE(300, 0x14000 + 0x668); memory.writeInt16LE(351, BODY + 0x668);
  memory.writeInt32LE(-799, other + 0x24); memory.writeUInt32LE(0xa0c0, BODY + 0x710);
  limitAutonomousPacing(BODY, runtime); assert.equal(memory.readUInt32LE(BODY + 0x710), 0xa0c0);
  memory.writeInt32LE(-800, other + 0x24); limitAutonomousPacing(BODY, runtime); assert.equal(memory.readUInt32LE(BODY + 0x710), 0xa080);
});
test('target preparation advances at a reached point and normalizes next delta', () => {
  const runtime = fixture(), {memory} = runtime;
  put(memory, OUT, [0, 0, 0]); prepareAutonomousTarget(BODY, OUT, 0, 0, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6c2), 1); assert.deepEqual(vec(memory, OUT), [0, 0, 65500]);
});
test('route control leaves a gated-off body untouched', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(0x8000, BODY + 0x6c4); const before = Buffer.from(memory.subarray(BODY, BODY + 0x4000));
  updateAutonomousRouteControl(BODY, runtime); assert.deepEqual(memory.subarray(BODY, BODY + 0x4000), before);
});
test('special target squared-distance comparison wraps signed32 and clears5', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x6c9] = 5; put(memory, BODY + 0x6cc, [-2147483648, -2147483648, 0]);
  updateAutonomousRouteControl(BODY, runtime); assert.equal(memory[BODY + 0x6c9], 0);
});
test('special target at exactly200 units remains; suppression clears steering bits', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x6c9] = 5; put(memory, BODY + 0x6cc, [200 * 65536, 0, 0]); memory.writeUInt16LE(0xc000, BODY + 0x6c4); memory.writeUInt32LE(0xa000, BODY + 0x710);
  updateAutonomousRouteControl(BODY, runtime); assert.equal(memory[BODY + 0x6c9], 5); assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x4000); assert.equal(memory.readUInt32LE(BODY + 0x710) & 0xa000, 0);
});
test('route controls feed actual digital smoothing, handling drive and next-frame speed', () => {
  const runtime = fixture(), {memory} = runtime;
  Buffer.from(controlTables.hex, 'hex').copy(memory, Number(controlTables.address));
  memory[BODY + 0x718] = 8; memory[BODY + 0x708] = 128; memory[BODY + 0x720] = 16;
  memory.writeUInt16LE(7, 0x909300 + 0x25e); //Autonomous input ignores analog masks.
  memory.writeInt32LE(4, SESSION + 0x57c); memory.writeInt32LE(12345, BODY + 0x6b0);
  memory.writeInt32LE(8 * 65536, BODY + 0x70);
  //The target and velocity are supplied; no movement or acceleration model is
  //invented here.450e50 ingests controls before physics and derives speed after.
  for (let frame = 0; frame < 35; frame++) {
    memory.writeInt32LE(memory.readInt32LE(BODY + 0x710), BODY + 0x70c);
    memory.writeInt32LE(0, BODY + 0x710);
    updateAutonomousRouteControl(BODY, runtime);
    updateVehicleInputBlock(BODY, 0, runtime);
    updateVehicleControlState(BODY, runtime);
    memory.writeInt32LE(frame, 0x90a548);
    updateVehicleMotionState(0x909300, runtime);
  }
  assert.equal(memory[BODY + 0x721], 31); assert.equal(memory[BODY + 0x709], 255);
  assert.equal(memory.readInt32LE(BODY + 0x650), 255 << 8); assert.equal(memory.readInt32LE(BODY + 0x644), 0);
  assert.equal(memory.readInt32LE(BODY + 0x6b0), 12345); assert.equal(memory.readInt32LE(BODY + 0x664), 8 * 65536);
  assert.equal(memory.readInt16LE(BODY + 0x668), 54); assert.equal(memory.readInt16LE(BODY + 0x66a), 54);
  for (let frame = 0; frame < 16; frame++) {memory.writeInt32LE(0, BODY + 0x710); updateVehicleInputBlock(BODY, 0, runtime); updateVehicleControlState(BODY, runtime);}
  assert.equal(memory[BODY + 0x721], 0); assert.equal(memory.readInt32LE(BODY + 0x650), 0);
});
