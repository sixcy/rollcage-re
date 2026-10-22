//Read-only47b020 entry-input proof plus the independent complete4749e0 replay.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {replayNativeFrame} from './lib/native-frame-replay.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from './check-native-frame-replay.mjs';
import {nativeForceBoundaries} from './prepare-native-force-frame-capture.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {abs32} from '../src/fixed-integer.mjs';
const pendingKeys=['beforeBreakpointId','afterBreakpointId','eventBreakpointId','maxPendingBytes','maxCandidateFrames','maxEventSnapshots','eventStackOffset','eventReturnRva','eventPointerRegister','eventPoolRoot','eventPoolCapacity','eventRecordBytes'];
const u32=(value,label)=>{value=Number(value);if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw Error(`Invalid native force ${label}.`);return value;};
const exactRange=(row,{rva,baseRegister,length,dereferenceOffsets=[]})=>row&&Number(row.offset??0)===0&&row.length===length&&row.address===undefined&&!row.readableRegion&&JSON.stringify(row.dereferenceOffsets??[])===JSON.stringify(dereferenceOffsets)&&(rva===undefined?row.rva===undefined:Number(row.rva)===rva)&&row.baseRegister===baseRegister;
export function verifyNativeForceFrameConfiguration(configuration){
 const pending=configuration.pendingFrameObserver,force=configuration.breakpoints?.find(row=>row.id===pending?.eventBreakpointId);
 if(!pending||Object.keys(pending).some(key=>!pendingKeys.includes(key))||pending.beforeBreakpointId!=='native-frame-before'||pending.afterBreakpointId!=='native-frame-after'||pending.eventBreakpointId!=='native-force-entry'||pending.eventStackOffset!==-96||Number(pending.eventReturnRva)!==0x7a913||pending.eventPointerRegister!=='ecx'||pending.eventRecordBytes!==1)throw Error('Force observer requires the exact47b020 caller and used-byte arena contract.');
 for(const[key,max]of[['maxPendingBytes',134217728],['maxCandidateFrames',600],['maxEventSnapshots',64]])if(!Number.isSafeInteger(pending[key])||pending[key]<1||pending[key]>max)throw Error(`Invalid force observer ${key} bound.`);
 if(Number(force?.rva)!==0x7b020||force.stopAfterHits>0||force.skipMatchingHits!==undefined||force.captureWhen!==undefined&&force.captureWhen!==null||force.service!==undefined&&force.service!==null)throw Error('Force observer requires the unfiltered complete47b020 entry stream without services.');
 for(const[key,rva]of[['eventPoolRoot',0x2e6b40],['eventPoolCapacity',0x30dcf4]])if(!exactRange(pending[key],{rva,length:4}))throw Error('Force observer byte-arena roots differ from the native allocation/cursor.');
 for(const[id,policy]of[['force-body-header',{baseRegister:'ecx',length:0x180}],['force-caller',{baseRegister:'esp',length:4}],['force-physical-body-list',{rva:0x502bc0,dereferenceOffsets:['0'],length:0x180}]])if(!exactRange(force.ranges?.find(row=>row.id===id),policy))throw Error(`Force ${id} range differs from its exact live input.`);
 for(const{id,preferredAddress,length}of nativeFrameGlobalRegions)if(!exactRange(force.ranges?.find(row=>row.id===id),{rva:preferredAddress-0x400000,length}))throw Error(`Force global ${id} descriptor differs from the complete observer input.`);
 if(configuration.phaseActions?.some(row=>row.breakpointId===pending.eventBreakpointId))throw Error('Force observations cannot perform phase writes.');
 return {mode:'pending-frame',forceBreakpointId:pending.eventBreakpointId};
}
function memoryOf(snapshot){
 const rows=[...snapshot.ranges.values()],bases=new Set([snapshot.moduleBaseAddress,...rows.map(row=>row.moduleBaseAddress)].filter(v=>v!==undefined&&v!==null).map(Number));
 if(bases.size!==1)throw Error('Force snapshot requires one observed module base.');
 const moduleBaseAddress=u32([...bases][0],'module base'),aliases=nativeFrameGlobalRegions.map(row=>({address:row.preferredAddress,targetAddress:moduleBaseAddress+row.preferredAddress-0x400000,length:row.length}));
 return {...createCapturedMemory(rows,{aliases}),moduleBaseAddress};
}
export function inspectNativeForceEntry(snapshot,{frameEntryEsp,moduleBaseAddress:expectedBase}={}){
 const{memory:m,moduleBaseAddress}=memoryOf(snapshot),r=snapshot.registers??{},bodyAddress=u32(r.ecx,'body pointer'),entryEsp=u32(r.esp,'entry ESP'),actual=preferred=>moduleBaseAddress+preferred-0x400000;
 if(expectedBase!==undefined&&moduleBaseAddress!==expectedBase)throw Error('Force module base differs from its complete parent frame.');
 if(u32(r.eip,'entry EIP')!==actual(nativeForceBoundaries.entry)||frameEntryEsp!==undefined&&entryEsp!==frameEntryEsp-96)throw Error('Force entry instruction/parent ESP differs from its actual47b020 ABI.');
 const header=snapshot.ranges.get('force-body-header'),caller=snapshot.ranges.get('force-caller'),list=snapshot.ranges.get('force-physical-body-list');
 if(!header||Number(header.address)!==bodyAddress||header.bytes.length!==0x180||!caller||Number(caller.address)!==entryEsp||caller.bytes.length!==4||caller.bytes.readUInt32LE()!==actual(nativeForceBoundaries.returnAddress))throw Error('Force body-header/caller range differs from its actual native input.');
 const allocation=m.readUInt32LE(0x6e6b40),usedBytes=m.readUInt32LE(0x70dcf4),alignedBase=m.readUInt32LE(0x902eec),allocationBytes=((m.readInt32LE(0x709808)+140000)<<5)>>>0;
 if(!allocation||!usedBytes||allocation+usedBytes>0x100000000||bodyAddress<allocation||bodyAddress>=allocation+usedBytes)throw Error('Force pointer fails the observed used-byte arena admission.');
 if(alignedBase!==Math.ceil(allocation/128)*128||alignedBase+usedBytes>allocation+allocationBytes||bodyAddress<alignedBase||(bodyAddress-alignedBase)%128||bodyAddress+0x180>alignedBase+usedBytes)throw Error('Force body alignment/common extent exceeds the actual aligned used arena.');
 const listAddress=m.readUInt32LE(0x902bc0),count=m.readUInt16LE(0x902bc4);
 if(!list||Number(list.address)!==listAddress||list.bytes.length!==0x180||count<1||count>=96||m.readUInt32LE(listAddress+count*4)!==0)throw Error('Force live physical list lacks its exact root/count/trailing null.');
 const indices=[];for(let i=0;i<count;i++)if(m.readUInt32LE(listAddress+i*4)===bodyAddress)indices.push(i);
 if(indices.length!==1)throw Error('Force body must have one actual live physical-list membership.');
 const flags=header.bytes.readUInt32LE(),type=flags&0x1ff;
 if(m.readInt32LE(0x91cd90)!==1||(flags&0x22000)||[17,21,25].includes(type))throw Error('Force entry contradicts its native ordinary-preparation first-effect gates.');
 const entryRegisters=Object.fromEntries(['ebx','ebp','esi','edi'].map(name=>[name,u32(r[name],`incoming ${name}`)]));
 if(entryRegisters.edi!==bodyAddress)throw Error('Force incoming EDI differs from the known preparation body register.');
 return {bodyAddress,bodyHeaderHex:header.bytes.toString('hex'),originQ16:[0,4,8].map(o=>m.readInt32LE(0x91cd80+o)),strength:m.readInt32LE(0x91cd8c),entryEsp,entryRegisters,returnAddress:caller.bytes.readUInt32LE(),logicalClock:m.readUInt32LE(0x90a548),moduleBaseAddress,bodyType:type,physicalIndex:indices[0],physicalCount:count,arena:{allocation,alignedBase,usedBytes,allocationBytes}};
}
export function classifyNativeForceInput(record){
 const header=Buffer.from(record.bodyHeaderHex,'hex'),differenceQ16=[0,4,8].map((o,i)=>(header.readInt32LE(0x34+o)-record.originQ16[i])|0),reduced=differenceQ16.map(v=>v>>18),squared=reduced.reduce((s,v)=>(s+Math.imul(v,v))|0,0),base={bodyType:header.readUInt32LE()&0x1ff,differenceQ16,reducedSquaredDistance:squared,outputAttribution:'not-isolated-by-entry-observation'};
 if(squared>65536)return {...base,inputGate:'rejected-distance'};
 const direction=reduced.map(v=>Math.trunc((v<<16)/Math.max(squared,256))|0);
 if(direction.reduce((s,v)=>(s+abs32(v))|0,0)<32)return {...base,inputGate:'rejected-direction'};
 const cappedImpulse=direction.map(v=>Math.max(-0x1800,Math.min(0x1800,Math.imul(record.strength>>2,v))));
 return {...base,inputGate:cappedImpulse.some(v=>v!==0)?'accepted-nonzero-capped-input':'accepted-zero-capped-input',cappedImpulse,vehicleBranch:base.bodyType===3?'active-versus-ordinary-state-not-in-entry-header':'ordinary-numeric-branch'};
}
export async function verifyNativeForceBoundaries(){
 const evidence=await readInstructionEvidence(['050-ordinary-preparation-assembly.json','076-first-body-effect-assembly.json'],{directory:'analysis/native-simulation/results'});
 if(evidence.evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Force boundary evidence target differs.');
 const listing=new Map(evidence.instructions.map(row=>[row.address,row]));
 for(const[address,op,args]of[[0x47b020,'SUB',['ESP','0x24']],[0x47a90e,'CALL',['0x0047b020']],[0x47a913,'JMP',['0x0047a91c']]])if(listing.get(address)?.op!==op||JSON.stringify(listing.get(address)?.args)!==JSON.stringify(args))throw Error(`Retained force boundary differs at0x${address.toString(16)}.`);
 return evidence.evidence.map(row=>row.evidence_id);
}
export function traceNativeFrameForces(snapshot,options={}){
 const forceRecords=[],external=options.onBodyEffectImpulse;
 if(external!==undefined&&typeof external!=='function')throw Error('Native force observer must be a function.');
 try{return {...replayNativeFrame(snapshot,{...options,onBodyEffectImpulse:record=>{forceRecords.push(record);external?.(record);}}),forceRecords};}
 catch(error){error.forceRecords=forceRecords;throw error;}
}
export function compareNativeForceSnapshots(nativeSnapshots,sourceRecords,{before,after,moduleBaseAddress,returnAddress}={}){
 if(!Array.isArray(nativeSnapshots)||!Array.isArray(sourceRecords)||!before||!after)throw Error('Force comparison requires ordered entries and a complete parent frame.');
 if(!nativeSnapshots.length)throw Error('Selected force frame must contain a nonempty native entry stream.');
 if(nativeSnapshots.length!==sourceRecords.length)return {matched:false,firstDivergence:{kind:'force-entry-count',nativeCount:nativeSnapshots.length,sourceCount:sourceRecords.length},entries:[]};
 const total=nativeSnapshots.length,identity=before.pendingFrame,keys=['candidateIndex','frameTid','frameEntryEsp','frameReturnAddress','frameMatchingHit'];
 if(!identity||identity.role!=='before'||after.pendingFrame?.role!=='after'||!Number.isSafeInteger(identity.candidateIndex)||identity.candidateIndex<1)throw Error('Force comparison requires accepted pending parent metadata.');
 for(const parent of[before,after]){
  const p=parent.pendingFrame;
  if(parent.deferredPublication!==true||p.eventIndex!==undefined||p.observedEventHits!==total||p.qualifyingEventSnapshots!==total)throw Error('Force totals must describe the unfiltered complete native/source entry stream.');
  for(const key of keys)if(String(p[key])!==String(identity[key]))throw Error('Force parent pending identities differ.');
 }
 if(Number(identity.frameTid)!==before.tid||before.tid!==after.tid||Number(identity.frameEntryEsp)!==Number(before.registers.esp)||Number(identity.frameReturnAddress)!==returnAddress)throw Error('Force pending parent ABI differs.');
 if(!Number.isSafeInteger(before.observedDebugEventOrdinal)||!Number.isSafeInteger(after.observedDebugEventOrdinal)||before.observedDebugEventOrdinal>=after.observedDebugEventOrdinal||!Number.isSafeInteger(before.observedElapsedMs)||!Number.isSafeInteger(after.observedElapsedMs)||before.observedElapsedMs>after.observedElapsedMs)throw Error('Force pending parent observed order/time differs.');
 let previousOrdinal=before.ordinal,previousObserved=before.observedDebugEventOrdinal;const entries=[],clock=before.ranges.get('clock').bytes.readUInt32LE();
 if(after.ranges.get('clock').bytes.readUInt32LE()!==clock)throw Error('Force paired frame clock changes across its native call.');
 for(let index=0;index<total;index++){
  const snapshot=nativeSnapshots[index],source=sourceRecords[index],p=snapshot.pendingFrame;
  if(snapshot.ordinal<=previousOrdinal||snapshot.ordinal>=after.ordinal||snapshot.tid!==before.tid)throw Error('Force entry is outside its ordered same-thread complete frame.');previousOrdinal=snapshot.ordinal;
  if(!p||p.role!=='event'||snapshot.deferredPublication!==true||p.eventIndex!==index+1||p.observedEventHits!==total||p.qualifyingEventSnapshots!==total||snapshot.captureWhen!==undefined&&snapshot.captureWhen!==null)throw Error('Force pending entry lacks its complete unfiltered index/totals.');
  for(const key of keys)if(String(p[key])!==String(identity[key]))throw Error('Force entry belongs to another pending candidate.');
  if(!Number.isSafeInteger(snapshot.observedDebugEventOrdinal)||snapshot.observedDebugEventOrdinal<=previousObserved||snapshot.observedDebugEventOrdinal>=after.observedDebugEventOrdinal||!Number.isSafeInteger(snapshot.observedElapsedMs)||snapshot.observedElapsedMs<before.observedElapsedMs||snapshot.observedElapsedMs>after.observedElapsedMs)throw Error('Force observed entry order/time differs from deferred publication.');previousObserved=snapshot.observedDebugEventOrdinal;
  const native=inspectNativeForceEntry(snapshot,{frameEntryEsp:Number(before.registers.esp),moduleBaseAddress});if(native.logicalClock!==clock)throw Error('Force entry clock differs from its paired frame.');
  if(typeof source?.bodyHeaderHex!=='string'||!/^[0-9a-f]{768}$/i.test(source.bodyHeaderHex)||!Array.isArray(source.originQ16)||source.originQ16.length!==3)throw Error('Source force observer lacks its exact body header/origin input.');
  let divergence=null;
  for(const key of['bodyAddress','entryEsp','returnAddress','strength'])if(source[key]!==native[key]){divergence={kind:key,native:native[key],source:source[key]};break;}
  for(const key of['ebx','ebp','esi','edi'])if(!divergence&&source.entryRegisters?.[key]!==native.entryRegisters[key])divergence={kind:'entry-register',register:key,native:native.entryRegisters[key],source:source.entryRegisters?.[key]};
  for(let lane=0;lane<3;lane++)if(!divergence&&source.originQ16[lane]!==native.originQ16[lane])divergence={kind:'effect-origin',lane,native:native.originQ16[lane],source:source.originQ16[lane]};
  if(!divergence&&source.bodyHeaderHex.toLowerCase()!==native.bodyHeaderHex){const bytes=Buffer.from(source.bodyHeaderHex,'hex'),expected=Buffer.from(native.bodyHeaderHex,'hex');divergence={kind:'body-header',firstByte:bytes.findIndex((v,i)=>v!==expected[i])};}
  entries.push({index,nativeOrdinal:snapshot.ordinal,bodyAddress:native.bodyAddress,bodyType:native.bodyType,physicalIndex:native.physicalIndex,entryEsp:native.entryEsp,matched:!divergence,divergence,classification:classifyNativeForceInput(native)});
 }
 const first=entries.find(row=>!row.matched);return {matched:!first,nativeCount:total,sourceCount:sourceRecords.length,firstDivergence:first?{entryIndex:first.index,...first.divergence}:null,entries};
}
export async function checkNativeForceFrameReplay(input,output){
 const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),selection=verifyNativeForceFrameConfiguration(configuration),pairing=pairNativeFrameSnapshots(capture,configuration);
 if(pairing.pairs.length!==1)throw Error('Force proof requires exactly one complete selected parent frame.');
 const pair=pairing.pairs[0],snapshots=capture.snapshots.filter(row=>row.breakpointId===selection.forceBreakpointId);let frame,force,sourceRecords=[];
 try{const replay=traceNativeFrameForces(pair.before,{...pair.options,moduleBaseAddress:pair.moduleBaseAddress});sourceRecords=replay.forceRecords;frame=compareNativeFramePair(pair,replay);try{force=compareNativeForceSnapshots(snapshots,sourceRecords,pair);}catch(error){force={matched:false,firstDivergence:{kind:'observation-contract',error:error.message},entries:[]};}}
 catch(error){frame={matched:false,replayStage:error.replayStage??null,replayError:error.stack??String(error)};sourceRecords=error.forceRecords??[];force={matched:false,firstDivergence:{kind:'source-replay-failed',error:error.message},entries:[]};}
 const report={schemaVersion:1,authority:'original-process-direct-force-entry-and-complete-frame-comparison',matched:frame.matched&&force.matched,clock:pair.before.ranges.get('clock').bytes.readUInt32LE(),selectionMode:selection.mode,method:'Compare every ordered actual47b020 entry input against immutable source observations, including byte-arena admission, aligned common body extent and live physical-list membership; independently compare the complete paired4749e0 semantic bytes and return.',frame:{beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,...frame},force,sourceRecords,boundaryEvidence:await verifyNativeForceBoundaries(),limits:['A native force call can return at its radius/direction gates; accepted input does not independently prove an impulse or active-owner write.','The180h-byte entry header does not contain vehicle+6bc; accepted type3 entries do not identify active versus ordinary controller state.','Whole-frame final state validates the declared complete frame, not isolated native47b020 exit writes or uninterrupted tick/input producers.','ABI scratch is captured input and separate from whole-frame semantic comparison.','No game is launched by this checker.']};
 await mkdir(output);for(const name of['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);await writeFile(path.join(output,'report.json'),`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/check-native-force-frame-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');const report=await checkNativeForceFrameReplay(input,output);console.log(JSON.stringify({matched:report.matched,clock:report.clock,entries:report.force.entries.length,forceDivergence:report.force.firstDivergence,frameDivergence:report.frame.firstDivergence,output}));if(!report.matched)process.exitCode=1;}
