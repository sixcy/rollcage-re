import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
export async function verifySimulationVehicleConnected({fixtures=80,frames=8,allMemory=true,output='analysis/simulation-vehicle-full-parent-instruction-check.json'}={}){
 const retained=await loadRetainedNativeProgram(),listing=await loadRetainedListing('analysis/vehicle-filter-listing.json','analysis/native-simulation/results/1454-vehicle-filter-bytes.json'),program={...retained,instructions:[...new Map([...retained.instructions,...listing.instructions].map(i=>[i.address,i])).values()].sort((a,b)=>a.address-b.address)},machine=new BoundedX86(program.instructions),visits={},executed=new Set();let steps=0,events=0,wheelContacts=0,pairEvents=0,staticEvents=0;
 const entries=[0x4749e0,0x41d9a0,0x47ab30,0x488910,0x4890a0,0x488bf0,0x488370,0x41c080,0x499e90,0x483b90,0x42c590,0x424ff0,0x474bb0,0x427910,0x475450,0x41e080,0x436698,0x475d96,0x483c80],byAddress=new Map(program.instructions.map(i=>[i.address,i])),recentCalls=[];let lastRootWrite=null;
 machine.onInstruction=(address,m)=>{executed.add(address);if(entries.includes(address))visits[address.toString(16)]=(visits[address.toString(16)]??0)+1;if(address===0x474bb0){if(m.bytes.readUInt32LE(m.r.ECX+8))pairEvents++;else staticEvents++;}const ins=byAddress.get(address);if(ins.op==='CALL'){recentCalls.push(['0x'+address.toString(16),ins.args[0]]);if(recentCalls.length>16)recentCalls.shift();}if(ins.args[0]?.includes('0x0091d460'))lastRootWrite={address:'0x'+address.toString(16),calls:recentCalls.slice()};};
 machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(let fixture=0;fixture<fixtures;fixture++){
  const f=createSimulationVehicleFixture(program,fixture,{vehicleCount:1+fixture%2,interacting:fixture%3===0}),{memory,addresses:a,extraAddresses:b}=f;
  const ranges=allMemory?[[0x10000,memory.length-0x10000]]:[...f.bodies.map(body=>[body.address,0x4000]),[a.list,32],[a.records,256*72],[a.arena,2048*16],[a.nodes,36],[b.groupLists,65*132],[b.events,100*104],[b.heap,101*4],[b.free,100*4],[0x902ba0,0x350],[0x91e780,32],[0x91e7a0,64*40],[0x911c00,40],[0x91d360,0x104],[0x7132e0,4*72+4*40],[0x6e6ba0,4],[0x902040,128],[f.vehicleAddresses.skids,16*292]];
  machine.reset();memory.copy(machine.bytes);machine.fpuRounding='nearest-even';
  for(let frame=0;frame<frames;frame++){
   const clock=fixture+frame*17;memory.writeInt32LE(clock,0x90a548);machine.bytes.writeInt32LE(clock,0x90a548);f.context.selectionCounter=clock;
   const source=stepSimulationFrame(f.views.physicalGroup,f.vehicles,f.context);machine.entry=0x4749e0;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);
   try{steps+=machine.run(3000000);assert.equal(machine.r.EAX,source.nativeReturn);for(const[p,n]of ranges){const native=machine.bytes.subarray(p,p+n),port=memory.subarray(p,p+n);if(!native.equals(port)){const o=native.findIndex((v,i)=>v!==port[i]);throw Error(`vehiclefixture${fixture}/frame${frame} diff0x${(p+o).toString(16)} native${native[o]} JS${port[o]}`);}}}catch(error){console.error({fixture,frame,visits,lastRootWrite});throw error;}
   events+=source.processedEvents;wheelContacts+=source.vehicles.reduce((sum,v)=>sum+v.contacts.hits,0);
  }
 }
 const report={method:'Actual full4749e0 parent with one/two populated vehicles, persistent interacting pairs, raw488910/probe/selector/contact helpers, actualterrainqueries, suspension, drive, tractionforces/skid/rear/surface effects, assists, rigidbodycontacts/integration, actual41e080 collisionfilter/descendants, registeredspatial/lists and shared scratch aliases. ALLmemory>=10000h compared after every frame, no differingbytes excluded. Varying masses/inertia,upright/yaw/inverted rotation,steering/input/material/quality and complete particle/debris pools. Explicit matching externalclock input advances17 per frame. Nativevehicleconstructor41dbb0/model/controller/profile/inputproducer lifecycle remains supplied fixture input. Compiler cookie equality is the only admitted external service. No originalprocess execution.',targetSha256:program.sha256,evidence:program.references.map(item=>item.evidence),listingEvidence:listing.evidence,fixtures,frames,calls:fixtures*frames,allMemory,processedEvents:events,pairEvents,staticEvents,wheelContacts,executedInstructions:executed.size,instructionSteps:steps,visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));const {evidence,listingEvidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifySimulationVehicleConnected({fixtures:Number(process.argv[2]??80)});
