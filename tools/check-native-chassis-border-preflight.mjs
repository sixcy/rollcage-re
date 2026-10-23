import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from './check-native-frame-replay.mjs';
import {traceNativeFrameDispatches} from './lib/native-frame-event-trace.mjs';
import {multiplyQ16} from '../src/fixed-integer.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const chassisBorderForceScalarsQ16=Object.freeze([4*65536,16*65536,64*65536]);
export const chassisBorderForceMaximum=0x01000000;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rowsOf=snapshot=>snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
function baseOf(snapshot){const values=new Set([snapshot.moduleBaseAddress,...rowsOf(snapshot).map(r=>r.moduleBaseAddress)].filter(v=>v!==undefined&&v!==null).map(Number));if(values.size!==1||!Number.isSafeInteger([...values][0]))throw Error('Preflight requires one actual observed module base.');return [...values][0];}
const words=(m,p,n=3)=>Array.from({length:n},(_,i)=>m.readInt32LE(p+i*4));

export function forceAlongBorderNormal(normalQ16,signedScalarQ16){
  if(!Array.isArray(normalQ16)||normalQ16.length!==3||normalQ16.some(v=>!Number.isInteger(v)||Math.abs(v)>65536)||normalQ16.every(v=>v===0)||!Number.isInteger(signedScalarQ16)||!signedScalarQ16||Math.abs(signedScalarQ16)>64*65536)throw Error('Force requires an actual bounded nonzero border normal and scalar.');
  const increment=normalQ16.map(v=>multiplyQ16(v,signedScalarQ16));
  if(increment.some(v=>Math.abs(v)>chassisBorderForceMaximum))throw Error('Declared force increment exceeds its bound.');
  return increment;
}

//Only original participant+force bytes are changed. Every overlapping capture
//span is patched consistently; the original immutable capture is never edited.
export function cloneNativeFrameWithForce(snapshot,{participantIndex,incrementQ16}){
  if(!Number.isInteger(participantIndex)||participantIndex<0||participantIndex>=6||!Array.isArray(incrementQ16)||incrementQ16.length!==3||incrementQ16.some(v=>!Number.isInteger(v)||Math.abs(v)>chassisBorderForceMaximum))throw Error('Invalid bounded participant force input.');
  const rows=rowsOf(snapshot),{memory}=createCapturedMemory(rows),base=baseOf(snapshot),root=base+0x509300+participantIndex*0x30c,body=memory.readUInt32LE(root);
  if(!body||(memory.readUInt32LE(body)&511)!==3)throw Error('Force target is not the actual participant type3 chassis.');
  const originalBody=Buffer.from(memory.subarray(body,body+0x3e78)),originalForce=words(memory,body+0x74),nextForce=originalForce.map((v,i)=>v+incrementQ16[i]);
  if(nextForce.some(v=>!Number.isInteger(v)||v<-2147483648||v>2147483647||Math.abs(v)>chassisBorderForceMaximum))throw Error('Force addition exceeds the declared signed input bound; no wrapping or clamp is supplied.');
  const bytes=Buffer.alloc(12);nextForce.forEach((v,i)=>bytes.writeInt32LE(v,i*4));
  const address=body+0x74,changedRanges=[],modified=rows.map(row=>{
    const start=Math.max(Number(row.address),address),end=Math.min(Number(row.address)+row.bytes.length,address+12);
    if(start>=end)return row;
    const next=Buffer.from(row.bytes);bytes.copy(next,start-Number(row.address),start-address,end-address);
    if(!next.subarray(0,start-Number(row.address)).equals(row.bytes.subarray(0,start-Number(row.address)))||!next.subarray(end-Number(row.address)).equals(row.bytes.subarray(end-Number(row.address))))throw Error('Force clone changed bytes outside the declared input.');
    changedRanges.push({id:row.id,address:Number(row.address),originalSha256:sha(row.bytes),experimentalSha256:sha(next),changedWindow:{address:start,length:end-start}});
    return {...row,bytes:next,sha256:sha(next)};
  });
  const changedMemory=createCapturedMemory(modified).memory,after=changedMemory.subarray(body,body+0x3e78);
  if(!after.subarray(0,0x74).equals(originalBody.subarray(0,0x74))||!after.subarray(0x80).equals(originalBody.subarray(0x80)))throw Error('Pose, quaternion, momenta, spatial/header or vehicle inputs changed outside force74.');
  return {snapshot:{...snapshot,ranges:new Map(modified.map(r=>[r.id,r]))},proof:{participantIndex,participantRootAddress:root,bodyAddress:body,forceAddress:address,originalForceQ16:originalForce,incrementQ16:incrementQ16.slice(),experimentalForceQ16:nextForce,
    originalForceHex:originalBody.subarray(0x74,0x80).toString('hex'),experimentalForceHex:bytes.toString('hex'),originalBodySha256:sha(originalBody),experimentalBodySha256:sha(after),unchangedBodyBytes:0x3e78-12,
    inputMutationScope:'Only actual participant body+74..7f; all other snapshot bytes remain original, including pose/quaternion/momentum/velocity/spatial links/shape/cache/vehicle state.',changedRanges}};
}

