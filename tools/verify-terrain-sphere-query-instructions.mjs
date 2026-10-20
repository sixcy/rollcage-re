import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {readStaticSpherePrimitiveEvidence,initializeStaticSpherePrimitiveTables} from './lib/static-sphere-primitive-evidence.mjs';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
const terrain=await readInstructionEvidence(['168-terrain-query-assembly.json']),edge=await readInstructionEvidence(['040-terrain-edge-assembly.json','041-edge-direction-assembly.json'],{directory:'analysis/native-simulation/results'}),primitives=await readStaticSpherePrimitiveEvidence();
const evidence=[...terrain.evidence,...edge.evidence,...primitives.evidence],instructions=[...terrain.instructions,...edge.instructions,...primitives.instructions];
const tables=await Promise.all(['analysis/scene/results/169-terrain-query-switch-tables.json','analysis/native-simulation/results/043-terrain-edge-switch.json'].map(async path=>{const reply=JSON.parse(await readFile(path,'utf8'));return reply.structuredContent??JSON.parse(reply.content[0].text);}));
const machine=new BoundedX86(instructions,{tables:tables.map(table=>table.normalized_result)});await initializeStaticSpherePrimitiveTables(machine);
const put=(bytes,p,values)=>values.forEach((value,axis)=>bytes.writeInt32LE(value|0,p+axis*4));
export function verifyTerrainSphere(grid,candidates,query,options={}) {
 machine.reset();const bytes=machine.bytes,body=0x1000,probe=0x2000,out=0x3000,list=0x10000,mode=options.roundingMode??'nearest-even',scratch={};
 bytes.writeUInt32LE(options.bodyFlags??3,body);bytes.writeUInt32LE(list,body+0x154);bytes.writeUInt16LE(candidates.length,body+0x15c);bytes.writeUInt32LE(0x8000,0x90b98c);bytes.writeUInt32LE(0x8100,0x8000);
 bytes.fill(0xa5,0x91e7a0,0x91e7a0+64*40);bytes.fill(0xa5,0x911c00,0x911c28);bytes.writeInt32LE(options.frameCounter??0,0x90a548);
 const sectorAddresses=[];let vertexPointer=0x20000;
 const needed=new Set(candidates.map(candidate=>candidate.sector));
 for(const sector of grid.sectors){sectorAddresses.push(vertexPointer);bytes.writeUInt32LE(0x8200+sector.index*32,0x8100+sector.index*4);bytes.writeUInt32LE(sector.rows,0x820c+sector.index*32);if(!needed.has(sector.index))continue;for(const vertex of sector.vertices){for(let axis=0;axis<4;axis++)bytes.writeInt16LE((vertex[axis]??0)<<16>>16,vertexPointer+axis*2);vertexPointer+=8;}}
 if(vertexPointer>=0x400000)throw Error('Fixture vertices exceed interpreter region.');
 for(let index=0;index<candidates.length;index++){const candidate=candidates[index],p=list+index*16;bytes[p]=candidate.type;bytes[p+1]=candidate.pointOffset;bytes[p+3]=candidate.columns;bytes.writeUInt32LE(candidate.id,p+4);bytes.writeUInt32LE(candidate.packedNormal>>>0,p+8);bytes.writeUInt32LE(sectorAddresses[candidate.sector]+candidate.vertexBase*8,p+12);}
 put(bytes,probe+8,query.originQ8);put(bytes,probe+0x14,query.deltaQ8);bytes.writeInt32LE(query.radiusQ8,probe+0x40);bytes.fill(0xa5,out,out+36);
 const expected=Buffer.from(bytes.subarray(out,out+36)),planeBytes=Buffer.from(bytes.subarray(0x91e7a0,0x91e7a0+64*40)),borderBytes=Buffer.from(bytes.subarray(0x911c00,0x911c28));
 const initial={pointQ8:[0,4,8].map(p=>expected.readInt32LE(p)),normalQ16:[12,16,20].map(p=>expected.readInt32LE(p)),distanceQ8:expected.readInt32LE(24),cellRef:expected.readUInt32LE(32)};
 const result=queryTerrainSphere(grid,candidates,query,{...options,roundingMode:mode,scratch,output:initial});
 expected.writeInt32LE(result.flags,28);put(expected,0,result.pointQ8);put(expected,12,result.normalQ16);expected.writeInt32LE(result.distanceQ8,24);expected.writeUInt32LE(result.cellRef,32);
 scratch.planes.forEach((plane,index)=>{put(planeBytes,index*40,plane.pointQ8);put(planeBytes,index*40+12,plane.normalQ8);planeBytes.writeInt32LE(plane.distanceQ8,index*40+24);planeBytes.writeInt32LE(plane.fractionQ16,index*40+36);});
 if(scratch.borderContact){const border=scratch.borderContact;put(borderBytes,0,border.normalQ16);borderBytes.writeInt32LE(border.frameCounter,12);put(borderBytes,16,border.pointQ8);border.anchorS16.forEach((value,axis)=>borderBytes.writeInt16LE(value<<16>>16,32+axis*2));}
 machine.fpuRounding=mode;machine.entry=0x424ff0;machine.r.ECX=body;machine.r.EDX=probe;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(out,0x9004);bytes.writeUInt32LE(options.parameter??65536,0x9008);
 const steps=machine.run();
 if(!bytes.subarray(out,out+36).equals(expected)||machine.r.EAX!==result.fractionQ16)throw Error(`Terrain sphere mismatch ${JSON.stringify({query,options,result,nativeTime:machine.r.EAX,native:bytes.subarray(out,out+36).toString('hex'),expected:expected.toString('hex'),candidates})}`);
 if(!bytes.subarray(0x91e7a0,0x91e7a0+64*40).equals(planeBytes))throw Error(`Terrain sphere plane cache mismatch ${JSON.stringify({query,options,result,candidates,scratch,native:bytes.subarray(0x91e7a0,0x91e7a0+candidates.length*40).toString('hex'),expected:planeBytes.subarray(0,candidates.length*40).toString('hex')})}`);
 if(!bytes.subarray(0x911c00,0x911c28).equals(borderBytes))throw Error('Terrain border contact state mismatch.');
 for(let index=0;index<candidates.length;index++)if(bytes[list+index*16]!==((candidates[index].type&0xef)|(scratch.visited[index]?16:0))||bytes[list+index*16+2]!==((scratch.edges[index]??-1)&255))throw Error('Terrain candidate scratch mismatch.');
 return {steps,result};
}
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0;
export async function checkSyntheticTerrainSpheres(){
 let seed=0x424ff0ab,steps=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},fixtures=4000,histogram={},modes=['nearest-even','toward-zero','down','up'];
 for(let fixture=0;fixture<fixtures;fixture++){
  const columns=4,rows=4,slope=random(2),vertices=[];for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++)vertices.push([column*32,slope?column*8+row*4:0,-row*32,fixture%9===0?random(65536):0]);
  const grid={sectors:[{index:0,columns,rows,vertices}]},normal=slope?[64,-256,-32]:[0,-256,0],candidates=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)for(const type of [[0],[2,3],[5,4]][random(3)])candidates.push({id:((row<<16)|(column<<8))>>>0,sector:0,row,column,type,columns,normalQ8:normal,packedNormal:pack(normal),vertexBase:row*5+column,pointOffset:type===3?6:type===4?5:type===5?1:0});
  if(fixture%13===0)candidates.reverse();if(fixture%17===0)candidates.splice(0,random(candidates.length+1));
  if(fixture%3===0)for(let row=0;row<4;row++)for(const type of [6,7]){const column=type===6?0:4,n=type===6?[256,0,0]:[-256,0,0];candidates.push({id:((row<<16)|(column<<8))>>>0,sector:0,row,column,type,columns,normalQ8:n,packedNormal:pack(n),vertexBase:(row+(type===6?1:0))*5+column,pointOffset:0});}
  const query={originQ8:[random(192*256)-32*256,random(128*256)-64*256,-random(192*256)+32*256],deltaQ8:[random(48*256)-24*256,random(96*256)-24*256,random(48*256)-24*256],radiusQ8:(random(24)+1)*256};
  if(fixture%5===0){query.originQ8[1]=slope?Math.trunc(query.originQ8[0]/4-query.originQ8[2]/8)-random(256):-random(256);query.deltaQ8=[0,0,0];}
  const parameter=fixture%19===0?[0,1,255,256,32768,65535][fixture%6]:fixture%3===0?65536:fixture%11===0?0x100c000:0x1010000;
  const {steps:count,result}=verifyTerrainSphere(grid,candidates,query,{bodyFlags:fixture%7===0?4:3,parameter,roundingMode:modes[fixture%4]});steps+=count;histogram[result.flags]=(histogram[result.flags]??0)+1;
 }
 const report={method:'Complete retained terrain query424ff0 nonzero-radius path and actual terrain-edge/primitive/math callees. Full36-byte output, return time, every40-byte plane-cache entry, candidate visited/edge scratch and border diagnostic state compared. Synthetic split/quad/wall terrain, authored edge flags, reordered/sparse lists, overlaps/misses/tolerances/impacts and four declared integer conversion modes. No helper stubs or original process execution.',evidence:evidence.map(item=>item.evidence_id),switchEvidence:tables.map(item=>item.evidence_id),instructions:instructions.length,fixtures,roundingModes:modes,histogram,instructionSteps:steps,matched:true};await writeFile('analysis/terrain-sphere-query-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkSyntheticTerrainSpheres();
