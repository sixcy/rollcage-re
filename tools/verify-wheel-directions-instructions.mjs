import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {prepareWheelDriveDirections} from '../src/wheel-drive.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['235-wheel-preparation-assembly.json','250-wheel-cosine-assembly.json','245-wheel-short-transform-assembly.json','244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json'].map(readEvidence));
const tables=await Promise.all(['078-cosine-table.json','251-wheel-matrix-scale-bytes.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const machine=new BoundedX86(instructions,{tables:tables.map(value=>value.normalized_result),externalCalls:new Map([[0x568162,()=>{}]])});
let seed=0x41d680ab,instructionSteps=0;const fixtures=3000,random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
const matrices=[[4096,0,0,0,4096,0,0,0,4096],[0,0,4096,0,4096,0,-4096,0,0],[2896,0,2896,0,4096,0,-2896,0,2896],[4096,0,0,0,0,-4096,0,4096,0]];
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();const bytes=machine.bytes,root=0x1000,body={rotation:fixture&1?Array.from({length:9},()=>random(65536)-32768):matrices[random(matrices.length)]},wheels=Array.from({length:4},()=>({})),angle=random(0x32441)-0x19220,reverseSteering=!!random(2);
 bytes.fill(0xa5,root,root+0x700);body.rotation.forEach((value,i)=>bytes.writeInt16LE(value,root+0xc4+i*2));bytes.writeInt32LE(angle,root+0x644);bytes[root+0x64f]=reverseSteering?1:0;
 const expected=Buffer.from(bytes.subarray(root,root+0x700));prepareWheelDriveDirections(body,wheels,angle,{reverseSteering});
 wheels.forEach((wheel,index)=>wheel.driveDirection.forEach((value,axis)=>expected.writeInt32LE(value,0x358+index*200+axis*4)));
 machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 if(!bytes.subarray(root,root+0x700).equals(expected))throw Error(`Wheel direction mismatch: ${JSON.stringify({fixture,body,angle,reverseSteering,wheels,native:Array.from({length:4},(_,index)=>[0,1,2].map(axis=>bytes.readInt32LE(root+0x358+index*200+axis*4)))})}`);
}
const report={method:'Bounded interpretation of retained direction preparation, cosine, short transform, normalization and root/division instructions. Compares all 1792 vehicle bytes on synthetic rotations and wide signed-short matrices, steering/reverse inputs. Native matrix scratch loads/conversions also execute in the interpreter. Only the security-cookie helper is stubbed. No original process execution.',evidence:evidence.map(value=>value.evidence_id),tableEvidence:tables.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps,matched:true};
await writeFile('analysis/wheel-directions-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
