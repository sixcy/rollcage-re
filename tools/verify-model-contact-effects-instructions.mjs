import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createModelContactEffectFixture} from './lib/model-contact-effect-fixtures.mjs';
import {initializeModelContactFragments,emitModelContactFragments,updateModelContactFragments,breakClassOneModel,breakClassTwoModel} from '../src/model-contact-effects.mjs';
const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),STACK=0x9000,fixtures=400;
machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
let instructionSteps=0,calls=0,fragmentEmits=0,reuses=0,expirations=0,particles=0,debris=0;const visited=new Set();
machine.onInstruction=address=>{visited.add(address);if(address===0x48e950)fragmentEmits++;if(address===0x48e95e)reuses++;if(address===0x48ede1)expirations++;if(address===0x435fc4)particles++;if(address===0x475a71)debris++;};
function compare(f,label){const native=machine.bytes.subarray(0x10000),source=f.memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${label} diff0x${(0x10000+offset).toString(16)} native${native[offset]} source${source[offset]}`);}}
function execute(entry,ecx=0,edx=0,args=[]){machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));instructionSteps+=machine.run(3_000_000);calls++;}
for(let fixture=0;fixture<fixtures;fixture++)for(const entry of[0x48e800,0x48e900,0x48edb0,0x48ec50,0x4142a0]){
 const f=createModelContactEffectFixture(program,fixture,{initialize:entry!==0x48e800}),context={memory:f.memory,scratchBase:STACK};
 if(entry===0x48edb0){emitModelContactFragments(2*65536,-6*65536,0,fixture%70,fixture%16+2,fixture,context);for(let i=0;i<64;i++)if(f.memory[f.effectAddresses.fragments+i*384+0x2c])f.memory[f.effectAddresses.fragments+i*384+0x2c]=1+fixture%3;}
 machine.reset();f.memory.copy(machine.bytes);
 if(entry===0x48e800){initializeModelContactFragments(context);execute(entry);}
 else if(entry===0x48e900){const args=[fixture%7*65536,fixture%70,fixture%16+2,fixture];emitModelContactFragments(2*65536,-6*65536,...args,context);execute(entry,2*65536,-6*65536,args);}
 else if(entry===0x48edb0){updateModelContactFragments(context);execute(entry);}
 else if(entry===0x48ec50){const result=breakClassOneModel(0x250000,context);execute(entry,0x250000);assert.equal(machine.r.EAX,result);}
 else{breakClassTwoModel(0x250000,context);execute(entry,0x250000);}
 compare(f,`fixture${fixture}/${entry.toString(16)}`);
}
const sequenceScenarios=6,sequenceFrames=256;
for(let scenario=0;scenario<sequenceScenarios;scenario++){
 const f=createModelContactEffectFixture(program,scenario,{initialize:false}),context={memory:f.memory,scratchBase:STACK};machine.reset();f.memory.copy(machine.bytes);
 initializeModelContactFragments(context);execute(0x48e800);compare(f,`constructorSequence${scenario}`);
 const args=[0,[1,3,64,67,70,127][scenario],8,37];emitModelContactFragments(2*65536,-6*65536,...args,context);execute(0x48e900,2*65536,-6*65536,args);compare(f,`emitSequence${scenario}`);
 for(let frame=0;frame<sequenceFrames;frame++){updateModelContactFragments(context);execute(0x48edb0);compare(f,`lifetimeSequence${scenario}/${frame}`);}
 for(let i=0;i<64;i++)assert.equal(f.memory[f.effectAddresses.fragments+i*384+0x2c],0);
 emitModelContactFragments(2*65536,-6*65536,0,3,8,11,context);execute(0x48e900,2*65536,-6*65536,[0,3,8,11]);compare(f,`reactivationSequence${scenario}`);
}
const report={method:'Actual48ec50/4142a0 contacts,48e900 fragment emission,48e800 arena/material constructor and48edb0 expiry/movement, with actual attachment release,spatial removal/insertion,particle/debris RNG and sound absent-bank branch. Sixconstructor→emit/ringreuse→256expiryframes→reactivation scenarios verifyproducer/lifetime coherence. All data memory10000h..9fffffh compared after every operation; privateentry stack excluded. Only compiler cookie admitted. Constructed native runtime, no original-process execution.',targetSha256:program.sha256,fixtures,sequenceScenarios,sequenceFrames,calls,instructionSteps,executedInstructions:visited.size,fragmentEmits,reuses,expirations,particles,debris,matched:true};
await writeFile('analysis/model-contact-effects-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
