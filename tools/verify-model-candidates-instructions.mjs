import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {boxCollision} from './lib/model-query-fixtures.mjs';
import {buildModelCandidates} from '../src/model-candidates.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await readEvidence('184-placed-model-candidates-assembly.json'),screen=await readEvidence('187-model-volume-screen-assembly.json'),plane=await readEvidence('205-candidate-plane-filter-assembly.json'),yaw=await readEvidence('198-model-yaw-table.json');
const instructions=[evidence,screen,plane].flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
let pointCalls=0,edgeCalls=0;
const externalCalls=new Map([[0x422230,machine=>{const out=machine.bytes.readUInt32LE(machine.r.ESP);machine.bytes.writeInt32LE(pointCalls++&1?0:0x100000,out+28);machine.r.EAX=0;}],
 [0x422680,machine=>{const out=machine.bytes.readUInt32LE(machine.r.ESP+8);machine.bytes.writeInt32LE(edgeCalls++&1?0:0x80000,out+28);machine.r.EAX=65536; }]]);
const machine=new BoundedX86(instructions,{tables:[yaw.normalized_result],externalCalls});
export function verifyModelCandidates(context,body,options) {
 machine.reset();const bytes=machine.bytes,root=0x1000,query=0x2000,node=0x3000,table=0x4000,pool=0x6000;
 const registration=options.spatialState??context.spatial.lookup(body.position),list=context.links.nodes[registration.node.index].placementIndices;
 if(list.length>7)throw Error('Native static node admits at most seven placements.');
 bytes.writeUInt32LE(node,root+0xc);bytes.writeUInt32LE(pool,root+0x158);bytes.writeUInt32LE(list.length<<19,node);bytes.writeUInt32LE(table,0x9092bc);
 const objectAddresses=new Map(),shapeAddresses=new Map();
 for(const [index,placementIndex]of [...new Set(list)].entries()) {
  const {collision,settings}=context.instances.get(placementIndex),model=0x10000+index*0x5000,object=0x50000+index*0x1000,shapeBase=model+0x100,recordBase=model+0x800,edgeBase=model+0x1200,vertexBase=model+0x1800,faceBase=model+0x2000,config=object+0x200;
  objectAddresses.set(placementIndex,object);shapeAddresses.set(placementIndex,shapeBase);
  bytes.writeUInt32LE(model,object+0x10);bytes.writeUInt32LE(faceBase,object+0x2c);bytes.writeUInt32LE(config,object+0x194);bytes[object+0x199]=settings.yaw;bytes[object+0x19a]=settings.class;
  settings.position.forEach((value,axis)=>bytes.writeInt32LE(value<<16,object+0x34+axis*4));settings.configurations.forEach((value,slot)=>bytes.writeUInt32LE(value.flags>>>0,config+slot*4));
  bytes[model+0x27]=collision.shapes.length;bytes.writeUInt16LE(shapeBase-model,model+0x34);bytes.writeUInt16LE(recordBase-model,model+0x38);bytes.writeUInt16LE(edgeBase-model,model+0x3a);bytes.writeUInt32LE(vertexBase,model+0x40);
  collision.shapes.forEach((shape,i)=>shape.raw.copy(bytes,shapeBase+i*20));
  collision.vertices.forEach((vertex,i)=>vertex.forEach((value,axis)=>bytes.writeInt16LE((value<<16)>>16,vertexBase+i*8+axis*2)));
  collision.faces.forEach((face,i)=>{Buffer.from(face.indices).copy(bytes,faceBase+i*8);bytes.writeUInt32LE(face.packedNormal>>>0,faceBase+i*8+4);});
  collision.faceRecords.forEach(record=>record.raw.copy(bytes,recordBase+record.index*9));collision.edges.forEach(edge=>edge.raw.copy(bytes,edgeBase+edge.index*8));
 }
 list.forEach((placementIndex,index)=>bytes.writeUInt32LE(objectAddresses.get(placementIndex),table+(index+1)*4));
 body.position.forEach((value,axis)=>bytes.writeInt32LE(value>>8,query+8+axis*4));body.linearVelocity.forEach((value,axis)=>bytes.writeInt32LE(value>>8,query+0x14+axis*4));bytes.writeInt32LE(options.radiusQ8,query+0x40);
 const originalQuery=Buffer.from(bytes.subarray(query,query+0x48)),result=buildModelCandidates(context,body,options);bytes.fill(0xa5,pool,pool+0x1800);
 if(result.candidates.length*16>0x1800)throw Error('Fixture candidate pool exceeds its bounds.');
 const expected=Buffer.from(bytes.subarray(pool,pool+0x1800));
 result.candidates.forEach((candidate,index)=>{const p=index*16;expected[p]=0xa1;expected[p+1]=candidate.settings.yaw;expected.writeInt32LE(-4,p+4);expected.writeUInt32LE(objectAddresses.get(candidate.settings.placementIndex),p+8);expected.writeUInt32LE(shapeAddresses.get(candidate.settings.placementIndex)+candidate.shape.index*20,p+12);});
 machine.r.ECX=root;machine.r.EDX=query;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(65536,0x9004);
 const steps=machine.run(),count=bytes.readUInt16LE(root+0x15e);
 if(count!==result.candidates.length||!bytes.subarray(pool,pool+0x1800).equals(expected)||!bytes.subarray(query,query+0x48).equals(originalQuery))throw Error(`Model candidate mismatch: native=${count}, port=${result.candidates.length}; ${JSON.stringify({body,options,list,settings:list.map(index=>context.instances.get(index).settings)})}`);
 return {steps,count};
}
export async function checkSyntheticModelCandidates() {
 let seed=0x4293cafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=3000;let instructionSteps=0,candidates=0;
 for(let index=0;index<fixtures;index++) {
  const instances=new Map(),placementIndices=[];
  for(let object=0;object<random(8);object++) {
   const collision=boxCollision({triangles:!!(index&1),radius:16+random(32)});
   for(const count of [0,1,2]){const shape={...collision.shapes[0],index:collision.shapes.length,slot:collision.shapes.length,faceCount:count,raw:Buffer.from(collision.shapes[0].raw)};shape.raw.writeUInt32LE(shape.slot,12);shape.raw.writeUInt32LE(count<<16,16);collision.shapes.push(shape);}
   // The edge helper is mocked, but its endpoint setup still reads an edge.
   collision.edges=[{index:0,raw:Buffer.from([0,0,4,0,1,2,0,0])}];
   const settings={placementIndex:object,position:[random(120)-60,random(120)-60,random(120)-60],yaw:random(256),class:random(8),configurations:collision.shapes.map(()=>{const type=random(6);return {type,flags:type<<24};})};
   instances.set(object,{collision,settings});placementIndices.push(object);
  }
  const node={index:0},registration={found:true,outside:false,node},context={instances,links:{nodes:[{placementIndices}]},spatial:{available:true,lookup:()=>registration}};
  const body={flags:3,position:[0,1,2].map(()=>random(240*65536)-120*65536),linearVelocity:[0,1,2].map(()=>random(80*65536)-40*65536)};
  const result=verifyModelCandidates(context,body,{radiusQ8:(1+random(100))*256,spatialState:registration});instructionSteps+=result.steps;candidates+=result.count;
 }
 const report={method:'Bounded interpretation of retained static model candidate, shape acceptance and plane-filter instructions. Point/edge helper outputs are varied mocks because their flags are unconditionally overwritten by the screen; their scratch math is not compared. No original process execution.',evidence:[evidence.evidence_id,screen.evidence_id,plane.evidence_id],instructions:instructions.length,fixtures,instructionSteps,candidates,pointCalls,edgeCalls,matched:true};
 await writeFile('analysis/model-candidate-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkSyntheticModelCandidates();
