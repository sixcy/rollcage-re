import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativePickupEditorValidationConfig} from '../tools/prepare-native-pickup-editor-validation.mjs';
import {controlledRaceSettingsRanges} from '../tools/lib/native-controlled-race-settings.mjs';
import {verifyNativePickupEditorValidation,verifyNativePickupEditorConfiguration,verifyNativePickupEditorGraph,verifyNativePickupPlacement,verifyNativePickupEditorBoundaries,pickupValidationTargetSha256} from '../tools/check-native-pickup-editor-validation.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),word=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value);return b;};
const registerOffsets={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,esp:196};
const sites={'pickup-loader-entry':0x4c2b0,'pickup-init-entry':0x7b580,'pickup-init-return':0x319e6,'pickup-first-tick':0x7b680,'pickup-collection-before':0x7b8d0,'pickup-collection-after':0x7b8da,'pickup-respawn-before':0x7caf0,'pickup-respawn-after':0x7cc17};

// Constructed transport/ABI proof fixtures only. These are NOT native captures.
function fixture({count=2,quality='LOW',cycle=true,base=0x6e0000,phase=4}={}) {
  const resource=Buffer.alloc(0x200);resource.write('GFXM');resource.writeUInt32LE(0x140,0x90);resource[0x94]=count;resource[0xf7]=1;
  for(let i=0;i<count;i++){const p=0x140+i*12;resource.writeInt16LE(-200+i*10,p);resource.writeInt16LE(40+i,p+2);resource.writeInt16LE(-90-i,p+4);resource.writeUInt16LE(0x1234+i,p+8);resource[p+10]=2+i;}
  const configuration=createNativePickupEditorValidationConfig('unused-case',{kind:count===0?'zero':'baseline',quality,compiledData:resource,indexSha256:'1'.repeat(64),imageSha256:'2'.repeat(64)}),p=configuration.pickupEditorObservation;
  p.scenario=cycle&&count?'cycle':'load';p.targetIndex=count?0:-1;
  const owner={type:'owned-process',pid:42,tid:7},records=[owner],snapshots=[],hits=new Map();
  const address={data:0x11000000,pack:0x12000000,header:0x13000000,session:0x14000000,list:0x15000000,esp:0x16000000,config:0x17000000,arena:0x20000000,fs:0x21000000};
  const pickups=Array.from({length:count},(_,i)=>address.arena+0x200+i*0x200),controller=address.arena+0x3000,registryBefore=1;
  const family=Buffer.from(Array.from({length:20},(_,i)=>i%4)),local=Buffer.from(Array.from({length:20},(_,i)=>i%5)),stem=Buffer.alloc(260);stem.write(`${quality.toLowerCase()}\\lev1`);
  const descriptor=Buffer.alloc(8);descriptor.writeUInt16LE(address.fs&65535,2);descriptor[4]=address.fs>>>16&255;descriptor[7]=address.fs>>>24;
  const makeContext=(id,overrides={})=>{const bytes=Buffer.alloc(716);bytes.writeUInt32LE(0x53,144);for(const [key,offset]of Object.entries(registerOffsets))bytes.writeUInt32LE((overrides[key]??(key==='eip'?base+(sites[id]??0):key==='esp'?address.esp:0))>>>0,offset);return bytes;};
  const row=(id,at,bytes,source='pickup-editor-native-read')=>({id,address:at,moduleBaseAddress:base,length:bytes.length,bytes:Buffer.from(bytes),sha256:sha(bytes),source,...(source==='pickup-editor-native-read'?{emptyBecauseActualCountZero:bytes.length===0}:{})});
  const tls=()=>row('thread-seh-head',address.fs,word(0x1600ff00),'stopped-owned-thread-fs-zero');
  const environment={fsSelector:0x53,fsBase:address.fs,sehWord:0x1600ff00,descriptorHex:descriptor.toString('hex'),tid:7,contextSelectorOffset:144,source:'stopped-owned-thread-selector-query',selectorApi:'Wow64GetThreadSelectorEntry'};
  function snapshot(id,rows,proof,overrides={}) {
    const ordinal=snapshots.length+1,event=ordinal*10,context=makeContext(id,overrides),hit=(hits.get(id)??0)+1;hits.set(id,hit);
    records.push({type:'debug-event',ordinal:event,event:1,pid:42,tid:7});
    const s={type:'snapshot',ordinal,breakpointId:id,hit,tid:7,observedDebugEventOrdinal:event,context,contextSha256:sha(context),ranges:new Map(rows.map(r=>[r.id,r])),registers:Object.fromEntries(Object.entries(registerOffsets).map(([key,at])=>[key,context.readUInt32LE(at)]))};
    if(proof){s.rawHit=hit;s.capturePhase='pickup-editor-read-only-before-original-instruction';s.threadEnvironment=environment;s.ranges.set('thread-seh-head',tls());s.pickupEditorObservation={type:'pickup-editor-observation',kind:id,sceneName:p.sceneName,expectedResourceSha256:p.resourceSha256,wholeLoadedResourceHashObserved:false,nativeOutputsWritten:false,snapshotOrdinal:ordinal,observedDebugEventOrdinal:event,pid:42,tid:7,rawHit:hit,beforeOriginalInstruction:true,...proof};records.push(s.pickupEditorObservation);}
    const raw={...s,ranges:[...s.ranges.values()].map(({bytes,...r})=>r)};delete raw.context;records.push(raw);snapshots.push(s);return s;
  }
  for(const point of configuration.breakpoints.slice(0,3)){
    const rows=point.id==='launcher-policy'?[row('launcher-skip',base+0x2e66ec,word(0)),row('launcher-config',address.config+0x42c,Buffer.alloc(10))]:point.id==='graphics-policy'?[row('graphics-mode',0x24000024,Buffer.alloc(28))]:[row('presentation',0x25000378,Buffer.alloc(56)),row('entry-stack',address.esp,Buffer.alloc(32))];
    snapshot(point.id,rows,undefined,point.id==='before-device-creation'?{ecx:0x25000000}:{});
    const action=configuration.phaseActions.find(a=>a.breakpointId===point.id);
    for(const [i,w]of action.writes.entries()){
      const at=point.id==='launcher-policy'?(i===0?base+0x2e66ec:address.config+Number(w.offset)):point.id==='graphics-policy'?0x24000000+Number(w.offset):0x25000000+Number(w.offset);
      records.push({type:'intervention',breakpointId:point.id,hit:1,address:at,originalBytesHex:w.expectedBytesHex??w.expectedAnyBytesHex[0],replacementBytesHex:w.bytesHex,acceptedOriginalBytesHex:w.expectedAnyBytesHex??[w.expectedBytesHex]});
    }
  }
  const config=Buffer.alloc(128);config[0x15]=10;config[0x31]=1;
  const settingsContext=makeContext('controlled-race-settings',{eip:base+0x3e0c5,eax:11,ecx:11}),stack=Buffer.alloc(28);stack.writeUInt32LE(10,16);stack.writeUInt32LE(base+0x3dae8,20);stack.writeUInt32LE(3,24);
  const frontend=[word(4),word(0),Buffer.concat([word(1),word(918)]),word(12345)];frontend[2].copy(stem,0x68);
  const inputData=[word(address.config),word(address.session),config,Buffer.alloc(48),Buffer.alloc(0xd3),stack,family,local,stem,...frontend];
  const settingsRows=controlledRaceSettingsRanges().map((d,i)=>row(d.id,d.baseRegister?address.esp:d.dereferenceOffsets?(d.rva==='0x1ecefc'?address.config:address.session)+Number(d.offset??0):base+Number(d.rva),inputData[i],'structured-native-range'));
  const settings=snapshot('controlled-race-settings',settingsRows,undefined,{eip:base+0x3e0c5,eax:11,ecx:11});settings.threadEnvironment=environment;settings.ranges.set('thread-seh-head',tls());settings.capturePhase='before-declared-writes-before-original-instruction';
  Object.assign(records.at(-1),{threadEnvironment:environment,capturePhase:settings.capturePhase,ranges:[...settings.ranges.values()].map(({bytes,...r})=>r)});
  assert.deepEqual(settings.context,settingsContext);
  const common={pid:42,tid:7,snapshotOrdinal:4,observedDebugEventOrdinal:40},pointer=word(base+0x1ecefc),guard={...common,type:'controlled-race-settings-guarded',ownerMainTid:7,breakpointId:'controlled-race-settings',rawHit:1,configurationAddress:address.config,sessionAddress:address.session,stackAddress:address.esp,stackBytesHex:stack.toString('hex'),configurationBeforeHex:config.toString('hex'),contextSha256:settings.contextSha256,allGuardsBeforeWrites:true,beforeOriginalInstruction:true,instructionAddress:base+0x3e0c5,breakpointInstructionHex:`cc${pointer.toString('hex')}`,restoredInstructionHex:`a1${pointer.toString('hex')}`};
  records.push(guard);const replacement=Buffer.from(config);replacement[0xb]=1;replacement[0x31]=p.quality;
  for(const[i,offset]of [0xb,0x31].entries())records.push({...common,type:'controlled-race-settings-input-write',index:i+1,address:address.config+offset,length:1,originalBytesHex:config.subarray(offset,offset+1).toString('hex'),replacementBytesHex:replacement.subarray(offset,offset+1).toString('hex')});
  records.push({...guard,type:'controlled-race-settings-intervention',level:1,quality:p.quality,configurationAfterHex:replacement.toString('hex'),contextUnchanged:true,allOtherCapturedBytesUnchanged:true,rootsUnchanged:true,nativeOutputsWritten:false});
  records.push({...common,type:'pickup-editor-observers-activated',guardedSettingsCompleted:true,beforeOriginalInstruction:true,installed:Object.entries(sites).map(([id,rva])=>({id,address:base+rva,patchBytesHex:'cc',originalBytesHex:'8b'}))});
  function graph({bodies=true,stateIndex=-1,state=0,controllerIndex=0}={}) {
    const roots=Buffer.alloc(0x24);roots.writeUInt32LE(address.data);roots.writeUInt32LE(address.pack,0x1c);roots.writeUInt32LE(address.header,0x20);
    const header=Buffer.from(resource.subarray(0,0x120)),pack=Buffer.alloc(0xa0);header.writeUInt32LE(address.data+p.authoredOffset,0x90);pack[0x36]=count;pack.writeUInt32LE(address.data+p.authoredOffset,0x68);
    const sessionHeader=Buffer.alloc(0x40),runtime=Buffer.alloc(0x53b);sessionHeader[0xe]=family[0];sessionHeader[0xf]=local[0];runtime[4]=3;runtime[0xa86-0x54d]=1;runtime.writeUInt32LE(phase,0x57c-0x54d);
    const registryCount=bodies?registryBefore+count+1:registryBefore,registry=Buffer.alloc(registryCount*4);registry.writeUInt32LE(address.arena);
    if(bodies){pickups.forEach((at,i)=>registry.writeUInt32LE(at,(i+1)*4));registry.writeUInt32LE(controller,(count+1)*4);}
    const queue=Buffer.alloc(26);queue.fill(255,0,24);
    const data=[['pickup-module-roots',base+0x50b970,roots],['pickup-scene-header',address.header,header],['pickup-pack-header',address.pack,pack],['pickup-authored-root',base+0x5092a8,word(address.data+p.authoredOffset)],['pickup-authored',address.data+p.authoredOffset,resource.subarray(p.authoredOffset,p.authoredOffset+count*12)],['pickup-session-root',base+0x1ecb1c,word(address.session)],['pickup-session-header',address.session,sessionHeader],['pickup-session-runtime',address.session+0x54d,runtime],['pickup-clock',base+0x50a548,word(100)],['pickup-global-list',base+0x502020,Buffer.concat([word(address.list),word(count)])],['pickup-registry-count',base+0x2e6b44,word(registryCount)],['pickup-registry',base+0x30e200,registry],['pickup-arena-root',base+0x502eec,word(address.arena)],['pickup-arena-used',base+0x30dcf4,word(0x4000)],['pickup-controller-table',base+0x51d480,word(controller)],['pickup-pending-queue',base+0x51d498,queue],['settings-track-family',base+0x174760,family],['settings-track-local',base+0x17477c,local],['settings-level-stem',base+0x2e6660,stem]];
    if(bodies){
      data.push(['pickup-pointer-list',address.list,Buffer.concat(pickups.map(word))]);
      for(let i=0;i<count;i++){const b=Buffer.alloc(0x190),auth=resource.subarray(p.authoredOffset+i*12,p.authoredOffset+i*12+12);b.writeUInt32LE(10);b.writeUInt16LE(i+1,0x10e);b.writeUInt32LE(0x24000000,0xc);b.writeUInt32LE(stateIndex===i?state:0x83000c,0x180);b.writeUInt16LE(auth[10],0x18c);b.writeUInt16LE(auth.readUInt16LE(8),0x18e);for(let axis=0;axis<3;axis++)b.writeInt32LE(auth.readInt16LE(axis*2)*65536,0x34+axis*4);data.push([`pickup-body-${i}`,pickups[i],b]);}
      const ctl=Buffer.alloc(0x18c);ctl.writeUInt32LE(26);ctl.writeUInt16LE(count+1,0x10e);ctl.writeInt16LE(controllerIndex,0x186);data.push(['pickup-controller-0',controller,ctl]);
    }
    return data.map(([id,at,bytes])=>row(id,at,bytes));
  }
  const caller=returnRva=>row('pickup-entry-caller',address.esp,Buffer.concat([word(base+returnRva),word(0)]));
  snapshot('pickup-loader-entry',[row('pickup-loader-name',address.data,Buffer.from(`${quality}/LEV1\0`),'native-loader-cstring'),row('pickup-loader-caller',address.esp,Buffer.alloc(8))],{loaderName:`${quality}/LEV1`,loaderNameAddress:address.data},{ecx:address.data});
  snapshot('pickup-init-entry',[...graph({bodies:false}),caller(0x7ecef)],{registryBefore,pickupOption:1,nativeMode:3});
  snapshot('pickup-init-return',[...graph(),caller(0x7ecef)],{registryBefore,registryAfter:registryBefore+count+1,count});
  snapshot('pickup-first-tick',graph(),{registryAfterFullStartup:registryBefore+count+1,count});
  const placements=Array(16).fill(0),collections=Array(16).fill(0);
  const placement=(index,generation)=>{
    const proof={pickupIndex:index,pickupAddress:pickups[index],controllerAddress:controller,collectionGeneration:generation};
    snapshot('pickup-respawn-before',[...graph({controllerIndex:index}),caller(0x31c96)],proof,{ecx:controller});
    placements[index]++;snapshot('pickup-respawn-after',[...graph({controllerIndex:index}),caller(0x31c96)],{...proof,placementCount:placements[index],fullNativeFinalizerBeforeRet:true});
  };
  for(let i=0;i<count;i++)placement(i,0);
  if(p.scenario==='cycle'){
    const record=base+0x509300,car=address.arena+0x3800,recordBytes=Buffer.alloc(0x30c),body=Buffer.alloc(0x6b8);recordBytes.writeUInt32LE(car);body.writeUInt32LE(3);
    snapshot('pickup-collection-before',[...graph(),row('pickup-collector-record',record,recordBytes),row('pickup-collector-body',car,body)],{pickupIndex:0,pickupAddress:pickups[0],collectorRecord:record,nativeStateBefore:0x83000c},{ebp:pickups[0],esi:record});
    collections[0]++;snapshot('pickup-collection-after',graph({stateIndex:0,state:0x820064}),{pickupIndex:0,pickupAddress:pickups[0],collectorRecord:record,collectionGeneration:1,weightedAwardHasNotYetExecuted:true},{ebp:pickups[0],esi:record});placement(0,1);
  }
  const completedFinalizers=placements.reduce((sum,n)=>sum+n,0),complete={type:'complete',reason:'pickup-editor-validation-bound',events:1000,snapshots:snapshots.length,pickupEditorObservation:{scenario:p.scenario,sceneName:p.sceneName,targetIndex:p.targetIndex,placements,collections,completedTargetGeneration:p.scenario==='cycle'?1:0,actualRegistryBefore:registryBefore,fullNativeFinalizerObserved:completedFinalizers>0,completedFinalizers,nativeOutputsWritten:false,physicsGoalResumed:false}};
  records.push(complete,{type:'owned-process-cleanup',pid:42,terminated:true});
  const header={type:'capture',schemaVersion:1,executableSha256:pickupValidationTargetSha256,ancestorSha256:'a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9',helperSourceSha256:'3'.repeat(64),purpose:'pickup-editor-original-validation',helperCapabilities:['pickup-editor-original-archive-validation-v1'],maxDurationMs:90000,maxEvents:1000000,maxSnapshots:80,pickupExpected:Object.fromEntries(['sceneName','resourceSha256','indexSha256','imageSha256','scenario','targetIndex'].map(key=>[key,p[key]]))};
  return {capture:{header,complete,snapshots},configuration,records,p,graph:()=>graph()};
}

