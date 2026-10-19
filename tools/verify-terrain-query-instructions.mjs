import {BoundedX86} from './lib/bounded-x86.mjs';
// Bounded interpretation of the retained terrain query. No original process
// runs; radius-zero fixtures cannot enter the sphere-contact external call.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {queryTerrainRay} from '../src/terrain-query.mjs';
const readEvidence=async path=>{const reply=JSON.parse(await readFile(path,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await readEvidence('analysis/scene/results/168-terrain-query-assembly.json');
const tableEvidence=await readEvidence('analysis/scene/results/169-terrain-query-switch-tables.json');
const instructions=evidence.normalized_result.trim().split('\n').map(line=>{
 const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Unsupported assembly line: ${line}`);
 return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};
});

const machine=new BoundedX86(instructions,{tables:[tableEvidence.normalized_result]});
export function verifyTerrainRay(grid,candidates,query,options={}) {
 machine.reset();const bytes=machine.bytes,body=0x1000,probe=0x2000,out=0x3000,list=0x10000;
 bytes.writeUInt32LE(options.bodyFlags??3,body);bytes.writeUInt32LE(list,body+0x154);bytes.writeUInt16LE(candidates.length,body+0x15c);
 const sectorAddresses=[];let vertexPointer=0x20000;
 const needed=new Set(candidates.map(candidate=>candidate.sector));
 for(const sector of grid.sectors){sectorAddresses.push(vertexPointer);if(!needed.has(sector.index))continue;for(const vertex of sector.vertices){for(let axis=0;axis<4;axis++)bytes.writeInt16LE(((vertex[axis]??0)<<16)>>16,vertexPointer+axis*2);vertexPointer+=8;}}
 if(vertexPointer>=0x400000)throw Error('Fixture vertices exceed interpreter region.');
 for(let index=0;index<candidates.length;index++){const candidate=candidates[index],p=list+index*16;bytes[p]=candidate.type;bytes[p+1]=candidate.pointOffset;bytes[p+3]=candidate.columns;
  bytes.writeUInt32LE(candidate.id,p+4);bytes.writeUInt32LE(candidate.packedNormal>>>0,p+8);bytes.writeUInt32LE(sectorAddresses[candidate.sector]+candidate.vertexBase*8,p+12);}
 for(let axis=0;axis<3;axis++){bytes.writeInt32LE(query.originQ8[axis],probe+8+axis*4);bytes.writeInt32LE(query.deltaQ8[axis],probe+0x14+axis*4);}
 bytes.writeInt32LE(0,probe+0x40);bytes.fill(0xa5,out,out+36);
 const parameter=options.parameter??0x1010000,expected=Buffer.from(bytes.subarray(out,out+36)),result=queryTerrainRay(grid,candidates,query,options);
 expected.writeInt32LE(result.flags,28);
 if(result.flags){for(let axis=0;axis<3;axis++){expected.writeInt32LE(result.pointQ8[axis],axis*4);expected.writeInt32LE(result.normalQ16[axis],12+axis*4);}expected.writeInt32LE(result.distanceQ8,24);expected.writeUInt32LE(result.cellRef,32);}
 machine.r.ECX=body;machine.r.EDX=probe;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(out,0x9004);bytes.writeUInt32LE(parameter,0x9008);
 const steps=machine.run(),actual=bytes.subarray(out,out+36);
 if(!actual.equals(expected)||machine.r.EAX!==result.fractionQ16)throw Error(`Terrain mismatch: native-model fraction=${machine.r.EAX}, port=${result.fractionQ16}, native-model=${actual.toString('hex')}, port=${expected.toString('hex')}; input=${JSON.stringify({candidates,query,options})}`);
 return {steps,flags:result.flags,candidateIndex:result.candidateIndex};
}
function fixtureGrid(slope) {
 const columns=4,rows=4,vertices=[];
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++)vertices.push([col*32,slope?col*8+row*4:0,-row*32,0]);
 return {sectors:[{index:0,columns,rows,vertices}]};
}
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
export async function checkSyntheticTerrainRays() {
 let seed=0x4250cafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 let instructionSteps=0,hits=0,misses=0;const flags={},hitTypes={},fixtures=4000;
 for(let index=0;index<fixtures;index++) {
  const slope=random(2),grid=fixtureGrid(slope),normal=slope?[64,-256,-32]:[0,-256,0],candidates=[];
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
   const form=random(3),types=form===0?[0]:form===1?[2,3]:[5,4];
   for(const type of types)candidates.push({id:((row<<16)|(col<<8))>>>0,sector:0,row,column:col,type,columns:4,normalQ8:normal,packedNormal:pack(normal),vertexBase:row*5+col,pointOffset:type===3?6:type===4?5:type===5?1:0});
  }
  if(index%13===0)candidates.reverse();if(index%17===0)candidates.splice(0,random(candidates.length+1));
  const query={originQ8:[random(192*256)-32*256,random(128*256)-64*256,-random(192*256)+32*256],deltaQ8:[random(48*256)-24*256,random(96*256)-24*256,random(48*256)-24*256]};
  if(index%5===0){query.originQ8[1]=slope?Math.trunc(query.originQ8[0]/4-query.originQ8[2]/8)-random(256):-random(256);query.deltaQ8=[0,0,0];}
  if(index%3===0) {
   for(let row=0;row<4;row++)for(const type of [6,7]){const column=type===6?0:4,normal=type===6?[256,0,0]:[-256,0,0];
    candidates.push({id:((row<<16)|(column<<8))>>>0,sector:0,row,column,type,columns:4,normalQ8:normal,packedNormal:pack(normal),vertexBase:(row+(type===6?1:0))*5+column,pointOffset:0});}
  }
  const result=verifyTerrainRay(grid,candidates,query,{bodyFlags:index%7===0?4:3,parameter:index%3===0?0x10000:index%11===0?0x100c000:0x1010000});
  instructionSteps+=result.steps;if(result.flags){hits++;const type=candidates[result.candidateIndex].type;hitTypes[type]=(hitTypes[type]??0)+1;}else misses++;flags[result.flags]=(flags[result.flags]??0)+1;
 }
 const report={method:'Bounded interpretation of retained x86 terrain query and original switch-table bytes, with zero-radius synthetic rays; no original process execution.',evidence:evidence.evidence_id,switchEvidence:tableEvidence.evidence_id,function:'0x424ff0',instructions:instructions.length,fixtures,instructionSteps,hits,misses,flags,hitTypes,matched:true};
 await writeFile('analysis/terrain-ray-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkSyntheticTerrainRays();
