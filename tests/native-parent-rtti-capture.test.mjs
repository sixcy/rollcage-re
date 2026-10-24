import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeParentTailCaptureConfig} from '../tools/prepare-native-parent-tail-capture.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration,verifyNativeParentRttiCaptureRecords,verifyNativeParentRttiViewportMapGraph,nativeParentRttiMapBreakpointIds,nativeParentRttiMapCaptureRanges,nativeParentRttiRequiredCapability,nativeParentRttiViewportMapGraphCapability,nativeParentRttiWeatherCapability,nativeParentRttiWeatherObservationRanges} from '../tools/lib/native-parent-rtti-capture.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';

const options={frames:1,through:'world-effects',includeAfterAiCheckpoint:true,collisionSound19:true,guardedAudioChannels:false,stackBytesBefore:64,skipFrames:60};
const fixture=()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',options);

test('opt-in RTTI profile preserves all thirteen baseline observations and adds at most eight scoped snapshots',async()=>{
  const baseline=await createNativeParentTailCaptureConfig('synthetic','never-launched-rtti',options),f=await fixture(),config=f.configuration;
  assert.equal(baseline.configuration.maxSnapshots,13);assert.equal(baseline.configuration.parentRttiObservation,undefined);
  assert.equal(config.maxSnapshots,21);assert.equal(config.maxDurationMs,90000);assert.equal(config.captureThreadEnvironment,true);
  assert.equal(f.preparedOnly,true);assert.equal(f.launchBlockedUntilHelperCapability,true);assert.equal(f.requiredHelperCapability,nativeParentRttiRequiredCapability);
  const restored=structuredClone(config);delete restored.parentRttiObservation;restored.maxSnapshots-=8;
  restored.breakpoints=restored.breakpoints.filter(row=>!row.id.startsWith('native-parent-rtti-'));
  for(const point of restored.breakpoints)point.ranges=point.ranges.filter(row=>!row.id.startsWith('late-singleton-candidate-viewport-map-'));
  assert.deepEqual(restored,baseline.configuration);
  assert.equal(verifyNativeParentRttiCaptureConfiguration(config).maxExternalPairs,4);
});

test('map transport belongs only to three latched preflight points and never mixes unsupported range modes',async()=>{
  const {configuration:c}=await fixture();
  assert.deepEqual(c.parentRttiObservation.singletonMapPreflight.breakpointIds,[...nativeParentRttiMapBreakpointIds]);
  for(const point of c.breakpoints){
    const rows=point.ranges.filter(row=>row.id.startsWith('late-singleton-candidate-viewport-map-'));
    assert.deepEqual(rows,nativeParentRttiMapBreakpointIds.includes(point.id)?nativeParentRttiMapCaptureRanges():[]);
    for(const row of rows){assert.equal(row.bytes,undefined);assert.equal(row.preferredBytes,undefined);}
  }
  const [head,region]=nativeParentRttiMapCaptureRanges();
  assert.deepEqual(head.dereferenceMinimumValues,[1,1]);assert.equal(head.length,100);assert.equal(head.readableRegion,undefined);
  assert.equal(region.readableRegion,true);assert.equal(region.maxRegionBytes,16*1024*1024);assert.equal(region.dereferenceMinimumValues,undefined);
});

test('RTTI policy rejects unscoped sites, altered bounds, early activation, writes and changed stack/root domains',async()=>{
  const mutations=[
    c=>{delete c.parentRttiObservation;},c=>{c.parentRttiObservation.maxPairs=5;},c=>{c.parentRttiObservation.maxSnapshots=9;},
    c=>{c.parentRttiObservation.beginBreakpointId='native-control-before';},c=>{c.parentRttiObservation.endBreakpointId='native-control-after-world-effects';},
    c=>{c.maxSnapshots=22;},c=>{c.maxDurationMs=90001;},c=>{c.captureThreadEnvironment=false;},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').rva='0x2d85';},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-return').ranges[0].length=53;},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').captureWhen={equalsBytesHex:'04000000'};},
    c=>{c.breakpoints.find(x=>x.id==='native-parent-rtti-call').stopAfterHits=1;},
    c=>{c.phaseActions.push({breakpointId:'native-parent-rtti-return',writes:[]});},
    c=>{c.breakpoints.push({id:'unscoped-rtti-copy',rva:'0x2d86',ranges:[]});},
    c=>{c.breakpoints.push({id:'extra-pose-site',rva:'0x510ef',ranges:[{id:'pose',baseRegister:'eax',length:12}]});},
    c=>{c.phaseActions.push({breakpointId:'unknown-game-write',writes:[{rva:'0x50a548',bytesHex:'00000000'}]});},
    c=>{c.phaseActions[0].writes[0].bytesHex='00000000';},
    c=>{c.breakpoints[0].ranges[0].length=8;},
    c=>{[c.breakpoints[3],c.breakpoints[4]]=[c.breakpoints[4],c.breakpoints[3]];},
    c=>{c.heldForceInput={};},c=>{c.services={};},c=>{c.denyRegistryWrites=false;},c=>{c.hideOwnedWindows=false;},c=>{c.maxEvents++;},
    c=>{c.breakpoints.find(x=>x.id==='native-control-after').writes=[];},
    c=>{c.parentRttiObservation.singletonMapPreflight.dereferenceOffsets=['0','0x78'];},
    c=>{c.parentRttiObservation.singletonMapPreflight.maxRegionBytes++;},
    c=>{c.parentRttiObservation.singletonMapPreflight.breakpointIds.pop();},
    c=>{c.breakpoints.find(x=>x.id==='native-control-before').ranges.find(x=>x.id==='late-singleton-candidate-viewport-map-head').dereferenceMinimumValues=[0,0];},
    c=>{c.breakpoints.find(x=>x.id==='native-control-before').ranges.find(x=>x.id==='late-singleton-candidate-viewport-map-region').dereferenceMinimumValues=[1,1];},
    c=>{c.breakpoints.find(x=>x.id==='native-control-after-physics').ranges.push(...nativeParentRttiMapCaptureRanges());},
  ];
  const original=(await fixture()).configuration;
  for(const mutate of mutations){const c=structuredClone(original);mutate(c);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(c));}
});

