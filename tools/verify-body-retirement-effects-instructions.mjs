import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as effects from '../src/body-retirement-effects.mjs';
import {emitBodyEffectBurst,retireType33Body} from '../src/body-retirement.mjs';
const {instructions,evidence}=await readInstructionEvidence(['655-retirement-435f20-assembly.json','659-retirement-475a10-assembly.json','663-retirement-4386b0-assembly.json','665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json','115-effect-allocation-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','671-retirement-436490-assembly.json','673-retirement-436510-assembly.json','675-retirement-437670-assembly.json','667-retirement-44d230-assembly.json','661-retirement-437aa0-assembly.json','644-physical-unregister-assembly.json','646-type33-retirement-assembly.json','651-retirement-474850-assembly.json','653-retirement-435ba0-assembly.json','657-retirement-436410-assembly.json','149-event-emitter-assembly.json','151-effect-dispatch-assembly.json'],{directory:'analysis/native-simulation/results'});
const machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),yaw=JSON.parse(await readFile('src/yaw-table.json','utf8'));
const ROWS=0x40000,INDICES=0x43000,BUCKETS=0x45000,PARTICLES=0x100000,DEBRIS=0x110000,FREE=0x46000,ACTIVE=0x46100,POSITION=0x47000,VELOCITY=0x47100,OUTSIDE=0x47200,STACK=0x9000;
let seed=0x435f20ab,instructionSteps=0,spawned=0,debris=0,outside=0,reuses=0,totalParticleEmits=0,totalDebrisEmits=0,terrainWrites=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
machine.onInstruction=address=>{if(address===0x435e0d)reuses++;if(address===0x435fc4)totalParticleEmits++;if(address===0x475a71)totalDebrisEmits++;if(address===0x437c9e)terrainWrites++;};
machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX,m.bytes.readInt32LE(0x5e8890)));
const initialize=fixture=>{
 memory.fill(0);memory.fill(0x36,STACK-0x200,STACK+64);yaw.values.forEach((v,i)=>word(0x5ed030+i*2,v));
 put(0x909254,ROWS);put(0x909278,BUCKETS);for(let row=0;row<256;row++){word(ROWS+row*16,0xff00);word(ROWS+row*16+2,255);put(ROWS+row*16+12,INDICES);}
 // Sparse-row fallback, three vertical leaves and fractional coordinate bits.
 if(fixture%3===0)put(ROWS+128*16+12,0);put(BUCKETS+4,0x80000000);put(BUCKETS+12,32<<13);
 put(0x909240,0x48000);put(0x9092c0,0x49000);put(0x90924c,0x4c000);put(0x90b980,0x4b000);word(0x49000,10);word(0x49002,1);
 for(let id=0;id<4;id++){const segment=0x60000+id*256;put(0x48000+id*4,segment);put(segment+8,3);put(segment+12,24);put(segment+32,0x70000+id*0x1000);for(let i=0;i<100;i++){const p=0x70000+id*0x1000+i*8;word(p,(i%10)*4-20);word(p+2,(i%9)*3-12);put(p+4,((i%5)<<22)|((i%7)*4-12&65535));}}
 for(let i=0;i<1024;i++)put(0x4b000+i*4,i%2?0xffffff:0x808080);
 for(const bucket of[BUCKETS,BUCKETS+12]){if(fixture%3===0)put(bucket,1|(2<<7)|(2<<1));else{put(bucket,0);if(fixture%3===1)word(0x4c000,1|(2<<7)|(2<<1)|0x2000);else{word(0x4c000,(6<<1)|(8<<12));word(0x4c002,0x810);}}}
 if(fixture%6===2){word(0x4c002,0x10);word(0x4c004,1|(2<<7)|(3<<1));word(0x4c006,(1<<1)|(3<<12));word(0x4c008,0x21);word(0x4c00a,1|(3<<7)|(2<<1)|0x2000);}
 put(0x919008,0x120000);put(0x9153c0,0x140000);for(let i=0;i<10;i++)put(0x120000+i*0x1e2c+12,i<fixture%11?1:0);for(let i=0;i<3;i++)put(0x140000+i*0xf14+12,i<fixture%4?1:0);
 put(0x80f210,fixture%66);put(0x5e8890,0x71b842e9);
 const poolCount=[1,2,4,16][fixture%4];put(0x902eec,PARTICLES);put(0x6e65b4,PARTICLES);for(let i=0;i<poolCount;i++)put(PARTICLES+i*256+0xac,i+1<poolCount?PARTICLES+(i+1)*256:0);
 put(0x902b7c,FREE);put(0x902b80,ACTIVE);put(0x902b84,DEBRIS);put(0x902b88,0);put(0x902b8c,fixture%17-1);for(let i=0;i<32;i++)word(FREE+i*2,i);
 put(0x5ec958,[0,1,0x7fffffff,-1,random(0x100000000)][fixture%5]);put(0x5eb500,[0,1,4,16,32][fixture%5]);
 for(let i=0;i<3;i++){put(POSITION+i*4,(i===1?(fixture%3-1)*0x1000000:fixture%7*123456));put(VELOCITY+i*4,random(0x100000000));}
 memory.copy(machine.bytes);
};
const execute=(entry,ecx,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));instructionSteps+=machine.run();};
const compare=(fixture,label)=>{
 for(const[p,n]of[[PARTICLES,0x12000],[0x120000,10*0x1e2c],[0x140000,3*0xf14],[ROWS,0x1000],[BUCKETS,48],[FREE,0x200],[POSITION,0x110],[0x4d000,16],[0x70000,0x4000],[0x5ed2b4,4],[0x80f210,4],[0x80f420,256],[0x91d408,12],[0x91d448,12],[0x5ec958,4],[0x6e65b4,24],[0x902b7c,20],[0x902eec,4],[0x20000,0x8000],[0x902bc0,8],[0x91e780,28],[0x903520,4],[0x9153cc,0x30],[0x919020,288],[0x91cd60,0x34],[0x6fb954,8],[0x6fb9a4,4],[0x8106e0,0x244]]){
  const native=machine.bytes.subarray(p,p+n),js=memory.subarray(p,p+n);if(!native.equals(js)){const i=native.findIndex((v,i)=>v!==js[i]);assert.fail(`${label} fixture${fixture} firstdiff0x${(p+i).toString(16)} native${native[i]} JS${js[i]}`);}
 }
};
const fixtures=600;
for(let fixture=0;fixture<fixtures;fixture++){
 for(const entry of[0x4286e0,0x4386b0,0x435f20,0x475a10,0x44d230,0x437aa0,0x436490,0x436510,0x437670]){
  initialize(fixture);
  if(entry===0x4286e0){const x=memory.readInt32LE(POSITION),y=memory.readInt32LE(POSITION+4),z=memory.readInt32LE(POSITION+8),found=effects.lookupRawSpatialBucket(x,y,z,{memory});execute(entry,x,y,[z,OUTSIDE]);assert.equal(machine.r.EAX,found.bucket);assert.equal(machine.bytes.readInt32LE(OUTSIDE),found.outside);outside+=found.outside;}
  else if(entry===0x4386b0){const kind=[1,4,8,16,0x4000,0][fixture%6],life=[0,1,31,32,63,65535,-1][fixture%7];const value=effects.calculateRawEffectColor(kind,life,{memory});execute(entry,kind,life);assert.equal(machine.r.EAX,value);}
  else if(entry===0x435f20){const kind=[1,4,8,16,0x4000,0][fixture%6],count=fixture%12,color=0x0700aaff;spawned+=effects.emitRawEffectParticles(POSITION,VELOCITY,count,color,kind,{memory});execute(entry,POSITION,VELOCITY,[count,color,kind]);}
  else if(entry===0x475a10){const count=fixture%9-4;debris+=effects.emitRawBodyDebris(POSITION,VELOCITY,count,{memory});execute(entry,POSITION,VELOCITY,[count]);}
  else if(entry===0x44d230){const mode=fixture%17-2;effects.expandRawTerrainRanges(BUCKETS+12,0x4d000,mode,{memory});execute(entry,BUCKETS+12,0x4d000,[mode]);}
  else if(entry===0x437aa0){effects.alterRawTerrainBrightness(POSITION,fixture%14-2,{memory,scratchBase:STACK});execute(entry,POSITION,fixture%14-2);}
  else if(entry===0x436490){effects.appendRawBodyFlash(POSITION,fixture*1000000,{memory});execute(entry,POSITION,fixture*1000000);}
  else if(entry===0x436510){effects.activateRawBodyTrail(POSITION,fixture%3,{memory});execute(entry,POSITION,fixture%3);}
  else{effects.activateRawBodyPulse(POSITION,{memory});execute(entry,POSITION);}
  compare(fixture,entry.toString(16));
 }
}
const rangeFixtures=600;
for(let fixture=0;fixture<rangeFixtures;fixture++){
 initialize(fixture);
 for(let row=0;row<256;row++){
  const available=fixture%2===0||[120,125,130,135].includes(row);put(ROWS+row*16+12,available?INDICES:0);
  for(let range=0;range<6;range++)word(ROWS+row*16+range*2,range*40|((range*40+20)<<8));
 }
 for(let i=0;i<128;i++)word(INDICES+i*2,(i%2)*12);
 const x=((fixture*37%256)-128)<<24,y=0,z=0,found=effects.lookupRawSpatialBucket(x,y,z,{memory});memory.copy(machine.bytes);execute(0x4286e0,x,y,[z,OUTSIDE]);assert.equal(machine.r.EAX,found.bucket);assert.equal(machine.bytes.readInt32LE(OUTSIDE),found.outside);
}
const connectedFixtures=300;
for(let fixture=0;fixture<connectedFixtures;fixture++)for(const entry of[0x435ba0,0x46a2d0]){
 initialize(fixture);
 const body=0x20000,controller=0x21000,array=0x22000,group=0x23000,groupArray=0x23100;
 put(body+12,BUCKETS+12);put(body+0x164,controller);put(body+0x130,group);put(controller+4,10);put(controller+8,127);put(0x90a548,fixture+123);put(0x903520,-1);
 for(let i=0;i<3;i++)put(body+0x34+i*4,memory.readInt32LE(POSITION+i*4));
 put(0x902bc0,array);word(0x902bc4,2);put(array,body);put(array+4,0x28000);put(group,groupArray);word(group+4,1);put(groupArray,body);
 put(0x91e780,0x24000);put(0x91e78c,0x25000);put(0x91e790,0x26000);put(0x91e784,255);put(0x91e794,-1);put(0x91e798,256);memory[body+0x10c]=fixture%3;for(let i=0;i<256;i++){memory[0x25000+i]=i;memory[0x26000+i]=i;memory[body+0x140+i]=i;}put(body+0x164,controller);
 for(const p of[0x9153d8,0x9153e0,0x9153e4,0x919000,0x9153c8])put(p,0x0700aaff);
 // Explicit absent sound bank/channel; actual484bb0→40ea40 rejects the code.
 put(0x6f2414,0);put(0x6f2418,0);memory.copy(machine.bytes);
 if(entry===0x435ba0){const mask=fixture%2?0xfffff:0x5126b;emitBodyEffectBurst(POSITION,VELOCITY,8,mask,11,{memory,scratchBase:STACK});execute(entry,POSITION,VELOCITY,[8,mask,11]);}
 else{retireType33Body(body,{memory,scratchBase:STACK});execute(entry,body);}
 compare(fixture,'connected'+entry.toString(16));
}
const report={method:'Actual435f20 particle producer,475a10 debris producer,4386b0 color policy,4286e0 packed spatial selection with4746f0 sparse-row fallback,435df0 particle allocator/reuse,4748d0 spatial removal and474670 registration. Actual437aa0 terrain brightness mutation,44d230 packed range decoder/expander,and436490/436510/437670 flash/trail/pulse producers included; only compiler security-cookie equality is admitted as an ABI boundary. No game-owned callees mocked. Synthetic mapped rows/leaves,original321-word yaw/alpha table,free/active particle and debris storage. Compares complete pools,buckets,list globals,RNG,position/velocity and lookup return/outside flag; allfive particle kinds,spatial registration before jitter,active reuse,zero/one/multiple emits,frame-byte/color overlap,signed velocity and sparse/vertical selection. Additional600 six-interval/sparse-row checks and300 calls each to the complete435ba0 retirement/full masks and46a2d0 retirement execute every real particle/debris/terrain descendant plus484bb0 then40ea40 with an explicitly absent sound bank/channel. Compiler cookie is the only admitted boundary in these connected cases. No original process execution.',evidence:[...evidence.map(x=>x.evidence_id),yaw.evidence],instructions:instructions.length,fixtures,helperCalls:fixtures*9,rangeFixtures,connectedFixtures,connectedCalls:connectedFixtures*2,calls:fixtures*9+rangeFixtures+connectedFixtures*2,spawned,debris,totalParticleEmits,totalDebrisEmits,terrainWrites,outside,reuses,instructionSteps,matched:true};await writeFile('analysis/body-retirement-effects-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));


