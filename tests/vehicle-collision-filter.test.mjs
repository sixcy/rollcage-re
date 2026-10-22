import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAutonomousOpponentTables} from '../src/autonomous-opponent-candidates.mjs';
import {addVehicleContactScore, subtractVehicleContactScore, updateVehicleContactForObject, triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';
import {filterVehicleCollision, applyRawActiveVehicleEffect, createVehicleCollisionFilter} from '../src/vehicle-collision-filter.mjs';

const BODY = 0x10000, OTHER = 0x20000, CANDIDATE = 0x30000, SESSION = 0x50000, STATE = 0x60000, LOOKUP = 0x61000;
function fixture() {
  const memory = initializeAutonomousOpponentTables(Buffer.alloc(0xa00000)), runtime = {memory, scratchBase: 0x9000};
  memory.writeUInt32LE(SESSION, 0x5ecb1c);
  for (const [index, body] of [BODY, OTHER, CANDIDATE].entries()) {
    memory.writeUInt16LE(index, body + 0x65e); memory[body + 0x6f3] = 255;
    memory.writeUInt32LE(body, 0x909300 + index * 0x30c);
  }
  return runtime;
}

test('contact scores saturate at65535 and crossing a threshold sets the opponent bit', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(65530, BODY + 0x6fe); addVehicleContactScore(BODY, OTHER, 20, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6fe), 65535); assert.equal(memory[BODY + 0x6db], 2);
  assert.equal(memory[BODY + 0x6f3], 255, 'no existing owner means no ownership transfer');
});

test('contact ownership transfers from an existing weaker owner after threshold crossing', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[SESSION + 0x54d] = 3; memory[CANDIDATE + 0x6f3] = 1;
  memory.writeUInt16LE(5000, CANDIDATE + 0x6fe); memory.writeUInt16LE(4995, BODY + 0x6fe);
  addVehicleContactScore(BODY, OTHER, 20, runtime);
  assert.equal(memory[BODY + 0x6f3], 1); assert.equal(memory[CANDIDATE + 0x6f3], 255);
});

test('high opponent IDs preserve x86 byte-bit truncation while updating their score', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt16LE(9, OTHER + 0x65e); addVehicleContactScore(BODY, OTHER, 65535, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6fc + 18), 65535); assert.equal(memory[BODY + 0x6db], 0);
});

test('profile6 halves the unsigned-short decrement and clears an under-threshold opponent bit', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(6 << 12, BODY + 0x6f8); memory.writeUInt16LE(100, BODY + 0x6fe); memory[BODY + 0x6db] = 2;
  subtractVehicleContactScore(BODY, OTHER, 100, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6fe), 50); assert.equal(memory[BODY + 0x6db], 0);
  assert.equal(memory.readUInt16LE(runtime.scratchBase + 4), 50);
});

test('object adapters route kind12 through the captured target with a150-point tail argument', () => {
  const runtime = fixture(), {memory} = runtime;
  memory[OTHER + 0x718] = 1;
  updateVehicleContactForObject(BODY, OTHER, 12, true, runtime);
  assert.equal(memory.readUInt16LE(BODY + 0x6fe), 150); assert.equal(memory.readInt32LE(runtime.scratchBase + 4), 150);
});

test('contact recovery consumes its separate random stream only beyond the intensity threshold and without a pending timer', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(LOOKUP, 0x91f6a0); memory.writeInt32LE(1, 0x5ea4d4);
  triggerVehicleContactRecovery(BODY, 19, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 1);
  triggerVehicleContactRecovery(BODY, 20, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 0x41a7);
  assert.equal(memory.readUInt16LE(BODY + 0x6c4), 0x100); assert.equal(memory.readUInt16LE(BODY + 0x6c6), 40);
  triggerVehicleContactRecovery(BODY, 127, runtime); assert.equal(memory.readInt32LE(0x5ea4d4), 0x41a7);
});

test('kind12 collision returns before dereferencing event data or publishing collision feedback', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeInt32LE(12, OTHER); memory.writeUInt32LE(CANDIDATE, OTHER + 0x194); memory[BODY + 0x718] = 8;
  memory.writeUInt16LE(99, BODY + 0x66f);
  assert.equal(filterVehicleCollision(BODY, OTHER, memory.length + 16, runtime), 1);
  assert.equal(memory.readUInt16LE(BODY + 0x700), 150); assert.equal(memory.readUInt16LE(BODY + 0x66f), 99);
});

test('raw active effect uses the lookup byte and preserves cooling state when sound is gated', () => {
  const runtime = fixture(), {memory} = runtime;
  memory.writeUInt32LE(STATE, BODY + 0x6bc); memory[STATE + 8] = 10; memory[STATE + 1] = 71;
  memory.writeUInt32LE(LOOKUP, 0x713180); memory[LOOKUP + 42] = 77;
  applyRawActiveVehicleEffect(BODY, CANDIDATE, 123, runtime);
  assert.equal(memory[STATE + 86], 123); assert.equal(memory[STATE + 1], 71); assert.equal(memory[STATE + 8], 10);
});

test('vehicle filter bridge rejects detached views before touching native memory', () => {
  const runtime = fixture(), callback = createVehicleCollisionFilter(runtime);
  assert.throws(() => callback({address: BODY, bytes: Buffer.alloc(0x4000)}, null, {address: OTHER, bytes: Buffer.alloc(0x68)}), /shared native/);
});

test('raw active effect captures state identity but reads the lookup pointer and final argument after emission', () => {
  const runtime = fixture(), {memory} = runtime, otherState = STATE + 0x1000, otherLookup = LOOKUP + 0x1000;
  memory.writeUInt32LE(STATE, BODY + 0x6bc); memory[STATE + 1] = 100;
  memory.writeUInt32LE(LOOKUP, 0x713180); memory[otherLookup + 42] = 55;
  runtime.handlers = {call484bb0: request => {
    assert.equal(request.scratchBase, runtime.scratchBase - 88); assert.equal(request.code, 24);
    memory.writeUInt32LE(otherState, BODY + 0x6bc); memory.writeUInt32LE(otherLookup, 0x713180);
    memory.writeInt32LE(77, runtime.scratchBase + 4);
  }};
  applyRawActiveVehicleEffect(BODY, CANDIDATE, 64, runtime);
  assert.equal(memory[STATE + 1], 98); assert.equal(memory[STATE + 8], 10); assert.equal(memory[STATE + 64], 77);
  assert.equal(memory[otherState + 8], 0);
});
