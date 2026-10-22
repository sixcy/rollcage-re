import test from 'node:test';
import assert from 'node:assert/strict';
import {updateAutonomousStuckState, maybeStartAutonomousRandomRecovery, updateAutonomousReverseRecovery, updateAutonomousPowerSlide} from '../src/autonomous-recovery.mjs';

const BODY = 0x10000, PACK = 0x20000, GROUP = 0x21000, POINTS = 0x30000, SESSION = 0x60000, CONTACT = 0x62000, STACK = 0x9000;
function fixture(points = [[0, 0, 0], [0, 0, 100], [0, 0, 200]]) {
  const memory = Buffer.alloc(0xa00000);
  memory.writeUInt32LE(PACK, 0x90b98c); memory.writeUInt32LE(GROUP, PACK + 0x60); memory.writeUInt32LE(SESSION, 0x5ecb1c);
  memory.writeUInt16LE(points.length, GROUP); memory.writeUInt32LE(POINTS, GROUP + 8);
  points.forEach((point, index) => {point.forEach((value, axis) => memory.writeInt16LE(value, POINTS + index * 16 + axis * 2)); memory[POINTS + index * 16 + 7] = 125;});
  memory.writeUInt32LE(BODY, 0x909300); memory.writeUInt32LE(GROUP, 0x909354);
  [4096, 0, 0, 0, 4096, 0, 0, 0, 4096].forEach((value, index) => memory.writeInt16LE(value, BODY + 0xc4 + index * 2));
  memory[BODY + 0x6f1] = 4;
  return {memory, scratchBase: STACK};
}
const controls = memory => memory.readUInt32LE(BODY + 0x710);
const modeAndTimer = memory => memory.readUInt32LE(BODY + 0x6c4);

test('opening countdown overwrites both age bytes and uses an unsigned timer', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(4, SESSION + 0x57c); memory.writeInt32LE(59, SESSION + 0x580); memory.writeUInt16LE(0x7788, BODY + 0x6e8);
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory.readUInt16LE(BODY + 0x6e8), 254);
  memory.writeInt32LE(-1, SESSION + 0x580);
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory.readUInt16LE(BODY + 0x6e8), 255);
});

test('stuck admission is strict above the surface threshold and clears the overlapping timer', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x70c] = 64; memory[BODY + 0x6e9] = 29; memory.writeUInt32LE(0x12344000, BODY + 0x6c4);
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory[BODY + 0x6e9], 30); assert.equal(modeAndTimer(memory), 0x12344000);
  updateAutonomousStuckState(BODY, runtime); assert.equal(modeAndTimer(memory), 0x80); assert.equal(memory[BODY + 0x6e9], 0);
  memory[BODY + 0x324] = 1; memory.writeUInt32LE(CONTACT, BODY + 0x198); memory.writeUInt32LE(11 << 8, CONTACT + 12); memory[BODY + 0x6e9] = 59;
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory[BODY + 0x6e9], 60);
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory[BODY + 0x6e9], 0);
});

test('stuck byte wraps, speed85 clears it, and saturated age stays255', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x70c] = 64; memory[BODY + 0x6e9] = 255; memory[BODY + 0x6e8] = 255;
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory[BODY + 0x6e9], 0); assert.equal(memory[BODY + 0x6e8], 255); assert.equal(modeAndTimer(memory), 0);
  memory[BODY + 0x6e9] = 30; memory.writeInt16LE(85, BODY + 0x668);
  updateAutonomousStuckState(BODY, runtime); assert.equal(memory[BODY + 0x6e9], 0); assert.equal(modeAndTimer(memory), 0);
});

test('random recovery skips its private generator until all gates admit it', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(1, 0x5ea4d4); memory.writeInt16LE(200, BODY + 0x668); memory.writeUInt32LE(377, 0x90a548);
  maybeStartAutonomousRandomRecovery(BODY, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 1);
  memory.writeUInt32LE(378, 0x90a548); memory.writeInt32LE(2, 0x5ea4d8);
  maybeStartAutonomousRandomRecovery(BODY, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 1);
  memory.writeInt32LE(0, 0x5ea4d8); memory.writeInt16LE(199, BODY + 0x668);
  maybeStartAutonomousRandomRecovery(BODY, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 1);
});

test('unsigned negative clock and low-five-bit shift can assign mode200 and clear its timer', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(-1, 0x90a548); memory.writeInt32LE(1, 0x5ea4d4); memory.writeInt16LE(200, BODY + 0x668); memory[BODY + 0x6f2] = 32; memory.writeUInt32LE(0x12340080, BODY + 0x6c4);
  maybeStartAutonomousRandomRecovery(BODY, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 16807); assert.equal(modeAndTimer(memory), 0x200);
});

test('reverse recovery times out before querying progression and clears state plus age', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(0, 0x909354); memory.writeUInt16LE(0x80, BODY + 0x6c4); memory.writeUInt16LE(120, BODY + 0x6c6); memory[BODY + 0x6e8] = 119;
  updateAutonomousReverseRecovery(BODY, runtime); assert.equal(modeAndTimer(memory), 0); assert.equal(memory[BODY + 0x6e8], 0); assert.equal(controls(memory), 0);
});

