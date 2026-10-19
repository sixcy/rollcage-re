import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {boxCollision} from './lib/model-query-fixtures.mjs';
import {modelQueryInstructions,modelQueryTables} from './verify-model-query-instructions.mjs';
import {queryPlacedModelRay} from '../src/placed-model-query.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await readEvidence('191-model-contact-query-assembly.json'),yaw=await readEvidence('198-model-yaw-table.json');
const outer=evidence.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid assembly: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};});
const externalCalls=new Map([[0x568162,()=>{}],[0x421da0,machine=>{
 const object=machine.r.ECX;if(machine.bytes.readInt32LE(object+0x1b0)!==0||machine.bytes[object+0x198]!==0)throw Error('Non-inert destruction state is outside this fixture.');machine.r.EAX=0;
}]]);
const machine=new BoundedX86([...outer,...modelQueryInstructions],{tables:[...modelQueryTables,yaw.normalized_result],externalCalls});
export function verifyPlacedModelRay(candidates,query,options={}) {
 machine.reset();const bytes=machine.bytes,body=0x1000,probe=0x2000,out=0x3000,pool=0x6000;
 bytes.writeUInt32LE(options.vehicleFlags??3,body);bytes.writeInt32LE(-1,body+0x6bc);bytes.writeUInt32LE(pool,body+0x158);bytes.writeUInt16LE(candidates.length,body+0x15e);bytes[body+0x10c]=options.activeTag??0;
 if(options.specialType4){bytes.writeUInt32LE(0x1800,body+0x6bc);bytes[0x1800]=1;}
 candidates.forEach(({collision,shape,settings},index)=>{
  const model=0x10000+index*0x5000,object=0x50000+index*0x1000,shapeAddress=model+0x100,recordBase=model+0x800,edgeBase=model+0x1200,vertexBase=model+0x1800,faceBase=model+0x2000,config=object+0x200;
  bytes.writeUInt32LE(object,pool+index*16+8);bytes.writeUInt32LE(shapeAddress,pool+index*16+12);
  bytes.writeUInt32LE(model,object+0x10);bytes.writeUInt32LE(faceBase,object+0x2c);bytes.writeUInt32LE(config,object+0x194);bytes[object+0x199]=settings.yaw;bytes[object+0x19a]=settings.class;
  settings.position.forEach((value,axis)=>bytes.writeInt32LE(value<<16,object+0x34+axis*4));
  settings.configurations.forEach((value,slot)=>bytes.writeUInt32LE(value.flags>>>0,config+slot*4));
  bytes.writeUInt32LE(vertexBase,model+0x40);bytes.writeUInt16LE(recordBase-model,model+0x38);bytes.writeUInt16LE(edgeBase-model,model+0x3a);
  shape.raw.copy(bytes,shapeAddress);
  collision.vertices.forEach((vertex,i)=>vertex.forEach((value,axis)=>bytes.writeInt16LE((value<<16)>>16,vertexBase+i*8+axis*2)));
  collision.faces.forEach((face,i)=>{Buffer.from(face.indices).copy(bytes,faceBase+i*8);bytes.writeUInt32LE(face.packedNormal>>>0,faceBase+i*8+4);});
  collision.faceRecords.forEach(record=>record.raw.copy(bytes,recordBase+record.index*9));collision.edges.forEach(edge=>edge.raw.copy(bytes,edgeBase+edge.index*8));
 });
 query.originQ8.forEach((value,axis)=>bytes.writeInt32LE(value,probe+8+axis*4));query.deltaQ8.forEach((value,axis)=>bytes.writeInt32LE(value,probe+0x14+axis*4));bytes.writeUInt16LE(query.tag??0,probe+0x46);bytes.fill(0xa5,out,out+36);
 const result=queryPlacedModelRay(candidates,query,{...options,onBreakableContact:()=>false}),expected=Buffer.from(bytes.subarray(out,out+36));expected.writeUInt32LE(result.flags,28);
 if(result.flags){result.pointQ8.forEach((value,axis)=>expected.writeInt32LE(value,axis*4));result.normalQ16.forEach((value,axis)=>expected.writeInt32LE(value,axis*4+12));expected.writeInt32LE(result.distanceQ8,24);expected.writeInt32LE(-4,32);}
 machine.r.ECX=body;machine.r.EDX=probe;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(out,0x9004);bytes.writeUInt32LE(options.maxFractionQ16??65536,0x9008);
 const steps=machine.run(),actual=bytes.subarray(out,out+36);
 if(!actual.equals(expected)||machine.r.EAX!==result.fractionQ16)throw Error(`Placed model mismatch: native fraction=${machine.r.EAX}, port=${result.fractionQ16}, native=${actual.toString('hex')}, port=${expected.toString('hex')}; ${JSON.stringify({query,options,settings:candidates.map(candidate=>candidate.settings)})}`);
 for(let axis=0;axis<3;axis++)if(bytes.readInt32LE(probe+8+axis*4)!==query.originQ8[axis]||bytes.readInt32LE(probe+0x14+axis*4)!==query.deltaQ8[axis])throw Error('Native model query did not restore the ray.');
 return {steps,flags:result.flags};
}
export async function checkSyntheticPlacedModelRays() {
let seed=0x423acafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
const fixtures=3000;let instructionSteps=0,hits=0,misses=0;
for(let index=0;index<fixtures;index++) {
 const candidates=Array.from({length:1+random(4)},(_,slot)=>{
  const collision=boxCollision({triangles:!!(index&1),radius:16+random(24)}),type=[0,1,4,5][random(4)];
  return {collision,shape:collision.shapes[0],settings:{position:[slot*10-20,0,0],yaw:random(256),class:[0,1,2,3,4,5,7][random(7)],placementIndex:slot,configurations:[{type,flags:type<<24}]}};
 });
 const query={originQ8:[random(160*256)-80*256,random(160*256)-80*256,random(160*256)-80*256],deltaQ8:[random(200*256)-100*256,random(200*256)-100*256,random(200*256)-100*256],tag:index%7?100:0};
 if(index%4===0){query.originQ8=[0,-80*256,0];query.deltaQ8=[0,160*256,0];}
 const result=verifyPlacedModelRay(candidates,query,{activeTag:0,specialType4:index%5===0,vehicleFlags:index%11?3:4});instructionSteps+=result.steps;if(result.flags)hits++;else misses++;
}
const report={method:'Retained x86 outer model query, shape, containment and fraction interpretation on synthetic zero-radius candidates. Destruction state is explicitly inert; damage helper returns zero, security-cookie helper stubbed. No original process execution.',evidence:evidence.evidence_id,yawEvidence:yaw.evidence_id,instructions:outer.length+modelQueryInstructions.length,fixtures,instructionSteps,hits,misses,matched:true};
await writeFile('analysis/placed-model-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkSyntheticPlacedModelRays();
