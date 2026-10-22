import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import * as source from '../src/weapon-targeting.mjs';

export async function verifyWeaponTargeting({fixtures=4000,persistent=24,output='analysis/weapon-targeting-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0,seed=0x48ac00ab;
 machine.onInstruction=p=>{reached.add(p);if([0x48ac00,0x48acb0,0x48b0e0,0x48b2a0,0x422c70,0x4286e0,0x48aee4,0x48affa,0x48b4f7,0x48ac80].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;},modes=['nearest-even','toward-zero','down','up'];
 const fixtureFor=i=>{
  const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),pack=0x60000,segments=0x61000,segment=0x62000,vertices=0x63000,cells=0x64000,normals=0x65000,regions=0x66000,models=0x70000,session=0x80000;
  m.fill(0xa7,0x8000,0x9100);put(0x90b98c,pack);put(pack,segments);put(pack+0x1c,normals);put(pack+0x80,regions);put(segments,segment);put(segment+8,8);put(segment+0x20,vertices);put(segment+0x50,cells);word(f.addresses.bucket+6,0);
  for(let j=0;j<64;j++){word(vertices+j*8,(j%9-4)*128);word(vertices+j*8+2,(j%3-1)*80);word(vertices+j*8+4,(Math.floor(j/9)-2)*128);word(cells+j*8+2,j%8);}
  for(let j=0;j<8;j++)put(normals+j*4,random());
  const regionsCount=1+i%4;for(let j=0;j<regionsCount;j++){word(regions+j*6,(j%4)|((i+j)%7)<<10);word(regions+j*6+2,j===0?(regionsCount-1)<<9:0);}
  put(0x5ecb1c,session);m[session+0x54d]=1+i%6;put(0x90a548,random());put(0x82e900,i%5);put(0x82e904,i%4);put(f.addresses.pack+0xec,models);
  for(let j=0;j<6;j++){
   const body=0x100000+j*0x5000,record=0x909300+j*0x30c;put(record,body);put(body+12,i%3?f.addresses.bucket:f.addresses.bucket+12);m[body+0x68c]=i%7?1:255;m[body+0x68d]=i%11?255:1;m[body+0x718]=(i+j)%3?8:0;word(body+0x65e,j);put(body+0x710,i&1?0x1000:0);
   put(body+0x34,(j-2)*0x100000);put(body+0x38,0);put(body+0x3c,0);put(record+0x7c,[0,2,4][i%3]);word(record+0x6a,i%3);word(record+0x68,[0,1,2,6,65535][i%5]);put(record+0x70,0x200000+(i%4)*0x1000);put(record+0x74,0x300000+(i%3)*0x1000);put(record+0x78,random());
   for(let k=0;k<9;k++)word(body+0xc4+k*2,i%13===0?random():k%4?0:4096);
  }
  for(let j=0;j<4;j++){
   const object=0x200000+j*0x1000,model=0x300000+j*0x1000,shape=0x310000+j*0x1000,types=0x320000+j*0x1000;put(0x82e880+j*8,object);put(0x82e884+j*8,(i+j)%3);put(models+j*20,shape);put(models+j*20+4,model);put(model+0x194,types);m[types+3]=(i+j)%5===0?5:0;m[model+0x199]=(i*7+j*17)&255;
   word(shape,(j-2)*64);word(shape+2,j*10);word(shape+4,j*50);put(shape+12,0);
   for(const p of[model,object]){put(p+0x34,(j-1)*0x200000);put(p+0x38,(j-1)*0x100000);put(p+0x3c,(j+1)*0x180000);}
  }
  for(let j=0;j<3;j++){put(0x90000+j*4,(random()%1024)|0);put(0x90010+j*4,(random()%512)|0);word(0x90020+j*2,(random()%4096)|0);}put(0x90030,random());f.roundingMode=modes[i%4];return f;
 };
 const execute=(entry,ecx,edx,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,j)=>machine.bytes.writeInt32LE(v|0,0x9004+j*4));steps+=machine.run(2000000);calls++;return machine.r.EAX;};
 const compare=(m,label)=>{const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
 for(let i=0;i<fixtures;i++){
  const f=fixtureFor(i*17+Math.floor(i/4)),{memory:m}=f,entry=[0x48b2a0,0x48b0e0,0x48acb0,0x48ac00][i%4],record=0x909300;machine.reset();m.copy(machine.bytes);machine.fpuRounding=f.roundingMode;let expected,ecx=record,edx=0,args=[];
  if(entry===0x48b2a0){ecx=f.addresses.bucket;edx=0x90000;args=[0x90010,0x90020];expected=source.weaponTargetBucketObstructed(ecx,edx,...args,f);}
  else if(entry===0x48b0e0){edx=i%3;args=[0x90020,0x90030];expected=source.evaluateWeaponTarget(record,edx,...args,f);}
  else if(entry===0x48acb0)source.updateVehicleWeaponTarget(record,f);else source.updateWeaponTargets(f);
  const result=execute(entry,ecx,edx,args);if(expected!==undefined)assert.equal(result,expected,`return${i}`);compare(m,`fixture${i}/${entry.toString(16)}`);
 }
 for(let i=0;i<persistent;i++){
  const f=fixtureFor(i+1),m=f.memory;machine.reset();m.copy(machine.bytes);machine.fpuRounding=f.roundingMode;
  for(let tick=0;tick<16;tick++){m.writeInt32LE(tick,0x90a548);machine.bytes.writeInt32LE(tick,0x90a548);source.updateWeaponTargets(f);execute(0x48ac00,0,0);compare(m,`persistent${i}/${tick}`);}
 }
 const report={method:'Actual48ac00/48acb0 target scheduler/scans,48b0e0 line preference and48b2a0 terrain obstruction with actual422c70 normalization and4286e0 spatial lookup. No game/platform mocks; populated competing model/body targets,terrain rows,locks and four rounding modes. ALLmappedmemory>=10000h compared after eachcall. Synthetic runtime/registry/terrain producers; no original process execution.',targetSha256:program.sha256,fixtures,persistentFrames:persistent*16,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyWeaponTargeting({fixtures:Number(process.argv[2]??4000),persistent:Number(process.argv[3]??24)});
