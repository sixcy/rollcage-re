import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {initializePickupProbabilityTables} from '../src/pickup-award.mjs';
import {updateWorldPickups} from '../src/pickup-world-state.mjs';
import {stepRawScriptedMotion} from '../src/raw-scripted-motion.mjs';
import * as source from '../src/pickup-world-construction.mjs';

export async function verifyPickupWorldConstruction({fixtures=360,chains=16,frames=360,output='analysis/pickup-world-construction-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0,nativeAllocate;
 const watched=new Set([0x47b580,0x431950,0x47c6c0,0x47b680,0x4319f0,0x47caf0,0x476550,0x47b920,0x436920]);machine.onInstruction=p=>{reached.add(p);if(watched.has(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
 machine.externalCalls.set(0xf0000000,m=>m.r.EAX=nativeAllocate(m.bytes.readUInt32LE(m.r.ESP)));machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(m.bytes.readUInt32LE(m.r.ESP+4)&255,p,p+n);m.r.EAX=p;});machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 const fixtureFor=i=>{
  const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),pack=0x50000,metadata=0x51000,models=0x52000,model=0x53000,auxiliary=f.addresses.pack,bank=0x57000;initializeWheelRenderTables(m);initializePickupProbabilityTables(m);
  const original=Buffer.from(m);source.initializePickupWorldTables(m);for(const[p,n]of[[0x5ec9f8,128],[0x5eaf38,128],[0x5dd020,16]])assert.ok(m.subarray(p,p+n).equals(original.subarray(p,p+n)),'Original pickup constants');
  put(0x90b98c,pack);put(pack+0x58,metadata);put(pack+0x18,models);put(models,model);put(models+4,model+0x1000);word(metadata+12,0);word(metadata+0x46,1);m[pack+0x36]=i%7;m[auxiliary+0xf7]=(i>>1)%5;put(0x90b988,bank);for(let j=0;j<0x1000;j++)m[bank+j]=(i+j*37)&255;
  for(let j=0;j<2;j++){
   const p=model+j*0x1000,faces=(i+j)%3;put(p+0x10,0x300);put(p+0x14,0x300+faces*40);m[p+4]=3;put(p+12,0x58000+j*0x100);put(p+0x40,0x59000+j*0x100);for(let k=0;k<faces*80;k++)m[p+0x300+k]=(k*13+i)&255;
  }
  put(0x5ecb1c,0x70000);m[0x70a86]=i%3?1:0;m[0x70551]=[0,3,8][i%3];m[0x7054d]=1;put(0x56e258,0xf0000000);put(0x70dcf4,0x30000);put(0x6e6b44,0);put(0x902bc0,0x71000);word(0x902bc4,0);word(f.addresses.bucket+8,0);
  put(0x9092a8,0x72000);put(0x9092b4,0x73000);word(0x73000,0x20);word(0x73020,6);word(0x73022,0);word(0x73024,12);word(0x73028,1);word(0x7302a,16);word(0x73034,6);word(0x73036,2);word(0x7303c,0);
  for(let j=0;j<7;j++){for(const o of[0,2,4])word(0x72000+j*12+o,j*20+o*3);m[0x72000+j*12+6]=0;m[0x72000+j*12+7]=j;word(f.addresses.spawns+j*8,j*20);word(f.addresses.spawns+j*8+2,0);word(f.addresses.spawns+j*8+4,j*30);}
  const player=0x180000;m.fill(0,player,player+0x800);put(0x909300,player);m[0x90931d]=1;m[player+0x68c]=255;m[player+0x68d]=255;put(player+0x6bc,-1);return f;
 };
 const allocateFor=(m,i)=>{let n=0;return size=>{const p=0x60000;if((i%5)===1&&n++===0){m.copy(m,0x61000,0x50000,0x50000+0x100);m.writeUInt32LE(0x61000,0x90b98c);}m.fill(0xa5,p,p+size);return p;};};
 const execute=(entry,ecx=0)=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(3000000);calls++;};
 const compare=(m,label)=>{const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
 for(let i=0;i<fixtures;i++){
  const f=fixtureFor(i*17+Math.floor(i/3)),m=f.memory,entry=[0x47b580,0x431950,0x47c6c0][i%3],body=i%11===0?0x5ec427:0x140000;machine.reset();m.copy(machine.bytes);nativeAllocate=allocateFor(machine.bytes,i);f.handlers={allocate:allocateFor(m,i)};
  if(entry===0x47b580)source.initializeWorldPickups(f);else if(entry===0x431950)source.initializePickupRespawnControllers(f);else source.initializePickupRenderRecords(body,f);execute(entry,body);compare(m,`fixture${i}/${entry.toString(16)}`);
 }
 for(let i=0;i<chains;i++){
  const f=fixtureFor(i+1),m=f.memory;m[m.readUInt32LE(0x90b98c)+0x36]=2;m[f.addresses.pack+0xf7]=2;m[0x70a86]=1;machine.reset();m.copy(machine.bytes);nativeAllocate=allocateFor(machine.bytes,i);f.handlers={allocate:allocateFor(m,i)};source.initializeWorldPickups(f);execute(0x47b580);compare(m,`constructor${i}`);
  for(let tick=0;tick<frames;tick++){
   for(const b of[m,machine.bytes]){b.writeInt32LE(tick,0x90a548);const player=b.readUInt32LE(0x909300);b[player+0x68c]=255;b[player+0x68d]=255;}
   updateWorldPickups(f);execute(0x47b680);compare(m,`tick${i}/${tick}`);
   const n=m.readUInt16LE(0x902bc4),list=m.readUInt32LE(0x902bc0);for(let j=0;j<n;j++){const body=m.readUInt32LE(list+j*4);if(m.readInt32LE(body)&0x2000){stepRawScriptedMotion(body,f);execute(0x476550,body);compare(m,`script${i}/${tick}/${j}`);}}
  }
 }
 const report={method:'Actual47b580 pickup and431950 controller constructors +47c6c0 renderer producer with actual4741c0/4798d0/spatial/math children, then persistent47b680→4319f0 plus actual476550 opcode6/1 scripted timer/retirement producers. Actual47caf0 effects,47b920 awards and controller/particle reuse. Only CRTmalloc/memset/compiler-cookie services. Explicit synthetic authored models,texture data,script bytecode and one local session; empty sound bank. ALLmappedmemory>=10000h compared after every entry,no differingbytes excluded,no original process execution.',targetSha256:program.sha256,fixtures,chains,frames,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyPickupWorldConstruction({fixtures:Number(process.argv[2]??360),chains:Number(process.argv[3]??16),frames:Number(process.argv[4]??360)});
