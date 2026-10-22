import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createAttachmentEffectsFixture} from './verify-attachment-effects-instructions.mjs';
import {updateRawAttachmentEffects,updateRawPersistentEmitters,activateRawPersistentEmitter} from '../src/attachment-effects.mjs';
import {advanceRawEffectParticles} from '../src/particle-lifetime.mjs';

const names=['1061-attachment-target-update-a-assembly.json','1063-attachment-target-update-b-assembly.json','1065-attachment-emitter-assembly.json','1067-attachment-target2-emitter-assembly.json','115-effect-allocation-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json','943-world-effects-stage-b-assembly.json','951-world-effect-438280-assembly.json','955-world-effect-438330-assembly.json','957-world-effect-435ec0-assembly.json'];
names.push('1076-persistent-emitter-setup-assembly.json');
const {instructions,evidence}=await readInstructionEvidence(names,{directory:'analysis/native-simulation/results'});
const reply=JSON.parse(await readFile('analysis/native-simulation/results/960-world-effect-update-switch.json','utf8')),table=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);
const machine=new BoundedX86(instructions),scenarios=32,frames=132,ranges=[[0x10000,0x8000],[0x60000,0x14000],[0x100000,0x8000],[0x5ec958,4],[0x6e65b4,24],[0x6e6b1c,8],[0x6ff140,200],[0x80e660,32],[0x80f56c,512],[0x902eec,52],[0x9153c4,4],[0x91900c,4]];
let steps=0,calls=0,emits=0,frees=0;
machine.onInstruction=address=>{if(address===0x435ec0)frees++;};
for(let scenario=0;scenario<scenarios;scenario++) {
 const context=createAttachmentEffectsFixture(scenario*4+3),m=context.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p);
 put(0x9153c4,0x100000);put(0x91900c,0x102000);put(0x6e6b1c,1);put(0x902f00,0x10000);word(0x1016a,0x3000);word(0x1016c,0x4001);word(0x1016e,0);
 for(let i=0;i<10;i++)put(0x6ff14c+i*20,0);word(0x72006,2);put(0x6ff14c,1);word(0x6ff146,0);put(0x6ff150,0);
 Buffer.from(table.normalized_result.bytes_hex,'hex').copy(m,Number(table.normalized_result.address));machine.reset();m.copy(machine.bytes);
 const compare=label=>{for(const[address,length]of ranges)assert.deepEqual(machine.bytes.subarray(address,address+length),m.subarray(address,address+length),`scenario ${scenario}/${label}/${address.toString(16)}`);};
 const execute=entry=>{machine.entry=entry;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(1_000_000);calls++;compare(entry.toString(16));};
 for(let frame=0;frame<frames;frame++) {
  //450e50 advances particles before both emitters in the same update.
  advanceRawEffectParticles(context);execute(0x438550);
  if(frame===0||frame===130) {
   if(frame===130) {
    assert.equal(m.readUInt32LE(0x6e65c0),0);assert.equal(m.readUInt32LE(0x6e65c8),0);
    //Only the fixture's preexisting type2 targets remain spatially registered.
    const ids=[];let id=m.readUInt16LE(0x6300a);while(id){ids.push(id);assert(ids.length<=8);id=m.readUInt16LE(0x100000+(id-1)*128+4);}
    assert.deepEqual(ids.sort((a,b)=>a-b),[193,194,195,196,197,198,199,200]);
    for(const bytes of[m,machine.bytes]){bytes.writeUInt32LE(1,0x6e6b1c);bytes.writeInt16LE(2,0x72006);bytes.writeInt32LE(1,0x6ff14c);bytes.writeInt16LE(0,0x6ff146);bytes.writeInt32LE(0,0x6ff150);}
   }
   emits+=updateRawPersistentEmitters(context);execute(0x44f990);emits+=updateRawAttachmentEffects(context).particles;execute(0x44f3a0);
  }
 }
}
const setupScenarios=8,setupFrames=1060;let setupSteps=0,setupCalls=0,setupActivations=0,setupEmits=0,setupFrees=0;
machine.onInstruction=address=>{if(address===0x435ec0)setupFrees++;};
for(let scenario=0;scenario<setupScenarios;scenario++) {
 const context=createAttachmentEffectsFixture(scenario*4+3),m=context.memory,put=(p,v)=>m.writeInt32LE(v|0,p);
 put(0x9153c4,0x100000);put(0x91900c,0x102000);put(0x6fbb14,scenario);for(let i=0;i<10;i++)put(0x6ff14c+i*20,0);
 [scenario*65536+32767,-2*65536-1,12345].forEach((value,axis)=>put(0x17000+axis*4,value));
 Buffer.from(table.normalized_result.bytes_hex,'hex').copy(m,Number(table.normalized_result.address));machine.reset();m.copy(machine.bytes);
 const execute=(entry,ecx=0)=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);setupSteps+=machine.run(1_000_000);setupCalls++;
  for(const[address,length]of[...ranges,[0x6fbb14,4]])assert.deepEqual(machine.bytes.subarray(address,address+length),m.subarray(address,address+length),`setup ${scenario}/${entry.toString(16)}/${address.toString(16)}`);
 };
 activateRawPersistentEmitter(0x17000,context);execute(0x44f910,0x17000);setupActivations++;
 for(let frame=0;frame<setupFrames;frame++) {
  advanceRawEffectParticles(context);execute(0x438550);
  if(frame===1040) {
   assert.equal(m.readUInt32LE(0x6e65c0),0);assert.equal(m.readUInt32LE(0x6e65c8),0);
   for(let i=0;i<10;i++)assert.equal(m.readInt32LE(0x6ff14c+i*20),0);
   const ids=[];let id=m.readUInt16LE(0x6300a);while(id){ids.push(id);assert(ids.length<=8);id=m.readUInt16LE(0x100000+(id-1)*128+4);}
   assert.deepEqual(ids.sort((a,b)=>a-b),[193,194,195,196,197,198,199,200]);
   activateRawPersistentEmitter(0x17000,context);execute(0x44f910,0x17000);setupActivations++;
  }
  setupEmits+=updateRawPersistentEmitters(context);execute(0x44f990);
 }
}
const report={method:'Actual450e50 relative order438550 advancement→44f990 persistent emitter→44f3a0 queued attachment effects over132 persistent frames per scenario, plus8×1060-frame scenarios beginning with actual44f910 activation and its original900-frame duration. Actual types27/28/34 creation,spatial insertion,motion,expiry/freeing andlater reuse with zero admitted calls or game mocks. Full pool/free/active/spatial/queue/emitter/target/RNG/cursor storage compared after every operation. Atframe130 in original scenarios and1040 in constructor scenarios active endpoints are asserted empty and spatial membership contains only preexisting synthetic type2 targets before reactivation/emissions from reclaimed pool. Runtime pool/map/target constructors remain explicit fixture inputs; persistent-emitter fields now also have an actual producer scenario. No original-process execution.',evidence:evidence.map(item=>item.evidence_id).concat(table.evidence_id),instructions:instructions.length,scenarios,frames,calls,instructionSteps:steps,emittedParticles:emits,actualFrees:frees,setupScenarios,setupFrames,setupCalls,setupSteps,setupActivations,setupEmits,setupFrees,matched:true};
await writeFile('analysis/attachment-effects-lifetime-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
