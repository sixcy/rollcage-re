import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';

export async function checkSimulationFrameConnected(fixtures=240) {
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions,{entry:0x4749e0}),visits={},executed=new Set();let steps=0,events=0,hits=0,modelHits=0,modelQueries=0;
 const entries=[0x4749e0,0x46e9b0,0x47a8e0,0x413fc0,0x4287f0,0x46ea80,0x475760,0x427870,0x427bd0,0x424ff0,0x474bb0,0x427910,0x475450,0x423ab0,0x421da0,0x480900];
 machine.onInstruction=address=>{executed.add(address);if(entries.includes(address))visits[address]=(visits[address]??0)+1;};
 machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(let fixture=0;fixture<fixtures;fixture++) {
  const f=createSimulationRuntimeFixture(program,fixture,{count:1+fixture%2,models:fixture%5===0,breakable:fixture%10===0}),{memory,views,addresses:a,extraAddresses:b}=f;machine.reset();memory.copy(machine.bytes);
  let result;try{result=stepSimulationFrame(views.physicalGroup,[],f.context);machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(2_000_000);}catch(error){console.error({fixture,stage:'source/native',visits});throw error;}
  assert.equal(machine.r.EAX,result.nativeReturn);events+=result.processedEvents;hits+=result.terrainHits;modelHits+=result.modelHits;modelQueries+=result.modelQueries;
  const ranges=[...f.bodies.map(body=>[body.address,0x4000]),[a.list,32],[a.records,256*72],[a.arena,2048*16],[a.nodes,36],[b.groupLists,65*132],[b.events,100*104],[b.heap,101*4],[b.free,100*4],[0x902ba0,0x350],[0x91e780,32],[0x91e7a0,64*40],[0x911c00,40],[0x91d360,0x104],[0x6e6ba0,4],[0x902040,128],[0x200000,0xf000],[0x250000,0x3000]];
  if(fixture%10===0)ranges.push([b.particles,128*256],[b.debris,64*128],[b.debrisFree,0x1100],[0x5ec958,4],[0x6e65b4,24],[0x902b7c,20],[0x9153cc,0x30],[0x919020,288],[0x91cdc0,48],[0x91ff80,0x140],[0x9205a0,0x250]);
  for(const[address,length]of ranges) {
   const native=machine.bytes.subarray(address,address+length),source=memory.subarray(address,address+length);
   if(!native.equals(source)){const offset=native.findIndex((value,i)=>value!==source[i]);assert.fail(`fixture${fixture} diff0x${(address+offset).toString(16)} native=${native[offset]} source=${source[offset]} events=${result.processedEvents} terrainHits=${result.terrainHits}`);}
  }
 }
 const report={method:'Complete4749e0 surrounding physics parent with actual reached preparation/world/candidate/group/derivative/terrain/model/collision/response/refresh/finish routines, over constructed one/two ordinary-body fixtures. Every fifth fixture admits model candidates; every tenth reaches configured breakable models with actual421da0/480900 destruction and particle/debris/queue descendants. Retained instructions/literals admitted only for selectedReduxSHA; only compiler cookie is external. Complete bodies/records/arena/lists/groups/heap/free/events/model/object/shared91d360..463 math/plane/border/attachment state and reached effect pools/globals compared. Device/script/vehicle/world-effect/interacting-pair/class1/2/4-model variants and native runtime constructors remain further required cases. No original-process execution or whole-game completion claim.',targetSha256:program.sha256,availableRetainedInstructions:program.instructions.length,executedInstructions:executed.size,evidence:program.references.map(item=>item.evidence),fixtures,instructionSteps:steps,processedEvents:events,terrainHits:hits,modelQueries,modelHits,visits:Object.fromEntries(Object.entries(visits).map(([address,count])=>[`0x${Number(address).toString(16)}`,count])),matched:true};
 await writeFile('analysis/simulation-frame-connected-instruction-check.json',JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){const {evidence,...summary}=await checkSimulationFrameConnected(Number(process.argv[2]??240));console.log(JSON.stringify(summary));}
