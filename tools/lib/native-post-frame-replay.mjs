// Read-only bindings for the genuine post-physics recovery graph. No native
// process launch, constructor, route answer or state reset is supplied here.
import {createCapturedMemory} from './captured-memory.mjs';
import {buildNativeFrameManifest} from './native-frame-manifest.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {extendNativeFrameGeometryComparison} from './native-frame-replay.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {checkRawPostFrameVehicles} from '../../src/raw-respawn-state.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativePostFrameBoundaries = Object.freeze({
  prepass: Object.freeze({entry:0x47e180,exit:0x47e234,caller:0x47ccff,returnAddress:0x47cd04}),
  parent: Object.freeze({entry:0x47ccc0,exit:0x47d02d,caller:0x45101c,returnAddress:0x451021}),
  query: Object.freeze({entry:0x47d040,exits:Object.freeze([0x47d42a,0x47d434]),caller:0x47cf11,returnAddress:0x47cf16}),
  apply: Object.freeze({entry:0x47d440,exits:Object.freeze([0x47d6ed,0x47d703]),caller:0x47cf37,returnAddress:0x47cf3c}),
});
export async function verifyNativePostFrameBoundaries() {
  const records=await Promise.all([
    readInstructionEvidence(['109-post-frame-vehicle-check-assembly.json'],{directory:'analysis/native-simulation/results'}),
    readInstructionEvidence(['098-post-frame-body-states-assembly.json'],{directory:'analysis/native-simulation/results'}),
  ]);
  const instructions=records.flatMap(row=>row.instructions),listing=new Map(instructions.map(row=>[row.address,row]));
  if(records.some(row=>row.evidence.some(value=>value.subject?.digest?.sha256!==REDUX_SHA256)))throw Error('Retained recovery target SHA differs.');
  for(const[address,op,args]of [[0x47e180,'MOV',['ECX','dword ptr [0x005ecb1c]']],[0x47e186,'MOV',['EAX','0x909300']],[0x47e234,'RET',[]],[0x47ccff,'CALL',['0x0047e180']],[0x47ccc0,'SUB',['ESP','0x54']],[0x47d02d,'RET',[]]]){
    const actual=listing.get(address);if(actual?.op!==op||JSON.stringify(actual.args)!==JSON.stringify(args))throw Error(`Retained recovery boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds:records.flatMap(row=>row.evidence.map(value=>value.evidence_id)),instructions};
}

//47e180 only accesses integer state. Floating-point registers are recorded as
//observed context; no PC24 numerical implementation is required by this leaf.
export function replayNativeVehiclePrepass(snapshot,options={}) {
  let stage='core-coverage';
  try{
    const manifest=buildNativeFrameManifest(snapshot,options),rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
    manifest.boundary='0x47e180';manifest.caller='0x47ccff';manifest.nativeReturnKind='EAX=relocated909300+capturedParticipantCount*30c; no game success/failure return';
    const captured=createCapturedMemory(rows,{aliases:manifest.aliases}),{memory}=captured;
    const actual=address=>manifest.moduleBaseAddress+address-0x400000;
    if(Number(snapshot.registers?.eip)!==actual(nativePostFrameBoundaries.prepass.entry))throw Error('Native vehicle prepass entry address differs.');
    const esp=Number(snapshot.registers?.esp);
    if(memory.readUInt32LE(esp)!==actual(nativePostFrameBoundaries.prepass.returnAddress))throw Error('Native vehicle prepass caller return address differs.');
    const count=memory[memory.readUInt32LE(0x5ecb1c)+0x54d];
    stage='geometry-binding';const geometry=createNativeFrameGeometry({...options.geometryOptions,memory});
    stage='vehicle-prepass';checkRawPostFrameVehicles({memory});
    stage='geometry-comparison-coverage';extendNativeFrameGeometryComparison(manifest,geometry.comparisonRegions);
    const expectedEax=(actual(0x909300)+count*0x30c)>>>0;
    const numericalContext=decodePhysicsNumericalContext({x87ControlWord:Number(snapshot.registers?.fpuControlWord),mxcsr:Number(snapshot.registers?.mxcsr)});
    return {...captured,manifest,geometry,numericalContext,report:{stage:'vehicle-prepass',participantCount:count,expectedEax,registersCompared:['eax','ebx','ebp','esi','edi','esp'],
      limits:['Exact47e180 integer prepass only; parent47ccc0 route selection/query/apply/emission remains a separate stage.', 'Private saved-register stack bytes and volatileECX/EDX/EFLAGS are outside this source comparison.']}};
  }catch(error){error.replayStage=stage;throw error;}
}

export function replayNativePostFrame(snapshot,{stage='vehicle-prepass',...options}={}) {
  if(stage==='vehicle-prepass')return replayNativeVehiclePrepass(snapshot,options);
  throw Error(`Native post-frame stage ${stage} is not yet bound; recovery query/apply/parent require captured clone, route, progression and reached service context.`);
}
