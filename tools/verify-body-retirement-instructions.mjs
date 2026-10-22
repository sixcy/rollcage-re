import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {unregisterPhysicalBody,removeBodySpatial,appendBodyPositionEffect,emitBodyEffectBurst,retireType33Body} from '../src/body-retirement.mjs';
const {instructions,evidence}=await readInstructionEvidence(['644-physical-unregister-assembly.json','646-type33-retirement-assembly.json','651-retirement-474850-assembly.json','653-retirement-435ba0-assembly.json','657-retirement-436410-assembly.json'],{directory:'analysis/native-simulation/results'});
const machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),BODY=0x10000,POOL=0x30000,BUCKET=0x40000,ARRAY=0x41000,GROUP=0x42000,GROUP_ARRAY=0x42100,CONTROL=0x43000,HANDLE=0x44000,OBJECT=0x44100,VTABLE=0x44200,METHOD=0x44300,FREE=0x50000,ACTIVE=0x51000,REVERSE=0x52000,POSITION=0x53000,VELOCITY=0x53100,STACK=0x9000;
let instructionSteps=0,seed=0x4284d0ab,stops=0,effectCalls=0,released=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},put=(address,value)=>memory.writeInt32LE(value|0,address),word=(address,value)=>memory.writeUInt16LE(value&65535,address);
const initialize=fixture=>{
 memory.fill(0);memory.fill(0x55,BODY,BODY+0x1000);memory.fill(0x36,STACK-256,STACK+64);put(BODY,fixture);memory[BODY+0x10c]=0xff;put(BODY+0x130,fixture%3?GROUP:0);put(BODY+0x164,CONTROL);put(CONTROL+4,[-1,0,9,10,100][fixture%5]);put(CONTROL+8,[127,0,256,HANDLE][fixture%4]);put(HANDLE,fixture%7?OBJECT:0);put(OBJECT,VTABLE);put(VTABLE+0x34,METHOD);
 put(0x902bc0,ARRAY);word(0x902bc4,3);for(let i=0;i<3;i++)put(ARRAY+i*4,i===fixture%3?BODY:0x18000+i*0x1000);put(GROUP,GROUP_ARRAY);word(GROUP+4,2);put(GROUP_ARRAY,fixture%2?BODY:0x19000);put(GROUP_ARRAY+4,fixture%2?0x19000:BODY);
 put(0x902eec,POOL);word(BODY+4,[0,1,2,17][fixture%4]);word(BODY+6,[0,1,7][fixture%3]);put(BODY+12,BUCKET|(fixture%2));word(BUCKET+8,99);for(let i=0;i<20;i++){word(POOL+i*128+4,33);word(POOL+i*128+6,44);}
 put(0x91e780,fixture%11===0?ACTIVE:FREE);put(0x91e78c,ACTIVE);put(0x91e790,REVERSE);put(0x91e784,255);put(0x91e794,-1);put(0x91e798,256);for(let i=0;i<256;i++){memory[ACTIVE+i]=i;memory[REVERSE+i]=i;memory[FREE+i]=0xcc;memory[BODY+0x140+i]=i;}
 // Large inclusive collision lists overlap controller fields; restore those
 // pointers for lifecycle fixtures after choosing their small valid list.
 put(BODY+0x164,CONTROL);put(0x90a548,fixture*7);put(0x903520,-1);put(0x9153dc,fixture%24);put(0x810920,fixture%19);put(0x811180,fixture%2);
 for(const address of[0x9153d8,0x9153e0,0x9153e4,0x919000,0x9153c8])put(address,random(0x100000000));
 for(const p of[POSITION,VELOCITY])for(let i=0;i<3;i++)put(p+i*4,random(0x100000000));memory.copy(machine.bytes);
};
const compare=(fixture,label)=>{
 for(const[address,length]of[[BODY,0x1000],[POOL,20*128],[BUCKET,16],[ARRAY,16],[GROUP,0x110],[CONTROL,16],[HANDLE,0x340],[FREE,0x3200],[0x902bc0,8],[0x91e780,28],[0x903520,4],[0x90a548,4],[0x8106e0,0x244],[0x9153cc,0x30],[0x919020,24*12],[0x91cd60,0x34],[0x6fb954,8],[0x6fb9a4,4]]){
  const actual=machine.bytes.subarray(address,address+length),expected=memory.subarray(address,address+length);if(!actual.equals(expected)){const offset=actual.findIndex((value,i)=>value!==expected[i]);assert.fail(`${label} fixture${fixture} firstdiff0x${(address+offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
 }
};
const execute=(entry,ecx,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));instructionSteps+=machine.run();};
const fixtures=2000;
for(let fixture=0;fixture<fixtures;fixture++){
 initialize(fixture);const collisionLast=[-128,-1,0,1,3,31,63,127][fixture%8];memory.writeInt8(collisionLast,BODY+0x10c);memory.copy(machine.bytes);unregisterPhysicalBody(BODY,{memory});execute(0x4284d0,BODY);compare(fixture,'unregister');released+=Math.max(0,collisionLast+1);
 initialize(fixture);removeBodySpatial(BODY,{memory});execute(0x474850,BODY);compare(fixture,'spatial remove');
 initialize(fixture);appendBodyPositionEffect(POSITION,fixture*257-32768,{memory});execute(0x436410,POSITION,fixture*257-32768);compare(fixture,'position append');
 for(const entry of[0x435ba0,0x46a2d0]){
  initialize(fixture);memory[BODY+0x10c]=fixture%4===0?0xff:fixture%4;memory.copy(machine.bytes);const expected=[],actual=[];
  const mutate=(target,log,name,ecx,edx,args)=>{log.push([name,ecx,edx,args]);target.writeInt32LE(target.readInt32LE(0x90a548)+1,0x90a548);};
  const handlers={emit484bb0:({code,registerEdx,args})=>mutate(memory,expected,'emit484bb0',code,registerEdx,args),emitParticles435f20:({position,velocity,count,color,kind})=>mutate(memory,expected,'emitParticles435f20',position,velocity,[count,color,kind]),stopAudioVirtual34:({object,method})=>{assert.equal(method,METHOD);mutate(memory,expected,'stop',object,0,[]);stops++;}};
  for(const[name,code]of[['emit436490',0x436490],['emitDebris475a10',0x475a10],['emit436510',0x436510],['alterTerrain437aa0',0x437aa0],['emit437670',0x437670]])handlers[name]=({position,velocity,count,mode})=>mutate(memory,expected,name,position,name==='emitDebris475a10'?velocity:name==='emit437670'?0:mode??count,name==='emitDebris475a10'?[count]:[]);
  const hooks=[[0x484bb0,'emit484bb0',7],[0x435f20,'emitParticles435f20',3],[0x436490,'emit436490',0],[0x475a10,'emitDebris475a10',1],[0x436510,'emit436510',0],[0x437aa0,'alterTerrain437aa0',0],[0x437670,'emit437670',0]];
  for(const[address,name,count]of hooks)machine.externalCalls.set(address,m=>mutate(m.bytes,actual,name,m.r.ECX,name==='emit437670'?0:m.r.EDX,Array.from({length:count},(_,i)=>m.bytes.readInt32LE(m.r.ESP+i*4))));
  machine.externalCalls.set(METHOD,m=>mutate(m.bytes,actual,'stop',m.r.ECX,0,[]));
  if(entry===0x435ba0){const mask=[0,0x5126b,0xfffff][fixture%3];emitBodyEffectBurst(POSITION,VELOCITY,fixture%9,mask,fixture%12,{memory,scratchBase:STACK,handlers});execute(entry,POSITION,VELOCITY,[fixture%9,mask,fixture%12]);}
  else{retireType33Body(BODY,{memory,scratchBase:STACK,handlers});execute(entry,BODY);}
  compare(fixture,entry.toString(16));assert.deepEqual(actual,expected,`callbacks${fixture}/${entry.toString(16)}`);effectCalls+=expected.length;
 }
}
const report={method:'Complete raw4284d0 physical unregister,474850 packed spatial removal,436410 position append,435ba0 dispatcher parent and46a2d0 type33 retirement.2000 fixtures per entry compare all body/pool/list/global/effect bytes; inclusive signed collision indexes, byte-array alias, global/group swap deletion, tagged buckets and packed neighbor links, effect masks/ring, controller/audio sentinels and live timestamp reads. Effect children435f20/436490/475a10/436510/437aa0/437670/484bb0 and virtual audio stop are explicitly state-mutating call boundaries, with exact arguments/order checked; their complete numeric closure is independently checked by the companion effects verifier. No original process execution.',evidence:evidence.map(x=>x.evidence_id),instructions:instructions.length,fixtures,calls:fixtures*5,released,stops,effectCalls,instructionSteps,matched:true};await writeFile('analysis/body-retirement-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
