import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {applyActiveVehicleEffect} from '../src/active-vehicle-effect.mjs';
const {evidence,instructions}=await readInstructionEvidence(['091-active-vehicle-effect-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions),root=0x10000,stateBase=0x50000,otherBase=0x51000,directionBase=0x60000,lookupBase=0x70000;
const put=(bytes,p,vector)=>vector.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4)),get=(bytes,p)=>[0,4,8].map(offset=>bytes.readInt32LE(p+offset));
function encode(bytes,p,body){put(bytes,p+0x34,body.position);body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,p+0xc4+index*2));bytes[p+0x6b4]=body.effectByte6b4;bytes.writeUInt32LE(body.effectStateAddress6bc,p+0x6bc);}
export function verifyActiveVehicleEffect(inputBody,inputDirection,effectCode,inputState,inputLookup,mutation=0){
 const body=structuredClone(inputBody),direction=inputDirection.slice(),state=Buffer.from(inputState),lookup=Buffer.from(inputLookup),other=Buffer.alloc(265,0x36),sourceLog=[],nativeLog=[];machine.reset();const bytes=machine.bytes;bytes.fill(0xa5,root,root+0x4000);encode(bytes,root,body);state.copy(bytes,stateBase);other.copy(bytes,otherBase);lookup.copy(bytes,lookupBase);put(bytes,directionBase,direction);bytes.writeUInt32LE(lookupBase,0x713180);const original=Buffer.from(bytes.subarray(root,root+0x4000));
 const snapshot=()=>{const value=Buffer.from(original);encode(value,0,body);return value;};
 function mutateSource(){
  if(mutation&1){state[1]=77;state[8]=99;other[8]=44;}
  if(mutation&2){body.position[1]=(body.position[1]+0x12345678)|0;body.rotation[2]=-32768;body.rotation[4]=12345;direction[0]=-direction[0]|0;direction[2]=(direction[2]+0x10203)|0;}
  if(mutation&4)lookup.fill((effectCode>>>8)&255);
  if(mutation&8)body.effectStateAddress6bc=otherBase;
 }
 machine.externalCalls.set(0x484bb0,m=>{
  assert.equal(m.r.ECX,24);assert.equal(m.r.EDX,root+0x34);const args=Array.from({length:7},(_,index)=>m.bytes.readInt32LE(m.r.ESP+index*4));nativeLog.push({position:get(m.bytes,root+0x34),args,body:Buffer.from(m.bytes.subarray(root,root+0x4000)),state:Buffer.from(m.bytes.subarray(stateBase,stateBase+265)),direction:get(m.bytes,directionBase),lookup:Buffer.from(m.bytes.subarray(lookupBase,lookupBase+64))});
  if(mutation&1){m.bytes[stateBase+1]=77;m.bytes[stateBase+8]=99;m.bytes[otherBase+8]=44;}
  if(mutation&2){m.bytes.writeInt32LE((m.bytes.readInt32LE(root+0x38)+0x12345678)|0,root+0x38);m.bytes.writeInt16LE(-32768,root+0xc8);m.bytes.writeInt16LE(12345,root+0xcc);m.bytes.writeInt32LE(-m.bytes.readInt32LE(directionBase)|0,directionBase);m.bytes.writeInt32LE((m.bytes.readInt32LE(directionBase+8)+0x10203)|0,directionBase+8);}
  if(mutation&4)m.bytes.fill((effectCode>>>8)&255,lookupBase,lookupBase+64);
  if(mutation&8)m.bytes.writeUInt32LE(otherBase,root+0x6bc);
 });
 const result=applyActiveVehicleEffect(body,direction,effectCode,{state,lookup,handlers:{onEmitActiveEffect:args=>{assert.equal(args.body,body);assert.equal(args.positionQ16,body.position);assert.equal(args.effectId,24);sourceLog.push({position:args.positionQ16.slice(),args:args.nativeArgs.map(value=>value===body?root:value),body:snapshot(),state:Buffer.from(state),direction:direction.slice(),lookup:Buffer.from(lookup)});mutateSource();}}});
 const expected=snapshot();machine.entry=0x482730;machine.r.ECX=root;machine.r.EDX=directionBase;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeInt32LE(effectCode,0x9004);const steps=machine.run();assert.deepEqual(bytes.subarray(root,root+0x4000),expected);assert.deepEqual(bytes.subarray(stateBase,stateBase+265),state);assert.deepEqual(bytes.subarray(otherBase,otherBase+265),other);assert.deepEqual(bytes.subarray(lookupBase,lookupBase+64),lookup);assert.deepEqual(get(bytes,directionBase),direction);assert.equal(bytes.readUInt32LE(0x713180),lookupBase);assert.deepEqual(nativeLog,sourceLog);
 return {steps,result,state,lookup,body,direction,emitted:nativeLog.length};
}
export async function checkActiveVehicleEffect(){
 let seed=0x482730ab,instructionSteps=0,emissions=0,mutatedEmissionCases=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,fixtures=4000,histogram={};
 for(let fixture=0;fixture<fixtures;fixture++){
  const body={position:[signed(),signed(),signed()],rotation:fixture%3?Array.from({length:9},()=>random(65536)-32768):[4096,0,0,0,4096,0,0,0,4096],effectByte6b4:[0,1,2,128,255][random(5)],effectStateAddress6bc:stateBase},direction=fixture%3?[signed(),signed(),signed()]:[random(1025)-512,random(1025)-512,random(1025)-512],state=Buffer.alloc(265),lookup=Buffer.alloc(64),effectCode=[0,1,31,32,0x70,255,256,-1,-2147483648,2147483647,signed()][random(11)],mutation=fixture%16;
  for(let index=0;index<state.length;index++)state[index]=random(256);for(let index=0;index<lookup.length;index++)lookup[index]=random(256);state[8]=fixture%3?0:random(255)+1;
  const result=verifyActiveVehicleEffect(body,direction,effectCode,state,lookup,mutation);instructionSteps+=result.steps;emissions+=result.emitted;if(result.emitted&&mutation)mutatedEmissionCases++;histogram[result.result.index]=(histogram[result.result.index]??0)+1;
 }
 const report={method:'Complete482730 retained instructions; only484bb0 emitter is an explicit callback. Compares full16384-byte body, captured265-byte effect state, alternate265-byte state,64-byte lookup, direction and lookup pointer global. Emitter observes full state before signed-byte decrement/status writes and receives exact effectId24/body position/seven native arguments. Declared callbacks mutate body rotation/position, current direction, lookup contents, both states and body state pointer; later arithmetic uses mutations while final writes retain captured original state identity. Lookup pointer replacement is outside this explicit Buffer contract. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,emissions,mutatedEmissionCases,lookupIndexHistogram:histogram,instructionSteps,matched:true};await writeFile('analysis/active-vehicle-effect-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkActiveVehicleEffect();
