import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createVehicleConstructionPhysicsFixture} from './lib/vehicle-construction-physics-fixtures.mjs';
import {constructVehicle} from '../src/vehicle-construction.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {updateVehicleControlState} from '../src/vehicle-control-state.mjs';
import {initializeVehicleAutonomousState} from '../src/vehicle-autonomous-init.mjs';
export async function verifyVehicleConstructionPhysics({fixtures=48,frames=8,initializeAutonomous=false,output='analysis/vehicle-construction-physics-instruction-check.json'}={}){
 const retained=await loadRetainedNativeProgram(),listing=await loadRetainedListing('analysis/vehicle-filter-listing.json','analysis/native-simulation/results/1454-vehicle-filter-bytes.json'),program={...retained,instructions:[...new Map([...retained.instructions,...listing.instructions].map(i=>[i.address,i])).values()].sort((a,b)=>a.address-b.address)},machine=new BoundedX86(program.instructions),executed=new Set();let steps=0,contacts=0,events=0,cursor;
 machine.onInstruction=p=>executed.add(p);machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));machine.externalCalls.set(0xf0000000,m=>{m.r.EAX=cursor;cursor+=(m.bytes.readUInt32LE(m.r.ESP)+15)&~15;});machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(m.bytes[m.r.ESP+4],p,p+n);m.r.EAX=p;});machine.externalCalls.set(0x568a48,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),q=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);for(let i=0;i<n;i++)m.bytes[p+i]=m.bytes[q+i];m.r.EAX=p;});
 const compare=(memory,label)=>{const native=machine.bytes.subarray(0x10000),source=memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${label} diff${(0x10000+offset).toString(16)} native${native[offset]} JS${source[offset]}`);}};
 for(let fixture=0;fixture<fixtures;fixture++){
  //Keep the controller heap away from410060's immutable dispatch table. The
  //older physics-only fixtures never read that table after allocating at400000.
  const heapBase=initializeAutonomous?0x600000:0x400000;
  const f=createVehicleConstructionPhysicsFixture(program,fixture,{heapBase}),{memory,construction:c}=f;cursor=heapBase;machine.reset();memory.copy(machine.bytes);machine.fpuRounding='nearest-even';constructVehicle(c.record,c.index,c.runtime);machine.entry=0x41dbb0;machine.r.ECX=c.record;machine.r.EDX=c.index;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(3000000);compare(memory,`constructor${fixture}`);
  if(initializeAutonomous){initializeVehicleAutonomousState(c.record,{memory,scratchBase:0x9000});machine.entry=0x410060;machine.r.ECX=c.record;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(3000000);compare(memory,`autonomousInitialization${fixture}`);}
  const vehicles=c.finish();
  for(let frame=0;frame<frames;frame++){const clock=fixture+frame*17;for(const bytes of[memory,machine.bytes]){bytes.writeInt32LE(clock,0x90a548);bytes.writeInt32LE(4,bytes.readUInt32LE(0x5ecb1c)+0x57c);bytes[c.body+0x708]=[104,128,152][fixture%3];bytes[c.body+0x709]=160+(fixture%4)*31;bytes[c.body+0x70a]=0;}f.context.selectionCounter=clock;
   updateVehicleControlState(c.body,{memory});machine.entry=0x42a9a0;machine.r.ECX=c.body;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run();compare(memory,`control${fixture}/frame${frame}`);
   const result=stepSimulationFrame(f.views.physicalGroup,vehicles,f.context);machine.entry=0x4749e0;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(3000000);compare(memory,`fixture${fixture}/frame${frame}`);contacts+=result.vehicles.reduce((s,v)=>s+v.contacts.hits,0);events+=result.processedEvents;}
 }
 const report={method:'Actual41dbb0 constructor and all reached game helpers into persistent42a9a0 controls and full4749e0 vehicle physics, with constructed upstream model/session/terrain/storage and byte-axis input samples. No replacement wheel/contact answers or game callees; only CRT allocate/memset/memcpy and compiler cookie services. ALLmemory>=10000h compared after construction, controls and each physics tick; no differing bytes excluded; no original process execution.'+(initializeAutonomous?' Actual410060 initialization consumes the constructed record/body before controls/physics and is compared separately. This bounded sequence does not execute47ea40 or its intervening416180 auxiliary setup, input/AI dispatch, full scene/session lifecycle or missing mode producers.':''),targetSha256:program.sha256,fixtures,frames,constructors:fixtures,autonomousInitializations:initializeAutonomous?fixtures:0,controlCalls:fixtures*frames,physicsCalls:fixtures*frames,wheelContacts:contacts,processedEvents:events,executedInstructions:executed.size,instructionSteps:steps,evidence:program.references.map(r=>r.evidence),listingEvidence:listing.evidence,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,listingEvidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyVehicleConstructionPhysics({fixtures:Number(process.argv[2]??48)});