test('new RTTI creator rejects unsupported multi-parent or shorter observation windows',async()=>{
  for(const change of [{frames:2},{through:'cameras'},{includeAfterAiCheckpoint:false}])await assert.rejects(()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,...change}),/one parent through world-effects/);
});

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const word=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value);return b;};
const stageOrder=['native-control-before','native-control-after-ai','native-control-after','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects'];
const offsets={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,cs:188,eflags:192,esp:196,ss:200};
//Small constructed transport/ABI fixtures, never native runtime observations.
async function runtimeFixture({base=0x6e0000,pairs=1,eax=0x20000000,viewportMapGraph=false,emptyGraph=false,weatherScreenQueries=false}={}){
  const {configuration}=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph,weatherScreenQueries}),U=0x10000000,Q=U-276,APP=0x20000000,HEAD=0x21000000,FS=0x23000000,SESSION=0x24000000,clock=348,iteration=17,total=21,caller=0x500010,saved=[0x1010,0x2020,0x3030,0x4040],entryEvent=140,activationEvent=210,pairTotal=pairs+(weatherScreenQueries?2:0);
  const header={type:'capture',schemaVersion:1,executableSha256:configuration.expectedSha256,helperCapabilities:[nativeParentRttiRequiredCapability],maxDurationMs:90000,maxEvents:1000000,maxSnapshots:21},owner={type:'owned-process',pid:42,tid:7},records=[header,owner],snapshots=[];
  if(viewportMapGraph)header.helperCapabilities.push(nativeParentRttiViewportMapGraphCapability);
  if(weatherScreenQueries)header.helperCapabilities.push(nativeParentRttiWeatherCapability);
  for(const[id,rva,opcode]of [['native-parent-rtti-call',0x2d86,'e8'],['native-parent-rtti-return',0x2d8b,'83']])records.push({type:'breakpoint-installation-deferred',id,address:base+rva,originalBytesHex:opcode,activationBreakpointId:'native-control-after-auxiliary',activationSelection:'selected-owned-parent-auxiliary',capability:nativeParentRttiRequiredCapability,codeModified:false});
  const descriptor=Buffer.alloc(8);descriptor.writeUInt16LE(FS&65535,2);descriptor[4]=FS>>>16&255;descriptor[7]=FS>>>24;
  const env={fsSelector:0x53,fsBase:FS,sehWord:0x1000ff00,descriptorHex:descriptor.toString('hex'),tid:7,contextSelectorOffset:144,source:'stopped-owned-thread-selector-query',selectorApi:'Wow64GetThreadSelectorEntry'};
  const range=(id,address,bytes,meta={})=>({id,address,length:bytes.length,bytes:Buffer.from(bytes),sha256:hash(bytes),moduleBaseAddress:base,...meta});
  const common=(type,id,event)=>({type,pid:42,tid:7,ownerMainTid:7,breakpointId:id,observedDebugEventOrdinal:event,parentEntryDebugEventOrdinal:entryEvent,parentEntryEsp:U,parentClock:clock,parentIteration:iteration,parentCaller:caller,parentTotalIterations:total,activationDebugEventOrdinal:id==='native-control-before'?0:activationEvent});
  function mapRows(){
    const appBytes=Buffer.alloc(0x84);appBytes.writeUInt32LE(HEAD,0x7c);const headBytes=Buffer.alloc(100),regionBytes=Buffer.alloc(256),extra=[];
    if(viewportMapGraph){
      const addresses=[0x25000000,0x25000100,0x25000200],count=emptyGraph?0:3;appBytes.writeUInt32LE(count,0x80);headBytes[12]=1;headBytes[13]=1;headBytes.writeUInt32LE(count?addresses[1]:HEAD);headBytes.writeUInt32LE(count?addresses[0]:HEAD,4);headBytes.writeUInt32LE(count?addresses[2]:HEAD,8);
      extra.push(range('parent-rtti-map-graph-header',APP+0x7c,appBytes.subarray(0x7c),{source:'parent-rtti-viewport-map-graph',graphRole:'header'}),range('parent-rtti-map-graph-head',HEAD,headBytes.subarray(0,16),{source:'parent-rtti-viewport-map-graph',graphRole:'head'}));
      const keys=['Player','1 Player','Really long viewport name'];
      for(let i=0;i<count;i++){
        const bytes=Buffer.alloc(100),heap=i===2,key=Buffer.from(keys[i]+'\0'),address=addresses[i],path=['root','root.left','root.right'][i],meta={source:'parent-rtti-viewport-map-graph',graphRole:'node',graphNodeIndex:i,graphPath:path,nodeAddress:address};
        bytes.writeUInt32LE(i===0?addresses[1]:HEAD);bytes.writeUInt32LE(i===0?HEAD:addresses[0],4);bytes.writeUInt32LE(i===0?addresses[2]:HEAD,8);bytes[12]=1;bytes.writeUInt32LE(key.length-1,32);bytes.writeUInt32LE(heap?31:15,36);
        if(heap){bytes.writeUInt32LE(0x26000000,16);extra.push(range(`parent-rtti-map-key-${i}`,0x26000000,key,{...meta,graphRole:'heap-key'}));}else key.copy(bytes,16);
        extra.push(range(`parent-rtti-map-node-${i}`,address,bytes,meta));
      }
    }
    headBytes.copy(regionBytes);
    const steps=[{index:0,readAddress:base+0x2efb38,value:APP,minimumValue:1,bytesHex:word(APP).toString('hex')},{index:1,readAddress:APP+0x7c,value:HEAD,minimumValue:1,bytesHex:word(HEAD).toString('hex')}];
    return [range('late-viewport-singletons',base+0x2efb38,Buffer.concat([word(APP),word(0)])),range('late-application-header',APP,appBytes),
      range('late-singleton-candidate-viewport-map-head',HEAD,headBytes,{rootRva:'0x2efb38',dereferenceOffsets:['0','0x7c'],dereferenceMinimumValues:[1,1],rangeMode:'guarded-pointer',guardedRootAddress:base+0x2efb38,guardedDeclaredLength:100,guardedStopIndex:null,guardedPointerSteps:steps,guardedPointerReadBytes:8}),
      range('late-singleton-candidate-viewport-map-region',HEAD,regionBytes,{rootRva:'0x2efb38',dereferenceOffsets:['0','0x7c'],rangeMode:'readable-region',requestedResolvedRoot:HEAD,regionBaseAddress:HEAD,regionSize:256,regionProtection:4,regionState:0x1000,regionType:0x20000,maxRegionBytes:16*1024*1024}),...extra];
  }
  function append(id,{externalIndex,weatherQueryIndex}={}){
    const ordinal=snapshots.length+1,event=100+ordinal*10,isExternal=externalIndex!==undefined,weather=weatherQueryIndex!==undefined,stage=stageOrder.indexOf(id),physical=['native-control-after','native-control-after-physics'].includes(id),esp=isExternal?(weather?U-460:Q):stage===0?U:stage>0?U-(physical?20:16):U;
    const context=Buffer.alloc(716);context.writeUInt32LE(0x53,144);context.writeUInt32LE(0x7f,28);context.writeUInt32LE(0x1f80,228);
    const point=configuration.breakpoints.find(p=>p.id===id),reg={edi:saved[0],esi:saved[1],ebp:stage===0?saved[2]:iteration,ebx:saved[3],edx:iteration,eax:isExternal&&externalIndex%2?eax:APP,eip:base+Number(point.rva),esp,cs:0x23,ss:0x2b,eflags:0x202,ecx:0};
    for(const[key,at]of Object.entries(offsets))context.writeUInt32LE(reg[key]>>>0,at);const rows=[];
    if(stage>=0){
      const stack=Buffer.alloc(96),at=64;if(stage===0){stack.writeUInt32LE(caller,at);stack.writeUInt32LE(total,at+4);}else{const shift=physical?4:0;if(physical)stack.writeUInt32LE(base+0x51017,at);saved.forEach((v,i)=>stack.writeUInt32LE(v,at+shift+i*4));stack.writeUInt32LE(caller,at+shift+16);stack.writeUInt32LE(total,at+shift+20);}
      const session=Buffer.alloc(0x590);session[0x54d]=6;session.writeUInt32LE(4,0x57c);rows.push(range('frame-stack',esp-64,stack),range('session',SESSION,session),range('clock',base+0x50a548,word(clock)));
      if(stage===0&&weatherScreenQueries)rows.push(range('late-weather-player-name',base+0x1d0254,Buffer.from('0 Player\0')));
      if(nativeParentRttiMapBreakpointIds.includes(id))rows.push(...mapRows());
    }
    let endpoint;
    if(isExternal){
      const stack=Buffer.alloc(weather?68:52,0xa5);[APP,0,base+0x2e213c,base+0x2e20a4,0].forEach((v,i)=>stack.writeUInt32LE(v,i*4));endpoint=stack;
      if(weather){const F=U-360,outputs=weatherQueryIndex===1?[F+0x18,F+0x1c,F+0x14,F+0x20]:[F+0x10,F+0x18,F+0x1c,F+0x20];[base+0xabf3,esp+141,esp+140,...outputs].forEach((v,i)=>stack.writeUInt32LE(v,40+i*4));rows.push(range('native-parent-rtti-context',esp,stack),range('native-parent-rtti-clock',base+0x50a548,word(clock)),range('native-parent-rtti-weather-query-return',esp+84,word(base+(weatherQueryIndex===1?0x98092:0x980f5))),range('native-parent-rtti-weather-screen-return',esp+416,word(base+0x96822)),range('native-parent-rtti-weather-parent-return',esp+440,word(base+0x51116)),range('native-parent-rtti-weather-name',esp+140,Buffer.from('0 Player\0')));}
      else{stack.writeUInt32LE(base+0x1a0c8,40);stack.writeUInt32LE(U-60,44);stack.writeUInt32LE(1,48);rows.push(range('native-parent-rtti-context',Q,stack),range('native-parent-rtti-camera-return',U-20,word(base+0x51107)),range('native-parent-rtti-clock',base+0x50a548,word(clock)));}
    }
    rows.push(range('thread-seh-head',FS,word(0x1000ff00),{source:'stopped-owned-thread-fs-zero'}));
    const s={type:'snapshot',ordinal,breakpointId:id,hit:isExternal?Math.floor(externalIndex/2)+1:1,tid:7,observedDebugEventOrdinal:event,capturePhase:'before-declared-writes-before-original-instruction',contextFile:`synthetic-context-${ordinal}.bin`,contextSha256:hash(context),context,registers:{...reg,fpuControlWord:0x7f,fpuStatusWord:0,mxcsr:0x1f80},threadEnvironment:env,ranges:new Map(rows.map(row=>[row.id,row]))};
    if(stage>=0)Object.assign(s,{rawHit:61,matchingHit:61,captureWhen:{actualBytesHex:'04000000',equalsBytesHex:'04000000',address:SESSION+0x57c}});
    records.push({type:'debug-event',event:1,pid:42,tid:7,ordinal:event});
    const annotate=(key,proof)=>{records.push(proof);s[key]=structuredClone(proof);};
    if(id===configuration.parentRttiObservation.endBreakpointId)annotate('parentRttiClosure',{...common('parent-rtti-closed',id,event),snapshotOrdinal:ordinal,actualPairs:pairTotal,actualSnapshots:pairTotal*2,callOpen:false,windowOpen:false,breakpointsRemainArmedForDeferredReplay:true,beforeSnapshotRangeResolution:true,beforeOriginalInstruction:true});
    if(nativeParentRttiMapBreakpointIds.includes(id))annotate('parentRttiMapPreflight',{...common('parent-rtti-map-preflight',id,event),snapshotOrdinal:ordinal,rootAddress:base+0x2efb38,rootBytesHex:word(APP).toString('hex'),appAddress:APP,headSlotAddress:APP+0x7c,headBytesHex:word(HEAD).toString('hex'),headAddress:HEAD,identitiesLatchedOrStable:true,identityAction:stage===0?'latched':'stable',beforeSnapshotRangeResolution:true,phasePredicateAlreadySelected:true,sameStoppedDebugEvent:true});
    if(viewportMapGraph&&nativeParentRttiMapBreakpointIds.includes(id)){
      const header=rows.find(r=>r.id==='parent-rtti-map-graph-header').bytes,head=rows.find(r=>r.id==='parent-rtti-map-graph-head').bytes,nodeRows=rows.filter(r=>r.graphRole==='node').sort((a,b)=>a.graphNodeIndex-b.graphNodeIndex);
      annotate('parentRttiViewportMapGraph',{...common('parent-rtti-map-graph',id,event),snapshotOrdinal:ordinal,appAddress:APP,headerAddress:APP+0x7c,headerBytesHex:header.toString('hex'),headAddress:HEAD,headBytesHex:head.toString('hex'),rootAddress:head.readUInt32LE(4),count:header.readUInt32LE(4),maxNodes:8,maxKeyBytes:256,nodes:nodeRows.map(r=>{const b=r.bytes,i=r.graphNodeIndex,heap=b.readUInt32LE(36)>=16;return{index:i,path:r.graphPath,address:r.address,parentAddress:b.readUInt32LE(4),leftAddress:b.readUInt32LE(),rightAddress:b.readUInt32LE(8),keyAddress:heap?b.readUInt32LE(16):r.address+16,keyLength:b.readUInt32LE(32),keyCapacity:b.readUInt32LE(36),heapKey:heap,nodeRangeId:r.id,keyRangeId:heap?`parent-rtti-map-key-${i}`:null};}),sameStoppedDebugEvent:true,beforeOriginalInstruction:true,afterSingletonPreflight:true,completeGraphObserved:true});
    }
    if(id==='native-control-after-auxiliary'){
      const installed=[['native-parent-rtti-call',0x2d86,'e89f651600'],['native-parent-rtti-return',0x2d8b,'83c414']].map(([name,rva,opcode])=>({id:name,address:base+rva,originalBytesHex:opcode,patchBytesHex:'cc'}));
      for(const item of installed)records.push({...common('parent-rtti-breakpoint-activated',id,event),...item,beforeOriginalInstruction:true});
      annotate('parentRttiActivation',{...common('parent-rtti-activation',id,event),auxiliarySnapshotOrdinal:ordinal,installed,afterSnapshotBytesCaptured:true,beforeSnapshotPublication:true,beforeOriginalInstruction:true});
    }
    if(isExternal)annotate('parentRttiObservation',{...common('parent-rtti-admitted',id,event),role:externalIndex%2?'return':'call',rawHit:Math.floor(externalIndex/2)+1,pairIndex:Math.floor(externalIndex/2)+1,snapshotOrdinal:ordinal,derivedQ:esp,stackAddress:esp,stackBytesHex:endpoint.toString('hex'),...(weatherScreenQueries?{family:weather?'weather-screen':'camera'}:{}),...(weather?{weatherQueryIndex,queryReturnAddress:esp+84,queryReturnBytesHex:word(base+(weatherQueryIndex===1?0x98092:0x980f5)).toString('hex'),screenReturnAddress:esp+416,screenReturnBytesHex:word(base+0x96822).toString('hex'),parentReturnAddress:esp+440,parentReturnBytesHex:word(base+0x51116).toString('hex'),nameAddress:esp+140,nameBytesHex:Buffer.from('0 Player\0').toString('hex')}:{cameraReturnAddress:U-20,cameraReturnBytesHex:word(base+0x51107).toString('hex')}),actualSingletonBytesHex:word(APP).toString('hex'),actualClockBytesHex:word(clock).toString('hex'),actualArgumentsHex:endpoint.subarray(0,20).toString('hex'),commonAbiMatched:true,beforeSnapshotRangeResolution:true,beforeOriginalInstruction:true});
    const raw=structuredClone({...s,context:undefined,ranges:rows.map(({bytes,...meta})=>meta)});delete raw.context;records.push(raw);snapshots.push(s);
  }
  for(const id of configuration.breakpoints.slice(0,3).map(p=>p.id))append(id);
  for(const id of stageOrder.slice(0,8))append(id);
  for(let i=0;i<pairs*2;i++)append(i%2?'native-parent-rtti-return':'native-parent-rtti-call',{externalIndex:i});
  append('native-control-after-cameras');
  if(weatherScreenQueries)for(let query=1;query<=2;query++)for(let endpoint=0;endpoint<2;endpoint++)append(endpoint?'native-parent-rtti-return':'native-parent-rtti-call',{externalIndex:pairs*2+(query-1)*2+endpoint,weatherQueryIndex:query});
  append('native-control-after-world-effects');
  const complete={type:'complete',reason:'snapshot-bound',events:1000,snapshots:snapshots.length,parentRttiObservation:{selectedParentCheckpoints:10,startupSnapshots:3,externalPairs:pairTotal,externalSnapshots:pairTotal*2,mapPreflights:3,windowClosed:true,callOpen:false,activationDebugEventOrdinal:activationEvent}};records.push(complete);
  return {capture:{header,complete,snapshots},configuration,records,U,Q,APP,HEAD,base};
}
function runtimeSnapshot(f,id){return f.capture.snapshots.find(s=>s.breakpointId===id);}
function rewriteRange(f,s,id,fn){const row=s.ranges.get(id);row.bytes=Buffer.from(row.bytes);fn(row.bytes);row.sha256=hash(row.bytes);f.records.find(r=>r.type==='snapshot'&&r.ordinal===s.ordinal).ranges.find(r=>r.id===id).sha256=row.sha256;}

