// Complete shape query and its admitted point/edge helpers from retained x86.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {readStaticSpherePrimitiveEvidence,initializeStaticSpherePrimitiveTables} from './lib/static-sphere-primitive-evidence.mjs';
import {queryModelShapeSphere} from '../src/model-sphere-query.mjs';
import {sphereBoxCollision} from './lib/model-sphere-fixtures.mjs';
const own=await readInstructionEvidence(['173-model-shape-contact-assembly.json','193-model-polygon-containment-assembly.json']),primitive=await readStaticSpherePrimitiveEvidence(),tableReply=JSON.parse(await readFile('analysis/scene/results/196-model-query-switch-table.json','utf8')),table=tableReply.structuredContent??JSON.parse(tableReply.content.find(c=>c.type==='text').text),evidence=[...own.evidence,...primitive.evidence,table],instructions=[...own.instructions,...primitive.instructions];
export const modelSphereInstructions=instructions;
export const modelSphereTables=[table.normalized_result];
const machine=new BoundedX86(instructions,{tables:modelSphereTables,externalCalls:new Map([[0x568162,()=>{}]])});await initializeStaticSpherePrimitiveTables(machine);
const put=(bytes,p,values)=>values.forEach((value,i)=>bytes.writeInt32LE(value|0,p+i*4));
export function verifyModelShapeSphere(collision,shape,input,options={},initial={flags:0x1234,point:[1,2,3],normal:[4,5,6],scalar:7}) {
 machine.reset();machine.fpuRounding=options.roundingMode??'nearest-even';const bytes=machine.bytes,body=0x1000,probe=0x2000,out=0x3000,model=0x4000,shapeAddress=0x5000,edgeBase=0x6000,recordBase=0x8000,vertexBase=0x10000,faceBase=0x12000;
 const position=options.positionQ16??[0,0,0],limit=options.maxFractionQ16??65536,query=structuredClone(input),output=structuredClone(initial);
 bytes.writeUInt32LE(model,body+0x10);bytes.writeUInt32LE(faceBase,body+0x2c);bytes.writeUInt32LE(vertexBase,model+0x40);bytes.writeUInt16LE(recordBase-model,model+0x38);bytes.writeUInt16LE(edgeBase-model,model+0x3a);
 put(bytes,body+0x34,position);put(bytes,probe+8,query.originQ8);put(bytes,probe+0x14,query.deltaQ8);bytes.writeInt32LE(query.radiusQ8??0,probe+0x40);bytes.writeInt32LE(query.surfaceRef??0x12345678,probe+0x38);
 for(let index=0;index<collision.vertices.length;index++)for(let axis=0;axis<4;axis++)bytes.writeInt16LE(((collision.vertices[index][axis]??0)<<16)>>16,vertexBase+index*8+axis*2);
 for(let index=0;index<collision.faces.length;index++){const face=collision.faces[index],p=faceBase+index*8;Buffer.from(face.indices).copy(bytes,p);bytes.writeUInt32LE(face.packedNormal>>>0,p+4);}
 for(const record of collision.faceRecords)record.raw.copy(bytes,recordBase+record.index*9);
 for(const edge of collision.edges)edge.raw.copy(bytes,edgeBase+edge.index*8);
 shape.raw.copy(bytes,shapeAddress);bytes.fill(0xa5,out,out+36);put(bytes,out,initial.point);put(bytes,out+12,initial.normal);bytes.writeInt32LE(initial.scalar,out+24);bytes.writeInt32LE(initial.flags,out+28);
 const before=Buffer.from(bytes.subarray(probe,probe+72)),expected=Buffer.from(bytes.subarray(out,out+36)),time=queryModelShapeSphere(collision,shape,query,output,{...options,roundingMode:machine.fpuRounding});
 put(expected,0,output.point);put(expected,12,output.normal);expected.writeInt32LE(output.scalar,24);expected.writeInt32LE(output.flags,28);if(query.surfaceRef!==undefined)before.writeInt32LE(query.surfaceRef,0x38);
 machine.entry=0x424040;machine.r.EDX=body;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);[shapeAddress,probe,out,limit].forEach((value,i)=>bytes.writeUInt32LE(value>>>0,0x9004+i*4));
 const steps=machine.run(),actual=bytes.subarray(out,out+36);
 if(machine.r.EAX!==time||!actual.equals(expected)||!bytes.subarray(probe,probe+72).equals(before))throw Error(`Model sphere mismatch: ${JSON.stringify({time,nativeTime:machine.r.EAX,output,nativeOutput:{point:[0,1,2].map(i=>actual.readInt32LE(i*4)),normal:[0,1,2].map(i=>actual.readInt32LE(12+i*4)),scalar:actual.readInt32LE(24),flags:actual.readInt32LE(28)},surfaceRef:query.surfaceRef,nativeSurface:bytes.readInt32LE(probe+0x38),input,options,count:shape.faceCount})}`);
 return {steps,time,flags:output.flags};
}
export async function checkModelShapeSpheres() {
 let seed=0x424040ab,steps=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,modes=['nearest-even','toward-zero','down','up'],histogram={},fixtures=5000;
 for(let i=0;i<fixtures;i++) {
  const collision=sphereBoxCollision({triangles:!!(i&1),radius:8+random(48)}),shape=collision.shapes[0];
  if(i%7===0){shape.faceCount=i%3;shape.raw.writeUInt32LE(shape.faceCount<<16,16);if(shape.faceCount===1){shape.center=[3,-4,5];shape.center.forEach((v,j)=>shape.raw.writeInt16LE(v,j*2));}}
  shape.slot=random(16);shape.raw.writeUInt32LE(shape.slot,12);
  const positionQ16=[0,1,2].map(()=>((random(2001)-1000)*65536+random(65536))|0),originQ8=positionQ16.map(v=>(v>>8)+random(160*256)-80*256),deltaQ8=[0,1,2].map(()=>random(160*256)-80*256);
  if(i%5===0){originQ8[0]=(positionQ16[0]>>8)-80*256;originQ8[1]=positionQ16[1]>>8;originQ8[2]=positionQ16[2]>>8;deltaQ8[0]=160*256;deltaQ8[1]=deltaQ8[2]=0;}
  const initial={flags:signed(),point:[signed(),signed(),signed()],normal:[signed(),signed(),signed()],scalar:signed()},result=verifyModelShapeSphere(collision,shape,{originQ8,deltaQ8,radiusQ8:i%13===0?0:(1+random(24))*256,surfaceRef:signed()},{positionQ16,maxFractionQ16:[32768,65536,131072][i%3],roundingMode:modes[i%4]},initial);
  steps+=result.steps;histogram[result.flags]=(histogram[result.flags]??0)+1;
 }
 // Explicit corner fixture forces edge->endpoint redirection and the native
 // bound-based surface-reference write, which rare random contacts can miss.
 for(const roundingMode of modes){const collision=sphereBoxCollision(),result=verifyModelShapeSphere(collision,collision.shapes[0],{originQ8:[-10240,9216,-10240],deltaQ8:[20480,-18432,20480],radiusQ8:1024},{roundingMode});steps+=result.steps;}
 const report={method:'Complete retained shape query with polygon containment, point/edge contacts, vector normalization, fixed fraction, quadratic and lookup-square-root instructions. Only security-cookie check is stubbed. Synthetic convex quad/triangle boxes and point/edge/disabled shapes; output stale fields and complete query cache compared under four declared x87 rounding modes. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,targetedEndpointChecks:4,roundingModes:modes,histogram,instructionSteps:steps,matched:true};await writeFile('analysis/model-sphere-query-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkModelShapeSpheres();
