import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {replayNativeVehiclePrepass,replayNativePostFrame,verifyNativePostFrameBoundaries,nativePostFrameBoundaries} from '../tools/lib/native-post-frame-replay.mjs';
import {pairNativePrepassSnapshots,compareNativePrepassPair} from '../tools/check-native-prepass-replay.mjs';
import {createNativeFrameCaptureConfig} from '../tools/prepare-native-frame-capture.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const program=await loadRetainedNativeProgram(),leaf=await readInstructionEvidence(['109-post-frame-vehicle-check-assembly.json'],{directory:'analysis/native-simulation/results'});
const registers={esp:0x9000,eip:0x47e180,eax:7,ebx:0x11223344,ebp:0x22334455,esi:0x33445566,edi:0x44556677,fpuControlWord:0x7f,mxcsr:0x1f80};
function fixture(index=2){
  const f=createSimulationVehicleFixture(program,index,{vehicleCount:2,ordinaryCount:1,interacting:true,effects:false,models:false});
  completeNativeFrameGeometryFixture(f);const m=f.memory,base=f.addresses.bodies[0];
  m.writeUInt32LE(base,0x6e6b40);m.writeUInt32LE(base,0x902eec);m.writeInt32LE(-140000+0x14000/32,0x709808);m.writeUInt32LE(0x13000,0x70dcf4);m.writeInt32LE(4,f.extraAddresses.session+0x57c);m.writeUInt32LE(0x47cd04,0x9000);
  const snapshot={moduleBaseAddress:0x400000,registers:{...registers},ranges:[{address:0,bytes:m}]};
  return {...f,snapshot};
}
function nativeOracle(f){
  const machine=new BoundedX86(leaf.instructions);f.memory.copy(machine.bytes);
  for(const[key,value]of Object.entries(registers))if(['esp','eax','ebx','ebp','esi','edi'].includes(key))machine.r[key.toUpperCase()]=value;
  // The interpreter's terminal sentinel is a harness return slot only. All
  // source/observer snapshots retain the actual47ccff CALL return47cd04.
  machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.entry=0x47e180;machine.run();machine.bytes.writeUInt32LE(0x47cd04,0x9000);
  return {machine,snapshot:{moduleBaseAddress:0x400000,registers:{...registers,eip:0x47e234,eax:machine.r.EAX,esp:machine.r.ESP},ranges:[{address:0,bytes:machine.bytes}]}};
}

test('captured-memory prepass matches every retained instruction semantic byte on height,slow,grounded andwrap paths',()=>{
  for(const index of [1,2,3,4]){
    const f=fixture(index),m=f.memory,bodies=f.vehicles.map(v=>v.body.address),session=f.extraAddresses.session;
    m.writeInt16LE(0,f.addresses.header+0x14);
    for(let i=0;i<bodies.length;i++){
      const p=bodies[i],record=0x909300+i*0x30c;
      m.writeInt32LE((index===1&&i===0?513:0)<<16,p+0x38);m.writeInt16LE(index===4?2:0,p+0x668);m[record+0x248]=index===3?255:90;
      for(let wheel=0;wheel<4;wheel++)m[p+0x324+wheel*200]=index===2?1:0;
      m.writeUInt32LE(0x80000042,p+0x110);
    }
    if(index===4)m[session+0x54d]=0;
    const initial=Buffer.from(m),oracle=nativeOracle(f),replay=replayNativeVehiclePrepass(f.snapshot,{stackBytesBefore:4096});
    assert.deepEqual(m,initial,'Captured input is immutable.');
    assert.equal(replay.report.expectedEax,oracle.machine.r.EAX);
    const comparison=compareNativePrepassPair({before:f.snapshot,after:oracle.snapshot},replay);
    assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
    assert.equal(comparison.comparisons.find(row=>row.id==='body-arena-allocation-bytes').length,0x14000);assert.ok(replay.manifest.geometryComparison.addedBytes>0);assert.equal(replay.manifest.boundary,'0x47e180');
    if(index===1)assert.equal(replay.memory.readUInt32LE(bodies[0]+0x128),32);
    if(index===2||index===3)assert.equal(replay.memory[0x909548],0);
  }
});

