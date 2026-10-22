import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
export async function verifyNativeBodyEffectStack({output=null}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions,{fpuPrecisionBits:24}),S=0x9000,entryRegisters={ebx:0x11223344,ebp:0x55667788,esi:0x22334455,edi:0x33445566};
 const cases=[];
 for(const wheelVehicle of[false,true])for(const timer of[1,0])for(const strength of[4,32]){
  const f=createSimulationVehicleFixture(program,1,{vehicleCount:wheelVehicle?1:0,ordinaryCount:wheelVehicle?0:1,effects:false,vehicleFilters:false}),m=f.memory,p=f.bodies[0].address,state=0x82000,lookup=0x83000,d=(a,v)=>m.writeInt32LE(v|0,a),entries=[],sourceQueries=[],nativeQueries=[],visits=new Set();
  //Declared common type3 body in the physical list, with no wheel-list entry.
  //This isolates active->query stack lifetime from separate wheel child saves.
  if(!wheelVehicle)d(p,0x1803);
  d(p+0x6bc,state);m[state]=1;m[state+1]=30;m[state+8]=timer;d(0x713180,lookup);for(let i=0;i<64;i++)m[lookup+i]=i;
  d(0x91cd90,1);d(0x91cd80,-4*65536);d(0x91cd84,0);d(0x91cd88,-8*65536);d(0x91cd8c,strength);
  f.context.bodyEffectImpulse={originQ16:[-4*65536,0,-8*65536],strength};
  f.context.bodyEffectNativeStackFor=(body,index)=>({memory:m,scratchBase:S-96,entryRegisters:{ebx:entryRegisters.ebx,ebp:entryRegisters.ebp,esi:f.bodies.length-index,edi:body.address},onEnter:r=>entries.push(r)});
  const outputAddress=S-228,queryView=f.context.nativeTerrain.views;
  let first=true;f.context.nativeTerrain={...f.context.nativeTerrain,views:{...queryView,candidateAt:address=>{
   if(first){sourceQueries.push([m.readInt32LE(outputAddress+24),m.readInt32LE(outputAddress+32)]);first=false;}
   return queryView.candidateAt(address);
  }}};
  machine.reset();m.copy(machine.bytes);machine.fpuRounding='nearest-even';machine.entry=0x4749e0;Object.assign(machine.r,{ESP:S,...Object.fromEntries(Object.entries(entryRegisters).map(([k,v])=>[k.toUpperCase(),v|0]))});machine.bytes.writeInt32LE(-1,S);
  machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
  machine.onInstruction=(address,x)=>{visits.add(address);if(address===0x424ff0&&x.bytes.readUInt32LE(x.r.ESP+4)===outputAddress&&!nativeQueries.length)nativeQueries.push([x.bytes.readInt32LE(outputAddress+24),x.bytes.readInt32LE(outputAddress+32)]);};
  const steps=machine.run(3000000),source=stepSimulationFrame(f.views.physicalGroup,f.vehicles,f.context);
  const start=0x10000,diff=m.subarray(start).findIndex((v,i)=>v!==machine.bytes[start+i]);
  assert.equal(diff,-1,diff<0?'':`timer${timer}/strength${strength} first mapped difference0x${(start+diff).toString(16)} source${m[start+diff]} native${machine.bytes[start+diff]}`);
  assert.equal(entries.length,1);assert.equal(entries[0].entryEsp,S-96);assert.ok(visits.has(0x47b020)&&visits.has(0x482730)&&visits.has(0x424ff0));assert.equal(visits.has(0x484bb0),timer===0);assert.ok(source.terrainQueries>0);assert.deepEqual(sourceQueries,nativeQueries,'later initial-query scalar/contactTime shared stack words');assert.ok(sourceQueries.length>0);
  cases.push({wheelVehicle,timer,strength,instructionSteps:steps,processedEvents:source.processedEvents,terrainQueries:source.terrainQueries,terrainHits:source.terrainHits,sharedQueryWords:sourceQueries[0],mappedComparedBytes:m.length-start,actualEmitterReached:visits.has(0x484bb0),matched:true});
 }
 const report={method:'Retained full4749e0 with actual47a8e0/47b020/4343e0/482730 and following424ff0, supplied native fixture/controller/lookup and naturally-null sound bank, exact PC24 nearest-even finite arithmetic; all mapped bytes>=10000 and reached initial-query scalar/contactTime stack words compared. Separate leaf regression compares every10MiB byte including full affected stack. No original-process execution.',targetSha256:program.sha256,cases,matched:true};
 if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyNativeBodyEffectStack({output:process.argv[2]??null})));