test('constructed raw contexts/ranges authenticate zero through four CRT pairs at preferred and relocated bases without predetermining EAX',async()=>{
  for(const pairs of [0,1,4])for(const base of [0x400000,0x6e0000]){const f=await runtimeFixture({pairs,base,eax:0}),r=verifyNativeParentRttiCaptureRecords(f);assert.equal(r.verified,true);assert.equal(r.externalPairs,pairs);assert.equal(r.snapshots,13+pairs*2);assert.ok(r.outcomes.every(row=>row.eax===0));assert.equal(r.runtimeResolvedExportIdentityProved,false);}
});
test('runtime proof rejects foreign thread, missing capability, raw-context mismatch, altered annotation and false terminal counts',async()=>{
  for(const change of [
    f=>runtimeSnapshot(f,'native-parent-rtti-call').tid++,
    f=>f.capture.header.helperCapabilities=[],
    f=>runtimeSnapshot(f,'native-parent-rtti-call').registers.esp++,
    f=>runtimeSnapshot(f,'native-parent-rtti-call').parentRttiObservation.commonAbiMatched=false,
    f=>f.capture.complete.parentRttiObservation.externalPairs++,
    f=>f.records.find(r=>r.type==='parent-rtti-breakpoint-activated').originalBytesHex='e800000000',
    f=>f.records.find(r=>r.type==='breakpoint-installation-deferred').codeModified=true,
    f=>f.records.push({type:'breakpoint-installed',id:'native-parent-rtti-call'}),
    f=>f.records.push({...f.records.find(r=>r.type==='parent-rtti-map-preflight'),observedDebugEventOrdinal:9998}),
    f=>f.records.push({...f.records.find(r=>r.type==='parent-rtti-closed'),observedDebugEventOrdinal:9998}),
    f=>f.records.push({type:'parent-rtti-unreviewed-proof'}),
    f=>{const s=runtimeSnapshot(f,'native-parent-rtti-call'),r=f.records.find(r=>r.type==='parent-rtti-admitted');r.rawHit=2;s.parentRttiObservation=structuredClone(r);f.records.find(x=>x.type==='snapshot'&&x.ordinal===s.ordinal).parentRttiObservation=structuredClone(r);},
  ]){const f=await runtimeFixture();change(f);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));}
});
test('correct name/mode words and actual ASLR type/argument blobs are required even with refreshed hashes and matching annotations',async()=>{
  for(const modify of [b=>{const old=b.readUInt32LE(44);b.writeUInt32LE(b.readUInt32LE(48),44);b.writeUInt32LE(old,48);},b=>b.writeUInt32LE(0x6e213c,8),b=>b.writeUInt32LE(1,4)]){
    const f=await runtimeFixture(),s=runtimeSnapshot(f,'native-parent-rtti-call');rewriteRange(f,s,'native-parent-rtti-context',modify);
    const bytes=s.ranges.get('native-parent-rtti-context').bytes,proof=f.records.find(r=>r.type==='parent-rtti-admitted');proof.stackBytesHex=bytes.toString('hex');proof.actualArgumentsHex=bytes.subarray(0,20).toString('hex');s.parentRttiObservation=structuredClone(proof);f.records.find(r=>r.type==='snapshot'&&r.ordinal===s.ordinal).parentRttiObservation=structuredClone(proof);
    assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));
  }
});
test('preflight requires independent root/APP/head bytes, stable identities, bounded real region and marker before its snapshot',async()=>{
  for(const change of [
    f=>rewriteRange(f,runtimeSnapshot(f,'native-control-before'),'late-application-header',b=>b.writeUInt32LE(0x22000000,0x7c)),
    f=>rewriteRange(f,runtimeSnapshot(f,'native-control-after-cameras'),'late-viewport-singletons',b=>b.writeUInt32LE(0x22000000)),
    f=>runtimeSnapshot(f,'native-control-before').ranges.get('late-singleton-candidate-viewport-map-region').regionProtection=0x104,
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-map-preflight'),[row]=f.records.splice(at,1);f.records.splice(at+1,0,row);},
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-map-preflight');f.records.splice(at,1);},
  ]){const f=await runtimeFixture();change(f);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));}
});
test('activation, closure and endpoints cannot move to a different debug event or outside the selected auxiliary/cameras lineage',async()=>{
  for(const change of [
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-activation');f.records.splice(at,0,{type:'debug-event',event:1,pid:42,tid:7,ordinal:9999});},
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-activation'),[row]=f.records.splice(at,1);f.records.splice(at+1,0,row);},
    f=>runtimeSnapshot(f,'native-parent-rtti-call').observedDebugEventOrdinal=runtimeSnapshot(f,'native-control-after-auxiliary').observedDebugEventOrdinal,
    f=>f.records.find(r=>r.type==='parent-rtti-closed').callOpen=true,
  ]){const f=await runtimeFixture();change(f);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));}
});