test('original zero-count path saves EDI unconditionally and preserves stale ESI stack storage',()=>{
  const f=fixture(),m=f.memory;m[f.extraAddresses.session+0x54d]=0;m.writeUInt32LE(0xaabbccdd,0x8ff8);m.writeUInt32LE(0xabcdef01,0x8ffc);
  const {machine}=nativeOracle(f);
  assert.equal(machine.bytes.readUInt32LE(0x8ffc),registers.edi);assert.equal(machine.bytes.readUInt32LE(0x8ff8),0xaabbccdd);
  assert.equal(machine.r.ESI,registers.esi);assert.equal(machine.r.EDI,registers.edi);assert.equal(machine.r.ESP,registers.esp);assert.equal(machine.r.EAX,0x909300);
});

test('prepass refuses wrong entry/caller coverage and does not silently bind unsupported full recovery',()=>{
  const f=fixture();
  assert.throws(()=>replayNativeVehiclePrepass({...f.snapshot,registers:{...registers,eip:0x4749e0}},{stackBytesBefore:4096}),/entry address/);
  f.memory.writeUInt32LE(0x451017,0x9000);assert.throws(()=>replayNativeVehiclePrepass(f.snapshot,{stackBytesBefore:4096}),/caller return/);
  assert.throws(()=>replayNativePostFrame(f.snapshot,{stage:'parent'}),/not yet bound/);
});

test('retained recovery entry/singleexit/caller evidence and two-exit descendants are explicit',async()=>{
  const evidence=await verifyNativePostFrameBoundaries();assert.equal(evidence.evidenceIds.length,2);
  assert.deepEqual(nativePostFrameBoundaries.prepass,{entry:0x47e180,exit:0x47e234,caller:0x47ccff,returnAddress:0x47cd04});
  assert.equal(nativePostFrameBoundaries.query.exits.length,2);assert.equal(nativePostFrameBoundaries.apply.exits.length,2);
});

async function pairedFixture(){
  const {configuration}=await createNativeFrameCaptureConfig('synthetic-root','new-synthetic-prepass',{frames:1,stackBytesBefore:4096});
  for(const bp of configuration.breakpoints){if(bp.id==='native-frame-before'){bp.id='native-prepass-before';bp.rva='0x7e180';}else if(bp.id==='native-frame-after'){bp.id='native-prepass-after';bp.rva='0x7e234';}}
  const base=0x6e0000,esp=0x30001000,sessionAddress=0x20000000;
  const make=after=>{const session=Buffer.alloc(0x590),stack=Buffer.alloc(4100),count=Buffer.alloc(4);session[0x54d]=6;session.writeUInt32LE(4,0x57c);stack.writeUInt32LE(base+0x7cd04,4096);return {ordinal:after?2:1,breakpointId:after?'native-prepass-after':'native-prepass-before',hit:1,rawHit:30,matchingHit:1,tid:321,moduleBaseAddress:base,registers:{...registers,esp,eip:base+(after?0x7e234:0x7e180)},captureWhen:{address:sessionAddress+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'},ranges:new Map([['session',{address:sessionAddress,bytes:session}],['frame-stack',{address:esp-4096,bytes:stack}],['attachment-count',{address:base+0x2e6ba0,bytes:count}]])};};
  return {configuration,capture:{header:{executableSha256:REDUX_SHA256},complete:{reason:'snapshot-bound',snapshots:2},snapshots:[make(false),make(true)]}};
}

test('prepass pairing proves true caller, gate, same-thread ESP and terminal count instead of relabelling frame captures',async()=>{
  const f=await pairedFixture(),paired=pairNativePrepassSnapshots(f.capture,f.configuration);assert.equal(paired.frames,1);assert.equal(paired.pairs[0].returnAddress,0x6e0000+0x7cd04);
  for(const mutate of [
    f=>{f.capture.snapshots[1].registers.eip++;},f=>{f.capture.snapshots[1].tid++;},f=>{f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(0x451017,4096);},f=>{f.capture.snapshots[1].captureWhen.actualBytesHex='01000000';},f=>{f.configuration.phaseActions.push({breakpointId:'native-prepass-before'});},f=>{f.capture.snapshots[0].matchingHit=2;},
  ]){const changed=await pairedFixture();mutate(changed);assert.throws(()=>pairNativePrepassSnapshots(changed.capture,changed.configuration),/differs|Missing|proof|observer/);}
});
