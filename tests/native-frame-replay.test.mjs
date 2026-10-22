import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {replayNativeFrame, extendNativeFrameGeometryComparison, extendNativeFrameSoundComparison} from '../tools/lib/native-frame-replay.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {compareNativeFrameRegions} from '../tools/lib/native-frame-manifest.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';

const program = await loadRetainedNativeProgram();

// Constructed complete input image: exact headers/pointers are declared here,
// not inferred from original-process recordings or installed game resources.
function fixture(index = 2, {models = false, vehicles = 2} = {}) {
  const f = createSimulationVehicleFixture(program, index, {vehicleCount: vehicles, ordinaryCount: 1, interacting: true, effects: false, models});
  completeNativeFrameGeometryFixture(f);
  const m = f.memory, base = f.addresses.bodies[0];
  m.writeUInt32LE(base, 0x6e6b40); m.writeUInt32LE(base, 0x902eec);
  m.writeInt32LE(-140000 + 0x14000 / 32, 0x709808);
  m.writeUInt32LE(0x13000, 0x70dcf4);
  m.writeInt32LE(4, f.extraAddresses.session + 0x57c);
  const snapshot = {moduleBaseAddress: 0x400000, registers: {esp: '0x9000', fpuControlWord: '0x007f', mxcsr: '0x1f80'}, ranges: [{address: 0, bytes: m}]};
  return {...f, snapshot};
}

test('complete replay binds captured native geometry and both vehicles without constructing replacement state', () => {
  for (const index of [1,2,3,4]) {
    const f = fixture(index), initial = Buffer.from(f.memory);
    const replay = replayNativeFrame(f.snapshot, {stackBytesBefore: 4096});
    assert.deepEqual(f.memory, initial, 'Evidence remains immutable.');
    const expected = stepSimulationFrame(f.views.physicalGroup, f.vehicles, f.context);
    assert.equal(replay.report.nativeReturn, expected.nativeReturn);
    assert.equal(replay.report.preparedBodies, 3); assert.equal(replay.report.vehicles.length, 2);
    assert.ok(replay.manifest.geometryComparison.addedBytes > 0);
    const geometry = replay.manifest.requiredRegions.find(row => row.id.startsWith('native-geometry-'));
    const changed = Buffer.from(replay.span(0, f.memory.length)); changed[geometry.address] ^= 1;
    const comparison = compareNativeFrameRegions(replay.manifest, [{address: 0, bytes: replay.span(0, f.memory.length)}], [{address: 0, bytes: changed}]);
    assert.equal(comparison.matched, false, 'Integrated frame comparison detects a geometry-only mismatch.');
    assert.equal(comparison.divergence.address, geometry.address);
    assert.deepEqual(replay.span(0x10000, f.memory.length - 0x10000), f.memory.subarray(0x10000), `Fixture ${index}: every semantic image byte, including untouched state`);
  }
});

test('geometry comparison subtracts semantic core coverage while preserving uncovered bytes and ABI overlaps', () => {
  const manifest = {requiredRegions: [
    {id: 'core-a', address: 10, length: 10, comparison: 'mutable'},
    {id: 'core-b', address: 30, length: 10, comparison: 'read-only'},
    {id: 'scratch', address: 20, length: 10, comparison: 'abi-input'},
  ]};
  const region = {id: 'native-geometry-test', address: 5, length: 40, comparison: 'mutable', evidence: 'Constructed span.'};
  extendNativeFrameGeometryComparison(manifest, [region, {...region, address: 15, length: 20}]);
  assert.deepEqual(manifest.requiredRegions.slice(3).map(({address, length}) => [address, length]), [[5, 5], [20, 10], [40, 5]]);
  assert.deepEqual(manifest.geometryComparison, {validatedRegions: 2, addedRegions: 3, addedBytes: 20});
  assert.throws(() => extendNativeFrameGeometryComparison(manifest, [{...region, address: 0xffffffff}]), /Invalid validated/);
});

test('replay rejects unsupported numerical context and missing coverage before a partial physics result', () => {
  const f = fixture();
  for (const [key, value] of [['fpuControlWord','0x027f'], ['mxcsr','0x9f80']]) {
    assert.throws(() => replayNativeFrame({...f.snapshot, registers: {...f.snapshot.registers, [key]: value}}, {stackBytesBefore: 4096}), error => error.replayStage === 'numerical-context');
  }
  assert.throws(() => replayNativeFrame({...f.snapshot, ranges: [{address: 0x10000, bytes: f.memory.subarray(0x10000, 0x20000)}]}, {stackBytesBefore: 4096}), error => error.replayStage === 'core-coverage');
});