const originalRtti='analysis/native-parent-rtti-stock-capture-v1-20261024';
test('closed original stock RTTI capture authenticates raw fifteen-snapshot lineage and rejects a rehashed swapped common ABI',{skip:!existsSync(`${originalRtti}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(originalRtti),configuration=JSON.parse(await readFile(`${originalRtti}/configuration.json`)),records=(await readFile(`${originalRtti}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse),pair=pairNativeControlSnapshots(capture,configuration).pairs[0],f={capture,configuration,records,pair};
  const result=verifyNativeParentRttiCaptureRecords(f);assert.equal(result.externalPairs,1);assert.equal(result.snapshots,15);assert.equal(result.logicalClock,288);assert.equal(result.outcomes[0].eax,result.mapIdentity.appAddress);
  const s=runtimeSnapshot(f,'native-parent-rtti-call');rewriteRange(f,s,'native-parent-rtti-context',b=>{const name=b.readUInt32LE(44);b.writeUInt32LE(1,44);b.writeUInt32LE(name,48);});assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));
});

test('graph opt-in only appends its bounded purpose policy and required capability; default and explicitfalse configurations are unchanged',async()=>{
  const old=(await fixture()).configuration,off=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph:false}),on=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph:true});
  assert.deepEqual(off.configuration,old);assert.equal(on.requiredHelperCapability,nativeParentRttiViewportMapGraphCapability);assert.equal(on.configuration.maxSnapshots,21);assert.equal(on.configuration.breakpoints.length,15);
  assert.deepEqual(on.configuration.parentRttiObservation.viewportMapGraph,{maxNodes:8,maxKeyBytes:256,breakpointIds:[...nativeParentRttiMapBreakpointIds]});
  const restored=structuredClone(on.configuration);delete restored.parentRttiObservation.viewportMapGraph;assert.deepEqual(restored,old);
  for(const mutate of [c=>c.parentRttiObservation.viewportMapGraph.maxNodes=9,c=>c.parentRttiObservation.viewportMapGraph.maxKeyBytes=257,c=>c.parentRttiObservation.viewportMapGraph.breakpointIds.pop(),c=>c.parentRttiObservation.viewportMapGraph.extraRoot=true]){const bad=structuredClone(on.configuration);mutate(bad);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(bad));}
  await assert.rejects(()=>createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph:1}),/boolean/);
});
test('constructed opt-in graph authenticates actual BFS nodes, inline/heap keys and empty HEAD at allthree original points without source admission',async()=>{
  for(const base of [0x400000,0x6e0000])for(const emptyGraph of [false,true]){
    const f=await runtimeFixture({viewportMapGraph:true,base,emptyGraph}),r=verifyNativeParentRttiCaptureRecords(f);assert.equal(r.viewportMapGraph.length,3);
    for(const graph of r.viewportMapGraph){assert.equal(graph.count,emptyGraph?0:3);assert.equal(graph.wholeGraphAdmittedToSource,false);if(!emptyGraph){assert.deepEqual(graph.nodes.map(n=>n.path),['root','root.left','root.right']);assert.deepEqual(graph.nodes.map(n=>Buffer.from(n.keyHex,'hex').toString()),['Player','1 Player','Really long viewport name']);assert.equal(graph.nodes[2].heapKey,true);assert.equal(graph.nodes[0].heapKey,false);}}
  }
});
test('graph reconstruction rejects cycles, wrong backlink, keycapacity/length/NUL, missingheap span and extraneous nodes independently of annotations',async()=>{
  for(const change of [
    (f,s,p)=>{rewriteRange(f,s,'parent-rtti-map-node-0',b=>b.writeUInt32LE(0x25000000));p.nodes[0].leftAddress=0x25000000;},
    (f,s,p)=>{rewriteRange(f,s,'parent-rtti-map-node-1',b=>b.writeUInt32LE(0x25000200,4));p.nodes[1].parentAddress=0x25000200;},
    (f,s,p)=>{rewriteRange(f,s,'parent-rtti-map-node-0',b=>b.writeUInt32LE(16,32));p.nodes[0].keyLength=16;},
    (f,s,p)=>rewriteRange(f,s,'parent-rtti-map-key-2',b=>b[b.length-1]=1),
    (f,s,p)=>rewriteRange(f,s,'parent-rtti-map-node-0',b=>b[12]=2),
    (f,s,p)=>s.ranges.delete('parent-rtti-map-key-2'),
    (f,s,p)=>{const row=s.ranges.get('parent-rtti-map-node-0');s.ranges.set('parent-rtti-map-node-8',{...row,id:'parent-rtti-map-node-8'});},
    (f,s,p)=>p.nodes[2].keyAddress++,
    (f,s,p)=>p.nodes.reverse(),
  ]){const f=await runtimeFixture({viewportMapGraph:true}),s=runtimeSnapshot(f,'native-control-before'),p=structuredClone(s.parentRttiViewportMapGraph);change(f,s,p);assert.throws(()=>verifyNativeParentRttiViewportMapGraph(s,p,{appAddress:f.APP,headAddress:f.HEAD}));}
});
test('graph markers/capability are opt-in and cannot be missing, moved beforepreflight, foreign-thread or substituted by a changedcount claim',async()=>{
  for(const change of [
    f=>f.capture.header.helperCapabilities.pop(),
    f=>delete f.configuration.parentRttiObservation.viewportMapGraph,
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-map-graph');f.records.splice(at,1);},
    f=>{const at=f.records.findIndex(r=>r.type==='parent-rtti-map-graph'),[p]=f.records.splice(at,1);f.records.splice(at-1,0,p);},
    f=>runtimeSnapshot(f,'native-control-before').parentRttiViewportMapGraph.tid++,
    f=>runtimeSnapshot(f,'native-control-before').parentRttiViewportMapGraph.count=4,
  ]){const f=await runtimeFixture({viewportMapGraph:true});change(f);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));}
});

