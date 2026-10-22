import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from '../tools/lib/post-frame-runtime-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {bindCapturedNativeRecovery,nativeRecoveryGlobalRegions} from '../tools/lib/native-recovery-context.mjs';
import {runRawPostFrameBodyStates} from '../src/raw-respawn-state.mjs';
import {replayNativeRecoveryParent,verifyNativeRecoveryParentBoundaries} from '../tools/lib/native-recovery-parent-replay.mjs';
import {nativeFrameGlobalRegions} from '../tools/lib/native-frame-manifest.mjs';

const program=await loadRetainedNativeProgram();
function fixture(index=7){
  const f=createSimulationVehicleFixture(program,index,{vehicleCount:2,models:false,vehicleFilters:false,extraBodyStorage:[{address:0x70f130,length:0x3e78}]});
  completeNativeFrameGeometryFixture(f);configurePostFrameFixture(f,index,0x9000);
  const m=f.memory,base=f.addresses.bodies[0];
  m.writeUInt32LE(base,0x6e6b40);m.writeUInt32LE(base,0x902eec);m.writeInt32LE(-140000+0x14000/32,0x709808);m.writeUInt32LE(0x13000,0x70dcf4);m.writeInt32LE(4,f.extraAddresses.session+0x57c);m.writeUInt32LE(0x451021,0x9000);
  const snapshot={moduleBaseAddress:0x400000,registers:{esp:0x9000,eip:0x47ccc0,fpuControlWord:0x7f,mxcsr:0x1f80},ranges:[{address:0,bytes:m}]};
  return {...f,snapshot};
}

test('captured parent recovery binding performs actual nearest/query/apply/progression/ring graph against retained instructions',()=>{
  for(const index of [1,7]){
    const f=fixture(index),m=f.memory;for(const body of f.bodies)m.writeInt32LE(32,body.address+0x128);
    const before=Buffer.from(m),bound=bindCapturedNativeRecovery(f.snapshot,{stackBytesBefore:4096});assert.deepEqual(m,before,'Binding does not initialize native state.');
    const machine=new BoundedX86(program.instructions,{fpuPrecisionBits:24});before.copy(machine.bytes);machine.fpuRounding='nearest-even';
    machine.externalCalls.set(0x568162,emulator=>assert.equal(emulator.r.ECX>>>0,emulator.bytes.readUInt32LE(0x5e8890)));
    machine.r.ESP=0x9000;machine.entry=0x47ccc0;machine.bytes.writeUInt32LE(0xffffffff,0x9000);
    machine.run(4000000);
    const report=runRawPostFrameBodyStates(bound.runtime);
    assert.equal(report.respawnedBodies,2);assert.equal(report.retiredBodies,0);
    assert.deepEqual(bound.span(0x10000,m.length-0x10000),machine.bytes.subarray(0x10000),'Every mapped semantic byte including native route/pool/emission state matches.');
    assert.deepEqual(m,before,'Replay keeps capture input immutable.');
  }
});

test('captured progression follows live pointer tables and rejects missing checkpoint backing',()=>{
  const f=fixture(),bound=bindCapturedNativeRecovery(f.snapshot,{stackBytesBefore:4096}),m=bound.memory,pack=m.readUInt32LE(0x90b98c);
  const record=bound.progression.recordAt(0x909300);assert.equal(record.body00.address,f.bodies[0].address);
  const ids=bound.progression.runtime.pack.checkpointIds90;assert.equal(ids[0],0);assert.equal(bound.progression.runtime.pack.checkpoints70.length,40);
  m[ids.length?m.readUInt32LE(pack+0x90):0]=3;
  assert.equal(bound.progression.runtime.pack.checkpoints70.length,80,'Backing span derives from actual live IDs, not an authored parser projection.');
  m.writeUInt32LE(0x20000000,pack+0x70);assert.throws(()=>bound.progression.runtime.pack.checkpoints70,/Uncaptured/);
});

test('recovery declares clone alias extent and refuses numerical context or absent captured globals',()=>{
  const f=fixture();assert.equal(nativeRecoveryGlobalRegions[0].preferredAddress+nativeRecoveryGlobalRegions[0].length,0x712fa8);
  assert.throws(()=>bindCapturedNativeRecovery({...f.snapshot,registers:{...f.snapshot.registers,fpuControlWord:0x27f}},{stackBytesBefore:4096}),/PC24/);
  assert.throws(()=>bindCapturedNativeRecovery({...f.snapshot,ranges:[{address:0,bytes:f.memory.subarray(0,0x70eb00)}]},{stackBytesBefore:4096}),/Missing|Uncaptured|Alias target/);
});

