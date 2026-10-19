import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readVehicleTrackBasis} from '../src/track-basis.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['266-vehicle-track-basis-assembly.json','268-track-basis-axis-assembly.json','271-track-basis-route-sign-assembly.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const machine=new BoundedX86(instructions);
export function verifyTrackBasis(data,grid,cellRef,context) {
 machine.reset();const bytes=machine.bytes,root=0x1000,header=0x6000,table=0x7000,config=0x8000,sectorPtr=0x10000,vertices=0x30000,packets=0x50000,normals=0x70000,routes=0x100000,output=0x5000;
 bytes.writeInt32LE(cellRef,root+0x11c);bytes.writeUInt16LE(3,root+0x65e);bytes.writeUInt32LE(header,0x90b98c);bytes.writeUInt32LE(table,header);bytes.writeUInt32LE(normals,header+0x1c);bytes.writeUInt32LE(config,0x5ecb1c);bytes[config+0x579]=context.mode;bytes[0x909320+3*0x30c]=context.progressStage;bytes[0x909322+3*0x30c]=context.routeIndex;bytes.writeUInt32LE(routes,0x9092b0);
 if(cellRef>=0) {
  const sector=grid.sectors[cellRef&255];if(sector.vertices.length*8>packets-vertices||sector.cells.length*8>normals-packets||grid.normals.length*4>routes-normals)throw Error('Track basis fixture exceeds interpreter geometry bounds.');
  bytes.writeUInt32LE(sectorPtr,table+(cellRef&255)*4);bytes.writeInt32LE(sector.columns,sectorPtr+8);bytes.writeInt32LE(sector.rows,sectorPtr+12);bytes.writeUInt32LE(vertices,sectorPtr+0x20);bytes.writeUInt32LE(packets,sectorPtr+0x50);
  sector.vertices.forEach((vertex,index)=>vertex.slice(0,3).forEach((value,axis)=>bytes.writeInt16LE(value,vertices+index*8+axis*2)));sector.cells.forEach((cell,index)=>bytes.writeUInt16LE(cell.rawNormalIndex,packets+index*8+2));grid.normals.forEach((normal,index)=>bytes.writeUInt32LE(normal.packed>>>0,normals+index*4));
  const routeIndex=context.routeIndex&255,offset=data.readUInt32LE(0xa0)+routeIndex*20;data.copy(bytes,routes+routeIndex*20,offset,offset+20);
 }
 bytes.fill(0xa5,output,output+48);const expected=Buffer.from(bytes.subarray(output,output+48)),result=readVehicleTrackBasis(data,grid,cellRef,context);
 if(result){result.tangentQ16.forEach((value,axis)=>expected.writeInt32LE(value,axis*4));result.normalQ16.forEach((value,axis)=>expected.writeInt32LE(value,24+axis*4));}
 machine.r.ECX=output;machine.r.EDX=output+24;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(root,0x9004);const steps=machine.run();
 if(machine.r.EAX!==(result?1:0)||!bytes.subarray(output,output+48).equals(expected))throw Error(`Track basis mismatch: ${JSON.stringify({cellRef,context,result,nativeTangent:[0,1,2].map(i=>bytes.readInt32LE(output+i*4)),nativeNormal:[0,1,2].map(i=>bytes.readInt32LE(output+24+i*4))})}`);
 return {steps,result};
}
export async function checkTrackBasis() {
 let seed=0x417210ab;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
 const fixtures=4000;let instructionSteps=0,absent=0;
 for(let fixture=0;fixture<fixtures;fixture++) {
  const data=Buffer.alloc(0x2000),columns=2+random(3),rows=80,sectorIndex=[0,2,3,4,5,7,8,10,16,24][random(10)],sector={columns,rows,vertices:Array.from({length:(columns+1)*(rows+1)},()=>[random(65536)-32768,random(65536)-32768,random(65536)-32768]),cells:Array.from({length:columns*rows},()=>({rawNormalIndex:random(8)}))},grid={sectors:[],normals:Array.from({length:8},()=>({packed:random(0xffffffff)>>>0}))};grid.sectors[sectorIndex]=sector;
  data.writeUInt32LE(0x100,0xa0);for(let route=0;route<256;route++)for(let axis=0;axis<3;axis++)data.writeInt16LE(random(65536)-32768,0x100+route*20+12+axis*2);
  let row=[0,15,16,18,19,23,24,59,60,70,71,79][random(12)],column=random(columns),selectedSector=sectorIndex;const context={mode:[0,11,12][random(3)],progressStage:[4,6,7,8,11,13,14][random(7)],routeIndex:random(256)};
  if(fixture%19===0){row=rows;context.mode=0;}
  if(fixture%19===1){selectedSector=0;row=18;column=columns;context.mode=12;context.progressStage=6;}
  if(fixture%19===2){selectedSector=5;row=60;column=columns;context.mode=11;context.progressStage=4;}
  grid.sectors[selectedSector]=sector;const cellRef=fixture%17?((row<<16)|(column<<8)|selectedSector):-1;
  const result=verifyTrackBasis(data,grid,cellRef,context);instructionSteps+=result.steps;if(!result.result)absent++;
 }
 const report={method:'Bounded interpretation of retained track-basis, mode-axis policy and route-dot-sign instructions. Compares all output bytes and return flags on declared signed-short grids, packed normals, progression modes and route records. No helper stubs or original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps,absent,matched:true};
 await writeFile('analysis/track-basis-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkTrackBasis();