export function planChassisBorderForces(snapshot,baseline,{scalarsQ16=chassisBorderForceScalarsQ16,maxDirectionsPerParticipant=4,maxAttempts=24}={}){
  if(!Array.isArray(scalarsQ16)||!scalarsQ16.length||scalarsQ16.length>3||new Set(scalarsQ16).size!==scalarsQ16.length||scalarsQ16.some(v=>!Number.isInteger(v)||v<1||v>64*65536)||!Number.isInteger(maxDirectionsPerParticipant)||maxDirectionsPerParticipant<1||maxDirectionsPerParticipant>4||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>64)throw Error('Invalid explicit preflight bounds.');
  const base=baseOf(snapshot),original=createCapturedMemory(rowsOf(snapshot)).memory,participants=[],attempts=[];
  for(let index=0;index<6;index++){
    const body=original.readUInt32LE(base+0x509300+index*0x30c),entry=body?{flags:original.readUInt32LE(body),positionQ16:words(original,body+0x34),momentumQ16:words(original,body+0x40),forceQ16:words(original,body+0x74)}:null;
    const participant={index,bodyAddress:body,original:entry,borders:[]};participants.push(participant);
    if(!body||(entry.flags&511)!==3){participant.status='not-a-type3-participant';continue;}
    if(baseline.memory.readUInt32LE(0x909300+index*0x30c)!==body){participant.status='participant-root-changed-during-baseline';continue;}
    const view=baseline.views.bodyAt(body),count=view.terrainWord15c,pointer=baseline.memory.readUInt32LE(body+0x154);
    if(!Number.isInteger(count)||count<0||count>64)throw Error('Original generated terrain candidate count exceeds64.');
    const unique=new Set();
    for(let i=0;i<count;i++){
      const c=baseline.views.candidateAt(pointer+i*16);if(c.type!==6&&c.type!==7)continue;
      const normalQ16=c.normalQ8.map(v=>v<<8),key=normalQ16.join(',');if(unique.has(key)||participant.borders.length>=maxDirectionsPerParticipant)continue;unique.add(key);
      const sector=baseline.geometry.grid.sectors[c.sector],point=sector.vertices[c.vertexBase+c.pointOffset].slice(0,3);
      const border={candidateAddress:c.address,candidateHex:c.bytes.toString('hex'),type:c.type,cellId:c.id|0,sector:c.sector,row:c.row,column:c.column,vertexBase:c.vertexBase,pointOffset:c.pointOffset,planePoint:point,normalQ16,packedNormal:c.packedNormal,
        provenance:'Genuine baseline ordinary preparation/candidate generation from retained entry, with complete native baseline output equality; original candidate/geometry bytes retained.'};participant.borders.push(border);
      for(const scalar of scalarsQ16)for(const sign of [-1,1]){
        if(attempts.length>=maxAttempts)throw Error('Declared force plan exceeds its bounded attempt budget.');
        attempts.push({index:attempts.length,participantIndex:index,bodyAddress:body,border,signedScalarQ16:sign*scalar,incrementQ16:forceAlongBorderNormal(normalQ16,sign*scalar)});
      }
    }
    participant.status=participant.borders.length?'actual-border-directions-planned':'no-admissible-border-candidate';
  }
  return {scalarsQ16:[...scalarsQ16],maxDirectionsPerParticipant,maxAttempts,participants,attempts,arithmetic:'increment[axis]=signed64(normalQ16[axis]*signedScalarQ16)>>16 via actual multiplyQ16; checked addition to original force, no wrap/clamp. Both signs are tested; no world-axis assumption.'};
}

