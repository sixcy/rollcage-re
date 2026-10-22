import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createModelContactEffectFixture} from './lib/model-contact-effect-fixtures.mjs';
import {initializeModelContactFragments,emitModelContactFragments} from '../src/model-contact-effects.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

export async function verifyRaceModelFragmentsConnected({scenarios=8,ticks=260,output='analysis/race-model-fragments-connected-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),own=await readInstructionEvidence(['310-race-step-parent-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(program.instructions);
 const boundaries=[...new Set(own.instructions.filter(i=>i.op==='CALL'&&/^0x/.test(i.args[0])).map(i=>Number(i.args[0])))].filter(address=>address!==0x48edb0);assert.equal(boundaries.length,41);
 for(const address of boundaries)machine.entries.delete(address);
 const STACK=0x9000,manager=0x7e000,vtable=0x7e100,service=0x73005c,configuration=0x7f000;
 let instructionSteps=0,parentCalls=0,producerCalls=0,boundaryCalls=0,expirations=0,activeAfterReactivation=0;const reached=new Set(),visits={};
 const watched=new Set([0x450e50,0x48e800,0x48e900,0x48edb0]);
 machine.onInstruction=address=>{reached.add(address);if(watched.has(address)){visits[address.toString(16)]=(visits[address.toString(16)]??0)+1;if(address===0x48edb0)assert.equal(machine.r.ESP,STACK-20);}
  if(address===0x48ede1)expirations++;
 };
 machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 const compare=(f,label)=>{const native=machine.bytes.subarray(0x10000),source=f.memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${label} byte0x${(offset+0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}};
 const executeProducer=(entry,ecx=0,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));instructionSteps+=machine.run(2_000_000);producerCalls++;};
 for(let scenario=0;scenario<scenarios;scenario++){
  const f=createModelContactEffectFixture(program,scenario,{initialize:false}),{memory}=f,put=(p,v)=>memory.writeInt32LE(v|0,p),context={memory,scratchBase:STACK},bank=f.effectAddresses.fragments;
  put(0x5ecefc,configuration);put(configuration+0x404,scenario*17);put(0x714b08,manager);put(manager,vtable);put(vtable+0x5c,service);memory[f.extraAddresses.session+0x58b]=scenario&1;
  const sourceLog=[],nativeLog=[];let tick=0;
  const boundary=(bytes,log,address)=>{
   log.push(address);
   //Declared earlier-stage mutation: the actual fragment update must consume
   //this changed speed in this same outer call, with no synchronizing copy.
   if(address===0x481200&&tick===1)bytes.writeInt32LE(17,bank+0x28);
   return 0;
  };
  const handlers={audioManagerCall:(object,method,args)=>sourceLog.push([object,method,args])};
  for(const address of boundaries){handlers[`call${address.toString(16)}`]=()=>boundary(memory,sourceLog,address);machine.externalCalls.set(address,m=>{m.r.EAX=boundary(m.bytes,nativeLog,address);});}
  machine.externalCalls.set(service,m=>{nativeLog.push([m.r.ECX>>>0,0x5c,[m.bytes.readInt32LE(m.r.ESP)]]);m.r.ESP+=4;});
  machine.reset();memory.copy(machine.bytes);
  initializeModelContactFragments(context);executeProducer(0x48e800);compare(f,`constructor${scenario}`);
  const count=[1,3,7,16,64,67,70,127][scenario%8],args=[0,count,8,37];
  emitModelContactFragments(2*65536,-6*65536,...args,context);executeProducer(0x48e900,2*65536,-6*65536,args);compare(f,`emission${scenario}`);
  for(;tick<ticks;tick++){
   if(tick===256){const reactivation=[0,3,8,11];emitModelContactFragments(2*65536,-6*65536,...reactivation,context);executeProducer(0x48e900,2*65536,-6*65536,reactivation);compare(f,`reactivation${scenario}`);}
   const returned=runRaceUpdate(tick%2,2,{memory,scratchBase:STACK,handlers});
   machine.entry=0x450e50;machine.r.EDX=tick%2;machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);machine.bytes.writeInt32LE(2,STACK+4);
   instructionSteps+=machine.run(2_000_000);parentCalls++;assert.equal(machine.r.EAX,returned);assert.deepEqual(nativeLog,sourceLog);compare(f,`scenario${scenario}/tick${tick}`);
   if(tick===254)for(let i=0;i<64;i++)assert.equal(memory[bank+i*384+0x2c],0);
  }
  if(ticks===260){const active=Array.from({length:64},(_,i)=>memory[bank+i*384+0x2c]).filter(Boolean);assert.deepEqual(active,[251,251,251]);activeAfterReactivation+=active.length;}
  boundaryCalls+=sourceLog.filter(value=>typeof value==='number').length;
 }
 const report={method:'Actual450e50 caller with actual48edb0 default and original nested entryESP, over persistent actually constructed/emitted fragments. Actual48e800 and48e900 setup,255-call expiry,empty-bank update andreactivation execute their original numeric/spatial/RNG descendants. Other41 direct outergame stages are explicit contracts includingone earlier speedmutation; finalaudio-manager virtualcall is explicit. Every data byte10000h..9fffffh compared aftereveryproducer/outercall; privateentrystack/lowaddressspace excluded. No originalprocess execution or wholeoutertick closureclaim.',targetSha256:program.sha256,evidence:own.evidence.map(item=>item.evidence_id),scenarios,ticks,parentCalls,producerCalls,instructionSteps,executedInstructions:reached.size,boundaryCalls,expirations,activeAfterReactivation,actualGameCalls:visits,matched:true};
 if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceModelFragmentsConnected()));
