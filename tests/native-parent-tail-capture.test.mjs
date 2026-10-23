import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentTailCaptureConfig} from '../tools/prepare-native-parent-tail-capture.mjs';
import {pairNativeControlSnapshots,nativeControlTailBoundaries} from '../tools/lib/native-control-capture.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

async function fixture(){
  const {configuration}=await createNativeParentTailCaptureConfig('synthetic','never-launched-tail',{stackBytesBefore:64,skipFrames:2,includeAfterAiCheckpoint:false,guardedAudioChannels:false});
  const base=0x700000,U=0x200100,initial={ebx:1,ebp:2,esi:3,edi:4,edx:0,ecx:123,fpuControlWord:0x7f,mxcsr:0x1f80};
  const sites=[['native-control-before',0x450e50,U],['native-control-after',0x4749e0,U-20],['native-control-after-physics',0x474b1e,U-20],...nativeControlTailBoundaries.map(row=>[row.id,row.address,U-16])];
  const snapshots=sites.map(([id,address,esp],index)=>{
    const bytes=Buffer.alloc(96),put=(offset,value)=>bytes.writeUInt32LE(value,64+offset),session=Buffer.alloc(0x590),clock=Buffer.alloc(4);
    session[0x54d]=6;session.writeUInt32LE(4,0x57c);clock.writeUInt32LE(288);
    if(index===0){put(0,base+0x41234);put(4,1);}
    else{
      const at=index<3?4:0;if(index<3)put(0,base+0x51017);
      for(const [offset,name]of [[0,'edi'],[4,'esi'],[8,'ebp'],[12,'ebx']])put(at+offset,initial[name]);
      put(at+16,base+0x41234);put(at+20,1);
    }
    return {breakpointId:id,ordinal:index+4,tid:80,hit:1,matchingHit:3,rawHit:230,
      registers:{...initial,esp,eip:base+address-0x400000,...(index?{ebp:0,eax:0}:{})},
      captureWhen:{address:0x30057c,actualBytesHex:'04000000',equalsBytesHex:'04000000'},
      ranges:new Map([['frame-stack',{id:'frame-stack',address:esp-64,bytes}],['session',{id:'session',address:0x300000,bytes:session}],
        ['clock',{id:'clock',address:base+0x50a548,moduleBaseAddress:base,bytes:clock}],['attachment-count',{id:'attachment-count',address:base+0x2e6ba0,bytes:Buffer.alloc(4)}]])};
  });
  return {configuration,capture:{header:{executableSha256:REDUX_SHA256},complete:{reason:'snapshot-bound'},snapshots}};
}

test('postphysics observer preserves native parent entry and uses actual S+4 checkpoints with terminal drive bound',async()=>{
  const f=await fixture(),paired=pairNativeControlSnapshots(f.capture,f.configuration);
  assert.equal(paired.postphysics,true);assert.equal(f.configuration.maxSnapshots,9);assert.equal(f.configuration.maxDurationMs,90000);
  assert.deepEqual(Object.keys(paired.pairs[0].postphysics),['attachments','recovery','drive']);
  assert.equal(paired.pairs[0].postphysics.attachments.registers.esp,paired.pairs[0].physicsAfter.registers.esp+4);
  assert.equal(f.configuration.breakpoints.find(row=>row.id==='native-control-after-physics').stopAfterHits,0);
  for(const point of f.configuration.breakpoints.filter(row=>row.id.startsWith('native-control-'))){
    assert.ok(point.ranges.some(row=>row.id==='tail-type2-pointer-domain'&&row.length===16384));
    assert.ok(point.ranges.some(row=>row.id==='tail-pickup-list-region'&&row.readableRegion));
  }
});

test('postphysics pairing rejects altered caller stack, missing/reordered stages, mode/thread/clock and early terminal policy',async()=>{
  for(const corrupt of [
    f=>{f.capture.snapshots[3].registers.esp--;},f=>{f.capture.snapshots[3].tid++;},
    f=>{f.capture.snapshots[3].ranges.get('clock').bytes.writeUInt32LE(289);},
    f=>{f.capture.snapshots[4].ranges.get('frame-stack').bytes.writeUInt32LE(0,80);},
    f=>{f.capture.snapshots[4].ordinal=f.capture.snapshots[3].ordinal;},
    f=>{f.capture.snapshots[4].registers.ebp=2;},f=>{f.capture.snapshots[5].registers.mxcsr|=0x8000;},
    f=>{f.capture.snapshots.splice(3,1);},f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-physics').stopAfterHits=1;},
    f=>{f.configuration.breakpoints.find(row=>row.id==='native-control-after-attachments').rva='0x51017';},
    f=>{f.configuration.phaseActions.push({breakpointId:'native-control-after-recovery',writes:[]});},
    f=>{f.configuration.breakpoints=f.configuration.breakpoints.filter(row=>row.id!=='native-control-after-drive');},
  ]){const f=await fixture();corrupt(f);assert.throws(()=>pairNativeControlSnapshots(f.capture,f.configuration));}
});

test('tail alias admission only covers genuinely observed source spans and subtracts existing module aliases',()=>{
  const base=0x6e0000,address=base+0x91cdb0-0x400000;
  const snapshot={ranges:[{address,moduleBaseAddress:base,bytes:Buffer.alloc(0x6a4)}]};
  const admitted=nativeParentTailAdditionalRegions(snapshot);
  assert.ok(admitted.length>0);assert.ok(admitted.every(row=>row.address>=address&&row.address+row.length<=address+0x6a4));
  assert.ok(admitted.every(row=>row.id.startsWith('tail-attachment-scratch')));
});