export async function checkNativeChassisBorderPreflight(input,output,options={}){
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8')),pairing=pairNativeFrameSnapshots(capture,configuration);
  if(pairing.pairs.length!==1)throw Error('Chassis preflight requires one complete retained native frame.');
  const pair=pairing.pairs[0],originalHashes=rowsOf(pair.before).map(r=>sha(r.bytes)),attempts=[];
  const report={schemaVersion:1,authority:'offline-declared-force-source-preflight',targetSha256:REDUX_SHA256,inputDirectory:path.resolve(input),clock:pair.before.ranges.get('clock').bytes.readUInt32LE(),beforeOrdinal:pair.before.ordinal,afterOrdinal:pair.after.ordinal,
    originalGameLaunched:false,nativeControlledExperimentPerformed:false,sourceScenarioFound:false,attempts,limits:['Only a declared force accumulator input is modified; no original pose, orientation, momentum, spatial/shape/cache or vehicle state is manufactured.','A successful complete source forecast is not an original-process controlled collision match.','Natural/controlled native chassis walls, ceiling contacts and sustained inverted driving remain separate required runtime scenarios.','Missing geometry, effect/audio state or callback dependencies are retained; partial dispatcher events never establish a winning attempt.']};
  try{
    const baseline=traceNativeFrameDispatches(pair.before,pair.options),comparison=compareNativeFramePair(pair,baseline);
    report.baseline={sourceComplete:true,nativeFrameMatched:comparison.matched,comparedBytes:comparison.comparedBytes,firstDivergence:comparison.firstDivergence,processedEvents:baseline.report.processedEvents,modelQueries:baseline.report.modelQueries,events:baseline.dispatchEvents};
    if(!comparison.matched)throw Error('Unmodified native baseline does not match; no force plan is admitted.');
    const plan=planChassisBorderForces(pair.before,baseline,options),nativeAfter=createCapturedMemory(rowsOf(pair.after)).memory;
    for(const participant of plan.participants)for(const border of participant.borders){
      const actual=nativeAfter.subarray(border.candidateAddress,border.candidateAddress+16).toString('hex');
      if(actual!==border.candidateHex)throw Error('Baseline border candidate does not match its independently retained native after bytes.');
      border.nativeAfterCandidateMatched=true;
    }
    report.plan=plan;
    for(const spec of plan.attempts){
      const result={index:spec.index,participantIndex:spec.participantIndex,bodyAddress:spec.bodyAddress,border:spec.border,signedScalarQ16:spec.signedScalarQ16,incrementQ16:spec.incrementQ16,sourceComplete:false,nativeOutputCompared:false,qualifyingEvents:[]};attempts.push(result);
      try{
        const changed=cloneNativeFrameWithForce(pair.before,spec);result.inputProof=changed.proof;
        const replay=traceNativeFrameDispatches(changed.snapshot,pair.options);result.sourceComplete=true;result.status='complete-source-miss';
        result.physics={preparedBodies:replay.report.preparedBodies,finishedBodies:replay.report.finishedBodies,processedEvents:replay.report.processedEvents,terrainQueries:replay.report.terrainQueries,modelQueries:replay.report.modelQueries,modelHits:replay.report.modelHits,nativeReturn:replay.report.nativeReturn};
        result.events=replay.dispatchEvents;
        result.qualifyingEvents=replay.dispatchEvents.filter(e=>e.before.kind===1&&e.before.object1?.type===3&&e.before.object1.address===spec.bodyAddress&&e.classification.category==='terrain-border'&&['swept-contact','penetration-contact','sliding-contact'].includes(e.classification.response)&&e.classification.matchingPlaneTypes.length&&e.classification.matchingPlaneTypes.every(t=>t===6||t===7)).map(e=>({eventIndex:e.index,bodyAddress:e.before.object1.address,deltaQ16:e.before.deltaQ16,classFlags:e.before.classFlags,normalQ16:e.before.normalQ16,cellId:e.before.field44,classification:e.classification,matchingActualCandidates:e.before.terrainCandidates.filter(c=>[6,7].includes(c.type)&&c.id===e.before.field44&&c.normalQ16.every((v,i)=>v===e.before.normalQ16[i])),samePlannedPlane:e.before.field44===spec.border.cellId&&e.before.normalQ16.every((v,i)=>v===spec.border.normalQ16[i])}));
        if(result.qualifyingEvents.length){result.status='complete-source-chassis-border';report.sourceScenarioFound=true;}
      }catch(error){result.status='unbound-or-failed-source-attempt';result.failure={stage:error.replayStage??'declared-force-input',message:error.message,stack:error.stack};result.partialDispatchRecords=error.dispatchRecords??[];}
    }
    report.preflightCompleted=true;
  }catch(error){report.preflightCompleted=false;report.failure={stage:error.replayStage??'baseline-or-plan',message:error.message,stack:error.stack};}
  report.originalInputBytesUnchanged=rowsOf(pair.before).every((r,i)=>sha(r.bytes)===originalHashes[i]);
  if(!report.originalInputBytesUnchanged)throw Error('Offline preflight mutated the original retained input.');
  const samePlane=attempts.filter(r=>r.sourceComplete&&r.qualifyingEvents.some(e=>e.samePlannedPlane));
  report.summary={attempts:attempts.length,completeSourceAttempts:attempts.filter(r=>r.sourceComplete).length,unboundOrFailedAttempts:attempts.filter(r=>!r.sourceComplete).length,sourceChassisBorderAttempts:attempts.filter(r=>r.qualifyingEvents.length).length,
    samePlannedPlaneAttempts:samePlane.length,smallestSamePlaneAttemptIndex:samePlane.sort((a,b)=>Math.abs(a.signedScalarQ16)-Math.abs(b.signedScalarQ16)||a.index-b.index)[0]?.index??null};
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[input,output]=process.argv.slice(2);if(!input||!output||process.argv.length!==4)throw Error('Usage: node tools/check-native-chassis-border-preflight.mjs CAPTURE_DIRECTORY NEW_REPORT_FILE');
  const report=await checkNativeChassisBorderPreflight(input,output);console.log(JSON.stringify({preflightCompleted:report.preflightCompleted,sourceScenarioFound:report.sourceScenarioFound,...report.summary,failure:report.failure?.message,output}));
  if(!report.preflightCompleted||!report.sourceScenarioFound)process.exitCode=1;
}
