import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {clampVehicleAtRest,dampAirborneSpin,assistAirborneOrientation,applyVehicleAssists} from '../src/vehicle-assists.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['241-wheel-rest-clamp-assembly.json','242-wheel-air-spin-assembly.json','243-wheel-air-upright-assembly.json','256-wheel-cross-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const machine=new BoundedX86(instructions),root=0x1000;
const stages={rest:[0x47ac50,clampVehicleAtRest],airSpin:[0x47ada0,dampAirborneSpin],orientation:[0x47ae30,assistAirborneOrientation]};
function encode(bytes,base,body,state,drive) {
 for(const [vector,p]of [[body.momentum,0x40],[body.angularMomentum,0x4c]])vector.forEach((value,index)=>bytes.writeInt32LE(value,base+p+index*4));
 body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,base+0xc4+index*2));bytes.writeInt32LE(drive.multiplierQ16,base+0x650);bytes[base+0x64e]=drive.inputByte;bytes[base+0x66e]=state.airSpinCounter;
 state.wheels.forEach((wheel,index)=>{const p=base+0x324+index*200;bytes[p]=wheel.flags;bytes.writeInt32LE(wheel.spin,p+0x58);bytes.writeInt32LE(wheel.angle,p+0x78);});
}
export function verifyVehicleAssists(inputBody,inputState,drive,{stage='sequence'}={}) {
 const body=structuredClone(inputBody),state=structuredClone(inputState);machine.reset();const bytes=machine.bytes;bytes.fill(0xa5,root,root+0x700);encode(bytes,root,body,state,drive);
 const expected=Buffer.from(bytes.subarray(root,root+0x700)),result=stage==='sequence'?applyVehicleAssists(body,state,drive):stages[stage][1](body,state,drive);encode(expected,0,body,state,drive);
 let steps=0;for(const address of stage==='sequence'?Object.values(stages).map(value=>value[0]):[stages[stage][0]]){machine.entry=address;machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();}
 if(!bytes.subarray(root,root+0x700).equals(expected))throw Error(`Vehicle assist mismatch: ${JSON.stringify({stage,inputBody,inputState,drive,body,state,result,nativeMomentum:[0,1,2].map(i=>bytes.readInt32LE(root+0x40+i*4)),nativeAngular:[0,1,2].map(i=>bytes.readInt32LE(root+0x4c+i*4)),nativeCounter:bytes[root+0x66e]})}`);
 return {steps,result};
}
export async function checkVehicleAssists() {
 let seed=0x47ac50ab;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=3000,histogram={rest:0,airSpin:0,orientation:0},matrices=[[4096,0,0,0,4096,0,0,0,4096],[4096,0,0,0,0,-4096,0,4096,0],[0,-4096,0,4096,0,0,0,0,4096],[4096,0,0,0,-4096,0,0,0,-4096]];
 const edges=[0,7999,8000,8001,37999,38000,38001,47999,48000,48001,7999999,8000000,8000001,2147483647,-2147483648];let instructionSteps=0,checks=0;
 for(let fixture=0;fixture<fixtures;fixture++) {
  const body={momentum:fixture&1?[0,0,edges[random(edges.length)]]:[0,1,2].map(()=>random(100001)-50000),angularMomentum:fixture%3?[0,edges[random(edges.length)]*(fixture&1?1:-1)|0,0]:[0,1,2].map(()=>random(0xffffffff)|0),rotation:fixture%5?matrices[random(matrices.length)]:Array.from({length:9},()=>random(8193)-4096)};
  const state={airSpinCounter:[0,1,29,30,31,254,255][random(7)],wheels:Array.from({length:4},(_,index)=>({flags:fixture%4===0?8:((fixture>>index)&1),spin:random(0xffffffff)|0,angle:random(0xffffffff)|0}))},drive={multiplierQ16:fixture%3?0:65536,inputByte:fixture&1?0:128};
  for(const stage of ['rest','airSpin','orientation','sequence']){const check=verifyVehicleAssists(body,state,drive,{stage});instructionSteps+=check.steps;checks++;if(stage==='sequence')for(const key of Object.keys(histogram))if(check.result[key])histogram[key]++;}
 }
 const report={method:'Bounded interpretation of retained rest clamp, airborne spin/orientation assists and cross/root/division callees, individually and in native sequence. Compares every byte of the 1792-byte vehicle region with threshold, flag-byte, signed-overflow and byte-counter wrap fixtures. No helper stubs or original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,checks,instructionSteps,histogram,matched:true};
 await writeFile('analysis/vehicle-assists-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkVehicleAssists();