test('aligned reverse recovery changes phase at60 and clears state after actual steering', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(0x80, BODY + 0x6c4); memory.writeUInt16LE(59, BODY + 0x6c6);
  updateAutonomousReverseRecovery(BODY, runtime); assert.equal(controls(memory) & 0xd0, 0x10); assert.equal(memory.readUInt16LE(BODY + 0x6c6), 60);
  memory.writeUInt32LE(0, BODY + 0x710); updateAutonomousReverseRecovery(BODY, runtime);
  assert.equal(controls(memory) & 0xd0, 0x40); assert.equal(modeAndTimer(memory), 0);
});

test('older surface11 recovery switches at20 while age149 still uses60', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[BODY + 0x324] = 1; memory.writeUInt32LE(CONTACT, BODY + 0x198); memory.writeUInt32LE(11 << 8, CONTACT + 12);
  memory[BODY + 0x6e8] = 149; memory.writeUInt16LE(0x80, BODY + 0x6c4); memory.writeUInt16LE(20, BODY + 0x6c6);
  updateAutonomousReverseRecovery(BODY, runtime); assert.equal(controls(memory) & 0x50, 0x10); assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x80);
  memory[BODY + 0x6e8] = 150; memory.writeUInt32LE(0, BODY + 0x710); memory.writeUInt16LE(20, BODY + 0x6c6);
  updateAutonomousReverseRecovery(BODY, runtime); assert.equal(controls(memory) & 0x50, 0x40); assert.equal(modeAndTimer(memory), 0);
});

test('slide timer0 requires speed200 and forward route alignment', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(1, BODY + 0x6c4); memory.writeInt16LE(199, BODY + 0x668);
  assert.equal(updateAutonomousPowerSlide(BODY, runtime), 0); assert.equal(controls(memory), 0);
  memory.writeInt16LE(200, BODY + 0x668); assert.equal(updateAutonomousPowerSlide(BODY, runtime), 1); assert.equal(controls(memory) & 0xa000, 0x8000);
  memory.writeUInt32LE(0, BODY + 0x710); memory.writeInt16LE(-4096, BODY + 0xd4);
  assert.equal(updateAutonomousPowerSlide(BODY, runtime), 0); assert.equal(controls(memory), 0);
});

test('slide timer10..29 advances alone and timer30 clears the whole mode dword', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(2, BODY + 0x6c4); memory.writeUInt16LE(29, BODY + 0x6c6); memory.writeUInt32LE(0x12345678, BODY + 0x710);
  assert.equal(updateAutonomousPowerSlide(BODY, runtime), 0); assert.equal(memory.readUInt16LE(BODY + 0x6c6), 30); assert.equal(controls(memory), 0x12345678);
  assert.equal(updateAutonomousPowerSlide(BODY, runtime), 0); assert.equal(modeAndTimer(memory), 0); assert.equal(controls(memory), 0x12345678);
});

test('slide braking uses strict opposite30000 steering thresholds for each side', () => {
  for (const [mode, edge, direction] of [[1, -30000, 0x8000], [2, 30000, 0x2000]]) {
    const runtime = fixture(), {memory} = runtime;
    memory.writeUInt16LE(mode, BODY + 0x6c4); memory.writeUInt16LE(1, BODY + 0x6c6); memory.writeInt32LE(edge, BODY + 0x644);
    assert.equal(updateAutonomousPowerSlide(BODY, runtime), 1); assert.equal(controls(memory) & 0xa080, direction); assert.equal(memory.readUInt16LE(BODY + 0x6c6), 1);
    memory.writeUInt32LE(0, BODY + 0x710); memory.writeInt32LE(edge + Math.sign(edge), BODY + 0x644);
    updateAutonomousPowerSlide(BODY, runtime); assert.equal(controls(memory) & 0xa080, direction | 0x80); assert.equal(memory.readUInt16LE(BODY + 0x6c6), 2);
  }
});

test('slide speed uses the original point byte after target advance, with mode4 override', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[POINTS + 7] = 255; memory[POINTS + 16 + 7] = 1; memory.writeUInt16LE(1, BODY + 0x6c4); memory.writeUInt16LE(1, BODY + 0x6c6); memory.writeInt16LE(400, BODY + 0x668);
  assert.equal(updateAutonomousPowerSlide(BODY, runtime), 1); assert.equal(memory.readUInt16LE(BODY + 0x6c2), 1); assert.equal(controls(memory) & 0xc0, 0x40);
  memory.writeUInt16LE(0, BODY + 0x6c2); memory[SESSION + 0x551] = 4; memory.writeUInt32LE(0, BODY + 0x710);
  updateAutonomousPowerSlide(BODY, runtime); assert.equal(controls(memory) & 0xc0, 0x80);
});
