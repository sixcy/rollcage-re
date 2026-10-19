import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateVehicleSpecialState} from '../src/vehicle-special.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['263-vehicle-special-stage-assembly.json','256-wheel-cross-assembly.json','220-wheel-drive-dot-assembly.json','244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const root=0x1000;let suppliedBasis,nativeEvents=[];
const vector=(bytes,p)=>[0,1,2].map(axis=>bytes.readInt32LE(p+axis*4));
const putVector=(bytes,p,v)=>v.forEach((value,axis)=>bytes.writeInt32LE(value,p+axis*4));
const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x47d900,m=>{nativeEvents.push(['event',m.r.EDX]);m.bytes.writeInt32LE((m.bytes.readInt32LE(root+0x40)+17)|0,root+0x40);}],[0x417210,m=>{nativeEvents.push(['basis']);if(suppliedBasis){putVector(m.bytes,m.r.ECX,suppliedBasis.tangentQ16);putVector(m.bytes,m.r.EDX,suppliedBasis.normalQ16);}m.r.EAX=suppliedBasis?1:0;}]])});
function encode(bytes,base,body,state,drive) {
 for(const [key,p]of [['momentum',0x40],['angularMomentum',0x4c],['torque',0x80]])putVector(bytes,base+p,body[key]);
 body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,base+0xc4+index*2));bytes.writeInt32LE(drive.capacityOverride,base+0x3d04);bytes.writeInt32LE(drive.specialTimer,base+0x3d08);
 state.wheels.forEach((wheel,index)=>{const p=base+0x324+index*200;bytes[p]=wheel.flags;putVector(bytes,p+0x40,wheel.normal);});
}
export function verifyVehicleSpecial(inputBody,inputState,inputDrive,basis) {
 const body=structuredClone(inputBody),state=structuredClone(inputState),drive=structuredClone(inputDrive),events=[];machine.reset();nativeEvents=[];suppliedBasis=basis;
 const bytes=machine.bytes;bytes.fill(0xa5,root,root+0x4000);encode(bytes,root,body,state,drive);const expected=Buffer.from(bytes.subarray(root,root+0x4000));
 const result=updateVehicleSpecialState(body,state,drive,{readTrackBasis:()=>{events.push(['basis']);return basis;},onSpecialEvent:({code})=>{events.push(['event',code]);body.momentum[0]=(body.momentum[0]+17)|0;}});encode(expected,0,body,state,drive);
 machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);const steps=machine.run();
 if(!bytes.subarray(root,root+0x4000).equals(expected)||JSON.stringify(events)!==JSON.stringify(nativeEvents))throw Error(`Vehicle special mismatch: ${JSON.stringify({inputBody,inputState,inputDrive,basis,body,drive,result,events,nativeEvents,nativeMomentum:vector(bytes,root+0x40),nativeAngular:vector(bytes,root+0x4c),nativeTorque:vector(bytes,root+0x80)})}`);
 return {steps,result,events};
}
export async function checkVehicleSpecial() {
 let seed=0x41e510ab;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=4000,histogram={inactive:0,applied:0,events:0,basisCalls:0,normalOverride:0},matrices=[[4096,0,0,0,4096,0,0,0,4096],[0,0,4096,0,4096,0,-4096,0,0],[4096,0,0,0,-4096,0,0,0,-4096]],normals=[[0,-65536,0],[0,65536,0],[46340,0,46340]],timers=[0,20,21,22,24,25,26,39,40,41,2147483647,-2147483648];let instructionSteps=0;
 for(let fixture=0;fixture<fixtures;fixture++) {
  const body={momentum:[0,1,2].map(()=>random(0xffffffff)|0),angularMomentum:[0,1,2].map(()=>random(0xffffffff)|0),torque:[0,1,2].map(()=>random(0xffffffff)|0),rotation:matrices[random(matrices.length)]};
  const state={wheels:Array.from({length:4},(_,index)=>({flags:fixture>>index&1,normal:normals[random(normals.length)]}))},drive={capacityOverride:[0,1,2,3,-1][random(5)],specialTimer:timers[random(timers.length)]},basis=fixture%8?{normalQ16:normals[random(normals.length)],tangentQ16:fixture%7?[0,1,2].map(()=>random(0x200001)-0x100000):[0,0,0]}:null;
  const check=verifyVehicleSpecial(body,state,drive,basis);instructionSteps+=check.steps;if(!check.result.active)histogram.inactive++;if(check.result.applied)histogram.applied++;if(check.result.contacts>1&&check.result.applied&&JSON.stringify(check.result.normalQ16)!==JSON.stringify(basis?.normalQ16))histogram.normalOverride++;
  check.events.forEach(event=>histogram[event[0]==='event'?'events':'basisCalls']++);
 }
 const report={method:'Bounded interpretation of retained special-state timer/force caller and cross/dot/normalization/root/division callees. Compares all 16384 vehicle bytes and callback order. Track-basis provider is an explicit synthetic-vector mock; transition event is a deterministic momentum-mutating mock. Their native implementations are not verified. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps,histogram,matched:true};
 await writeFile('analysis/vehicle-special-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkVehicleSpecial();