const selected=(f,id)=>f.capture.snapshots.find(row=>row.breakpointId===id);
const mutateRange=(s,id,fn)=>{const r=s.ranges.get(id);fn(r.bytes);r.sha256=sha(r.bytes);};
test('constructed LOW/HIGH and preferred/ASLR transport proves all authored placements and an actual-state collection/respawn sequence',()=>{
  for(const base of [0x400000,0x6e0000])for(const quality of ['LOW','HIGH']){const result=verifyNativePickupEditorValidation(fixture({base,quality}));assert.equal(result.matched,true);assert.deepEqual(result.placements,[2,1]);assert.deepEqual(result.collections,[1,0]);assert.equal(result.completedTargetGeneration,1);assert.equal(result.wholeLoadedResourceHashObserved,false);}
});
test('constructed zero-count and load-only cases retain independent controller/registry proof without invented zero-byte memory grants',()=>{
  for(const count of [0,2]){const f=fixture({count,cycle:false}),result=verifyNativePickupEditorValidation(f);assert.equal(result.matched,true);assert.deepEqual(result.placements,Array(count).fill(1));assert.equal(result.completedTargetGeneration,0);}
});
test('constructed maximum16 case proves every initial placement and target later respawn within80 snapshots',()=>{
  const result=verifyNativePickupEditorValidation(fixture({count:16}));assert.equal(result.authoredBytes,192);assert.deepEqual(result.placements,[2,...Array(15).fill(1)]);assert.equal(result.snapshots,44);
});
test('scheduled pickup tick/finalizers during native countdown are valid before phase4; only typed startup path writes are allowed',()=>{
  const f=fixture({phase:2});assert.equal(verifyNativePickupEditorValidation(f).matched,true);
  const at=f.records.findIndex(row=>row.type==='snapshot'&&row.ordinal===1)+1,write={type:'service-memory-write',api:'SHGetFolderPathA',address:0x16001000,replacementBytesHex:Buffer.from(f.configuration.redirectedDocumentsPath+'\0').toString('hex')};write.originalBytesHex='00'.repeat(write.replacementBytesHex.length/2);f.records.splice(at,0,write);
  assert.equal(verifyNativePickupEditorValidation(f).matched,true);
  for(const change of [r=>r.api='arbitrary-game-answer',r=>r.replacementBytesHex='00000000']){const bad=structuredClone(write);change(bad);f.records[at]=bad;assert.throws(()=>verifyNativePickupEditorValidation(f));}
});
test('exact policy rejects extra pose/service writes, changed bounds, site ordering and inconsistent authored pins',()=>{
  const changes=[x=>x.breakpoints.push({id:'pose',rva:'0x509300',ranges:[]}),x=>x.phaseActions.push({breakpointId:'pickup-first-tick',writes:[]}),x=>x.maxSnapshots++,x=>x.pickupEditorObservation.expectedCount=17,x=>x.pickupEditorObservation.authoredHex='00',x=>x.pickupEditorObservation.authoredOffset=0xffffffff,x=>x.pickupEditorObservation.headerIdentityHex='00',x=>x.heldForceInput={},x=>x.breakpoints[4].service={}];
  for(const change of changes){const f=fixture();change(f.configuration);assert.throws(()=>verifyNativePickupEditorConfiguration(f.configuration));}
});
test('graph verifies live root/table offset, all128-aligned bodies and exact registry backlinks independently of annotations',()=>{
  const changes=[s=>mutateRange(s,'pickup-authored-root',b=>b.writeUInt32LE(b.readUInt32LE()+12)),s=>mutateRange(s,'pickup-scene-header',b=>b[0]^=1),s=>mutateRange(s,'pickup-authored',b=>b[0]^=1),s=>mutateRange(s,'pickup-pack-header',b=>b[0x36]++),s=>mutateRange(s,'pickup-global-list',b=>b.writeUInt32LE(1,4)),s=>mutateRange(s,'pickup-body-0',b=>b.writeUInt32LE(26)),s=>mutateRange(s,'pickup-body-0',b=>b.writeUInt16LE(511,0x10e)),s=>mutateRange(s,'pickup-registry',b=>b.writeUInt32LE(0,4)),s=>mutateRange(s,'pickup-arena-used',b=>b.writeUInt32LE(128)),s=>s.ranges.get('pickup-pointer-list').address++];
  for(const change of changes){const f=fixture(),s=selected(f,'pickup-init-return');change(s);assert.throws(()=>verifyNativePickupEditorGraph(s,f.p));}
});
test('actual requested allocation bounds and all24 pending queue indices are enforced, including zero authored count',()=>{
  for(const [id,fn]of [['pickup-arena-used',b=>b.writeUInt32LE(4480000)],['pickup-pending-queue',b=>b.writeUInt16LE(25,24)],['pickup-pending-queue',b=>b[23]=2],['pickup-pending-queue',b=>b.writeUInt16LE(1,24)]]){const f=fixture(),s=selected(f,'pickup-init-return');mutateRange(s,id,fn);assert.throws(()=>verifyNativePickupEditorGraph(s,f.p));}
  const zero=fixture({count:0}),s=selected(zero,'pickup-first-tick');mutateRange(s,'pickup-pending-queue',b=>b[0]=0);assert.throws(()=>verifyNativePickupEditorGraph(s,zero.p));
  const f=fixture(),a=selected(f,'pickup-init-return'),result=verifyNativePickupEditorGraph(a,f.p);assert.equal(result.requestedBytes,4480000);assert.equal(result.alignmentPadding,127);assert.equal(result.allocationBound,'conservative-worst-case-127-byte-alignment');
  mutateRange(a,'pickup-arena-used',b=>b.writeUInt32LE(4480000-64));assert.throws(()=>verifyNativePickupEditorGraph(a,f.p));
  const bytes=word(result.arena-64);a.ranges.set('pickup-arena-allocation-root',{id:'pickup-arena-allocation-root',address:result.base+0x2e6b40,moduleBaseAddress:result.base,length:4,bytes,sha256:sha(bytes),source:'pickup-editor-native-read',emptyBecauseActualCountZero:false});
  assert.equal(verifyNativePickupEditorGraph(a,f.p).alignmentPadding,64);
});
test('zero-count constructor entry permits inactive zero BSS queue bytes, while actual pending entries and initialized queue remain strict',()=>{
  const f=fixture({count:0,cycle:false}),entry=selected(f,'pickup-init-entry');mutateRange(entry,'pickup-pending-queue',b=>b.fill(0));
  assert.equal(verifyNativePickupEditorValidation(f).matched,true);
  mutateRange(entry,'pickup-pending-queue',b=>b.writeUInt16LE(1,24));assert.throws(()=>verifyNativePickupEditorGraph(entry,f.p,{bodies:false}));
  const bad=fixture({count:0,cycle:false});mutateRange(selected(bad,'pickup-init-return'),'pickup-pending-queue',b=>b.fill(0));assert.throws(()=>verifyNativePickupEditorValidation(bad));
});
test('provenance rejects foreign threads, early/moved markers, false activation, raw-context disagreement, missing capability and failed cleanup',()=>{
  const changes=[f=>selected(f,'pickup-first-tick').tid++,f=>f.capture.header.helperCapabilities=[],f=>f.records.find(r=>r.type==='pickup-editor-observers-activated').installed[0].address++,f=>selected(f,'pickup-first-tick').registers.eip++,f=>selected(f,'pickup-first-tick').pickupEditorObservation.nativeOutputsWritten=true,f=>f.records.find(r=>r.type==='controlled-race-settings-input-write').address++,f=>f.records.find(r=>r.type==='owned-process-cleanup').terminated=false,f=>f.records.splice(f.records.findIndex(r=>r.type==='snapshot'&&r.breakpointId==='pickup-first-tick'),0,{type:'debug-event',ordinal:9999,event:1,pid:42,tid:7}),f=>f.capture.complete.pickupEditorObservation.placements[0]++,f=>f.records.find(r=>r.type==='debug-event'&&r.ordinal===80).pid++];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>verifyNativePickupEditorValidation(f));}
});
test('corrupt collection state or full-return XYZ/spatial/template fails despite intact marker claims and hashes',()=>{
  for(const [id,bodyId,offset]of [['pickup-collection-after','pickup-body-0',0x180],['pickup-respawn-after','pickup-body-0',0x34],['pickup-respawn-after','pickup-body-0',0x18e],['pickup-respawn-after','pickup-body-0',0xc]]){
    const f=fixture(),s=selected(f,id);mutateRange(s,bodyId,b=>offset===0xc?b.writeUInt32LE(0,offset):b[offset]^=1);assert.throws(()=>verifyNativePickupEditorValidation(f));
  }
  const f=fixture(),s=selected(f,'pickup-respawn-after'),body=s.ranges.get('pickup-body-0').bytes,auth=Buffer.from(f.p.authoredHex,'hex').subarray(0,12);verifyNativePickupPlacement(body,auth);
  body.writeInt32LE(0x7fffffff,0x34);assert.throws(()=>verifyNativePickupPlacement(body,auth));
});
test('collection/finalizer guards are retained original instructions of the declared target, not helper-only expected states',async()=>{
  const proof=await verifyNativePickupEditorBoundaries();assert.equal(proof.targetSha256,pickupValidationTargetSha256);assert.equal(proof.evidenceIds.length,4);
  const e=await readInstructionEvidence(['3209-stage-child-47b680-assembly.json','3247-pickup-finalize-assembly.json','3287-pickup-controller-construction-assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok(e.evidence.every(row=>row.subject.digest.sha256===pickupValidationTargetSha256));const m=new Map(e.instructions.map(row=>[row.address,row]));
  for(const [at,op]of [[0x47b8d0,'MOV'],[0x47b8da,'CALL'],[0x47caf0,'SUB'],[0x47cc17,'RET'],[0x4319e6,'RET']])assert.equal(m.get(at)?.op,op,at.toString(16));
  assert.deepEqual(m.get(0x47b8d0).args,['dword ptr [EBP + 0x180]','0x820064']);assert.deepEqual(m.get(0x47b8da).args,['0x0047b920']);
});
