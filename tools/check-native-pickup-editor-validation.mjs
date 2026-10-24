// Read-only independent acceptance of dedicated original-process pickup evidence.
// No native execution, source simulation, or native-after inputs are used here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './lib/native-frame-sound.mjs';
import {controlledRaceSettingsBreakpoint,verifyControlledRaceSettingsSnapshot} from './lib/native-controlled-race-settings.mjs';
import {createReduxCaptureConfig} from './lib/redux-capture-config.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parsePickupPlacements} from '../src/pickup-editor.mjs';

export const pickupValidationTargetSha256='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const ancestor='a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9';
const capability='pickup-editor-original-archive-validation-v1';
const sites=Object.freeze([['pickup-loader-entry',0x4c2b0],['pickup-init-entry',0x7b580],['pickup-init-return',0x319e6],['pickup-first-tick',0x7b680],['pickup-collection-before',0x7b8d0],['pickup-collection-after',0x7b8da],['pickup-respawn-before',0x7caf0],['pickup-respawn-after',0x7cc17]]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const u32=(value,label='address')=>{const n=Number(value);assert.ok((typeof value==='number'||typeof value==='string'&&/^(0x[0-9a-f]+|[0-9]+)$/i.test(value))&&Number.isInteger(n)&&n>=0&&n<=0xffffffff,`Invalid ${label}`);return n;};
const equal=(a,b,message)=>assert.deepEqual(a,b,message);
const registers={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,esp:196};
const headerIdentity=bytes=>Buffer.concat([[0,20],[0x2c,4],[0x64,4],[0x78,4],[0x94,4],[0xf4,4]].map(([a,n])=>bytes.subarray(a,a+n)));
const cstring=bytes=>{const end=bytes.indexOf(0);assert.ok(end>=0,'Missing native string terminator');return bytes.subarray(0,end).toString('ascii');};

export function verifyNativePickupEditorConfiguration(configuration) {
  const p=configuration.pickupEditorObservation,base=createReduxCaptureConfig('unused-policy','hidden-idle','unused-output');
  assert.ok(p&&configuration.captureThreadEnvironment===true&&configuration.maxDurationMs===90000&&configuration.maxEvents===1000000&&configuration.maxSnapshots===80,'Dedicated fixed capture bounds');
  const settings=configuration.controlledRaceSettings;
  equal(settings,{breakpointId:'controlled-race-settings',level:p.frontendLevel,quality:p.quality,expectedTrackByte:0,expectedQualityByte:1},'Only declared frontend level/quality inputs');
  assert.ok(Number.isInteger(p.level)&&p.level>=1&&p.level<=20&&![15,16,17].includes(p.level)&&Number.isInteger(p.frontendLevel)&&p.frontendLevel>=1&&p.frontendLevel<=20&&[0,1].includes(p.quality));
  assert.ok(Number.isInteger(p.expectedCount)&&p.expectedCount>=0&&p.expectedCount<=16&&Number.isInteger(p.expectedControllerCount)&&p.expectedControllerCount>=1&&p.expectedControllerCount<=6,'Native bounded counts');
  assert.ok(['load','cycle'].includes(p.scenario)&&Number.isInteger(p.targetIndex)&&p.targetIndex>=-1&&p.targetIndex<p.expectedCount&&(p.scenario!=='cycle'||p.targetIndex>=0),'Target collection policy');
  assert.equal(p.sceneName,`${p.quality?'HIGH':'LOW'}/LEV${p.level}.BLP`);
  assert.ok(Number.isInteger(p.resourceBytes)&&p.resourceBytes>=0x120&&p.resourceBytes<=128*1024*1024&&Number.isInteger(p.authoredOffset)&&p.authoredOffset>=0&&(!p.expectedCount||p.authoredOffset>=0x98)&&p.authoredOffset+p.expectedCount*12<=p.resourceBytes);
  assert.match(p.authoredHex,new RegExp(`^[0-9a-f]{${p.expectedCount*24}}$`));assert.equal(sha(Buffer.from(p.authoredHex,'hex')),p.authoredSha256);assert.match(p.headerIdentityHex,/^[0-9a-f]{80}$/);
  for(const id of ['resourceSha256','indexSha256','imageSha256'])assert.match(p[id],/^[0-9a-f]{64}$/);
  equal(configuration.breakpoints,[...base.breakpoints.slice(0,3),controlledRaceSettingsBreakpoint(),...sites.map(([id,rva])=>({id,rva:`0x${rva.toString(16)}`,ranges:[]}))],'Exact startup/settings/eight observational site whitelist');
  equal(configuration.phaseActions,base.phaseActions,'Only original reviewed startup actions');
  const allowed=new Set([...Object.keys(base),'pickupEditorObservation','controlledRaceSettings','captureThreadEnvironment']);
  for(const key of Object.keys(configuration))assert.ok(allowed.has(key),`Unexpected capture policy ${key}`);
  for(const key of Object.keys(base))if(!['executablePath','workingDirectory','outputDirectory','redirectedDocumentsPath','redirectedShellFolderPath','temporaryDirectory','breakpoints','ranges','maxDurationMs','maxEvents','maxSnapshots','captureThreadEnvironment'].includes(key))equal(configuration[key],base[key],`Reviewed startup policy ${key}`);
  equal(configuration.ranges,[]);assert.equal(configuration.expectedSha256,pickupValidationTargetSha256);
  return p;
}

export async function verifyNativePickupEditorBoundaries() {
  const e=await readInstructionEvidence(['3209-stage-child-47b680-assembly.json','3247-pickup-finalize-assembly.json','3285-pickup-construction-assembly.json','3287-pickup-controller-construction-assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok(e.evidence.every(row=>row.subject?.digest?.sha256===pickupValidationTargetSha256),'Retained native target identity');
  const m=new Map(e.instructions.map(row=>[row.address,row]));
  for(const [at,op]of [[0x47b580,'SUB'],[0x47b680,'SUB'],[0x47b8d0,'MOV'],[0x47b8da,'CALL'],[0x47caf0,'SUB'],[0x47cc17,'RET'],[0x4319e6,'RET']])assert.equal(m.get(at)?.op,op,`Native boundary ${at.toString(16)}`);
  equal(m.get(0x47b8d0).args,['dword ptr [EBP + 0x180]','0x820064']);equal(m.get(0x47b8da).args,['0x0047b920']);
  return {targetSha256:pickupValidationTargetSha256,evidenceIds:e.evidence.map(row=>row.evidence_id)};
}

function snapshotBase(snapshot) {
  const bases=[...new Set([...snapshot.ranges.values()].flatMap(row=>row.moduleBaseAddress===undefined?[]:[u32(row.moduleBaseAddress)]))];
  assert.equal(bases.length,1,'One actual module base');assert.ok(bases[0]>0&&bases[0]+0x51d498+26<=0x100000000);return bases[0];
}
function range(snapshot,id,address,length) {
  const row=snapshot.ranges.get(id);assert.ok(row,`Missing ${id}`);
  assert.equal(u32(row.address),address,`${id} pointer identity`);assert.equal(row.length,length,`${id} exact extent`);
  assert.ok(Buffer.isBuffer(row.bytes)&&row.bytes.length===length&&row.sha256===sha(row.bytes),`${id} actual blob identity`);
  assert.ok(address+length<=0x100000000&&length<=32768&&(length===0||address>0),`${id} bounded address`);
  assert.equal(row.source,id==='pickup-loader-name'?'native-loader-cstring':'pickup-editor-native-read');
  if(id!=='pickup-loader-name')assert.equal(row.emptyBecauseActualCountZero,length===0);
  return row.bytes;
}

//47b580/47caf0 consumers, not speculative constructor capacities. Actual arena
//used bytes and the512 registration slots constrain every body/backlink.
export function verifyNativePickupEditorGraph(snapshot,p,{bodies=true}={}) {
  const base=snapshotBase(snapshot),read=(id,address,length)=>range(snapshot,id,address,length),word=(id,address)=>read(id,address,4).readUInt32LE();
  const roots=read('pickup-module-roots',base+0x50b970,0x24),dataBase=roots.readUInt32LE(),pack=roots.readUInt32LE(0x1c),headerAddress=roots.readUInt32LE(0x20);
  const header=read('pickup-scene-header',headerAddress,0x120),packHeader=read('pickup-pack-header',pack,0xa0);
  assert.equal(headerIdentity(header).toString('hex'),p.headerIdentityHex,'Native40B immutable header identity');
  equal([header[0x94],packHeader[0x36],header[0xf7]],[p.expectedCount,p.expectedCount,p.expectedControllerCount]);
  const authored=word('pickup-authored-root',base+0x5092a8);
  assert.ok(dataBase+p.authoredOffset<=0xffffffff);equal([authored,header.readUInt32LE(0x90),packHeader.readUInt32LE(0x68)],[dataBase+p.authoredOffset,dataBase+p.authoredOffset,dataBase+p.authoredOffset],'Exact loaded offset→three live authored pointers');
  const table=read('pickup-authored',authored,p.expectedCount*12);assert.equal(table.toString('hex'),p.authoredHex,'All original authored12N bytes');
  const session=word('pickup-session-root',base+0x1ecb1c),sessionHeader=read('pickup-session-header',session,0x40),runtime=read('pickup-session-runtime',session+0x54d,0x53b);
  const family=read('settings-track-family',base+0x174760,20),local=read('settings-track-local',base+0x17477c,20),stem=read('settings-level-stem',base+0x2e6660,260);
  equal([runtime[0x579-0x54d],sessionHeader[0xe],sessionHeader[0xf]],[p.frontendLevel-1,family[p.frontendLevel-1],local[p.frontendLevel-1]],'Actual correlated frontend outputs');
  assert.equal(cstring(stem).replaceAll('\\','/').toUpperCase(),p.sceneName.replace(/\.BLP$/,''));
  const clock=word('pickup-clock',base+0x50a548),globalList=read('pickup-global-list',base+0x502020,8),list=globalList.readUInt32LE();
  const registryCount=word('pickup-registry-count',base+0x2e6b44);assert.ok(registryCount<=512);
  const registry=read('pickup-registry',base+0x30e200,registryCount*4),arena=word('pickup-arena-root',base+0x502eec),used=word('pickup-arena-used',base+0x30dcf4);
  assert.ok(arena>0&&arena%128===0&&arena+used<=0x100000000,'Actual aligned used arena span');
  const requestedBytes=(header.readInt16LE(0x11e)+140000)*32;
  let alignmentPadding=127,allocationBound='conservative-worst-case-127-byte-alignment';
  if(snapshot.ranges.has('pickup-arena-allocation-root')){
    const raw=word('pickup-arena-allocation-root',base+0x2e6b40);assert.ok(raw>0&&raw<=arena&&arena-raw<=127&&Math.ceil(raw/128)*128===arena,'Original474160 raw allocation/alignment identity');
    alignmentPadding=arena-raw;allocationBound='observed-original-raw-allocation-and-alignment';
  }
  assert.ok(used<=requestedBytes-alignmentPadding,'Used bytes fit original474160 requested allocation after alignment');
  const controllerTable=read('pickup-controller-table',base+0x51d480,p.expectedControllerCount*4),queue=read('pickup-pending-queue',base+0x51d498,26),pickupBodies=[],controllers=[];
  const pendingCount=queue.readUInt16LE(24);assert.ok(pendingCount<=24,'Original24-byte pending index domain');
  //Before47b580 initializes the queue, inactive BSS bytes carry no index
  //meaning. Active entries remain bounded; initialized snapshots additionally
  //require every inactive byte to be an authored residue or theFF sentinel.
  for(let i=0;i<(bodies?24:pendingCount);i++)assert.ok((i>=pendingCount&&queue[i]===255)||queue[i]<p.expectedCount,`Pending queue index ${i} is authored or inactiveFF`);
  const body=(id,address,length,type)=>{
    const bytes=read(id,address,length),index=bytes.readUInt16LE(0x10e);
    assert.equal(bytes.readUInt32LE()&511,type,`${id} native type`);assert.ok(address>=arena&&(address-arena)%128===0&&address+length<=arena+used,`${id} actual arena membership`);
    assert.ok(index<registryCount&&registry.readUInt32LE(index*4)===address,`${id} registration backlink`);return {address,bytes,index};
  };
  if(bodies){
    assert.equal(globalList.readUInt32LE(4),p.expectedCount,'Constructed native count');
    const pointers=read('pickup-pointer-list',list,p.expectedCount*4);
    for(let i=0;i<p.expectedCount;i++)pickupBodies.push(body(`pickup-body-${i}`,pointers.readUInt32LE(i*4),0x190,10));
    for(let i=0;i<p.expectedControllerCount;i++)controllers.push(body(`pickup-controller-${i}`,controllerTable.readUInt32LE(i*4),0x18c,26));
    assert.equal(new Set([...pickupBodies,...controllers].map(row=>row.address)).size,p.expectedCount+p.expectedControllerCount,'Distinct registered pickups/controllers');
  }
  return {base,dataBase,pack,headerAddress,authored,table,session,sessionHeader,runtime,clock,list,registryCount,arena,used,requestedBytes,alignmentPadding,allocationBound,queue,pickupBodies,controllers};
}

export function verifyNativePickupPlacement(body,authored) {
  assert.equal(body.length,0x190);assert.equal(authored.length,12);
  equal([body.readUInt32LE()&511,body.readUInt32LE(0x180),body.readUInt32LE(0x11c),body.readUInt16LE(0x18c),body.readUInt16LE(0x18e)], [10,0x83000c,0,authored[10],authored.readUInt16LE(8)],'Full native RET state/template');
  assert.notEqual(body.readUInt32LE(0xc),0,'Native spatial ownership');
  for(let axis=0;axis<3;axis++)assert.equal(body.readInt32LE(0x34+axis*4),authored.readInt16LE(axis*2)*65536,'Exact authored Q16 placement');
}

function verifySettings(configuration,records,snapshot,owner,base) {
  const input=verifyControlledRaceSettingsSnapshot(snapshot,configuration.controlledRaceSettings,{mainBase:base,ownerTid:owner.tid});
  const one=type=>{const rows=records.filter(row=>row.type===type);assert.equal(rows.length,1,`One ${type}`);return rows[0];};
  const guard=one('controlled-race-settings-guarded'),done=one('controlled-race-settings-intervention'),writes=records.filter(row=>row.type==='controlled-race-settings-input-write');assert.equal(writes.length,2);
  const raw=records.find(row=>row.type==='snapshot'&&row.ordinal===snapshot.ordinal),start=records.indexOf(raw),end=records.indexOf(done);
  assert.ok(start>=0&&start<records.indexOf(guard)&&records.indexOf(guard)<records.indexOf(writes[0])&&records.indexOf(writes[0])<records.indexOf(writes[1])&&records.indexOf(writes[1])<end);
  assert.ok(!records.slice(start+1,end).some(row=>row.type==='debug-event'),'Settings single stopped debug event');
  for(const row of [guard,...writes,done])equal([row.pid,row.tid,row.snapshotOrdinal,row.observedDebugEventOrdinal],[owner.pid,owner.tid,snapshot.ordinal,snapshot.observedDebugEventOrdinal]);
  for(const row of [guard,done]) {
    equal([row.ownerMainTid,row.breakpointId,row.rawHit,u32(row.configurationAddress),u32(row.sessionAddress),row.configurationBeforeHex,row.contextSha256,row.allGuardsBeforeWrites,row.beforeOriginalInstruction],[owner.tid,'controlled-race-settings',1,input.configAddress,input.sessionAddress,input.config.toString('hex'),snapshot.contextSha256,true,true]);
  }
  equal([u32(guard.stackAddress),guard.stackBytesHex],[snapshot.context.readUInt32LE(196),input.stack.toString('hex')]);
  const pointer=Buffer.alloc(4);pointer.writeUInt32LE(base+0x1ecefc);
  equal([u32(guard.instructionAddress),guard.breakpointInstructionHex,guard.restoredInstructionHex],[base+0x3e0c5,`cc${pointer.toString('hex')}`,`a1${pointer.toString('hex')}`]);
  equal([done.configurationAfterHex,done.level,done.quality,done.contextUnchanged,done.allOtherCapturedBytesUnchanged,done.rootsUnchanged,done.nativeOutputsWritten],[input.replacement.toString('hex'),configuration.controlledRaceSettings.level,configuration.controlledRaceSettings.quality,true,true,true,false]);
  for(const [i,offset]of [0xb,0x31].entries())equal([writes[i].index,u32(writes[i].address),writes[i].length,writes[i].originalBytesHex,writes[i].replacementBytesHex],[i+1,input.configAddress+offset,1,input.config.subarray(offset,offset+1).toString('hex'),input.replacement.subarray(offset,offset+1).toString('hex')]);
  return done;
}

function verifyStartupInterventions(configuration,records,snapshots,base) {
  const actual=records.filter(row=>row.type==='intervention'),expected=configuration.phaseActions.flatMap(action=>action.writes.map(write=>({action,write})));
  assert.equal(actual.length,expected.length,'Exactly six reviewed launcher/graphics/device writes');
  for(const [i,{action,write}]of expected.entries()) {
    const snapshot=snapshots.find(row=>row.breakpointId===action.breakpointId),row=actual[i],raw=records.find(r=>r.type==='snapshot'&&r.ordinal===snapshot.ordinal),at=records.indexOf(row),pre=records.indexOf(raw);
    let address;
    if(action.breakpointId==='launcher-policy')address=i===0?base+0x2e66ec:u32(snapshot.ranges.get('launcher-config').address)-0x42c+Number(write.offset);
    else if(action.breakpointId==='graphics-policy')address=u32(snapshot.ranges.get('graphics-mode').address)-0x24+Number(write.offset);
    else address=snapshot.context.readUInt32LE(172)+Number(write.offset);
    const accepted=write.expectedAnyBytesHex??[write.expectedBytesHex];
    equal([row.breakpointId,row.hit,u32(row.address),row.replacementBytesHex,row.acceptedOriginalBytesHex],[action.breakpointId,1,address,write.bytesHex,accepted]);
    assert.ok(accepted.includes(row.originalBytesHex)&&pre>=0&&at>pre&&!records.slice(pre+1,at).some(r=>r.type==='debug-event'),'Original startup preimage/same stopped event');
  }
}

export function verifyNativePickupEditorValidation({capture,configuration,records}) {
  const p=verifyNativePickupEditorConfiguration(configuration),{header,complete,snapshots}=capture;
  equal([header.executableSha256,header.ancestorSha256,header.purpose],[pickupValidationTargetSha256,ancestor,'pickup-editor-original-validation']);assert.ok(header.helperCapabilities?.includes(capability));
  assert.match(header.helperSourceSha256,/^[0-9a-f]{64}$/,'Actual dedicated helper source pin');
  equal(header.pickupExpected,Object.fromEntries(['sceneName','resourceSha256','indexSha256','imageSha256','scenario','targetIndex'].map(key=>[key,p[key]])));
  equal([header.maxDurationMs,header.maxEvents,header.maxSnapshots],[90000,1000000,80]);
  assert.ok(!records.some(row=>['capture-error','fatal-exception'].includes(row.type)),'No failed observation');
  const owners=records.filter(row=>row.type==='owned-process');assert.equal(owners.length,1);const owner=owners[0];assert.ok(owner.pid>0&&owner.tid>0);
  //Reviewed startup shell redirection is a typed Windows path output. It is
  //not a game-child answer and must never admit arbitrary service memory.
  const settingsIndex=records.findIndex(row=>row.type==='snapshot'&&row.breakpointId==='controlled-race-settings');
  for(const row of records.filter(row=>row.type==='service-memory-write')){
    const at=records.indexOf(row),event=records.slice(0,at).findLast(r=>r.type==='debug-event');
    equal([row.api,row.replacementBytesHex],['SHGetFolderPathA',Buffer.from(configuration.redirectedDocumentsPath+'\0','utf8').toString('hex')],'Only declared startup shell-path output');
    assert.ok(at<settingsIndex&&event?.pid===owner.pid&&event?.tid===owner.tid&&u32(row.address)>0&&u32(row.address)+row.replacementBytesHex.length/2<=0x100000000);
    assert.match(row.originalBytesHex,new RegExp(`^[0-9a-f]{${row.replacementBytesHex.length}}$`));
  }
  equal(snapshots.slice(0,4).map(row=>row.breakpointId),[...configuration.breakpoints.slice(0,3).map(row=>row.id),'controlled-race-settings']);
  assert.ok(snapshots.length<=80&&snapshots.length===complete.snapshots&&complete.reason==='pickup-editor-validation-bound'&&complete.events<=1000000);
  assert.equal(records.filter(row=>row.type==='snapshot').length,snapshots.length);
  assert.equal(records.filter(row=>row.type==='complete').length,1);
  const cleanup=records.filter(row=>row.type==='owned-process-cleanup');assert.equal(cleanup.length,1);equal([cleanup[0].pid,cleanup[0].terminated],[owner.pid,true]);
  let previousEvent=0;
  for(const snapshot of snapshots){
    assert.equal(snapshot.tid,owner.tid);assert.ok(snapshot.observedDebugEventOrdinal>previousEvent);previousEvent=snapshot.observedDebugEventOrdinal;
    const debug=records.filter(row=>row.type==='debug-event'&&row.ordinal===snapshot.observedDebugEventOrdinal);assert.equal(debug.length,1);equal([debug[0].event,debug[0].pid,debug[0].tid],[1,owner.pid,owner.tid]);
    const raw=records.filter(row=>row.type==='snapshot'&&row.ordinal===snapshot.ordinal);assert.equal(raw.length,1);assert.ok(records.indexOf(debug[0])<records.indexOf(raw[0]));
    assert.ok(!records.slice(records.indexOf(debug[0])+1,records.indexOf(raw[0])).some(row=>row.type==='debug-event'));
    assert.equal(snapshot.context.length,716);assert.equal(sha(snapshot.context),snapshot.contextSha256);
    for(const[name,offset]of Object.entries(registers))assert.equal(u32(snapshot.registers[name]),snapshot.context.readUInt32LE(offset),`Raw CONTEXT ${name}`);
  }
  assert.ok(complete.events>=previousEvent,'Completion event count includes every selected boundary');
  const selected=snapshots.slice(4),base=snapshotBase(selected[0]);verifyStartupInterventions(configuration,records,snapshots,base);
  const settingsDone=verifySettings(configuration,records,snapshots[3],owner,base);
  const activations=records.filter(row=>row.type==='pickup-editor-observers-activated');assert.equal(activations.length,1);const activation=activations[0];
  equal([activation.pid,activation.tid,activation.snapshotOrdinal,activation.observedDebugEventOrdinal,activation.guardedSettingsCompleted,activation.beforeOriginalInstruction],[owner.pid,owner.tid,snapshots[3].ordinal,snapshots[3].observedDebugEventOrdinal,true,true]);
  assert.ok(records.indexOf(activation)>records.indexOf(settingsDone)&&!records.slice(records.indexOf(settingsDone)+1,records.indexOf(activation)).some(row=>row.type==='debug-event'),'Activation remains in the guarded settings event');
  equal(activation.installed.map(row=>[row.id,u32(row.address),row.patchBytesHex]),sites.map(([id,rva])=>[id,base+rva,'cc']));
  for(const row of activation.installed)assert.match(row.originalBytesHex,/^[0-9a-f]{2}$/);
  const observations=records.filter(row=>row.type==='pickup-editor-observation');assert.equal(observations.length,selected.length);
  let loader=false,entry=null,initialized=null,firstTick=false,collect=null,respawn=null,identity=null,completedGeneration=0;
  const placements=Array(16).fill(0),collections=Array(16).fill(0),stages=[];
  for(const snapshot of selected){
    const proof=snapshot.pickupEditorObservation,rawIndex=records.findIndex(row=>row.type==='snapshot'&&row.ordinal===snapshot.ordinal),marker=records[rawIndex-1];
    equal(marker,proof,'Independent marker immediately precedes exactly annotated snapshot');assert.ok(observations.includes(marker));assert.ok(records.indexOf(marker)>records.indexOf(activation));
    equal([proof.type,proof.kind,proof.pid,proof.tid,proof.snapshotOrdinal,proof.observedDebugEventOrdinal,proof.rawHit,proof.beforeOriginalInstruction,proof.sceneName,proof.expectedResourceSha256,proof.wholeLoadedResourceHashObserved,proof.nativeOutputsWritten],['pickup-editor-observation',snapshot.breakpointId,owner.pid,owner.tid,snapshot.ordinal,snapshot.observedDebugEventOrdinal,snapshot.rawHit,true,p.sceneName,p.resourceSha256,false,false]);
    assert.ok(snapshot.rawHit>=snapshot.hit&&snapshot.hit>=1);assert.equal(snapshot.capturePhase,'pickup-editor-read-only-before-original-instruction');assert.equal(snapshotBase(snapshot),base);
    const site=sites.find(([id])=>id===snapshot.breakpointId);assert.ok(site);assert.equal(snapshot.context.readUInt32LE(184),base+site[1]);
    const memory=createCapturedMemory([...snapshot.ranges.values()].filter(row=>row.length)).memory;assert.ok(snapshot.threadEnvironment);bindCapturedNativeThreadEnvironment(snapshot,{memory});
    assert.ok(716+[...snapshot.ranges.values()].reduce((n,row)=>n+row.length,0)<=32768,'Bounded exact consumer snapshot');
    const esp=snapshot.context.readUInt32LE(196),reg=name=>snapshot.context.readUInt32LE(registers[name]);
    if(site[0]==='pickup-loader-entry'){
      assert.ok(!loader&&!entry);const name=range(snapshot,'pickup-loader-name',reg('ecx'),snapshot.ranges.get('pickup-loader-name').length);assert.ok(name.length<=64&&name[name.length-1]===0);
      assert.equal(cstring(name).replaceAll('\\','/').replace(/\.BLP$/i,'').toUpperCase(),p.sceneName.replace(/\.BLP$/,''));equal([proof.loaderName,u32(proof.loaderNameAddress)],[cstring(name),reg('ecx')]);range(snapshot,'pickup-loader-caller',esp,8);loader=true;continue;
    }
    assert.ok(loader);const g=verifyNativePickupEditorGraph(snapshot,p,{bodies:site[0]!=='pickup-init-entry'});
    const ids=[g.dataBase,g.pack,g.headerAddress,g.authored,g.session];if(identity)equal(ids,identity,'Stable loaded native roots');else identity=ids;
    if(site[0]==='pickup-init-entry'){
      assert.ok(!entry);const caller=range(snapshot,'pickup-entry-caller',esp,8);assert.equal(caller.readUInt32LE(),base+0x7ecef);
      const mode=g.runtime[4],option=g.runtime[0xa86-0x54d];assert.ok(option!==0||mode===3||mode===8);assert.ok(g.registryCount+p.expectedCount+p.expectedControllerCount<=512);
      equal([proof.registryBefore,proof.nativeMode,proof.pickupOption],[g.registryCount,mode,option]);entry={esp,registryCount:g.registryCount};continue;
    }
    assert.ok(entry);
    if(site[0]==='pickup-init-return'){
      assert.ok(!initialized);assert.equal(esp,entry.esp);assert.equal(range(snapshot,'pickup-entry-caller',esp,8).readUInt32LE(),base+0x7ecef);
      assert.equal(g.registryCount,entry.registryCount+p.expectedCount+p.expectedControllerCount);equal([...g.queue.subarray(0,24)],Array(24).fill(255));assert.equal(g.queue.readUInt16LE(24),0);
      equal([proof.registryBefore,proof.registryAfter,proof.count],[entry.registryCount,g.registryCount,p.expectedCount]);initialized=g.pickupBodies.map(row=>row.address);continue;
    }
    //47b680/controllers run during the native countdown too. A phase4-only
    //observer misses the first real placements; ownership/call ABI still bind.
    assert.ok(initialized);equal(g.pickupBodies.map(row=>row.address),initialized,'Native pickup list identity');
    if(site[0]==='pickup-first-tick'){assert.ok(!firstTick);firstTick=true;equal([proof.count,proof.registryAfterFullStartup],[p.expectedCount,g.registryCount]);continue;}
    assert.ok(firstTick);const index=proof.pickupIndex;assert.ok(Number.isInteger(index)&&index>=0&&index<p.expectedCount);assert.equal(u32(proof.pickupAddress),g.pickupBodies[index].address);
    if(site[0]==='pickup-collection-before'){
      assert.ok(p.scenario==='cycle'&&!collect&&index===p.targetIndex);const record=u32(proof.collectorRecord);assert.ok(record>=base+0x509300&&(record-base-0x509300)%0x30c===0&&(record-base-0x509300)/0x30c<6);
      equal([reg('ebp'),reg('esi')],[g.pickupBodies[index].address,record]);const car=range(snapshot,'pickup-collector-record',record,0x30c).readUInt32LE();assert.equal(range(snapshot,'pickup-collector-body',car,0x6b8).readUInt32LE()&511,3);
      assert.equal(proof.nativeStateBefore,g.pickupBodies[index].bytes.readUInt32LE(0x180));collect={esp,index,record};
    } else if(site[0]==='pickup-collection-after'){
      assert.ok(collect&&index===collect.index);equal([esp,reg('ebp'),reg('esi'),u32(proof.collectorRecord)],[collect.esp,g.pickupBodies[index].address,collect.record,collect.record]);assert.equal(g.pickupBodies[index].bytes.readUInt32LE(0x180),0x820064);
      collections[index]++;equal([proof.collectionGeneration,proof.weightedAwardHasNotYetExecuted],[collections[index],true]);collect=null;
    } else if(site[0]==='pickup-respawn-before'){
      assert.ok(!respawn);assert.equal(range(snapshot,'pickup-entry-caller',esp,8).readUInt32LE(),base+0x31c96);const controller=u32(proof.controllerAddress),body=g.controllers.find(row=>row.address===controller);assert.ok(body);equal([reg('ecx'),body.bytes.readInt16LE(0x186)],[controller,index]);assert.equal(proof.collectionGeneration,collections[index]);respawn={esp,index,controller,generation:collections[index]};
    } else if(site[0]==='pickup-respawn-after'){
      assert.ok(respawn);equal([esp,index,u32(proof.controllerAddress),proof.collectionGeneration],[respawn.esp,respawn.index,respawn.controller,respawn.generation]);assert.equal(range(snapshot,'pickup-entry-caller',esp,8).readUInt32LE(),base+0x31c96);
      verifyNativePickupPlacement(g.pickupBodies[index].bytes,g.table.subarray(index*12,index*12+12));placements[index]++;equal([proof.placementCount,proof.fullNativeFinalizerBeforeRet],[placements[index],true]);if(index===p.targetIndex&&respawn.generation>completedGeneration)completedGeneration=respawn.generation;respawn=null;
    } else assert.fail('Unexpected selected pickup stage');
    stages.push({stage:site[0],index,clock:g.clock,snapshotOrdinal:snapshot.ordinal});
  }
  assert.ok(loader&&entry&&initialized&&firstTick&&!collect&&!respawn);assert.ok(placements.slice(0,p.expectedCount).every(n=>n>0),'Every authored point has a complete original initial placement');
  if(p.scenario==='cycle')assert.ok(collections[p.targetIndex]>0&&completedGeneration===collections[p.targetIndex]&&placements[p.targetIndex]>=2,'Actual target collection followed by later full native respawn');
  const completedFinalizers=placements.reduce((sum,n)=>sum+n,0);
  equal(complete.pickupEditorObservation,{scenario:p.scenario,sceneName:p.sceneName,targetIndex:p.targetIndex,placements,collections,completedTargetGeneration:completedGeneration,actualRegistryBefore:entry.registryCount,fullNativeFinalizerObserved:completedFinalizers>0,completedFinalizers,nativeOutputsWritten:false,physicsGoalResumed:false});
  return {matched:true,authority:'original-process-edited-archive-with-declared-frontend-inputs',sceneName:p.sceneName,scenario:p.scenario,authoredCount:p.expectedCount,authoredBytes:p.expectedCount*12,headerIdentityBytes:40,registryBefore:entry.registryCount,placements:placements.slice(0,p.expectedCount),collections:collections.slice(0,p.expectedCount),completedTargetGeneration:completedGeneration,completedFinalizers,helperSourceSha256:header.helperSourceSha256,snapshots:snapshots.length,stages,wholeLoadedResourceHashObserved:false,nativeOutputsWritten:false,physicsGoalResumed:false};
}

async function fileIdentity(filename){const digest=createHash('sha256');let length=0;for await(const bytes of createReadStream(filename)){digest.update(bytes);length+=bytes.length;}return {length,sha256:digest.digest('hex')};}
async function fileCensus(root) {
  const found=[];
  async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink(),'Staged installation symlink');const name=path.join(directory,entry.name);if(entry.isDirectory())await walk(name);else{assert.ok(entry.isFile());found.push(path.relative(root,name).replaceAll('\\','/'));}}}
  await walk(root);return found.sort();
}
export async function checkNativePickupEditorValidation(input,output,{expectedPath=path.join(path.dirname(input),'expected.json')}={}) {
  await mkdir(output);let stage='capture-blobs',report,archive;
  try {
    const capture=await loadPhysicsCapture(input,{expectedSha256:pickupValidationTargetSha256}),records=(await readFile(path.join(input,'trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse),configBytes=await readFile(path.join(input,'configuration.json')),configuration=JSON.parse(configBytes),expected=JSON.parse(await readFile(expectedPath,'utf8'));
    stage='prepared-case-identity';assert.equal(sha(configBytes),expected.configurationSha256);equal(configuration.pickupEditorObservation,expected.policy);assert.equal(expected.installation.files.length,171);
    stage='retained-native-boundaries';const evidence=await verifyNativePickupEditorBoundaries();
    stage='native-runtime-evidence';const result=verifyNativePickupEditorValidation({capture,configuration,records}),root=await realpath(expected.installation.root);let bytes=0;
    stage='current-staged-integrity';equal(await fileCensus(root),expected.installation.files.map(row=>row.path).sort(),'Exact171-file staged installation census');
    for(const row of expected.installation.files){const actual=await realpath(path.join(root,row.path)),relative=path.relative(root,actual);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));equal(await fileIdentity(actual),{length:row.length,sha256:row.sha256},`Current staged file identity ${row.path}`);bytes+=row.length;}
    for(const [name,key]of [['IDXData/Rollcage.idx','indexSha256'],['IDXData/Rollcage.img','imageSha256']])assert.equal(expected.installation.files.find(row=>row.path===name)?.sha256,configuration.pickupEditorObservation[key]);
    stage='exported-resource-identity';archive=await RollcageArchive.open(root);const track=getGame('rollcage').tracks.find(row=>row.name===result.sceneName);assert.ok(track);const {data}=await archive.readResource(track.index),table=parsePickupPlacements(data),p=configuration.pickupEditorObservation;
    equal([sha(data),data.length,table.count,table.offset,headerIdentity(data).toString('hex'),data.subarray(table.offset,table.offset+table.count*12).toString('hex')],[p.resourceSha256,p.resourceBytes,p.expectedCount,p.authoredOffset,p.headerIdentityHex,p.authoredHex]);
    report={...result,captureDirectory:path.resolve(input),targetSha256:pickupValidationTargetSha256,evidenceIds:evidence.evidenceIds,expectedPath:path.resolve(expectedPath),currentStagedIntegrity:{files:171,bytes,allMatched:true},exportedResourceSha256:sha(data),limits:['Native loaded identity is exact40B header plus12N authored table and actual loader stem, not a hash of the entire relocated loaded resource.','Collection boundary precedes weighted award; full gameplay/combat equivalence and wall-clock rate are not claimed.','Current staged file equality is checked; capture-run before/after census must be retained separately by its operator.','Absent raw allocation root, used bytes must fit the conservative original requested allocation minus127 alignment bytes.']};
  } catch(error) {report={matched:false,stage,captureDirectory:path.resolve(input),targetSha256:pickupValidationTargetSha256,error:error.stack};}
  finally {await archive?.close();}
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const[input,output,expectedPath]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/check-native-pickup-editor-validation.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY [EXPECTED_JSON]');
  const report=await checkNativePickupEditorValidation(input,output,expectedPath?{expectedPath}:{});console.log(JSON.stringify(report));if(!report.matched)process.exitCode=1;
}
