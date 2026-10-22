import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlledNativeRecoveryLeafCaptureConfig} from '../tools/prepare-controlled-native-recovery-leaf-capture.mjs';
import {createNativeRecoveryLeafCaptureConfig} from '../tools/prepare-native-recovery-leaf-capture.mjs';
import {controlledNativeRecoveryAction,controlledNativeRecoveryCallerRanges} from '../tools/prepare-controlled-native-recovery-capture.mjs';
import {verifyControlledNativeRecoveryConfiguration,verifyControlledNativeRecoveryEvidence} from '../tools/lib/native-controlled-recovery.mjs';
import {pairNativeRecoveryLeafSnapshots,nativeRecoveryLeafIds} from '../tools/check-native-recovery-leaf-replay.mjs';
import {recoveryLeafPolicy} from '../tools/lib/native-recovery-leaf-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

test('controlled leaf composition keeps complete query/apply baseline ranges and both exits, adding only explicit caller input',async()=>{
  for(const stage of ['query','apply']){
    const [result,baseline]=await Promise.all([createControlledNativeRecoveryLeafCaptureConfig('synthetic','never-launched',{stage}),createNativeRecoveryLeafCaptureConfig('synthetic','never-launched',{stage})]);
    const c=result.configuration;
    assert.equal(result.authority,'controlled-native-recovery-input');assert.equal(c.pendingFrameObserver,undefined);assert.equal(c.captureThreadEnvironment,true);assert.equal(c.maxSnapshots,350);
    assert.deepEqual(c.breakpoints.slice(0,-1),baseline.configuration.breakpoints);assert.deepEqual(c.phaseActions.slice(0,-1),baseline.configuration.phaseActions);assert.deepEqual(c.phaseActions.at(-1),controlledNativeRecoveryAction());
    assert.deepEqual(c.breakpoints.at(-1),{id:'controlled-recovery-caller',rva:'0x5101c',ranges:controlledNativeRecoveryCallerRanges()});
    assert.equal(verifyControlledNativeRecoveryConfiguration(c,{scope:stage}).authority,result.authority);assert.ok(!result.limitations.some(row=>row.includes('no rejected-body state')||row.includes('no physics/AI/input writes')));
    assert.throws(()=>verifyControlledNativeRecoveryConfiguration(c,{scope:'parent'}),/pending observer/);
  }
});

