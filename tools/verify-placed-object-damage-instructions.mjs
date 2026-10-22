import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {damagePlacedObject,emitPlacedShapeDebris,queueDestroyedPlacedObjects,startModelDestructionCamera,selectModelDestructionObserver,computeModelCameraDuration} from '../src/placed-object-damage.mjs';

const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),STACK=0x9000,OBJECT=0x250000,BODY=0x10000,VELOCITY=0x79000,OUTPUT=0x79100,PARTICLES=0x700000,DEBRIS=0x720000,FREE=0x760000,ACTIVE=0x761000;
let instructionSteps=0,damaged=0,particles=0,debris=0,observerTests=0;const visited=new Set();
machine.onInstruction=address=>{visited.add(address);if(address===0x435fc4)particles++;if(address===0x475a71)debris++;if(address===0x4176b0)observerTests++;};
machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
const entries=[0x421da0,0x480900,0x415190,0x41a5d0,0x417720,0x41a570],fixtures=600;
for(let fixture=0;fixture<fixtures;fixture++)for(const entry of entries){
 const f=createSimulationRuntimeFixture(program,fixture,{models:true}),{memory}=f,put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 memory.fill(0x36,STACK-0x300,STACK+32);memory.fill(0,PARTICLES,PARTICLES+128*256);memory.fill(0,DEBRIS,DEBRIS+64*128);
 put(0x902eec,PARTICLES);put(0x6e65b4,PARTICLES);put(0x6e65c0,0);put(0x6e65c8,0);for(let i=0;i<128;i++)put(PARTICLES+i*256+0xac,i<127?PARTICLES+(i+1)*256:0);
 put(0x902b7c,FREE);put(0x902b80,ACTIVE);put(0x902b84,DEBRIS);put(0x902b88,0);put(0x902b8c,fixture%65-1);for(let i=0;i<64;i++)word(FREE+i*2,i);
 put(0x9153dc,fixture%24);put(0x9153d8,0x0700aaff);put(0x5ec958,fixture+1);put(0x5eb500,[0,1,32,256][fixture%4]);put(0x6f2414,0);put(0x6f2418,0);
 put(BODY,[7,12,17][fixture%3]);put(BODY+0xa8,[0,1,65536,4*65536][fixture%4]);
 for(let i=0;i<3;i++)put(VELOCITY+i*4,((fixture*(i+3)%41-20)<<16)|(fixture*17&65535));
 for(let i=0;i<3;i++){
  const object=OBJECT+i*0x1000;put(object+0x1b0,fixture%5===0&&i===0?object+0x1000:0);put(object+0x19c,fixture%7===0&&i<2?object+0x1000:0);memory[object+0x198]=1+fixture%3;
  [4096,0,0,0,4096,0,0,0,4096].forEach((v,j)=>word(object+0xc4+j*2,v));
  for(let slot=0;slot<4;slot++)put(memory.readUInt32LE(object+0x194)+slot*4,((fixture+slot)%4===0?0:0x4000000)|((fixture+slot)%16<<28));
 }
 memory[f.extraAddresses.session+0x58c]=fixture%2?0:2;
 put(0x6e6550,fixture%6);word(0x91ffb2,fixture%4===0?44:60);
 for(let i=0;i<6;i++){const p=0x91f6c0+i*56;put(p,(i+fixture)%3===0?1:0);for(let axis=0;axis<3;axis++)put(p+4+axis*4,(i*30+axis*7-50)*65536);}
 machine.reset();memory.copy(machine.bytes);machine.entry=entry;machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);
 let sourceReturn,ecx,edx=0,args=[];const context={memory,scratchBase:STACK};
 if(entry===0x421da0){ecx=OBJECT;edx=BODY;args=[fixture%4,VELOCITY];sourceReturn=damagePlacedObject(OBJECT,BODY,...args,context);damaged+=sourceReturn;}
 else if(entry===0x480900){ecx=OBJECT;edx=fixture%4;args=[VELOCITY];emitPlacedShapeDebris(OBJECT,edx,VELOCITY,context);}
 else if(entry===0x415190){ecx=OBJECT;sourceReturn=queueDestroyedPlacedObjects(OBJECT,context);}
 else if(entry===0x41a5d0){ecx=OBJECT;edx=VELOCITY;startModelDestructionCamera(OBJECT,VELOCITY,context);}
 else if(entry===0x417720){ecx=VELOCITY;args=[OUTPUT,1500];selectModelDestructionObserver(VELOCITY,...args,context);}
 else{ecx=OBJECT+0x34;edx=VELOCITY;args=[700,4];sourceReturn=computeModelCameraDuration(ecx,edx,...args,context);}
 machine.r.ECX=ecx;machine.r.EDX=edx;args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));
 instructionSteps+=machine.run(2_000_000);if(sourceReturn!==undefined)assert.equal(sourceReturn,machine.r.EAX,`return${fixture}/${entry.toString(16)}`);
 for(const[address,length]of[[OBJECT,0x3000],[BODY,0x4000],[VELOCITY,0x110],[PARTICLES,128*256],[DEBRIS,64*128],[FREE,0x1100],[f.addresses.nodes,36],[0x5ec958,4],[0x6e65b4,24],[0x902b7c,20],[0x9153cc,0x30],[0x919020,288],[0x91cdc0,48],[0x91d360,0x104],[0x91f6c0,6*56],[0x91ff80,0x140],[0x9205a0,0x250]]){
  const native=machine.bytes.subarray(address,address+length),source=memory.subarray(address,address+length);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`fixture${fixture} entry${entry.toString(16)} diff0x${(address+offset).toString(16)} native${native[offset]} source${source[offset]}`);}
 }
}
const report={method:'Actual421da0 damage,480900 paired debris,415190 chained destruction queue,41a5d0 camera activation,417720 observer selection and41a570 duration with real numeric/particle/debris/spatial/sound descendants. Only compiler cookie is admitted; actual sound dispatcher receives an absent bank. Declared constructed runtime/pools and synthetic geometry, not original process execution.',targetSha256:program.sha256,fixtures,calls:fixtures*entries.length,instructionSteps,executedInstructions:visited.size,damaged,particles,debris,observerTests,matched:true};
await writeFile('analysis/placed-object-damage-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
