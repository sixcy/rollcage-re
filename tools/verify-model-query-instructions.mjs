// Interpret retained x86 model-ray, containment and fraction instructions.
// No original target process runs. Only the security-cookie check is stubbed.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {queryModelShapeRay} from '../src/model-query.mjs';
import {boxCollision} from './lib/model-query-fixtures.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await readEvidence('173-model-shape-contact-assembly.json'),containment=await readEvidence('193-model-polygon-containment-assembly.json'),fraction=await readEvidence('197-model-fraction-helper-assembly.json'),table=await readEvidence('196-model-query-switch-table.json');
const instructions=[evidence,containment,fraction].flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{
 const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Unsupported assembly line: ${line}`);
 return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};
}));
export {instructions as modelQueryInstructions};
export const modelQueryTables=[table.normalized_result];
const machine=new BoundedX86(instructions,{tables:[table.normalized_result],externalCalls:new Map([[0x568162,()=>{}]])});
export function verifyModelShapeRay(collision,shape,query,options={}) {
 machine.reset();const bytes=machine.bytes,body=0x1000,probe=0x2000,out=0x3000,model=0x4000,shapeAddress=0x5000,edgeBase=0x6000,recordBase=0x8000,vertexBase=0x10000,faceBase=0x12000;
 const position=options.positionQ16??[0,0,0],limit=options.maxFractionQ16??65536;
 bytes.writeUInt32LE(model,body+0x10);bytes.writeUInt32LE(faceBase,body+0x2c);bytes.writeUInt32LE(vertexBase,model+0x40);bytes.writeUInt16LE(recordBase-model,model+0x38);bytes.writeUInt16LE(edgeBase-model,model+0x3a);
 for(let axis=0;axis<3;axis++){bytes.writeInt32LE(position[axis],body+0x34+axis*4);bytes.writeInt32LE(query.originQ8[axis],probe+8+axis*4);bytes.writeInt32LE(query.deltaQ8[axis],probe+0x14+axis*4);}
 for(let index=0;index<collision.vertices.length;index++)for(let axis=0;axis<4;axis++)bytes.writeInt16LE(((collision.vertices[index][axis]??0)<<16)>>16,vertexBase+index*8+axis*2);
 for(let index=0;index<collision.faces.length;index++){const face=collision.faces[index],p=faceBase+index*8;Buffer.from(face.indices).copy(bytes,p);bytes.writeUInt32LE(face.packedNormal>>>0,p+4);}
 for(const record of collision.faceRecords)record.raw.copy(bytes,recordBase+record.index*9);
 for(const edge of collision.edges)edge.raw.copy(bytes,edgeBase+edge.index*8);
 shape.raw.copy(bytes,shapeAddress);bytes.writeInt32LE(0x12345678,probe+0x38);bytes.fill(0xa5,out,out+36);
 const result=queryModelShapeRay(collision,shape,query,options),expected=Buffer.from(bytes.subarray(out,out+36));expected.writeInt32LE(result.flags,28);
 if(result.flags){for(let axis=0;axis<3;axis++){expected.writeInt32LE(result.pointQ8[axis],axis*4);expected.writeInt32LE(result.normalQ8[axis],12+axis*4);}expected.writeInt32LE(result.distanceQ8,24);}
 machine.r.EDX=body;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);
 for(const [index,value]of [shapeAddress,probe,out,limit].entries())bytes.writeUInt32LE(value,0x9004+index*4);
 const steps=machine.run(),actual=bytes.subarray(out,out+36),expectedSurface=result.flags?result.querySurfaceRef:0x12345678;
 if(machine.r.EAX!==result.fractionQ16||!actual.equals(expected)||bytes.readInt32LE(probe+0x38)!==expectedSurface)throw Error(`Model query mismatch: native-model fraction=${machine.r.EAX}, port=${result.fractionQ16}, native-model=${actual.toString('hex')}, port=${expected.toString('hex')}; input=${JSON.stringify({shapeIndex:shape.index,query,options})}`);
 return {steps,flags:result.flags,fractionQ16:result.fractionQ16};
}
export async function checkSyntheticModelRays() {
 let seed=0x4240cafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=4000;let instructionSteps=0,hits=0,misses=0;
 for(let index=0;index<fixtures;index++) {
  const collision=boxCollision({triangles:!!(index&1),radius:16+random(48)}),shape=collision.shapes[0];
  if(index%17===0){shape.faceCount=index%3;shape.raw.writeUInt32LE(shape.faceCount<<16,16);}
  const positionQ16=[random(2001)-1000,random(2001)-1000,random(2001)-1000].map(value=>value*65536+random(65536));
  const originQ8=positionQ16.map(value=>(value>>8)+random(240*256)-120*256),deltaQ8=[0,1,2].map(()=>random(200*256)-100*256);
  if(index%4===0){originQ8[0]=(positionQ16[0]>>8)-100*256;originQ8[1]=positionQ16[1]>>8;originQ8[2]=positionQ16[2]>>8;deltaQ8[0]=200*256;deltaQ8[1]=0;deltaQ8[2]=0;}
  const result=verifyModelShapeRay(collision,shape,{originQ8,deltaQ8},{positionQ16,maxFractionQ16:index%3?65536:32768});
  instructionSteps+=result.steps;if(result.flags)hits++;else misses++;
 }
 const report={method:'Bounded interpretation of retained model-ray, polygon and fraction x86 instructions, with synthetic zero-radius rays. Security-cookie check stubbed; sphere helpers are not admitted. No original process execution.',evidence:[evidence.evidence_id,containment.evidence_id,fraction.evidence_id,table.evidence_id],instructions:instructions.length,fixtures,instructionSteps,hits,misses,matched:true};
 await writeFile('analysis/model-ray-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkSyntheticModelRays();