test('mixed caller opt-in changes only its purpose/endwindow/dynamicranges and preserves both older default configurations',async()=>{
  for(const viewportMapGraph of [false,true]){
    const old=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph}),off=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph,weatherScreenQueries:false}),mixed=await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,viewportMapGraph,weatherScreenQueries:true});
    assert.deepEqual(old.configuration,off.configuration);assert.equal(mixed.requiredHelperCapability,nativeParentRttiWeatherCapability);assert.equal(mixed.configuration.parentRttiObservation.endBreakpointId,'native-control-after-world-effects');assert.equal(mixed.configuration.parentRttiObservation.weatherScreenQueries,true);assert.equal(mixed.configuration.breakpoints.length,15);assert.equal(mixed.configuration.maxSnapshots,21);
    for(const p of mixed.configuration.breakpoints.filter(p=>p.id.startsWith('native-parent-rtti-')))assert.deepEqual(p.ranges,[]);
    const restored=structuredClone(mixed.configuration);delete restored.parentRttiObservation.weatherScreenQueries;restored.parentRttiObservation.endBreakpointId='native-control-after-cameras';for(const p of restored.breakpoints.filter(p=>p.id.startsWith('native-parent-rtti-')))p.ranges=structuredClone(old.configuration.breakpoints.find(row=>row.id===p.id).ranges);assert.deepEqual(restored,old.configuration);
    for(const mutate of [c=>c.parentRttiObservation.weatherScreenQueries=false,c=>c.parentRttiObservation.endBreakpointId='native-control-after-cameras',c=>c.parentRttiObservation.maxPairs=5,c=>c.breakpoints.at(-1).ranges.push({id:'arbitrary',baseRegister:'esp',length:68})]){const bad=structuredClone(mixed.configuration);mutate(bad);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(bad));}
  }
  assert.deepEqual(nativeParentRttiWeatherObservationRanges().map(r=>[r.id,r.offset??0,r.length]),[['native-parent-rtti-context',0,68],['native-parent-rtti-clock',0,4],['native-parent-rtti-weather-query-return',84,4],['native-parent-rtti-weather-screen-return',416,4],['native-parent-rtti-weather-parent-return',440,4],['native-parent-rtti-weather-name',140,9]]);
});
test('constructed mixed camera then two weather calls authenticate their distinct depths/returns/outputpointers without assuming CRT outcomes',async()=>{
  for(const base of [0x400000,0x6e0000])for(const viewportMapGraph of [false,true])for(const pairs of [1,2]){
    const f=await runtimeFixture({base,viewportMapGraph,weatherScreenQueries:true,pairs,eax:0}),r=verifyNativeParentRttiCaptureRecords(f);assert.equal(r.snapshots,13+(pairs+2)*2);assert.equal(r.externalPairs,pairs+2);assert.deepEqual(r.outcomes.map(row=>row.family),[...Array(pairs).fill('camera'),'weather-screen','weather-screen']);assert.deepEqual(r.outcomes.filter(row=>row.family==='weather-screen').map(row=>row.weatherQueryIndex),[1,2]);assert.ok(r.outcomes.every(row=>row.eax===0));assert.equal(r.outcomes.at(-1).entryEsp,f.U-464);
  }
});
const weatherShot=f=>f.capture.snapshots.find(s=>s.parentRttiObservation?.family==='weather-screen'&&s.parentRttiObservation.role==='call');
function refreshProof(f,s,fn){const proof=f.records.find(row=>row.type==='parent-rtti-admitted'&&row.snapshotOrdinal===s.ordinal);fn(proof);s.parentRttiObservation=structuredClone(proof);f.records.find(row=>row.type==='snapshot'&&row.ordinal===s.ordinal).parentRttiObservation=structuredClone(proof);}
test('weather noMODE/padding/name and every caller/outputword are independently raw-validated, including the lastheight DWORD',async()=>{
  for(const [id,modify]of [
    ['native-parent-rtti-context',b=>b.writeUInt32LE(1,44)],
    ['native-parent-rtti-context',b=>b.writeUInt32LE(b.readUInt32LE(48)+1,48)],
    ['native-parent-rtti-context',b=>b.writeUInt32LE(b.readUInt32LE(52)+4,52)],
    ['native-parent-rtti-context',b=>b.writeUInt32LE(b.readUInt32LE(64)+4,64)],
    ['native-parent-rtti-weather-query-return',b=>b.writeUInt32LE(0x40ac9b)],
    ['native-parent-rtti-weather-screen-return',b=>b.writeUInt32LE(b.readUInt32LE()+1)],
    ['native-parent-rtti-weather-parent-return',b=>b.writeUInt32LE(b.readUInt32LE()-15)],
    ['native-parent-rtti-weather-name',b=>b[0]=49],
  ]){
    const f=await runtimeFixture({weatherScreenQueries:true}),s=weatherShot(f);rewriteRange(f,s,id,modify);
    refreshProof(f,s,p=>{const ids={'native-parent-rtti-context':'stackBytesHex','native-parent-rtti-weather-query-return':'queryReturnBytesHex','native-parent-rtti-weather-screen-return':'screenReturnBytesHex','native-parent-rtti-weather-parent-return':'parentReturnBytesHex','native-parent-rtti-weather-name':'nameBytesHex'};p[ids[id]]=s.ranges.get(id).bytes.toString('hex');});assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));
  }
});
test('mixed policy rejects missingsecondquery, changedfamily/earlyclosure, falsecapability and unprovedsame-main-window skips',async()=>{
  for(const change of [
    f=>f.capture.header.helperCapabilities.pop(),
    f=>refreshProof(f,weatherShot(f),p=>p.family='camera'),
    f=>refreshProof(f,weatherShot(f),p=>p.weatherQueryIndex=2),
    f=>{const s=weatherShot(f);s.ranges.delete('native-parent-rtti-weather-parent-return');},
    f=>{const s=weatherShot(f);s.ranges.get('native-parent-rtti-context').length=64;},
    f=>{const camera=runtimeSnapshot(f,'native-control-after-cameras');camera.parentRttiClosure=structuredClone(f.capture.snapshots.at(-1).parentRttiClosure);},
    f=>{const first=weatherShot(f),at=f.records.findIndex(row=>row.type==='snapshot'&&row.ordinal===first.ordinal);f.records.splice(at-1,0,{type:'parent-rtti-skipped',pid:42,tid:7,ownerMainTid:7,breakpointId:'native-parent-rtti-call',observedDebugEventOrdinal:first.observedDebugEventOrdinal,rawHit:2,reason:'different-derived-stack',matchingHitAdvanced:false,snapshotCountAdvanced:false,originalInstructionSkipped:false});},
  ]){const f=await runtimeFixture({weatherScreenQueries:true});change(f);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));}
  //A camera-only run cannot satisfy opt-in weather completion by copying the
  //old EAX or merely relabeling the final native parent checkpoint.
  const f=await runtimeFixture();f.configuration=(await createNativeParentRttiCaptureConfig('synthetic','never-launched-rtti',{...options,weatherScreenQueries:true})).configuration;f.capture.header.helperCapabilities.push(nativeParentRttiWeatherCapability);assert.throws(()=>verifyNativeParentRttiCaptureRecords(f));
});
