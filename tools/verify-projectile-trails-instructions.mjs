import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';
import * as source from '../src/projectile-trails.mjs';
export async function verifyProjectileTrails({fixtures=5000,output='analysis/projectile-trails-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0,seed=0x46aba0ab;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
 const watched=new Set([0x46aba0,0x46b000,0x436870,0x4354e0,0x484ce0,0x4334b0,0x435df0,0x474670,0x484bb0,0x40ea40]);machine.onInstruction=p=>{reached.add(p);if(watched.has(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(let i=0;i<fixtures;i++){
  const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),body=0x180000,record=0x909300,entry=[0x46aba0,0x46b000,0x436870,0x4354e0,0x484ce0][i%5],scenario=i*17+Math.floor(i/5),mode=[0,1,2,-1][scenario%4];initializeWheelEffectTables(m);m.fill((i*31)&255,0x8000,0x9100);m.fill((i*13)&255,body-0x1000,body+0x2000);put(record,body);
  put(body+0x184,[-1,0,1,2,3][scenario%5]);put(body+0x188,[0,1,2,16,64,128][scenario%6]);word(body+0x18c,[-32768,-33,-1,0,1,30,31,32,32767][scenario%9]);m[body+0x18e]=[-128,-1,0,1,2,3,31,32,33,127][scenario%10]&255;put(body+0x180,[0,1,10,100,0x7fffffff,-2147483648][scenario%6]);
  for(const o of[0x34,0x38,0x3c,0x68,0x6c,0x70,0x1a8,0x1ac,0x1b0])put(body+o,random());for(let j=0;j<10;j++)word(body+0xc4+j*2,scenario%3===0?j%4?0:4096:random());
  m[body+0x718]=scenario%3?10:8;m[f.addresses.pack+0xf6]=6;put(f.addresses.pack+0xf8,0x60000);put(0x90b98c,0x61000);put(0x61060,0x62000);for(let j=0;j<6;j++){const event=0x60000+j*8;word(event,j%2);word(event+2,j%3);m[event+4]=j%3?4:3;m[event+5]=j%2?1:0;put(0x62000+(j%2)*12+8,0x63000+(j%2)*0x100);for(let k=0;k<3;k++)word(0x63000+(j%2)*0x100+(j%3)*16+k*2,m.readUInt16LE(body+0x36+k*4)+(scenario%4===0?2000:100));}
  machine.reset();m.copy(machine.bytes);let ecx=body,edx=mode,args=[],expected;
  if(entry===0x46aba0)source.updateProjectileTrail(body,mode,f);else if(entry===0x46b000)source.lowerProjectileTrail(body,f);else if(entry===0x436870){ecx=i%7===0?f.addresses.particles+0x80:body+0x34;source.emitProjectileLaunchRing(ecx,f);}else if(entry===0x4354e0){ecx=record;source.clearVehicleLaunchEvents(record,f);}else{edx=scenario;args=[0,random(),random(),body+0x34,body+0x68];expected=source.startProjectileLoopSound(edx,args[1],args[2],args[3],args[4],f);}
  machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,j)=>machine.bytes.writeInt32LE(v|0,0x9004+j*4));steps+=machine.run(1000000);calls++;if(expected!==undefined)assert.equal(machine.r.EAX,expected);
  const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`fixture${i}/${entry.toString(16)} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
 }
 const report={method:'Actual46aba0 transform/trail producer and46b000 lowering,436870 particle allocation/spatial,4354e0 authored-event clears,484ce0 sound wrapper with actual4334b0/allocator/spatial/effect/audio game children. Only compiler cookie service. Signed ring/count/kind/state/width wrapping and raw overlapped scratch; ALLmappedmemory>=10000h compared. Explicit empty soundbank,synthetic bodies/events/arena and incoming stack bytes,no original process execution.',targetSha256:program.sha256,fixtures,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyProjectileTrails({fixtures:Number(process.argv[2]??5000)});
