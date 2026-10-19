import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {applyWheelTractionForces} from '../src/wheel-forces.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['246-wheel-correction-stage-assembly.json','248-wheel-torque-correction-assembly.json','254-wheel-correction-scale-assembly.json','255-wheel-correction-inertia-assembly.json','256-wheel-cross-assembly.json','244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
let callbackVehicles=[];const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x42c590,m=>callbackVehicles.push(m.r.ECX)]])});
let seed=0x499e90ab,instructionSteps=0,vehicles=0,active=0,smallTorque=0;const fixtures=2000;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
const putVector=(bytes,p,vector)=>vector.forEach((value,axis)=>bytes.writeInt32LE(value,p+axis*4));
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();callbackVehicles=[];const bytes=machine.bytes,config=0x6000,count=fixture%5,expectedBodies=[];bytes.writeUInt32LE(config,0x5ecb1c);bytes[config+0x54d]=count;
 for(let index=0;index<count;index++) {
  const root=0x10000+index*0x1000,body={momentum:[0,1,2].map(()=>random(0xffffffff)|0),angularMomentum:[0,1,2].map(()=>random(0xffffffff)|0),worldInverseInertia:fixture&1?[21671,1024,-500,1024,17762,1536,-500,1536,31930]:[21671,0,0,0,17762,0,0,0,31930]};
  const wheels=Array.from({length:4},(_,wheel)=>({flags:(fixture>>wheel&1)|8,leverArm:[0,1,2].map(()=>random(80*65536)-40*65536),tractionCorrection:fixture%7===0?[0,0,0]:[0,1,2].map(()=>random(30000)-15000),correctionScaleQ16:[0,1,4096,65536][random(4)],torqueScaleQ16:random(200000)}));
  bytes.fill(0xa5,root,root+0x800);bytes.writeUInt32LE(root,0x909300+index*0x30c);putVector(bytes,root+0x40,body.momentum);putVector(bytes,root+0x4c,body.angularMomentum);body.worldInverseInertia.forEach((value,i)=>bytes.writeInt32LE(value,root+0xe4+i*4));
  wheels.forEach((wheel,i)=>{const p=root+0x324+i*200;bytes[p]=wheel.flags;putVector(bytes,p+0x28,wheel.leverArm);putVector(bytes,p+0x4c,wheel.tractionCorrection);bytes.writeInt32LE(wheel.correctionScaleQ16,p+0xc0);bytes.writeInt32LE(wheel.torqueScaleQ16,p+0xbc);});
  const expected=Buffer.from(bytes.subarray(root,root+0x800)),result=applyWheelTractionForces(body,wheels);putVector(expected,0x40,body.momentum);putVector(expected,0x4c,body.angularMomentum);expectedBodies.push({root,expected});
  result.forEach(value=>{if(value){active++;if(!value.angularImpulse.some(Boolean))smallTorque++;}});vehicles++;
 }
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 const expectedCallbacks=expectedBodies.map(value=>value.root);
 if(expectedBodies.some(({root,expected})=>!bytes.subarray(root,root+0x800).equals(expected))||JSON.stringify(expectedCallbacks)!==JSON.stringify(callbackVehicles))throw Error(`Traction force mismatch on fixture ${fixture}: ${JSON.stringify({count,expectedCallbacks,callbackVehicles,differences:expectedBodies.flatMap(({root,expected})=>{const differences=[];for(let i=0;i<expected.length&&differences.length<8;i++)if(expected[i]!==bytes[root+i])differences.push({offset:i.toString(16),port:expected[i],native:bytes[root+i]});return differences;})})}`);
}
const report={method:'Bounded interpretation of retained global wheel-force accumulation, correction, scaling, cross product, inertia transform and root/division instructions. Compares every byte of each 2048-byte vehicle region and callback order on synthetic batches of zero to four vehicles. Post-force surface particle helper 0x42c590 is explicitly mocked as an event with no state mutations. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,vehicles,active,smallTorque,instructionSteps,matched:true};
await writeFile('analysis/wheel-forces-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
