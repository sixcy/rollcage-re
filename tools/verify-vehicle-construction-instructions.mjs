import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createVehicleConstructionFixture} from './lib/vehicle-construction-fixtures.mjs';
import * as source from '../src/vehicle-construction.mjs';
export async function verifyVehicleConstruction({fixtures=120,output='analysis/vehicle-construction-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),executed=new Set(),visits={};let steps=0,calls=0,nativeAllocate;
 machine.onInstruction=p=>executed.add(p);
 machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 machine.externalCalls.set(0xf0000000,m=>{m.r.EAX=nativeAllocate(m.bytes.readUInt32LE(m.r.ESP));});
 machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),v=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(v&255,p,p+n);m.r.EAX=p;});
 machine.externalCalls.set(0x568a48,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),from=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);for(let i=0;i<n;i++)m.bytes[p+i]=m.bytes[from+i];m.r.EAX=p;});
 const entries=[0x4494a0,0x481100,0x4831e0,0x42c9d0,0x42c950,0x42aa80,0x488220,0x48dd10,0x48dda0,0x48e670,0x48dc60,0x47e240,0x41cfc0,0x41dbb0];
 for(let fixture=0;fixture<fixtures;fixture++)for(const entry of entries){
  const f=createVehicleConstructionFixture(program,fixture),{memory:m,addresses:a,runtime}=f,state=a.body+0x2b88;let ecx=a.body,edx=fixture%6,args=[];
  m.writeInt32LE(a.body,state+4);m.writeInt32LE(0,state+8);m.fill(255,state+0x2f6,state+0x2fe);
  if(entry===0x4494a0||entry===0x41dbb0||entry===0x41cfc0)ecx=a.record;if(entry===0x41cfc0){m.writeInt32LE(0x220000,a.record+0x250);edx=fixture&1?f.models[1]:0;}if(entry===0x481100)ecx=a.body+0x728;if([0x48dda0,0x48e670,0x48dc60].includes(entry))ecx=state;if(entry===0x48dc60){edx=f.models[1];args=[fixture%6];}if(entry===0x42aa80)edx=fixture&1?4:1;
  if(entry===0x4494a0){if(fixture%7===0)m[a.pack+0x46]=1;else if(fixture%7===1)m.writeUInt16LE(0,a.groups+12);else if(fixture%7===2){m.writeInt16LE(-32768,a.body+0x36);m.writeInt16LE(32767,a.points+0x100);}}
  if(entry===0x42aa80&&fixture%8===7)for(let i=0;i<6;i++)m.writeInt32LE(7,a.session+0x1fb20+i*0x1e884);
  if(entry===0x48dd10&&fixture%4===0)m.writeUInt16LE(251,f.models[0]+6);
  if(entry===0x48dda0&&fixture%3===0)for(let i=0;i<4;i++)m.writeInt16LE(10,f.models[0]+0x204+i*8);
  if(entry===0x41cfc0)m.writeInt32LE([0,510,512,-1][fixture%4],0x6e6b44);
  const allocatorFor=bytes=>{let cursor=0x400000,allocation=0;return size=>{if(entry===0x41dbb0&&allocation++===0){const body=bytes.readUInt32LE(a.record);switch(fixture%8){case 1:bytes.copy(bytes,0x600000,a.session,a.session+0xb00);for(let i=0;i<6;i++)bytes.writeInt32LE(8,0x61fb20+i*0x1e884);bytes.writeInt32LE(0x600000,0x5ecb1c);break;case 2:bytes.copy(bytes,0x230000,body,body+0x3e78);bytes.writeInt32LE(0x230000,a.record);break;case 3:bytes.writeInt32LE(f.models[2],0x9000-68+0x1c);break;case 4:bytes.copy(bytes,0x600000,a.pack,a.pack+0x94);bytes.writeInt32LE(0x600000,0x90b98c);break;case 5:bytes.writeInt32LE(-0x123456,0x5eacd0+bytes[a.session+edx+0x1c]*16);break;case 6:bytes.writeUInt16LE(5,body+0x65e);break;case 7:for(let i=0;i<6;i++)bytes.writeInt32LE(7,a.session+0x1fb20+i*0x1e884);break;}}const p=cursor;cursor+=(size+15)&~15;return p;};};
  const before=Buffer.from(m);runtime.handlers.allocate=allocatorFor(m);nativeAllocate=allocatorFor(machine.bytes);
  switch(entry){case 0x41dbb0:source.constructVehicle(ecx,edx,runtime);break;case 0x41cfc0:source.cloneSecondaryVehicleWheels(ecx,edx,runtime);break;case 0x4494a0:source.resetVehicleParticipant(ecx,runtime);break;case 0x481100:source.initializeVehicleEffectBlock(ecx,runtime);break;case 0x4831e0:source.initializeVehicleSkidStorage(ecx,runtime);break;case 0x42c9d0:source.initializeVehicleSurfaceLinks(ecx,runtime);break;case 0x42c950:source.initializeVehicleGripRecords(ecx,runtime);break;case 0x42aa80:source.initializeVehicleController(ecx,edx,runtime);break;case 0x488220:source.initializeRawVehicleDescriptors(ecx,runtime);break;case 0x48dd10:source.initializeVehicleAnimationBody(ecx,edx,runtime);break;case 0x48dda0:source.initializeVehicleAnimationRange(ecx,runtime);break;case 0x48e670:source.initializeVehicleAnimationState(ecx,runtime);break;case 0x48dc60:source.createVehicleAnimation(ecx,edx,args[0],runtime);break;case 0x47e240:source.initializeVehiclePresentation(ecx,edx,runtime);break;}
  machine.reset();before.copy(machine.bytes);machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,i)=>machine.bytes.writeInt32LE(v,0x9004+i*4));steps+=machine.run(3000000);calls++;visits[entry.toString(16)]=(visits[entry.toString(16)]??0)+1;
  const start=0x10000,native=machine.bytes.subarray(start),port=m.subarray(start);if(!native.equals(port)){const offset=native.findIndex((v,i)=>v!==port[i]);assert.fail(`fixture${fixture} entry${entry.toString(16)} diff${(start+offset).toString(16)} native${native[offset]} JS${port[offset]}`);}
 }
 const report={method:'Actual41dbb0 and13constructor-child entries with every reached game helper; only CRT allocation/memset/memcpy and compiler cookie services. Explicit synthetic resource/session/spatial/model inputs. Includes allocation-side session/pack/record/model-slot/tuning/index mutations, exhausted replay-controller fallback, empty/overflow-distance route scans, once-only large-primary-model translation, equal-depth vertices and captured registry limit crossings. ALLmemory>=10000h compared, no differing bytes excluded; no original process execution.',targetSha256:program.sha256,fixtures,calls,executedInstructions:executed.size,instructionSteps:steps,visits,evidence:program.references.map(r=>r.evidence),matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyVehicleConstruction({fixtures:Number(process.argv[2]??120)});
