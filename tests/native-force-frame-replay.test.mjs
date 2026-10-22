import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeForceFrameCaptureConfig} from '../tools/prepare-native-force-frame-capture.mjs';
import {verifyNativeForceFrameConfiguration,inspectNativeForceEntry,classifyNativeForceInput,compareNativeForceSnapshots} from '../tools/check-native-force-frame-replay.mjs';
import {nativeFrameGlobalRegions} from '../tools/lib/native-frame-manifest.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from '../tools/check-native-frame-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
const prepared=await createNativeForceFrameCaptureConfig('synthetic','never-launched');
function fixture(){
 const configuration=structuredClone(prepared.configuration),base=0x14000000,S=0x31001000,allocation=0x33000003,aligned=0x33000080,bodies=[aligned+0x100,aligned+0x800],listAddress=0x34000000,sessionAddress=0x35000000,clock=348,identity={candidateIndex:3,frameTid:7,frameEntryEsp:S,frameReturnAddress:base+0x51017,frameMatchingHit:123,observedEventHits:2,qualifyingEventSnapshots:2},headers=bodies.map((_,i)=>{const b=Buffer.alloc(384);b.writeUInt32LE(i?0x1803:0x1801);b.writeInt32LE((i?1028:4)*65536,0x34);return b;});
 function snapshot(role,index){
  const event=role==='event',after=role==='after',ordinal=event?index+2:after?4:1,registers={esp:S-(event?96:0),eip:base+(event?0x7b020:after?0x74b1e:0x749e0),eax:0,ebx:0x11223344,ebp:0x22334455,esi:event?2-index:0,edi:event?bodies[index]:0};if(event)registers.ecx=bodies[index];
  const ranges=new Map(nativeFrameGlobalRegions.map(row=>[row.id,{id:row.id,address:base+row.preferredAddress-0x400000,bytes:Buffer.alloc(row.length)}]));
  const span=(p,n=4)=>{const row=[...ranges.values()].find(row=>p>=row.address&&p+n<=row.address+row.bytes.length);assert.ok(row,`fixtureglobal0x${p.toString(16)}`);return row.bytes.subarray(p-row.address,p-row.address+n);},d=(preferred,v)=>span(base+preferred-0x400000).writeUInt32LE(v>>>0);
  d(0x6e6b40,allocation);d(0x709808,0);d(0x70dcf4,0x1000);d(0x902eec,aligned);d(0x902bc0,listAddress);span(base+0x502bc4,2).writeUInt16LE(2);d(0x91cd90,1);d(0x91cd8c,4);d(0x90a548,clock);
  const list=Buffer.alloc(0x180);bodies.forEach((p,i)=>list.writeUInt32LE(p,i*4));ranges.set('force-physical-body-list',{id:'force-physical-body-list',address:listAddress,bytes:list});
  if(event){ranges.set('force-body-header',{id:'force-body-header',address:bodies[index],bytes:Buffer.from(headers[index])});const caller=Buffer.alloc(4);caller.writeUInt32LE(base+0x7a913);ranges.set('force-caller',{id:'force-caller',address:S-96,bytes:caller});}
  else{const session=Buffer.alloc(0x590);session[0x54d]=6;session.writeUInt32LE(4,0x57c);ranges.set('session',{id:'session',address:sessionAddress,bytes:session});const stack=Buffer.alloc(4100);stack.writeUInt32LE(identity.frameReturnAddress,4096);ranges.set('frame-stack',{id:'frame-stack',address:S-4096,bytes:stack});headers.forEach((bytes,i)=>ranges.set(`body${i}`,{id:`body${i}`,address:bodies[i],bytes:Buffer.from(bytes)}));}
  return {ordinal,tid:7,breakpointId:event?'native-force-entry':after?'native-frame-after':'native-frame-before',hit:event?index+1:1,rawHit:500+ordinal,matchingHit:event?index+1:123,moduleBaseAddress:base,registers,ranges,pendingFrame:{...identity,role,...(event?{eventIndex:index+1}:{})},deferredPublication:true,observedDebugEventOrdinal:100+ordinal,observedElapsedMs:1000+ordinal,...(!event?{captureWhen:{address:sessionAddress+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'}}:{})};
 }
 const before=snapshot('before'),native=[snapshot('event',0),snapshot('event',1)],after=snapshot('after'),capture={header:{executableSha256:REDUX_SHA256},snapshots:[before,...native,after],complete:{reason:'snapshot-bound',snapshots:4,pendingFrameSelection:{...identity}}},source=bodies.map((bodyAddress,i)=>({bodyAddress,bodyHeaderHex:headers[i].toString('hex'),originQ16:[0,0,0],strength:4,entryEsp:S-96,entryRegisters:{ebx:0x11223344,ebp:0x22334455,esi:2-i,edi:bodyAddress},returnAddress:base+0x7a913}));
 const pair=()=>pairNativeFrameSnapshots(capture,configuration).pairs[0];return {configuration,capture,native,source,before,after,pair,bodies,base,S,allocation,aligned};
}
test('force configuration requires the exact unfiltered used-byte selector and live list backing',()=>{
 const f=fixture();assert.equal(verifyNativeForceFrameConfiguration(f.configuration).forceBreakpointId,'native-force-entry');
 for(const[edit,message]of[
  [c=>{c.pendingFrameObserver.eventRecordBytes=128;},/used-byte arena/],
  [c=>{c.pendingFrameObserver.eventStackOffset=-92;},/caller/],
  [c=>{c.pendingFrameObserver.maxEventSnapshots=65;},/maxEventSnapshots/],
  [c=>{c.pendingFrameObserver.eventKind=3;},/used-byte arena/],
  [c=>{c.breakpoints.at(-1).captureWhen={equalsBytesHex:'03000000'};},/unfiltered/],
  [c=>{c.breakpoints.at(-1).ranges=c.breakpoints.at(-1).ranges.filter(r=>r.id!=='force-physical-body-list');},/live input/],
  [c=>{c.phaseActions.push({breakpointId:'native-force-entry',writes:[]});},/phase writes/],
 ]){const c=structuredClone(f.configuration);edit(c);assert.throws(()=>verifyNativeForceFrameConfiguration(c),message);}
});
test('force pairing proves actual body alignment/extent/live membership and exact ordered entry inputs',()=>{
 const f=fixture(),pair=f.pair(),proof=compareNativeForceSnapshots(f.native,f.source,pair);assert.equal(proof.matched,true);assert.equal(proof.entries.length,2);assert.deepEqual(proof.entries.map(r=>r.physicalIndex),[0,1]);assert.deepEqual(proof.entries.map(r=>r.classification.inputGate),['accepted-nonzero-capped-input','rejected-distance']);assert.ok(proof.entries.every(r=>r.classification.outputAttribution==='not-isolated-by-entry-observation'));
 const entry=inspectNativeForceEntry(f.native[0],{frameEntryEsp:f.S,moduleBaseAddress:f.base});assert.equal(entry.arena.allocation,f.allocation);assert.equal(entry.arena.alignedBase,f.aligned);assert.equal(entry.bodyAddress,f.bodies[0]);
});
test('force proof rejects missing/count/reordered entries and detects each concrete source input difference',()=>{
 const f=fixture(),pair=f.pair();assert.equal(compareNativeForceSnapshots(f.native,f.source.slice(0,1),pair).firstDivergence.kind,'force-entry-count');assert.throws(()=>compareNativeForceSnapshots([],[],pair),/nonempty/);
 for(const[key,edit]of[
  ['bodyAddress',r=>{r.bodyAddress+=128;}],['entryEsp',r=>{r.entryEsp-=4;}],['returnAddress',r=>{r.returnAddress++;}],['strength',r=>{r.strength++;}],['entry-register',r=>{r.entryRegisters.ebp++;}],['effect-origin',r=>{r.originQ16[2]++;}],['body-header',r=>{const b=Buffer.from(r.bodyHeaderHex,'hex');b[383]=1;r.bodyHeaderHex=b.toString('hex');}],
 ]){const source=structuredClone(f.source);edit(source[0]);assert.equal(compareNativeForceSnapshots(f.native,source,pair).firstDivergence.kind,key);}
 assert.equal(compareNativeForceSnapshots(f.native,[...f.source].reverse(),pair).firstDivergence.kind,'bodyAddress');assert.throws(()=>compareNativeForceSnapshots([...f.native].reverse(),f.source,pair),/index\/totals|ordered/);
});
test('force observations retain strict same-thread/caller/clock and deferred selection proof',()=>{
 for(const[edit,message]of[
  [f=>{f.native[0].tid++;},/same-thread/],
  [f=>{f.native[0].ordinal=4;},/same-thread/],
  [f=>{f.native[0].registers.esp+=4;},/parent ESP/],
  [f=>{f.native[0].ranges.get('force-caller').bytes.writeUInt32LE(0,0);},/caller range/],
  [f=>{f.native[0].ranges.get('clock').bytes.writeUInt32LE(349);},/clock differs/],
  [f=>{f.native[0].pendingFrame.frameMatchingHit++;},/another pending/],
  [f=>{f.native[0].pendingFrame.qualifyingEventSnapshots=1;},/index\/totals/],
  [f=>{f.native[0].observedDebugEventOrdinal=105;},/observed entry order/],
  [f=>{f.native[0].observedElapsedMs=999;},/observed entry order/],
  [f=>{f.native[0].captureWhen={actualBytesHex:'01000000'};},/unfiltered/],
  [f=>{f.after.pendingFrame.observedEventHits=3;f.capture.complete.pendingFrameSelection.observedEventHits=3;f.before.pendingFrame.observedEventHits=3;},/unfiltered complete/],
 ]){const f=fixture();edit(f);assert.throws(()=>compareNativeForceSnapshots(f.native,f.source,f.pair()),message);}
});
test('force byte-domain admission does not substitute for body extent or physical-list ownership',()=>{
 for(const[edit,message]of[
  [f=>{f.native[0].ranges.get('body-arena-cursor').bytes.writeUInt32LE(1);},/used-byte arena admission/],
  [f=>{f.native[0].ranges.get('body-arena-cursor').bytes.writeUInt32LE(0x200);},/common extent/],
  [f=>{f.native[0].ranges.get('frame-pools').bytes.writeUInt32LE(f.aligned+128,0x902eec-0x902b7c);},/alignment\/common/],
  [f=>{f.native[0].ranges.get('force-physical-body-list').bytes.writeUInt32LE(0,0);},/live physical-list membership/],
  [f=>{f.native[0].ranges.get('force-physical-body-list').bytes.writeUInt32LE(f.bodies[0],4);},/one actual live/],
  [f=>{f.native[0].ranges.delete('force-physical-body-list');},/live physical list/],
  [f=>{f.native[0].ranges.get('force-physical-body-list').bytes.writeUInt32LE(1,8);},/trailing null/],
  [f=>{f.native[0].ranges.get('force-body-header').address++;},/body-header\/caller/],
 ]){const f=fixture();edit(f);assert.throws(()=>compareNativeForceSnapshots(f.native,f.source,f.pair()),message);}
});
test('accepted/rejected/zero input classifications never assert isolated native output attribution',()=>{
 const f=fixture(),record=f.source[0];assert.equal(classifyNativeForceInput({...record,strength:0}).inputGate,'accepted-zero-capped-input');
 const header=Buffer.from(record.bodyHeaderHex,'hex');header.writeInt32LE(1,0x34);assert.equal(classifyNativeForceInput({...record,bodyHeaderHex:header.toString('hex')}).inputGate,'rejected-direction');header.writeUInt32LE(3);header.writeInt32LE(4*65536,0x34);assert.equal(classifyNativeForceInput({...record,bodyHeaderHex:header.toString('hex')}).vehicleBranch,'active-versus-ordinary-state-not-in-entry-header');
});
test('successful force-entry proof remains independent from complete final semantic equality',()=>{
 const f=fixture(),pair=f.pair(),bytes=Buffer.from(f.after.ranges.get('body0').bytes),replay={span:(p,n)=>{assert.equal(p,f.bodies[0]);return bytes.subarray(0,n);},report:{nativeReturn:0},manifest:{status:'synthetic-comparison-only',observed:{participantCount:6},requiredRegions:[{id:'body',address:f.bodies[0],length:384,comparison:'mutable'}]}};
 assert.equal(compareNativeForceSnapshots(f.native,f.source,pair).matched,true);assert.equal(compareNativeFramePair(pair,replay).matched,true);bytes[100]=1;assert.equal(compareNativeForceSnapshots(f.native,f.source,pair).matched,true);assert.equal(compareNativeFramePair(pair,replay).matched,false);
 f.capture.complete.pendingFrameSelection.frameMatchingHit++;assert.throws(()=>f.pair(),/terminal selection proof/);
});