async function fixture(stage){
  const {configuration}=await createControlledNativeRecoveryLeafCaptureConfig('synthetic','never-launched',{stage}),base=0x6e0000,actual=p=>base+p-0x400000,session=0x21000000,body=0x22000100,callerEsp=0x30001100,parentEsp=callerEsp-4,esp=parentEsp-(stage==='query'?120:124),leaf=recoveryLeafPolicy(stage),ids=nativeRecoveryLeafIds(stage),pack=0x25000000,route=0x2600000c;
  const u32=value=>{const bytes=Buffer.alloc(4);bytes.writeUInt32LE(value>>>0);return bytes;};
  const callers=Array.from({length:229},(_,i)=>({ordinal:i+1,breakpointId:'controlled-recovery-caller',hit:i+1,tid:321,registers:{eip:actual(0x45101c),esp:callerEsp},capturePhase:'before-declared-writes-before-original-instruction',ranges:new Map(controlledNativeRecoveryCallerRanges().map((row,index)=>[row.id,{address:base+Number(row.rva),bytes:u32(index===0?228:index===1?session:body),moduleBaseAddress:base}]))}));
  const state=Buffer.alloc(0x180);state.writeUInt32LE(0x1c03);state.writeInt32LE(32,0x128);const sessionBytes=Buffer.alloc(0x590);sessionBytes[0x54d]=6;sessionBytes.writeUInt32LE(4,0x57c);
  const stack=Buffer.alloc(4096+leaf.stackBytesAfter),args=[actual(leaf.returnAddress),parentEsp-24,body+0xc4,...(stage==='query'?[1,parentEsp-44]:[route,1,3])];args.forEach((v,i)=>stack.writeUInt32LE(v>>>0,4096+i*4));
  const packBytes=Buffer.alloc(0xa0);packBytes[0x46]=2;packBytes.writeUInt32LE(route-12,0x60);const routeBytes=Buffer.alloc(12);routeBytes.writeUInt16LE(4);
  const rows=[['clock',{address:actual(0x90a548),bytes:u32(228)}],['session-root',{address:actual(0x5ecb1c),bytes:u32(session)}],['first-body',{address:actual(0x909300),bytes:u32(body)}],['session',{address:session,bytes:sessionBytes}],['body',{address:body,bytes:state}],['frame-stack',{address:esp-4096,bytes:stack}],['quaternion',{address:parentEsp-24,bytes:Buffer.alloc(16)}],['position',{address:actual(0x70eb0c),bytes:Buffer.alloc(12)}],['pack-root',{address:actual(0x90b98c),bytes:u32(pack)}],['pack',{address:pack,bytes:packBytes}],['route',{address:route,bytes:routeBytes}],...(stage==='query'?[['output',{address:parentEsp-44,bytes:Buffer.alloc(4)}]]:[])];
  const before={ordinal:230,breakpointId:ids.before,hit:1,rawHit:1,matchingHit:1,tid:321,moduleBaseAddress:base,registers:{esp,eip:actual(leaf.entry),ecx:body,edx:actual(0x70eb0c)},captureWhen:{address:session+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'},ranges:new Map(rows)};
  const after={...before,ordinal:231,breakpointId:ids.after[0],registers:{...before.registers,eip:actual(leaf.exits[0])},ranges:new Map(rows.map(([id,row])=>[id,{...row,bytes:Buffer.from(row.bytes)}]))};
  const addresses=[actual(0x90a548),session+0x57c,body,body+0x128],interventions=controlledNativeRecoveryAction().writes.map((row,i)=>({type:'intervention',breakpointId:'controlled-recovery-caller',hit:229,address:`0x${addresses[i].toString(16)}`,originalBytesHex:row.expectedBytesHex,replacementBytesHex:row.bytesHex,acceptedOriginalBytesHex:[row.expectedBytesHex]}));
  return {configuration,capture:{header:{executableSha256:REDUX_SHA256},snapshots:[...callers,before,after],complete:{reason:'snapshot-bound',snapshots:231},interventions},before,after,caller:callers.at(-1)};
}

test('controlled leaf provenance admits actual callerESP-relative query/apply ABI with genuine immediate caller schema',async()=>{
  for(const stage of ['query','apply']){
    const f=await fixture(stage),result=pairNativeRecoveryLeafSnapshots(stage,f.capture,f.configuration),proof=result.pairs[0].controlledInput;
    assert.equal(proof.scope,stage);assert.equal(proof.authority,'controlled-native-recovery-input');assert.equal(proof.clock,228);assert.equal(proof.bodyAddress,0x22000100);assert.equal(proof.guards.length,4);
    assert.equal(proof.input.parentEntryEsp,f.caller.registers.esp-4);assert.equal(proof.input.positionAddress,0x9eeb0c);assert.equal(proof.input.quaternionAddress,f.caller.registers.esp-28);assert.equal(proof.input.rotationAddress,0x220001c4);
    if(stage==='query'){assert.equal(proof.input.mode,1);assert.equal(proof.input.outputAddress,f.caller.registers.esp-48);}else assert.equal(proof.input.routeAddress,0x2600000c);
    assert.equal(f.caller.rawHit,undefined);assert.equal(f.caller.matchingHit,undefined);assert.equal(f.caller.moduleBaseAddress,undefined);
  }
});

test('controlled leaf provenance rejects wrong scope, guarded input mismatch and unrelated parent stack/argument pointers',async()=>{
  for(const stage of ['query','apply'])for(const mutate of [
    f=>{f.before.registers.ecx+=128;},f=>{f.before.registers.edx+=4;},f=>{f.caller.registers.esp+=4;},f=>{f.before.ranges.get('body').bytes.writeInt32LE(0,0x128);},
    f=>{f.capture.interventions[3].originalBytesHex='20000000';},f=>{f.caller.rawHit=228;},
    f=>{f.before.ranges.get('frame-stack').bytes.writeUInt32LE(0x30000000,4100);},
    f=>{f.before.ranges.get('frame-stack').bytes.writeUInt32LE(stage==='query'?0:4,4108);},
  ]){
    const f=await fixture(stage);mutate(f);assert.throws(()=>verifyControlledNativeRecoveryEvidence(f.capture,{before:f.before,moduleBaseAddress:0x6e0000},f.configuration,{scope:stage}),/differ|consume|outside/);
  }
  const f=await fixture('query');assert.throws(()=>verifyControlledNativeRecoveryConfiguration(f.configuration,{scope:'apply'}),/leaf scope/);assert.throws(()=>verifyControlledNativeRecoveryConfiguration(f.configuration,{scope:'other'}),/scope must/);
});
