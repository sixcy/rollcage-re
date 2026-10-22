import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {updateVehicleGroundProjection,smoothVehicleGroundProjection,writeVehicleGroundProjection,computeVehicleProjectionCorner} from '../src/vehicle-ground-projection.mjs';
export async function verifyVehicleGroundProjection({fixtures=240,frames=3,leafFixtures=2000,output='analysis/vehicle-ground-projection-instruction-check.json'}={}){
 const retained=await loadRetainedNativeProgram(),listing=await loadRetainedListing('analysis/vehicle-filter-listing.json','analysis/native-simulation/results/1454-vehicle-filter-bytes.json'),program={...retained,instructions:[...new Map([...retained.instructions,...listing.instructions].map(i=>[i.address,i])).values()].sort((a,b)=>a.address-b.address)},machine=new BoundedX86(program.instructions),executed=new Set(),visits={};let steps=0,projected=0,misses=0,physicsCalls=0;
 machine.onInstruction=p=>{executed.add(p);if([0x481200,0x481390,0x481450,0x4815d0,0x424ff0,0x4287f0,0x4749e0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 const execute=(entry,ecx=0,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,0x9004+i*4));steps+=machine.run(3000000);return machine.r.EAX;};
 const compare=(memory,label)=>{const a=machine.bytes.subarray(0x10000),b=memory.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail(`${label} diff${(0x10000+o).toString(16)} native${a[o]} JS${b[o]}`);}};
 for(let fixture=0;fixture<fixtures;fixture++){
  const count=fixture%7,physicalCount=Math.min(count,4),f=createSimulationVehicleFixture(program,fixture,{vehicleCount:physicalCount,interacting:fixture%4===0}),{memory:m,extraAddresses:b}=f,d=(p,v)=>m.writeInt32LE(v|0,p),runtime={...f.context.nativeTerrain,scratchBase:0x9000,roundingMode:'nearest-even'};
  m[b.session+0x54d]=count;const vehicles=Array.from({length:count},(_,i)=>f.vehicles[i%physicalCount]);for(let i=0;i<count;i++)d(0x909300+i*0x30c,vehicles[i].body.address);
  for(let i=0;i<physicalCount;i++){const p=f.vehicles[i].body.address;for(const[o,v]of[[0x2958,(fixture%5-2)*32768],[0x295c,[-65536,-4095,-4096,0,4096,65536][fixture%6]],[0x2960,(fixture%3-1)*16384],[0x2f3c,(fixture%4-2)*65536],[0x2f40,[0,-100,30,6][fixture%4]*65536],[0x2f44,0]])d(p+o,v);}
  machine.reset();m.copy(machine.bytes);machine.fpuRounding='nearest-even';
  for(let frame=0;frame<frames;frame++){
   for(const bytes of[m,machine.bytes])bytes.writeInt32LE(fixture+frame*17,0x90a548);f.context.selectionCounter=fixture+frame*17;
   stepSimulationFrame(f.views.physicalGroup,vehicles,f.context);execute(0x4749e0);compare(m,`physics${fixture}/${frame}`);physicsCalls++;
   updateVehicleGroundProjection(runtime);execute(0x481200);compare(m,`projection${fixture}/${frame}`);for(const v of vehicles)if(m[v.body.address+0x72e])projected++;else misses++;
  }
 }
 //Explicit parent aliases distinguish the captured initial count, the live
 //evaluation count, and the session reload performed only after a drawn hit.
 for(let alias=0;alias<3;alias++){
  const f=createSimulationVehicleFixture(program,1,{vehicleCount:1}),{memory:m}=f,d=(p,v)=>m.writeInt32LE(v|0,p),normalBody=f.vehicles[0].body.address,runtime={...f.context.nativeTerrain,scratchBase:0x9000,roundingMode:'nearest-even'};
  machine.reset();m.copy(machine.bytes);stepSimulationFrame(f.views.physicalGroup,f.vehicles,f.context);execute(0x4749e0);compare(m,`aliasphysics${alias}`);physicsCalls++;
  const session=alias===0?0x75000:0x75003,body=alias===0?session-0x1e1:0x5ecb1c-0x72e;
  if(alias===2){m.copy(m,body,normalBody,normalBody+0x4000);d(body+0x2f40,0);d(body+0x2958,0);d(body+0x295c,-65536);d(body+0x2960,0);}else{d(body,0x1c03);d(body+0x154,0x60000);m.writeUInt16LE(0,body+0x15c);for(const o of[0x34,0x38,0x3c,0x2f3c,0x2f40,0x2f44])d(body+o,0);}
  d(0x5ecb1c,session);m[session+0x54d]=2;d(0x909300,body);d(0x90960c,normalBody);m[normalBody+0x72e]=0x5a;m.copy(machine.bytes);updateVehicleGroundProjection(runtime);execute(0x481200);compare(m,`parentalias${alias}`);if(alias===0)assert.equal(m[normalBody+0x72e],0x5a);
 }
 let seed=0x481390ab;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
 const base=program.initializeMemory(Buffer.alloc(0xa00000));
 for(let fixture=0;fixture<leafFixtures;fixture++)for(const entry of[0x481390,0x481450,0x4815d0]){
  const m=Buffer.from(base),body=0x10000,contact=0x20000,d=(p,v)=>m.writeInt32LE(v|0,p),normal=[0x21000,body+0x295c,body+0x728][fixture%3],relative=[0x22000,body+0x34,contact][fixture%3],forward=0x23000,right=0x23100,out=fixture&1?body+0x34:0x24000;
  for(const p of[body+0x34,body+0x2958,contact,contact+12,normal,relative,forward,right])for(let o=0;o<12;o+=4)d(p+o,random());d(contact+28,fixture%4);for(let i=0;i<9;i++)m.writeInt16LE((random()>>>16)<<16>>16,body+0xc4+i*2);d(normal+4,[-65536,-4096,-4095,0,4095,4096,65536,-2147483648,0x40000000,-0x40000000][fixture%10]);
  const fraction=[-1,0,1,0x1010000][fixture%4],flags=fixture&255,plane=random(),before=Buffer.from(m);let result;
  if(entry===0x481390)result=smoothVehicleGroundProjection(body,normal,relative,fraction,contact,{memory:m});else if(entry===0x481450){try{writeVehicleGroundProjection(body,normal,relative,{memory:m,scratchBase:0x9000});}catch(error){throw Error(`source write fixture${fixture}: ${error.message}`);}}else result=computeVehicleProjectionCorner(body,forward,right,out,normal,plane,flags,{memory:m});
  machine.reset();before.copy(machine.bytes);let actual;if(entry===0x481390)actual=execute(entry,body,normal,[relative,fraction,contact]);else if(entry===0x481450)actual=execute(entry,body,normal,[relative]);else actual=execute(entry,body,forward,[right,out,normal,plane,flags]);if(result!==undefined)assert.equal(actual,result,`return${fixture}/${entry.toString(16)}`);compare(m,`leaf${fixture}/${entry.toString(16)}`);
 }
 const report={method:'Actual481200/481390/481450/4815d0 and actual424ff0 terrain descendants, preceded each persistent tick by complete4749e0 with actual4287f0 spatial/terrain/model candidate producers and full wheel/collision helpers. Three additional parent aliases exercise live count and selective session reloads. Separate raw leaf cases cover aliasing, signed wrap, thresholds, nonpositive fractions and byte corner flags. ALLmemory>=10000h compared after each parent/leaf; no differing bytes excluded. Only compiler cookie external; constructed upstream terrain/model/runtime/session/queue inputs, no original process execution.',targetSha256:program.sha256,fixtures,frames,physicsCalls,projectionCalls:fixtures*frames+3,parentAliasCases:3,leafFixtures,leafCalls:leafFixtures*3,projected,misses,executedInstructions:executed.size,instructionSteps:steps,visits,evidence:program.references.map(r=>r.evidence),listingEvidence:listing.evidence,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,listingEvidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyVehicleGroundProjection({fixtures:Number(process.argv[2]??240),leafFixtures:Number(process.argv[3]??2000)});
