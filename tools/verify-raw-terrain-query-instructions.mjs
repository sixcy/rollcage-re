import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {readStaticSpherePrimitiveEvidence,initializeStaticSpherePrimitiveTables} from './lib/static-sphere-primitive-evidence.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawTerrainGrid,queryRawTerrain} from '../src/raw-terrain-query.mjs';
const terrain=await readInstructionEvidence(['168-terrain-query-assembly.json']),edge=await readInstructionEvidence(['040-terrain-edge-assembly.json','041-edge-direction-assembly.json'],{directory:'analysis/native-simulation/results'}),primitives=await readStaticSpherePrimitiveEvidence(),evidence=[...terrain.evidence,...edge.evidence,...primitives.evidence],instructions=[...terrain.instructions,...edge.instructions,...primitives.instructions];
const tables=await Promise.all(['analysis/scene/results/169-terrain-query-switch-tables.json','analysis/native-simulation/results/043-terrain-edge-switch.json'].map(async path=>{const value=JSON.parse(await readFile(path,'utf8'));return value.structuredContent??JSON.parse(value.content[0].text);}));
const machine=new BoundedX86(instructions,{tables:tables.map(t=>t.normalized_result)});await initializeStaticSpherePrimitiveTables(machine);const initialized=Buffer.from(machine.bytes),memory=Buffer.alloc(0xa00000);
const BODY=0x10000,RECORD=0x20000,OUT=0x21000,LIST=0x30000,VERTICES=0x40000,STACK=0x9000;
let vertexBasePointer=VERTICES;
const views=createPhysicsRuntimeViews({memory,bodyStorage:[{address:BODY,length:0x4000}],bodyLists:[{address:0x1000,capacity:1}],candidateMapping:{terrainVerticesFor:()=>vertexBasePointer}});
const pack=normal=>(((normal[0]&1023)<<20)|((normal[1]&1023)<<10)|(normal[2]&1023))>>>0,put=(p,value)=>memory.writeInt32LE(value|0,p),vector=(p,values)=>values.forEach((value,i)=>put(p+i*4,value));
let seed=0x424ff0ab,steps=0,stores=0,hits=0,edgeCalls=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const originalPut=machine.put.bind(machine);let nativeTrace=[],sourceTrace=[],count=0,observedOutputAddress=OUT;
const observed=p=>(p>=LIST&&p<LIST+count*16)||(p>=0x91d360&&p<0x91d464)||(p>=0x91e7a0&&p<0x91e7a0+64*40)||(p>=0x911c00&&p<0x911c28)||(p>=observedOutputAddress&&p<observedOutputAddress+36);
machine.put=(operand,value)=>{if(operand.includes('[')){const address=machine.address(operand),width=machine.width(operand);if(observed(address))nativeTrace.push({address,width,value:width===8?value&255:width===16?value&65535:value|0});}originalPut(operand,value);};machine.onInstruction=address=>{if(address===0x425f10)edgeCalls++;};
const fixtures=1800,modes=['nearest-even','toward-zero','down','up'];
for(let fixture=0;fixture<fixtures;fixture++){
 initialized.copy(memory);const columns=4,rows=4,slope=random(2),vertices=[],candidates=[];for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++)vertices.push([column*32,slope?column*8+row*4:0,-row*32,fixture%9===0?random(65536):0]);
 const normal=slope?[64,-256,-32]:[0,-256,0];for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)for(const type of [[0],[2,3],[5,4]][random(3)])candidates.push({id:(row<<16)|(column<<8),type,normal,vertexBase:row*5+column,pointOffset:type===3?6:type===4?5:type===5?1:0});
 if(fixture%3===0)for(let row=0;row<rows;row++)for(const type of[6,7]){const column=type===6?0:4;candidates.push({id:row<<16|column<<8,type,normal:type===6?[256,0,0]:[-256,0,0],vertexBase:(row+(type===6?1:0))*5+column,pointOffset:0});}if(fixture%13===0)candidates.reverse();if(fixture%17===0)candidates.splice(0,random(candidates.length+1));count=candidates.length;
 put(BODY,fixture%7===0?4:3);put(BODY+0x154,LIST);memory.writeUInt16LE(count,BODY+0x15c);put(0x90b98c,0x50000);put(0x50000,0x50100);put(0x50100,0x50200);put(0x5020c,rows);put(0x90a548,fixture);
 vertices.forEach((vertex,i)=>vertex.forEach((value,lane)=>memory.writeInt16LE(value<<16>>16,VERTICES+i*8+lane*2)));candidates.forEach((candidate,i)=>{const p=LIST+i*16;memory[p]=candidate.type|0xa0|(fixture%2?16:0);memory[p+1]=candidate.pointOffset;memory[p+2]=0x6a;memory[p+3]=columns;put(p+4,candidate.id);put(p+8,pack(candidate.normal));put(p+12,VERTICES+candidate.vertexBase*8);});
 const origin=[random(192*256)-32*256,random(128*256)-64*256,-random(192*256)+32*256],delta=[random(48*256)-24*256,random(96*256)-24*256,random(48*256)-24*256];if(fixture%5===0){origin[1]=slope?Math.trunc(origin[0]/4-origin[2]/8)-random(256):-random(256);delta.fill(0);}vector(RECORD+8,origin);vector(RECORD+20,delta);put(RECORD+64,fixture%2?(random(24)+1)*256:0);
 memory.fill(0xa5,OUT,OUT+36);memory.fill(0x5a,0x91d360,0x91d464);memory.fill(0x69,0x91e7a0,0x91e7a0+64*40);memory.fill(0x36,0x911c00,0x911c28);memory.copy(machine.bytes);sourceTrace=[];nativeTrace=[];
 const grid=createRawTerrainGrid({sectors:[{index:0,columns,rows,vertices}]},()=>VERTICES,{memory}),parameter=fixture%19===0?[0,1,255,256,32768,65535][fixture%6]:fixture%3===0?65536:fixture%11===0?0x100c000:0x1010000;
 const result=queryRawTerrain(BODY,RECORD,OUT,parameter,{memory,views,grid,roundingMode:modes[fixture%4],trace:value=>sourceTrace.push(value)});
 machine.entry=0x424ff0;machine.r.ECX=BODY;machine.r.EDX=RECORD;machine.r.ESP=STACK;machine.fpuRounding=modes[fixture%4];machine.bytes.writeUInt32LE(0xffffffff,STACK);machine.bytes.writeUInt32LE(OUT,STACK+4);machine.bytes.writeUInt32LE(parameter,STACK+8);steps+=machine.run();
 assert.equal(result,machine.r.EAX,`fraction fixture${fixture}`);
 for(const[p,n]of[[OUT,36],[LIST,count*16],[0x91d360,0x104],[0x91e7a0,64*40],[0x911c00,40]]){const a=memory.subarray(p,p+n),b=machine.bytes.subarray(p,p+n);if(!a.equals(b)){const i=a.findIndex((value,i)=>value!==b[i]);assert.fail(`fixture${fixture} byte0x${(p+i).toString(16)} native=${b[i]} JS=${a[i]} ${JSON.stringify({count,origin,delta,parameter,source:sourceTrace.slice(-15),native:nativeTrace.slice(-15)})}`);}}
 if(JSON.stringify(nativeTrace)!==JSON.stringify(sourceTrace)){let i=0;while(JSON.stringify(nativeTrace[i])===JSON.stringify(sourceTrace[i]))i++;assert.fail(`fixture${fixture} store${i} native=${JSON.stringify(nativeTrace.slice(i,i+5))} JS=${JSON.stringify(sourceTrace.slice(i,i+5))}`);}
 stores+=sourceTrace.length;if(memory.readInt32LE(OUT+28))hits++;
}
const aliasFixtures=48;
for(let fixture=0;fixture<aliasFixtures;fixture++){
 initialized.copy(memory);count=1;const outputAddress=[RECORD+8,LIST,0x91e7a0,OUT][fixture%4];observedOutputAddress=outputAddress;vertexBasePointer=fixture%4===3?0x91d360:VERTICES;
 put(BODY,3);put(BODY+0x154,LIST);memory.writeUInt16LE(1,BODY+0x15c);memory.fill(0x5a,0x91d360,0x91d464);memory.fill(0x69,0x91e7a0,0x91e7a0+64*40);memory.fill(0x36,0x911c00,0x911c28);
 const vertices=[];for(let row=0;row<3;row++)for(let column=0;column<3;column++)vertices.push([column*32,0,-row*32,0]);vertices.forEach((v,i)=>v.forEach((x,j)=>memory.writeInt16LE(x,vertexBasePointer+i*8+j*2)));
 memory[LIST]=0xb0;memory[LIST+1]=0;memory[LIST+2]=0x6a;memory[LIST+3]=2;put(LIST+4,0);put(LIST+8,pack([0,-256,0]));put(LIST+12,vertexBasePointer);vector(RECORD+8,[4096,-8192,-4096]);vector(RECORD+20,[0,16384,0]);put(RECORD+64,fixture%2?512:0);memory.copy(machine.bytes);sourceTrace=[];nativeTrace=[];
 const grid=createRawTerrainGrid({sectors:[{index:0,columns:2,rows:2,vertices}]},()=>vertexBasePointer,{memory});
 const result=queryRawTerrain(BODY,RECORD,outputAddress,65536,{memory,views,grid,roundingMode:modes[fixture%4],trace:value=>sourceTrace.push(value)});
 machine.entry=0x424ff0;machine.r.ECX=BODY;machine.r.EDX=RECORD;machine.r.ESP=STACK;machine.fpuRounding=modes[fixture%4];machine.bytes.writeUInt32LE(0xffffffff,STACK);machine.bytes.writeUInt32LE(outputAddress,STACK+4);machine.bytes.writeUInt32LE(65536,STACK+8);steps+=machine.run();assert.equal(result,machine.r.EAX,`alias fraction${fixture}`);
 for(const[p,n]of[[outputAddress,36],[LIST,64],[RECORD,72],[vertexBasePointer,vertices.length*8],[0x91d360,0x104],[0x91e7a0,64*40],[0x911c00,40]])assert.deepEqual(memory.subarray(p,p+n),machine.bytes.subarray(p,p+n),`alias fixture${fixture} region0x${p.toString(16)}`);
 // Output aliases already lie in candidate/plane/query regions. Include its
 // writes when the observed output address differs from the default fixture.
 const nativeObserved=nativeTrace,sourceObserved=sourceTrace.filter(value=>observed(value.address));assert.deepEqual(sourceObserved,nativeObserved,`alias ordered stores${fixture}`);stores+=sourceTrace.length;
}
const report={method:'Actual424ff0 ray and sphere graphs over shared native candidate/output/vertex/plane/border/math storage. Exact ordered write trace compares every observed byte/word/DWORD store, including same-value stores; complete candidate records,36-byte output,all64plane records,border40bytes and shared91d360..463 cross/normalization globals match. Explicit output/query,candidate,plane and vertex/cross-global alias cases preserve consumed writes. Actual425f10 and primitive/math children execute without mocked callees. Synthetic geometry/runtime and declared conversion modes; no original process execution or complete4749e0 claim.',evidence:evidence.map(e=>e.evidence_id),tables:tables.map(t=>t.evidence_id),instructions:instructions.length,fixtures,aliasFixtures,stores,hits,edgeCalls,instructionSteps:steps,matched:true};await writeFile('analysis/raw-terrain-query-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
