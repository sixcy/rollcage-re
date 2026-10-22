import test from 'node:test';
import assert from 'node:assert/strict';
import {updateAutonomousWeaponPolicy, initializeAutonomousWeaponTables, decideAutonomousItem00, decideAutonomousItem01, decideAutonomousItem02, decideAutonomousItem03, decideAutonomousItem04, decideAutonomousItem07, hasAutonomousSpeedMarker, writeAutonomousObjectPosition} from '../src/autonomous-weapon-policy.mjs';

const BODY = 0x10000, SESSION = 0x20000;
function fixture() {
  const memory = Buffer.alloc(0xa00000), calls = [];
  memory.writeUInt32LE(SESSION, 0x5ecb1c); memory.writeUInt32LE(350, 0x90a548);
  memory[BODY + 0x68c] = 5; memory[BODY + 0x68d] = 6; memory.writeInt32LE(-1, BODY + 0x6bc);
  const handlers = Object.fromEntries(['410780', '410f80', '411340', '410930', '411ba0', '410c90'].map(address => [`call${address}`, request => {calls.push({address, ...request}); return 1;}]));
  return {memory, scratchBase: 0x9000, handlers, calls};
}
const control = memory => memory.readUInt32LE(BODY + 0x710);

test('flagged record outside phase6 returns before advancing either timer', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[0x909549] = 1; memory.writeInt32LE(7, SESSION + 0x57c);
  updateAutonomousWeaponPolicy(BODY, runtime);
  assert.equal(memory.readUInt32LE(BODY + 0x6e4), 0); assert.equal(control(memory), 0);
});

test('late phases gate all decisions below150 and only slot2 below300', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(6, SESSION + 0x57c); memory.writeInt32LE(149, SESSION + 0x580);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(memory.readUInt32LE(BODY + 0x6e4), 0);
  memory.writeInt32LE(150, SESSION + 0x580); updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 4);
  memory.writeInt32LE(300, SESSION + 0x580); memory.writeUInt32LE(0, BODY + 0x710);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 12);
});

test('signed negative slot IDs distinguish empty-1 from invalid-128', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x68c] = 255; memory[BODY + 0x68d] = 128; memory.writeInt32LE(1, 0x5ea4d4);
  updateAutonomousWeaponPolicy(BODY, runtime);
  assert.equal(memory.readInt16LE(BODY + 0x6e4), -8); assert.equal(memory.readInt16LE(BODY + 0x6e6), 1); assert.equal(memory.readInt32LE(0x5ea4d4), 16807); assert.equal(control(memory), 0);
});

test('two empty slots consume ordered private RNG transitions but retain negative timers', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x68c] = memory[BODY + 0x68d] = 255; memory.writeInt32LE(1, 0x5ea4d4); memory.writeInt32LE(2, 0x5ea4d8);
  updateAutonomousWeaponPolicy(BODY, runtime);
  assert.equal(memory.readInt32LE(0x5ea4d4), Math.imul(16807, 16807) & 0x7fffffff);
  assert.equal(memory.readInt16LE(BODY + 0x6e4), -2); assert.equal(memory.readInt16LE(BODY + 0x6e6), -3);
  const seed = memory.readInt32LE(0x5ea4d4); updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), seed);
});

test('timer increments wrap signed words before arbitration and clock350 is unsigned', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(32767, BODY + 0x6e4); memory.writeUInt32LE(0xffffffff, 0x90a548);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(memory.readInt16LE(BODY + 0x6e4), -32768); assert.equal(control(memory), 8);
  memory.writeUInt32LE(0, BODY + 0x710); memory.writeUInt32LE(349, 0x90a548);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(memory.readInt16LE(BODY + 0x6e6), 2); assert.equal(control(memory), 0);
});

test('equal IDs prefer the older signed timer, with ties favoring slot1', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x68d] = 5; updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 4);
  memory.writeUInt16LE(2, BODY + 0x6e6); memory.writeUInt32LE(0, BODY + 0x710);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 8);
});

test('inline ID5 reads its global gate while ID6 accepts exactly timer50', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(1, 0x811180); memory.writeInt32LE(0, BODY + 0x6bc); memory.writeUInt16LE(48, BODY + 0x6e6);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 0);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(control(memory), 8);
});

test('previous-frame button bits suppress setting current controls after decisions', () => {
  const runtime = fixture(), {memory, calls} = runtime;
  memory[BODY + 0x68c] = 0; memory[BODY + 0x68d] = 4; memory[BODY + 0x70c] = 12; memory.writeUInt32LE(0x12340001, BODY + 0x710);
  updateAutonomousWeaponPolicy(BODY, runtime); assert.equal(calls.length, 2); assert.equal(control(memory), 0x12340001);
});

test('decision calls receive captured flags and native timer stack positions', () => {
  const runtime = fixture(), {memory, calls} = runtime;
  memory[BODY + 0x68c] = 3; memory[BODY + 0x68d] = 7; memory.writeUInt32LE(0x180, BODY + 0x6ec); memory.writeUInt16LE(9, BODY + 0x6e4); memory.writeUInt16LE(19, BODY + 0x6e6);
  updateAutonomousWeaponPolicy(BODY, runtime);
  assert.deepEqual(calls.map(call => [call.address, call.edx, call.args, call.scratchBase]), [['410930', 1, [10], 0x9000 - 36], ['410c90', 1, [20], 0x9000 - 36]]);
});

test('slot1 may change slot2 timer but slot2 ID was captured before callbacks', () => {
  const runtime = fixture(), {memory, calls} = runtime;
  memory[BODY + 0x68c] = 0; memory[BODY + 0x68d] = 1;
  runtime.handlers.call410780 = () => {memory.writeUInt16LE(123, BODY + 0x6e6); memory[BODY + 0x68d] = 2; return 0;};
  updateAutonomousWeaponPolicy(BODY, runtime);
  assert.equal(calls[0].address, '410f80'); assert.equal(calls[0].edx, 123); assert.equal(control(memory), 8);
});

