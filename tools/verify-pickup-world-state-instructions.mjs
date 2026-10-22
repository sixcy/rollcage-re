import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {registerRawBodySpatial} from '../src/raw-body-construction.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {initializePickupProbabilityTables} from '../src/pickup-award.mjs';
import * as source from '../src/pickup-world-state.mjs';

export async function verifyPickupWorldState({fixtures=1800,persistent=24,output='analysis/pickup-world-state-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0;
 const watched=new Set([0x47b680,0x4319f0,0x47caf0,0x43fa20,0x43fa80,0x46e940,0x47b920,0x436920,0x435df0,0x474600,0x474850,0x484bb0,0x40ea40]);
 machine.onInstruction=p=>{reached.add(p);if(watched.has(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 const fixtureFor=(i,entry)=>{
  const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p);initializeWheelRenderTables(m);initializePickupProbabilityTables(m);m.fill(0xa7,0x8000,0x9100);word(f.addresses.bucket+8,0);m[f.addresses.pack+0xf7]=2;
  put(0x5ecb1c,0x70000);m[0x7054d]=2;m[0x70551]=[1,3,5][i%3];put(0x90a548,i*371);put(0x902020,0x71000);put(0x902024,2);put(0x902bc0,0x72000);word(0x902bc4,0);put(0x9092a8,0x73000);put(0x9092b4,0x74000);put(0x74000,32);put(f.addresses.pack+0xa8,0x75000);word(0x91d4b0,0);
  const physical=[];const add=body=>{physical.push(body);registerRawBodySpatial(body,f);};
  for(let j=0;j<2;j++){
   const body=0x180000+j*0x5000,record=0x909300+j*0x30c;m.fill(0,body,body+0x800);put(record,body);m[record+0x1d]=j+1;word(body+0x65e,j);put(body+0x6bc,-1);m[body+0x68c]=i%7?255:1;m[body+0x68d]=i%5?255:2;put(body+0x34,[0,64,100,200,-200,32767,-32768][i%7]*65536);put(body+0x68,(i%4-2)*0x400000);m[body+0x6b4]=j;
   const pickup=0x140000+j*0x1000,controller=0x150000+j*0x1000;put(0x71000+j*4,pickup);put(0x91d480+j*4,controller);m.fill(0,pickup,pickup+0x200);m.fill(0,controller,controller+0x200);put(pickup,26);put(controller,26);word(controller+0x186,j);word(controller+0x188,(i%6)-1);put(pickup+0x34,j*30*65536);put(pickup+0x3c,j*20*65536);put(controller+0x34,j*100*65536);put(controller+0x38,100*65536);put(controller+0x3c,j*30*65536);
   for(const o of[0,2,4])word(0x73000+j*12+o,j*50+o*4);m[0x73000+j*12+6]=0;m[0x73000+j*12+7]=j;word(0x73000+j*12+8,0x1234);m[0x73000+j*12+10]=3;word(0x75000+j*8,j*20);word(0x75002+j*8,10);word(0x75004+j*8,j*30);
   if(entry===0x47b680){word(pickup+0x182,[0x81,0x82,0x83,0x84,0xff81][(i+j)%5]);word(pickup+0x180,[0,1,2,100,65535][(i+j)%5]);add(pickup);put(controller+0x180,0);}
   else if(entry===0x46e940){add(pickup);put(pickup+0x130,0x76000);}
   else if(entry===0x4319f0){const state=(i+j)%5;put(controller+0x180,state);word(controller+0x184,[0,1,2,9,10,11,65535][i%7]);if(state===3)add(controller);if(state===0||state===4){m[0x91d498+j]=j;word(0x91d4b0,j+1);}}
  }
  physical.forEach((body,j)=>put(0x72000+j*4,body));put(0x72000+physical.length*4,0);word(0x902bc4,physical.length);put(0x76000,0x77000);word(0x76004,2);put(0x77000,0x140000);put(0x77004,0x141000);put(0x77008,0);
  for(let j=0;j<4;j++)word(0x911ba0+j*24,i%5>j?12:0);for(const o of[0,2,4]){word(0x78000+o,i*123+o);word(0x78010+o,-i*321-o);}return f;
 };
 const execute=(entry,ecx,edx,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,j)=>machine.bytes.writeInt32LE(v|0,0x9004+j*4));steps+=machine.run(3000000);calls++;return machine.r.EAX;};
 const compare=(m,label)=>{const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
 const entries=[0x47b680,0x4319f0,0x47caf0,0x43fa20,0x43fa80,0x46e940];
 for(let i=0;i<fixtures;i++){
  const entry=entries[i%entries.length],f=fixtureFor(i*17+Math.floor(i/6),entry),m=f.memory;machine.reset();m.copy(machine.bytes);let expected,ecx=0,edx=0,args=[];
  if(entry===0x47b680)source.updateWorldPickups(f);else if(entry===0x4319f0)source.updatePickupRespawnControllers(f);else if(entry===0x47caf0){ecx=0x150000;source.finalizePickupRespawn(ecx,f);}else if(entry===0x43fa20){ecx=0x78000;edx=0x78010;args=[i*29];expected=source.createPickupTransition(ecx,edx,args[0],f);}else if(entry===0x43fa80){ecx=i%2?0x78000:0;edx=i%3?0x78010:0;args=[i%6-1];source.updatePickupTransition(ecx,edx,args[0],f);}else{ecx=0x140000;source.removePickupPhysicalLists(ecx,f);}
  const actual=execute(entry,ecx,edx,args);if(expected!==undefined)assert.equal(actual,expected);compare(m,`fixture${i}/${entry.toString(16)}`);
 }
 for(let i=0;i<persistent;i++){
  const f=fixtureFor(i,0x47b680),m=f.memory;machine.reset();m.copy(machine.bytes);
  for(let tick=0;tick<140;tick++){m.writeInt32LE(tick,0x90a548);machine.bytes.writeInt32LE(tick,0x90a548);source.updateWorldPickups(f);execute(0x47b680,0,0);compare(m,`persistent${i}/${tick}`);}
 }
 const report={method:'Actual47b680 collection→47b920 weightedaward and4319f0 respawn controllers→47caf0 placement/16particles,43fa20/43fa80 endpoint producers,46e940 physical lists,actual432680 matrix/spatial/allocator/effect/sound children. Only compiler cookie service; explicit empty sound bank and local nonnetwork sessions. ALLmappedmemory>=10000h compared after every call. Synthetic authored pickup/script/spawn/controller/session storage; no original process execution.',targetSha256:program.sha256,fixtures,persistentFrames:persistent*140,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyPickupWorldState({fixtures:Number(process.argv[2]??1800),persistent:Number(process.argv[3]??24)});