test('parent replay observes real route/progression/controller output spans and validates actual ABI',()=>{
  const f=fixture();for(const body of f.bodies)f.memory.writeInt32LE(32,body.address+0x128);
  const replay=replayNativeRecoveryParent(f.snapshot,{stackBytesBefore:4096});assert.equal(replay.report.respawnedBodies,2);assert.equal(replay.manifest.boundary,'0x47ccc0');
  const covers=(address,length)=>replay.manifest.requiredRegions.some(row=>row.comparison!=='abi-input'&&address>=row.address&&address+length<=row.address+row.length);
  assert.equal(covers(0x9c000,36),true);assert.equal(covers(0x9d000+128,64),true);assert.equal(covers(0x9f000,40),true);assert.equal(covers(0x9e000,0x3a),true);
  assert.throws(()=>replayNativeRecoveryParent({...f.snapshot,registers:{...f.snapshot.registers,eip:0x4749e0}},{stackBytesBefore:4096}),/entry address/);
});

test('native parent and both child return sites retain target-bound actual CALL/RET evidence',async()=>{
  const proof=await verifyNativeRecoveryParentBoundaries();assert.equal(proof.evidenceIds.length,4);assert.equal(proof.boundaries.parent.returnAddress,0x451021);
});

test('recovery observer exposes actual relocated arguments without changing any captured result', () => {
  const f = fixture(7), m = f.memory, relocation = 0x14000000;
  for (const body of f.bodies) m.writeInt32LE(32, body.address + 0x128);
  m.writeUInt32LE(0x451021 + relocation, 0x9000);
  const rows = [
    {address: 0x8000, bytes: m.subarray(0x8000, 0x9004)},
    {address: 0x10000, bytes: m.subarray(0x10000, 0x100000)},
    //The fixture declares128 linked256-byte particles at this actual heap root.
    {address: m.readUInt32LE(0x6e65b4), bytes: m.subarray(m.readUInt32LE(0x6e65b4), m.readUInt32LE(0x6e65b4) + 128 * 256)},
    ...[...nativeFrameGlobalRegions, ...nativeRecoveryGlobalRegions].map(({preferredAddress, length}) => ({address: preferredAddress + relocation, bytes: m.subarray(preferredAddress, preferredAddress + length)})),
  ];
  const snapshot = {...f.snapshot, moduleBaseAddress: 0x400000 + relocation, registers: {...f.snapshot.registers, eip: 0x47ccc0 + relocation}, ranges: rows};
  const original = rows.map(row => Buffer.from(row.bytes)), records = [];
  const options = {stackBytesBefore: 4096}, plain = replayNativeRecoveryParent(snapshot, options);
  const observed = replayNativeRecoveryParent(snapshot, {...options, onRecoveryApply: record => {
    assert.ok(Object.isFrozen(record)); records.push(record); return {index: -1, terrain: -1};
  }});
  assert.equal(records.length, 2); assert.equal(observed.report.respawnedBodies, 2);
  for (const record of records) {
    assert.equal(record.positionAddress, 0x70eb0c + relocation);
    assert.equal(record.entryEsp, 0x9000 - 124);
    assert.equal(record.bodyHeaderHex.length, 0x180 * 2);
    assert.equal(record.positionHex.length, 24); assert.equal(record.quaternionHex.length, 32);
    assert.equal(record.rotationHex.length, 36); assert.equal(record.routeHex.length, 24);
    assert.ok(record.routeAddress >= 0x9c000 && record.routeAddress < 0x9c000 + 36, 'Heap route identities stay unchanged.');
  }
  for (let i = 0; i < rows.length; i++) {
    const {address, bytes} = rows[i];
    assert.deepEqual(observed.span(address, bytes.length), plain.span(address, bytes.length), 'Observer leaves every mapped byte unchanged.');
    assert.deepEqual(bytes, original[i], 'Captured evidence stays immutable.');
  }
  assert.throws(() => replayNativeRecoveryParent(snapshot, {...options, onRecoveryApply: 1}), /observer must be a function/);
});
