import test from 'node:test';
import assert from 'node:assert/strict';
import {createSixteenPickupDraft, assertPickupCompilePreservation, assertPickupDebugCapacity} from '../tools/validate-pickup-editor.mjs';
import {compilePickupEdits} from '../src/pickup-editor.mjs';
import {updateWorldPickups} from '../src/pickup-world-state.mjs';
import {initializePickupRespawnControllers} from '../src/pickup-world-construction.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {loadRetainedNativeProgram, REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';

test('capacity draft uses only authentic source templates and compiled bytes preserve adjacent header fields', () => {
  const data = Buffer.alloc(0x140, 0x69); data.write('GFXM'); data.writeUInt32LE(0x120, 0x90); data[0x94] = 1;
  [32767, -32768, 7].forEach((n, i) => data.writeInt16LE(n, 0x120 + i * 2));
  const draft = createSixteenPickupDraft(data), edited = compilePickupEdits(data, draft);
  assert.equal(draft.length, 16); assert.deepEqual(draft[0].position, [32766, -32767, 8]);
  assert(draft.every(row => row.templateIndex === 0)); assertPickupCompilePreservation(data, edited, draft);
  edited[0x95] ^= 1; assert.throws(() => assertPickupCompilePreservation(data, edited, draft), /Unrelated/);
});

test('read-only diagnostics reject arena/registry/queue overflow and invalid pending indices', () => {
  const frame = {bodyArena: {block: 0x100003, aligned: 0x100080, cursor: 1000, requestedBytes: 1200, registeredBodies: 512}, pickupPendingCount: 16, pickupPendingIndices: [...Array(16).keys(), ...Array(8).fill(255)], pickupControllerCount: 3};
  assertPickupDebugCapacity(frame, 16);
  for (const bad of [{...frame, bodyArena: {...frame.bodyArena, cursor: 1100}}, {...frame, bodyArena: {...frame.bodyArena, registeredBodies: 513}}, {...frame, pickupPendingCount: 25}, {...frame, pickupPendingIndices: Array(24).fill(16)}]) assert.throws(() => assertPickupDebugCapacity(bad, 16));
});

test('retained target proves24 initialized queue bytes and independent byte controller count', async () => {
  const {evidence, instructions} = await readInstructionEvidence(['3287-pickup-controller-construction-assembly.json', '3209-stage-child-47b680-assembly.json'], {directory: 'analysis/native-simulation/results'});
  for (const item of evidence) assert.equal(item.subject.digest.sha256, REDUX_SHA256);
  const at = address => instructions.find(row => row.address === address);
  assert.deepEqual(at(0x43195e), {address: 0x43195e, op: 'MOVZX', args: ['EBX', 'byte ptr [EAX + 0xf7]']});
  assert.deepEqual(at(0x4319ce), {address: 0x4319ce, op: 'MOVDQU', args: ['xmmword ptr [0x0091d498]', 'XMM0']});
  assert.deepEqual(at(0x4319dc), {address: 0x4319dc, op: 'MOVQ', args: ['qword ptr [0x0091d4a8]', 'XMM0']});
  assert.deepEqual(at(0x47b880), {address: 0x47b880, op: 'MOV', args: ['byte ptr [EAX + 0x91d498]', 'DL']});
  assert.deepEqual(at(0x47b886), {address: 0x47b886, op: 'INC', args: ['word ptr [0x0091d4b0]']});
});

test('genuine pickup source and retained instructions agree for all16 pending indices and zero count', async () => {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
  for (const count of [0, 16]) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)); initializeWheelRenderTables(memory);
    memory.writeUInt32LE(0x70000, 0x90b990); memory[0x700f7] = 0; // Explicit zero-controller synthetic subdomain.
    memory.writeUInt32LE(0x71000, 0x902020); memory.writeInt32LE(count, 0x902024);
    memory.fill(255, 0x91d498, 0x91d4b0); memory.writeUInt16LE(0, 0x91d4b0);
    for (let i = 0; i < count; i++) {
      const pickup = 0x100000 + i * 0x1000; memory.writeUInt32LE(pickup, 0x71000 + i * 4);
      memory.writeUInt16LE(1, pickup + 0x180); memory.writeUInt16LE(0x82, pickup + 0x182);
    }
    machine.reset(); memory.copy(machine.bytes); machine.entry = 0x47b680; machine.r.ESP = 0x9000; machine.r.EDI = 123;
    machine.bytes.writeInt32LE(-1, 0x9000); machine.run(1000000);
    updateWorldPickups({memory, scratchBase: 0x9000, entryRegisters: {EDI: 123}});
    assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000));
    assert.equal(memory.readUInt16LE(0x91d4b0), count);
    assert.deepEqual(Array.from(memory.subarray(0x91d498, 0x91d498 + count)), [...Array(count).keys()]);
    assert.deepEqual(memory.subarray(0x91d498 + count, 0x91d4b0), Buffer.alloc(24 - count, 255));
  }
});

test('real controller initialization with zero authored controllers matches retained24-byte queue writes', async () => {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
  const memory = program.initializeMemory(Buffer.alloc(0xa00000));
  for (const [p, n] of [[0x90b990, 0x70000], [0x90b98c, 0x71000], [0x71058, 0x72000], [0x71018, 0x73000]]) memory.writeUInt32LE(n, p);
  memory.fill(255, 0x5dd020, 0x5dd030); memory.fill(0x69, 0x91d498, 0x91d4b2);
  machine.reset(); memory.copy(machine.bytes); machine.entry = 0x431950; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); machine.run(100000);
  initializePickupRespawnControllers({memory, scratchBase: 0x9000});
  assert.deepEqual(memory.subarray(0x10000), machine.bytes.subarray(0x10000));
  assert.deepEqual(memory.subarray(0x91d498, 0x91d4b0), Buffer.alloc(24, 255)); assert.equal(memory.readUInt16LE(0x91d4b0), 0);
});

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('optional frozen diagnostics preserve installed source session results', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation); let plain, observed;
  try {
    const track = getGame('rollcage').tracks.find(row => row.name === 'LOW/LEV1.BLP');
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const edited = compilePickupEdits(data, createSixteenPickupDraft(data)), options = {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true};
    const frames = [];
    plain = createSession(edited, textures, options);
    observed = createSession(edited, textures, {...options, onDebugFrame(frame) {
      assert(Object.isFrozen(frame.bodyArena)); assert(Object.isFrozen(frame.pickupPendingIndices));
      assertPickupDebugCapacity(frame, 16); frames.push(frame);
    }});
    assert.deepEqual(observed.step(), plain.step()); assert.equal(frames.length, 4);
    const first = frames[0].pickupPendingIndices.slice(); observed.step();
    assert.deepEqual(frames[0].pickupPendingIndices, first, 'Earlier frozen diagnostic is a copy, not live queue storage.');
  } finally {plain?.dispose(); observed?.dispose(); await archive.close();}
});
