import test from 'node:test';
import assert from 'node:assert/strict';
import {pairNativeRecoverySnapshots} from '../tools/check-native-recovery-replay.mjs';
import {createNativeFrameCaptureConfig} from '../tools/prepare-native-frame-capture.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
import {createNativeRecoveryCaptureConfig,nativeRecoveryApplicationRanges} from '../tools/prepare-native-recovery-capture.mjs';
import {compareNativeRecoveryApplications} from '../tools/lib/native-recovery-selection.mjs';

async function fixture({skip=0,frames=1}={}){
  const {configuration}=await createNativeFrameCaptureConfig('synthetic-root','new-synthetic-recovery',{frames,stackBytesBefore:4096});
  for(const bp of configuration.breakpoints){
    if(bp.id==='native-frame-before'){bp.id='native-recovery-before';bp.rva='0x7ccc0';bp.skipMatchingHits=skip;}
    else if(bp.id==='native-frame-after'){bp.id='native-recovery-after';bp.rva='0x7d02d';bp.skipMatchingHits=skip;}
  }
  const moduleBaseAddress=0x6e0000,esp=0x30001000,sessionAddress=0x20000000,snapshots=[];
  for(let hit=1;hit<=frames;hit++)for(const after of [false,true]){
    const session=Buffer.alloc(0x590),stack=Buffer.alloc(4100);session[0x54d]=6;session.writeUInt32LE(4,0x57c);stack.writeUInt32LE(moduleBaseAddress+0x51021,4096);
    snapshots.push({ordinal:snapshots.length+1,breakpointId:after?'native-recovery-after':'native-recovery-before',hit,matchingHit:skip+hit,rawHit:skip+hit+30,tid:321,moduleBaseAddress,registers:{esp,eip:moduleBaseAddress+(after?0x7d02d:0x7ccc0)},captureWhen:{address:sessionAddress+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'},ranges:new Map([['session',{address:sessionAddress,bytes:session}],['frame-stack',{address:esp-4096,bytes:stack}]])});
  }
  return {configuration,capture:{header:{executableSha256:REDUX_SHA256},complete:{reason:'snapshot-bound',snapshots:snapshots.length},snapshots}};
}

test('recovery pairs actual ASLR parent entry/preRET and45101c caller with explicit matching window',async()=>{
  const f=await fixture({skip:120,frames:3}),paired=pairNativeRecoverySnapshots(f.capture,f.configuration);
  assert.equal(paired.frames,3);assert.equal(paired.skipFrames,120);assert.equal(paired.pairs[2].before.matchingHit,123);
  assert.equal(paired.pairs[0].returnAddress,0x731021);assert.deepEqual(paired.options,{stackBytesBefore:4096,stackBytesAfter:4,attachmentWindowBytes:1024});
});

test('recovery pairing rejects frame/leaf relabelling, wrong caller and ABI identity changes',async()=>{
  for(const mutate of [
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-recovery-before').rva='0x7e180';},
    f=>{f.capture.snapshots[0].registers.eip=0x6e0000+0x749e0;},
    f=>{f.capture.snapshots[1].ranges.get('frame-stack').bytes.writeUInt32LE(0x6e0000+0x7cd04,4096);},
    f=>{f.capture.snapshots[1].tid++;},f=>{f.capture.snapshots[1].registers.esp+=4;},
    f=>{f.capture.snapshots[1].ranges.get('session').address+=4;},
    f=>{f.capture.snapshots[1].moduleBaseAddress+=0x10000;},
  ]){const f=await fixture();mutate(f);assert.throws(()=>pairNativeRecoverySnapshots(f.capture,f.configuration),/differ|Missing|proof/);}
});

test('recovery pairing requires real active predicate, observer-only actions and a complete bounded window',async()=>{
  for(const mutate of [
    f=>{f.capture.header.executableSha256='0'.repeat(64);},
    f=>{f.capture.snapshots[1].captureWhen.actualBytesHex='01000000';},
    f=>{f.capture.snapshots[1].ranges.get('session').bytes[0x54d]=5;},
    f=>{f.configuration.phaseActions.push({breakpointId:'native-recovery-before'});},
    f=>{f.configuration.pendingFrameObserver={};},
    f=>{f.capture.snapshots[0].matchingHit++;},
    f=>{delete f.capture.snapshots[0].matchingHit;},
    f=>{f.capture.complete.reason='duration-bound';},
    f=>{f.capture.snapshots.pop();},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-recovery-after').ranges.find(row=>row.id==='frame-stack').length--;},
  ]){const f=await fixture();mutate(f);assert.throws(()=>pairNativeRecoverySnapshots(f.capture,f.configuration),/differ|proof|observer|bound|coverage/);}
});

async function selectedFixture(){
  const f=await fixture(),result=await createNativeRecoveryCaptureConfig('synthetic','never-launched',{selection:'first-respawn-application',skipFrames:120});f.configuration=result.configuration;
  const [before,after]=f.capture.snapshots,esp=before.registers.esp,base=before.moduleBaseAddress,actual=p=>base+p-0x400000,body=0x22000100,physical=0x23000000,route=0x2400000c;
  const proof={candidateIndex:7,frameTid:321,frameEntryEsp:`0x${esp.toString(16)}`,frameReturnAddress:'0x731021',frameMatchingHit:127,observedEventHits:1,qualifyingEventSnapshots:1};
  for(const[index,row]of [before,after].entries()){row.matchingHit=127;row.rawHit=200;row.deferredPublication=true;row.observedElapsedMs=30+index*2;row.observedDebugEventOrdinal=100+index*2;row.pendingFrame={...proof,role:index?'after':'before'};}
  const locations={'recovery-apply-body-header':body,'recovery-apply-physical-list':physical,'recovery-apply-pack-header':0x25000000,'recovery-apply-caller':esp-124,'recovery-apply-arguments':esp-124,'recovery-apply-position':actual(0x70eb0c),'recovery-apply-quaternion':esp-24,'recovery-apply-rotation':body+0xc4,'recovery-apply-route':route};
  const ranges=new Map(nativeRecoveryApplicationRanges().map(row=>[row.id,{id:row.id,address:locations[row.id]??actual(Number(row.rva)+0x400000),bytes:Buffer.alloc(row.length),...(row.rva===undefined?{}:{moduleBaseAddress:base})}]));
  function put(address,value,width=4){for(const row of ranges.values())if(row.address<=address&&row.address+row.bytes.length>=address+width){if(width===4)row.bytes.writeUInt32LE(value>>>0,address-row.address);else if(width===2)row.bytes.writeUInt16LE(value&65535,address-row.address);else row.bytes[address-row.address]=value&255;}}
  put(actual(0x6e6b40),0x22000081);put(actual(0x70dcf4),0x10000);put(actual(0x902bc0),physical);put(actual(0x902bc4),1,2);put(physical,body);put(body,0x1c03);put(body+0x128,32);
  //The actualpack can differ from the preferred909240 backing. Its fields,
  //not a coincidentallyequal global909286, govern47ccc0's route search.
  put(actual(0x90b98c),0x25000000);put(0x25000000+0x60,route-12);put(0x25000000+0x46,2,1);put(actual(0x909286),0,1);put(route,4,2);
  for(const[o,v]of [[0,actual(0x47cf3c)],[4,esp-24],[8,body+0xc4],[12,route],[16,1],[20,3]])put(esp-124+o,v);
  const event={ordinal:2,breakpointId:'native-recovery-apply-entry',hit:1,matchingHit:210,rawHit:210,tid:321,moduleBaseAddress:base,registers:{esp:esp-124,eip:actual(0x47d440),ecx:body,edx:actual(0x70eb0c)},deferredPublication:true,observedElapsedMs:31,observedDebugEventOrdinal:101,pendingFrame:{...proof,role:'event',eventIndex:1},ranges};
  after.ordinal=3;f.capture.snapshots=[before,event,after];f.capture.complete.snapshots=3;f.capture.complete.pendingFrameSelection={...proof};
  return {...f,put,event};
}

test('selected recovery retains actual ASLR application ABI and compares every ordered immutable input field',async()=>{
  const f=await selectedFixture(),paired=pairNativeRecoverySnapshots(f.capture,f.configuration),records=paired.pairs[0].nativeApplications;
  assert.equal(paired.selection.mode,'first-respawn-application');assert.equal(records.length,1);assert.equal(records[0].bodyAddress,0x22000100);assert.equal(records[0].positionAddress,0x9eeb0c);assert.equal(records[0].entryEsp,0x30001000-124);
  assert.equal(f.event.ranges.get('runtime-geometry-roots').bytes[0x46],0,'The stalepreferred groupcount cannot admit this actualpack.');
  assert.equal(compareNativeRecoveryApplications(records,structuredClone(records),{sourceComplete:true,respawnedBodies:1}).matched,true);
  const changed=structuredClone(records);changed[0].terrain++;
  assert.equal(compareNativeRecoveryApplications(records,changed).firstDivergence.field,'terrain');
  assert.equal(compareNativeRecoveryApplications(records,[],{sourceComplete:false}).firstDivergence.kind,'application-call-count');
  const partial=compareNativeRecoveryApplications(records,structuredClone(records),{sourceComplete:false});assert.equal(partial.matched,true);assert.equal(partial.sourceComplete,false);
  assert.equal(compareNativeRecoveryApplications(records,records,{sourceComplete:true,respawnedBodies:0}).firstDivergence.kind,'completed-respawn-count');
  const two=[records[0],{...records[0],index:2}];
  assert.equal(compareNativeRecoveryApplications(two,[two[1],two[0]],{sourceComplete:true,respawnedBodies:2}).firstDivergence.field,'index');
});

test('selected recovery rejects subset/missing events, forged pending proof and wrong native body/route inputs',async()=>{
  for(const edit of [
    f=>{f.configuration.pendingFrameObserver.eventRecordBytes=104;},
    f=>{f.configuration.pendingFrameObserver.maxPendingBytes=715;},
    f=>{f.configuration.pendingFrameObserver.extraFilter=true;},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-recovery-apply-entry').captureWhen={};},
    f=>{delete f.capture.complete.pendingFrameSelection;},
    f=>{f.capture.complete.pendingFrameSelection.observedEventHits++;},
    f=>{f.event.pendingFrame.eventIndex++;},f=>{f.event.tid++;},f=>{f.event.registers.esp++;},f=>{f.event.moduleBaseAddress++;},
    f=>{f.event.observedDebugEventOrdinal=103;},f=>{f.capture.snapshots.splice(1,1);},
    f=>{f.put(0x30001000-124,0x731021);},f=>{f.put(0x22000100+0x128,0);},
    f=>{f.put(0x23000000,0);},f=>{f.put(0x30001000-124+16,4);},f=>{f.put(0x25000000+0x46,0,1);},
    f=>{f.put(0x30001000-124+4,0x30000000);},
    f=>{f.capture.snapshots[0].pendingFrame.qualifyingEventSnapshots++;},
    f=>{delete f.configuration.pendingFrameObserver;},
  ]){const f=await selectedFixture();edit(f);assert.throws(()=>pairNativeRecoverySnapshots(f.capture,f.configuration),/differ|proof|retain|policy|caller|membership|filters/);}
});
