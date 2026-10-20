import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {readStaticSpherePrimitiveEvidence,initializeStaticSpherePrimitiveTables} from './lib/static-sphere-primitive-evidence.mjs';
import {resolveTerrainSphereEdge} from '../src/terrain-sphere-edge.mjs';
const edge=await readInstructionEvidence(['040-terrain-edge-assembly.json','041-edge-direction-assembly.json'],{directory:'analysis/native-simulation/results'}),primitive=await readStaticSpherePrimitiveEvidence(),instructions=[...edge.instructions,...primitive.instructions],evidence=[...edge.evidence,...primitive.evidence];
const reply=JSON.parse(await readFile('analysis/native-simulation/results/043-terrain-edge-switch.json','utf8')),switchEvidence=reply.structuredContent??JSON.parse(reply.content[0].text),machine=new BoundedX86(instructions,{tables:[switchEvidence.normalized_result]});await initializeStaticSpherePrimitiveTables(machine);
let seed=0x425f10ab,steps=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,put=(bytes,p,values)=>values.forEach((value,axis)=>bytes.writeInt32LE(value|0,p+axis*4));
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0,modes=['nearest-even','toward-zero','down','up'],histogram={};
const fixtures=4000;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,mode=modes[fixture%4],columns=4,vertices=Array.from({length:30},(_,index)=>[(index%5)*32,fixture%2?((index%5)*8):0,-Math.floor(index/5)*32,random(65536)]),grid={sectors:[{vertices}]};
 for(let index=0;index<vertices.length;index++)vertices[index].forEach((value,axis)=>bytes.writeInt16LE(value<<16>>16,0x20000+index*8+axis*2));
 const normals=[[0,-256,0],[0,-252,32],[256,0,0],[-256,0,0],[64,-240,0]],normal=normals[random(5)],neighborNormal=fixture%3===0?normal:normals[random(5)],candidate={id:0x10203,sector:0,type:random(8),columns,vertexBase:10,packedNormal:pack(normal),edgeCode:[0,1,2,3,4,5,6,15,16,32,127,255][random(12)]},neighbor=fixture%4===0&&candidate.type<6?null:{...candidate,id:0x20304,type:random(8),packedNormal:pack(neighborNormal)};
 function encodeCandidate(item,p){bytes[p]=item.type;bytes[p+2]=item.edgeCode;bytes[p+3]=columns;bytes.writeUInt32LE(item.id,p+4);bytes.writeUInt32LE(item.packedNormal,p+8);bytes.writeUInt32LE(0x20000+item.vertexBase*8,p+12);}
 encodeCandidate(candidate,0x6000);if(neighbor)encodeCandidate(neighbor,0x6010);
 const plane={pointQ8:[signed(),signed(),signed()],distanceQ8:signed(),fractionQ16:[0,256,32768,65536][random(4)]},neighborPlane={pointQ8:[signed(),signed(),signed()],distanceQ8:signed(),fractionQ16:123};
 for(const [index,value]of [[0,plane],[1,neighborPlane]]){put(bytes,0x91e7a0+index*40,value.pointQ8);bytes.writeInt32LE(value.distanceQ8,0x91e7b8+index*40);bytes.writeInt32LE(value.fractionQ16,0x91e7c4+index*40);}
 const record=Buffer.alloc(72,0xa5);put(record,8,[random(160*256),random(80*256)-40*256,-random(160*256)]);put(record,20,[random(80*256)-40*256,random(80*256)-40*256,random(80*256)-40*256]);record.writeInt32LE((random(20)+1)*256,64);record.copy(bytes,0x10000);
 const result={flags:signed(),pointQ8:[signed(),signed(),signed()],normalQ16:[signed(),signed(),signed()],distanceQ8:signed(),cellRef:random(0xffffffff),fractionQ16:[0,256,32768,65536][random(4)]};
 const output=0x7000;put(bytes,output,[...result.pointQ8,...result.normalQ16,result.distanceQ8,0x76543210,result.cellRef|0]);bytes.writeInt32LE(result.flags,0x7104);bytes.writeInt32LE(result.fractionQ16,0x7100);
 const before=Buffer.from(bytes.subarray(0x6000,0x6020)),expected=Buffer.from(bytes.subarray(output,output+36));resolveTerrainSphereEdge(grid,candidate,neighbor,plane,neighborPlane,record,result,{roundingMode:mode});
 put(expected,0,[...result.pointQ8,...result.normalQ16,result.distanceQ8,0x76543210,result.cellRef|0]);
 machine.fpuRounding=mode;machine.entry=0x425f10;machine.r.ECX=0x10000;machine.r.EDX=output;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);[0x7100,0x7104,0x6000,neighbor?0x6010:0,0x6000].forEach((value,index)=>bytes.writeUInt32LE(value,0x9004+index*4));steps+=machine.run();
 assert.ok(bytes.subarray(output,output+36).equals(expected),`output ${fixture}: ${bytes.subarray(output,output+36).toString('hex')} vs ${expected.toString('hex')}`);assert.equal(bytes.readInt32LE(0x7100),result.fractionQ16,`time ${fixture}`);assert.equal(bytes.readInt32LE(0x7104),result.flags,`flags ${fixture}`);assert.ok(bytes.subarray(0x6000,0x6020).equals(before));assert.ok(bytes.subarray(0x10000,0x10048).equals(record));
 const key=result.flags===1?'impact':result.flags===2?'overlap':'preserved';histogram[key]=(histogram[key]??0)+1;
}
const report={method:'Complete terrain edge wrapper425f10, unreduced edge-direction float normalization4343e0 and actual finite-edge/math callees. Compares full36-byte contact payload, separate time/flags and unchanged geometry/cache. Covers smooth-neighbor averaging and wrapped midpoint sums, equal-distance cell selection, wall pairs, authored edge-disable bits, all six edge mappings and invalid codes. Four explicit integer float conversion contexts; no helper stubs or original execution. Border-null input excluded because native dereferences it before null check.',evidence:[...evidence.map(item=>item.evidence_id),switchEvidence.evidence_id],instructions:instructions.length,fixtures,roundingModes:modes,histogram,instructionSteps:steps,matched:true};await writeFile('analysis/terrain-sphere-edge-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