function geometryFixture() {
  const runtime = fixture(), {memory} = runtime;
  initializeAutonomousWeaponTables(memory); runtime.handlers = {};
  memory.writeUInt32LE(0x30000, 0x90b98c); memory.writeUInt32LE(0x31000, 0x30060); memory.writeUInt16LE(32, 0x31000); memory.writeUInt32LE(0x32000, 0x31008);
  for (let index = 0; index < 32; index++) {memory.writeInt16LE(index * 100, 0x32000 + index * 16 + 4); memory[0x32000 + index * 16 + 7] = 255;}
  memory.writeUInt32LE(BODY, 0x909300); memory.writeUInt32LE(0x31000, 0x909354);
  memory.writeUInt32LE(0x40000, 0x90960c); memory.writeUInt32LE(0x31000, 0x909660); memory.writeInt32LE(600, 0x909630);
  memory[SESSION + 0x54d] = 2; memory[SESSION + 0x586] = 3; memory.writeInt16LE(4096, BODY + 0xd4); memory[BODY + 0x6f1] = 4; memory[0x40000 + 0x11c] = memory[BODY + 0x11c] = 3; memory.writeInt16LE(150, 0x40000 + 0x668); memory.writeInt32LE(200 * 65536, 0x40000 + 0x3c); memory.writeUInt16LE(6000, BODY + 0x6fe);
  return runtime;
}

test('item03 qualified rear target sets use direction and mode using word precision', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory.writeInt32LE(-600, 0x909630); memory.writeUInt32LE(0x12340020, BODY + 0x6c4);
  assert.equal(decideAutonomousItem03(BODY, 0, 0, runtime), 1);
  assert.equal(control(memory), 0x4000); assert.equal(memory.readUInt32LE(BODY + 0x6c4), 0x12348020);
});

test('item03 skill0 refuses an aligned non-type8 vehicle ahead', () => {
  const runtime = geometryFixture(), {memory} = runtime; memory[BODY + 0x6f1] = 0;
  assert.equal(decideAutonomousItem03(BODY, 0, 0, runtime), 0); assert.equal(control(memory), 0);
  memory[0x40000 + 0x718] = 8; assert.equal(decideAutonomousItem03(BODY, 0, 0, runtime), 1);
});

test('speed marker scan includes exactly nine successors and respects open endpoints', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory[0x32000 + 10 * 16 + 7] = 1; assert.equal(hasAutonomousSpeedMarker(BODY, runtime), 0);
  memory[0x32000 + 9 * 16 + 7] = 1; assert.equal(hasAutonomousSpeedMarker(BODY, runtime), 1);
  memory.writeUInt16LE(31, BODY + 0x6c2); assert.equal(hasAutonomousSpeedMarker(BODY, runtime), 0);
});

test('item04 accepts a long straight sentinel-speed route and rejects a marker', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  assert.equal(decideAutonomousItem04(BODY, 0, runtime), 1);
  memory[0x32000 + 7] = 254; assert.equal(decideAutonomousItem04(BODY, 0, runtime), 0);
});

test('item02 predicts an eligible vehicle through its actual future route points', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory[0x40000 + 0x718] = 8; memory.writeInt32LE(10 * 65536, 0x40000 + 0x664);
  assert.equal(decideAutonomousItem02(BODY, 0, runtime), 1);
  memory[BODY + 0x6db] = 1; assert.equal(decideAutonomousItem02(BODY, 0, runtime), 0);
});

test('item07 uses the route direction again for targets at least4000 score units ahead', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory.writeInt32LE(4500, 0x909630); assert.equal(decideAutonomousItem07(BODY, 0, 0, runtime), 1);
  memory.writeInt32LE(-200 * 65536, 0x40000 + 0x3c); assert.equal(decideAutonomousItem07(BODY, 0, 0, runtime), 0);
});

test('item00 selected flag1 record affects both progression gap and relative speed', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory[0x909629] = 1; memory[0x40000 + 0x718] = 8;
  assert.equal(decideAutonomousItem00(BODY, 0, runtime), 1);
  memory.writeInt32LE(100, 0x909630); memory.writeInt16LE(150, BODY + 0x668);
  assert.equal(decideAutonomousItem00(BODY, 0, runtime), 0);
});

test('item01 admission checks flag10 before the late-phase timer shortcut', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory.writeInt32LE(6, SESSION + 0x57c);
  assert.equal(decideAutonomousItem01(BODY, 51, runtime), 0);
  memory[BODY + 0x6ec] = 16; assert.equal(decideAutonomousItem01(BODY, 51, runtime), 1);
  assert.equal(decideAutonomousItem01(BODY, 50, runtime), 0);
});

test('authored object transform preserves yaw0 and wraps signed coordinate words', () => {
  const runtime = geometryFixture(), {memory} = runtime;
  memory.writeUInt32LE(0x60000, 0x50000); memory.writeUInt32LE(0x70000, 0x50004);
  memory.writeInt16LE(100, 0x60000); memory.writeInt16LE(200, 0x60002); memory.writeInt16LE(300, 0x60004);
  memory.writeInt16LE(32760, 0x70036); memory.writeInt16LE(1000, 0x7003a); memory.writeInt16LE(-1000, 0x7003e);
  writeAutonomousObjectPosition(0x50000, 0x80000, runtime);
  assert.deepEqual([0, 2, 4].map(offset => memory.readInt16LE(0x80000 + offset)), [-32676, 1200, -700]);
});
