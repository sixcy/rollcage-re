import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlledNativeRecoveryCaptureConfig,controlledNativeRecoveryAction,controlledNativeRecoveryCallerRanges} from '../tools/prepare-controlled-native-recovery-capture.mjs';
import {verifyControlledNativeRecoveryConfiguration,verifyControlledNativeRecoveryEvidence} from '../tools/lib/native-controlled-recovery.mjs';

test('controlled preparation adds exactly guarded caller229 state32 input and scalar-only earlier observations',async()=>{
  const result=await createControlledNativeRecoveryCaptureConfig('synthetic','never-launched'),config=result.configuration,caller=config.breakpoints.find(row=>row.id==='controlled-recovery-caller'),action=config.phaseActions.at(-1);
  assert.equal(result.authority,'controlled-native-recovery-input');assert.equal(config.captureThreadEnvironment,true);assert.equal(config.maxSnapshots,350);
  assert.ok(!result.limitations.some(row=>row.includes('no physics/AI/input writes')));
  assert.equal(caller.rva,'0x5101c');assert.equal(caller.captureWhen,undefined);assert.equal(caller.skipMatchingHits,undefined);assert.equal(caller.stopAfterHits,undefined);assert.deepEqual(caller.ranges,controlledNativeRecoveryCallerRanges());
  assert.ok(caller.ranges.every(row=>row.length===4&&!row.dereferenceOffsets&&!row.readableRegion));assert.deepEqual(action,controlledNativeRecoveryAction());
  assert.equal(action.hit,229);assert.equal(action.writes.length,4);assert.ok(action.writes.slice(0,3).every(row=>row.expectedBytesHex===row.bytesHex));
  assert.deepEqual(action.writes[3],{rva:'0x509300',dereferenceOffsets:['0'],offset:'0x128',expectedBytesHex:'00000000',bytesHex:'20000000'});
  assert.equal(config.breakpoints.find(row=>row.id==='native-recovery-before').skipMatchingHits,0);assert.equal(config.breakpoints.find(row=>row.id==='native-recovery-after').stopAfterHits,1);
  assert.equal(verifyControlledNativeRecoveryConfiguration(config).authority,result.authority);
});

async function fixture(){
  const {configuration}=await createControlledNativeRecoveryCaptureConfig('synthetic','never-launched'),base=0x6e0000,actual=p=>base+p-0x400000,session=0x21000000,body=0x22000100;
  const bytes=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
  const callers=Array.from({length:229},(_,index)=>({ordinal:index+1,breakpointId:'controlled-recovery-caller',hit:index+1,tid:321,registers:{eip:actual(0x45101c)},capturePhase:'before-declared-writes-before-original-instruction',ranges:new Map(controlledNativeRecoveryCallerRanges().map((row,i)=>[row.id,{address:base+Number(row.rva),bytes:bytes(i===0?228:i===1?session:body),moduleBaseAddress:base}]))}));
  const state=Buffer.alloc(0x180);state.writeUInt32LE(0x1c03);state.writeInt32LE(32,0x128);const sessionBytes=Buffer.alloc(0x590);sessionBytes[0x54d]=6;sessionBytes.writeUInt32LE(4,0x57c);
  const before={ordinal:230,rawHit:229,tid:321,pendingFrame:{candidateIndex:1},ranges:new Map([['clock',{address:actual(0x90a548),bytes:bytes(228)}],['session-root',{address:actual(0x5ecb1c),bytes:bytes(session)}],['first-body',{address:actual(0x909300),bytes:bytes(body)}],['session',{address:session,bytes:sessionBytes}],['body',{address:body,bytes:state}]])};
  const writes=controlledNativeRecoveryAction().writes,addresses=[actual(0x90a548),session+0x57c,body,body+0x128];
  const capture={snapshots:callers,interventions:writes.map((write,index)=>({type:'intervention',breakpointId:'controlled-recovery-caller',hit:229,address:`0x${addresses[index].toString(16)}`,originalBytesHex:write.expectedBytesHex,replacementBytesHex:write.bytesHex,acceptedOriginalBytesHex:[write.expectedBytesHex]}))};
  return {configuration,capture,pair:{before,moduleBaseAddress:base,nativeApplications:[{bodyAddress:body}]}};
}

test('controlled provenance requires all real no-op guards and proves state32 already present before source replay',async()=>{
  const f=await fixture(),proof=verifyControlledNativeRecoveryEvidence(f.capture,f.pair,f.configuration);
  assert.equal(proof.authority,'controlled-native-recovery-input');assert.equal(proof.callerRawHit,229);assert.equal(proof.clock,228);assert.equal(proof.nativeFirstBodyApplications,1);
  assert.deepEqual(proof.guards.map(row=>row.noOp),[true,true,true,false]);assert.equal(proof.guards[3].address,0x22000228);
  assert.equal(f.capture.snapshots[228].rawHit,undefined);assert.equal(f.capture.snapshots[228].matchingHit,undefined);assert.equal(f.capture.snapshots[228].moduleBaseAddress,undefined);
});

test('controlled provenance rejects missing/changed guards, earlier writes, skipped callers and source-entry state masking',async()=>{
  for(const edit of [
    f=>{f.configuration.phaseActions.at(-1).hit=228;},
    f=>{f.configuration.phaseActions.at(-1).writes[0].expectedAnyBytesHex=['e4000000'];},
    f=>{f.configuration.phaseActions.at(-1).writes[3].bytesHex='00000000';},
    f=>{f.configuration.breakpoints.find(row=>row.id==='controlled-recovery-caller').captureWhen={};},
    f=>{f.configuration.breakpoints.find(row=>row.id==='controlled-recovery-caller').ranges.push({id:'early-heap',rva:'0x509300',dereferenceOffsets:['0'],length:0x180});},
    f=>{f.capture.interventions.splice(0,1);},f=>{f.capture.interventions[0].originalBytesHex='e3000000';},f=>{f.capture.interventions[2].replacementBytesHex='00000000';},f=>{f.capture.interventions[3].hit=228;},f=>{f.capture.interventions[3].address='0x2200022c';},
    f=>{f.capture.snapshots.splice(1,1);},f=>{f.capture.snapshots[228].rawHit=228;},f=>{f.capture.snapshots[228].matchingHit=228;},f=>{f.capture.snapshots[228].moduleBaseAddress=0x6f0000;},f=>{f.capture.snapshots[228].tid++;},f=>{f.capture.snapshots[228].ranges.get('controlled-recovery-clock').bytes.writeUInt32LE(227);},
    f=>{f.pair.before.ranges.get('body').bytes.writeInt32LE(0,0x128);},f=>{f.pair.nativeApplications=[];},f=>{f.pair.before.pendingFrame.candidateIndex=2;},
  ]){const f=await fixture();edit(f);assert.throws(()=>verifyControlledNativeRecoveryEvidence(f.capture,f.pair,f.configuration),/differ|proof|requires|consume|counts/);}
});
