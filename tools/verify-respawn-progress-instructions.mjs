import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateRespawnProgress} from '../src/respawn-progress.mjs';
const {evidence,instructions}=await readInstructionEvidence(['120-respawn-progress-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions);
let seed=0x44a2e0ab,steps=0,transitionCalls=0,forwardCalls=0,backwardCalls=0,packReplacements=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},RECORD=0x10000,BODY=0x20000;
const fixtures=2000;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const record={bytes:Buffer.alloc(780),body00:{position:Array.from({length:3},()=>((random(65536)-32768)<<16))}};
 for(let offset=0;offset<record.bytes.length;offset++)record.bytes[offset]=random(256);record.bytes.writeUInt32LE(BODY,0);
 const packs=Array.from({length:2},(_,index)=>{
  const checkpointCount44=1+random(5),checkpointIds90=Buffer.alloc(20,255),checkpoints70=Buffer.alloc(16*20);
  for(let id=0;id<16;id++){checkpoints70[id*20+1]=id%checkpointCount44;for(const offset of [4,6,8])checkpoints70.writeInt16LE(random(65536)-32768,id*20+offset);}
  for(let lane=0;lane<checkpointCount44*4;lane++)checkpointIds90[lane]=random(5)?random(16):255;checkpointIds90[0]=0;
  return {checkpointCount44,checkpointIds90,checkpoints70,address:0x30000+index*0x1000,table:0x40000+index*0x1000,ids:0x50000+index*0x1000};
 });
 const runtime={pack:packs[0]},sourceLog=[],nativeLog=[];let sourceCall=0,nativeCall=0;
 record.bytes.copy(machine.bytes,RECORD);record.body00.position.forEach((value,index)=>machine.bytes.writeInt32LE(value,BODY+0x34+index*4));
 for(const pack of packs){machine.bytes[pack.address+0x44]=pack.checkpointCount44;machine.bytes.writeUInt32LE(pack.table,pack.address+0x70);machine.bytes.writeUInt32LE(pack.ids,pack.address+0x90);pack.checkpoints70.copy(machine.bytes,pack.table);pack.checkpointIds90.copy(machine.bytes,pack.ids);}
 machine.bytes.writeUInt32LE(packs[0].address,0x90b98c);
 const resultFor=(call,mode)=>!mode?77:fixture%4===0?1:fixture%4===1?2:call>=3?0:call%2?2:1;
 const mutate=(bytes,call,mode)=>{bytes.writeInt32LE((fixture*257+call)|0,0x24);if(mode&&fixture%3===0){bytes[0x20]=(fixture+call)&255;bytes[0x21]=(fixture-call)&255;}};
 const expected=updateRespawnProgress(record,runtime,{transition:(object,mode)=>{
  sourceLog.push({mode,bytes:Buffer.from(object.bytes),pack:runtime.pack.address});const call=sourceCall++,answer=resultFor(call,mode);mutate(object.bytes,call,mode);
  if(mode&&call===0&&fixture%2){runtime.pack=packs[1];packReplacements++;}return answer;
 }});
 machine.externalCalls.set(0x449d40,m=>{
  assert.equal(m.r.ECX,RECORD);const mode=m.r.EDX,bytes=m.bytes.subarray(RECORD,RECORD+780);nativeLog.push({mode,bytes:Buffer.from(bytes),pack:m.bytes.readUInt32LE(0x90b98c)});
  const call=nativeCall++,answer=resultFor(call,mode);mutate(bytes,call,mode);if(mode&&call===0&&fixture%2)m.bytes.writeUInt32LE(packs[1].address,0x90b98c);m.r.EAX=answer;
  transitionCalls++;if(mode&&answer===1)forwardCalls++;if(mode&&answer===2)backwardCalls++;
 });
 machine.entry=0x44a2e0;machine.r.ECX=RECORD;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.equal(machine.r.EAX,expected);assert.deepEqual(nativeLog,sourceLog,`calls ${fixture}`);assert.deepEqual(machine.bytes.subarray(RECORD,RECORD+780),record.bytes,`record ${fixture}`);
 assert.equal(machine.bytes.readUInt32LE(0x90b98c),runtime.pack.address);
 for(const pack of packs){assert.deepEqual(machine.bytes.subarray(pack.table,pack.table+pack.checkpoints70.length),pack.checkpoints70);assert.deepEqual(machine.bytes.subarray(pack.ids,pack.ids+20),pack.checkpointIds90);}
}
const report={method:'Complete44a2e0 caller against retained instructions.449d40 is an explicit state-mutating transition mock, not a recovered checkpoint geometry implementation. Full780-byte record, checkpoint tables, source/body coordinates, live pack replacement, callback snapshots/modes and return compared. Fixtures cover signed wrapped nearest-distance overflow, ff lanes, forward/backward byte wrapping, iteration cap and final mode0 call after byte1f clear. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,transitionCalls,forwardCalls,backwardCalls,packReplacements,instructionSteps:steps,matched:true};
await writeFile('analysis/respawn-progress-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
