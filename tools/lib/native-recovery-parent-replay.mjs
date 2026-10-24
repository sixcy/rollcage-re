import {bindCapturedNativeRecovery} from './native-recovery-context.mjs';
import {nativePostFrameBoundaries} from './native-post-frame-replay.mjs';
import {extendNativeFrameGeometryComparison} from './native-frame-replay.mjs';
import {runRawPostFrameBodyStates} from '../../src/raw-respawn-state.mjs';
import {nativeMemoryAddress} from '../../src/native-memory-spans.mjs';
import {nativeGlobalAddress} from '../../src/native-global-address.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export async function verifyNativeRecoveryParentBoundaries(){
  const records=await Promise.all(['098-post-frame-body-states-assembly.json','310-race-step-parent-assembly.json','100-respawn-position-query-assembly.json','102-respawn-apply-assembly.json'].map(name=>readInstructionEvidence([name],{directory:'analysis/native-simulation/results'})));
  if(records.some(row=>row.evidence.some(value=>value.subject?.digest?.sha256!==REDUX_SHA256)))throw Error('Native recovery boundary target SHA differs.');
  const listing=new Map(records.flatMap(row=>row.instructions).map(row=>[row.address,row]));
  for(const[address,op,args]of [[0x47ccc0,'SUB',['ESP','0x54']],[0x47d02d,'RET',[]],[0x45101c,'CALL',['0x0047ccc0']],[0x47cf11,'CALL',['0x0047d040']],[0x47d42a,'RET',[]],[0x47d434,'RET',[]],[0x47cf37,'CALL',['0x0047d440']],[0x47d6ed,'RET',[]],[0x47d703,'RET',[]]]){
    const actual=listing.get(address);if(actual?.op!==op||JSON.stringify(actual.args)!==JSON.stringify(args))throw Error(`Native recovery boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds:records.flatMap(row=>row.evidence.map(value=>value.evidence_id)),boundaries:nativePostFrameBoundaries};
}

// Add exact native route/progression/controller observations. These are actual
// pointers/counts; no authored parser offsets or invented allocation tail.
function observeRecoveryStructures(bound,observations){
  const {memory:m}=bound,ptr=p=>m.readUInt32LE(p),add=(address,length,evidence)=>{
    if(!length)return;const bytes=m.subarray(address,address+length),actual=nativeMemoryAddress(m,bytes);
    if(actual===null)throw Error('Recovery comparison structure lacks native ownership.');
    const key=`${actual}:${length}`;observations.set(key,{id:`native-recovery-${actual.toString(16)}-${length.toString(16)}`,address:actual,length,comparison:'mutable',evidence});
  };
  const pack=ptr(0x90b98c),routeCount=m[pack+0x46],groups=ptr(pack+0x60);add(groups,routeCount*12,'47ccc0 actual12-byte route groups; leading group0 remains observed.');
  for(let index=1;index<routeCount;index++){
    const route=groups+index*12,count=m.readUInt16LE(route),points=ptr(route+8);add(points,count*16,'47ccc0 actual route point count and pointer,16-byte rows.');
    if(count===1)add(points-16,16,'47ccc0 one-point group may read its previous adjacent point; explicit native-readable neighbor, not invented capacity.');
  }
  const checkpointCount=m[pack+0x44],ids=ptr(pack+0x90);add(ids,checkpointCount*4,'44a2e0 actual checkpoint-ID groups.');
  let maximum=-1;for(let i=0;i<checkpointCount*4;i++)if(m[ids+i]!==255)maximum=Math.max(maximum,m[ids+i]);
  add(ptr(pack+0x70),(maximum+1)*20,'44a2e0/449d40 checkpoint backing bounded by actual captured IDs.');
  const count=m.readUInt16LE(nativeGlobalAddress(m,0x902bc4)),list=ptr(nativeGlobalAddress(m,0x902bc0));
  for(let index=0;index<count;index++){
    const body=ptr(list+index*4);if(m.readInt32LE(body+0x128)!==32)continue;
    const type=ptr(body)&511;
    if([4,7,21,33].includes(type))add(ptr(body+0x164),type===4?0x3b:type===33?12:6,'47ccc0 reached native controller fields for rejected-body type.');
    else if(type===3){const controller=ptr(0x909318+m.readUInt16LE(body+0x65e)*0x30c);if(controller!==0x12345678)add(controller,0x3a,'47d440 actual participant controller through byte39.');}
  }
}

export function replayNativeRecoveryParent(snapshot,options={}){
  let stage='recovery-context';
  try{
    const bound=bindCapturedNativeRecovery(snapshot,options),{manifest,memory,geometry}=bound;
    const actual=address=>manifest.moduleBaseAddress+address-0x400000,boundary=nativePostFrameBoundaries.parent;
    if(Number(snapshot.registers?.eip)!==actual(boundary.entry))throw Error('Native recovery parent entry address differs.');
    if(memory.readUInt32LE(Number(snapshot.registers?.esp))!==actual(boundary.returnAddress))throw Error('Native recovery parent caller return address differs.');
    manifest.boundary='0x47ccc0';manifest.caller='0x45101c';manifest.nativeReturnKind='void; no source EAX/ECX/EDX/EFLAGS claim';
    const observations=new Map();stage='recovery-structure-coverage';observeRecoveryStructures(bound,observations);
    stage='recovery-parent';const result=runRawPostFrameBodyStates(bound.runtime);
    stage='recovery-output-coverage';observeRecoveryStructures(bound,observations);
    extendNativeFrameGeometryComparison(manifest,[...geometry.comparisonRegions,...observations.values()]);
    return {...bound,report:{stage:'recovery-parent',...result,registersCompared:['ebx','ebp','esi','edi','esp'],limits:bound.limits}};
  }catch(error){error.replayStage=stage;throw error;}
}