test('captured force binding preserves actual parent registers, countdown and shared stack across the full retained frame', () => {
  const f = fixture(1), m = f.memory;
  const registers = {ebx: 0x11223344, ebp: 0x55667788, esi: 0x22334455, edi: 0x33445566};
  Object.assign(f.snapshot.registers, registers);
  m.writeUInt32LE(0xffffffff, 0x9000);
  m.writeInt32LE(1, 0x91cd90); m.writeInt32LE(32, 0x91cd8c);
  m.writeInt32LE(-4 * 65536, 0x91cd80); m.writeInt32LE(0, 0x91cd84); m.writeInt32LE(-8 * 65536, 0x91cd88);
  for (const vehicle of f.vehicles) m.writeUInt32LE(0xffffffff, vehicle.body.address + 0x6bc);
  const machine = new BoundedX86(program.instructions, {entry: 0x4749e0, fpuPrecisionBits: 24});
  m.copy(machine.bytes); Object.assign(machine.r, {ESP: 0x9000, ...Object.fromEntries(Object.entries(registers).map(([name, value]) => [name.toUpperCase(), value]))});
  //The external CRT cookie check is an asserted invariant, not a supplied
  //physics, collision, geometry, effect or vehicle-callee result.
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  const nativeEntries = [];
  machine.onInstruction = (address, x) => {
    if (address === 0x47b020) nativeEntries.push({bodyAddress: x.r.ECX >>> 0, entryEsp: x.r.ESP >>> 0,
      bodyHeaderHex: x.bytes.subarray(x.r.ECX >>> 0, (x.r.ECX >>> 0) + 0x180).toString('hex'),
      entryRegisters: Object.fromEntries(['ebx', 'ebp', 'esi', 'edi'].map(name => [name, x.r[name.toUpperCase()] >>> 0]))});
  };
  machine.run(3000000);
  const sourceEntries = [], replay = replayNativeFrame(f.snapshot, {stackBytesBefore: 4096, onBodyEffectImpulse: record => sourceEntries.push(record)});
  assert.ok(nativeEntries.length > 0);
  assert.deepEqual(sourceEntries.map(({bodyAddress, entryEsp, bodyHeaderHex, entryRegisters}) => ({bodyAddress, entryEsp, bodyHeaderHex, entryRegisters})), nativeEntries);
  assert.ok(sourceEntries.every(row => Object.isFrozen(row) && row.returnAddress === 0x47a913));
  assert.deepEqual(replay.span(0x10000, m.length - 0x10000), machine.bytes.subarray(0x10000), 'Every mapped semantic byte agrees, including the following terrain queries.');
  delete f.snapshot.registers.ebx;
  assert.throws(() => replayNativeFrame(f.snapshot, {stackBytesBefore: 4096}), /captured frame entry ebx/);
});

test('sound comparison preserves core policies and includes both selected slots and mutable owner state', () => {
  const manifest = {requiredRegions: [{id: 'core', address: 10, length: 10, comparison: 'read-only'}]};
  extendNativeFrameSoundComparison(manifest, [
    {id: 'slot', address: 8, length: 8, comparison: 'read-only'},
    {id: 'owner', address: 16, length: 12, comparison: 'mutable'},
  ]);
  assert.deepEqual(manifest.requiredRegions.map(({address, length, comparison}) => [address, length, comparison]), [[10, 10, 'read-only'], [8, 2, 'read-only'], [20, 8, 'mutable']]);
  assert.equal(manifest.soundComparison.addedBytes, 10);
  assert.throws(() => extendNativeFrameGeometryComparison(manifest, [{address: 40, length: 4, comparison: 'read-only'}]), /Invalid validated native geometry/);
  assert.throws(() => extendNativeFrameSoundComparison(manifest, [{address: 40, length: 4, comparison: 'abi-input'}]), /Invalid validated native sound/);
});

test('optional captured lookup and cookie use their exact live identities and retain read-only coverage', () => {
  const f = fixture(), lookupAddress = 0x83000;
  f.memory.writeUInt32LE(lookupAddress, 0x713180);
  f.snapshot.ranges.push(
    {id: 'active-effect-lookup-bytes', address: lookupAddress, bytes: f.memory.subarray(lookupAddress, lookupAddress + 64)},
    {id: 'active-sound-cookie', address: 0x5e8890, bytes: f.memory.subarray(0x5e8890, 0x5e8894)},
  );
  const replay = replayNativeFrame(f.snapshot, {stackBytesBefore: 4096});
  for (const id of ['active-effect-lookup-bytes', 'active-sound-cookie']) assert.equal(replay.manifest.requiredRegions.find(row => row.id === id).comparison, 'read-only');
  f.memory.writeUInt32LE(lookupAddress + 4, 0x713180);
  assert.throws(() => replayNativeFrame(f.snapshot, {stackBytesBefore: 4096}), /lookup differs from its live root/);
  f.memory.writeUInt32LE(lookupAddress, 0x713180);
  f.snapshot.ranges.at(-1).address += 4;
  f.snapshot.ranges.at(-1).bytes = f.memory.subarray(0x5e8894, 0x5e8898);
  assert.throws(() => replayNativeFrame(f.snapshot, {stackBytesBefore: 4096}), /cookie differs from its module literal/);
});
