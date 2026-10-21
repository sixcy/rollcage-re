import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {transitionCheckpoint} from '../src/respawn-progress.mjs';
const directory='analysis/native-simulation/results',names=['126-checkpoint-transition-assembly.json','134-checkpoint-interpolation-assembly.json','122-respawn-advance-lap-assembly.json','128-lap-advance-notification-assembly.json'];
const {evidence,instructions}=await readInstructionEvidence(names,{directory}),reply=JSON.parse(await readFile(`${directory}/129-lap-time-digit-switch.json`,'utf8')),table=reply.structuredContent??JSON.parse(reply.content.find(value=>value.type==='text').text),machine=new BoundedX86(instructions,{tables:[table.normalized_result]});
let seed=0x449d40ab,steps=0,basisCalls=0,finishCalls=0,returns=[0,0,0,0];const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const RECORD=0x10000,BODY=0x20000,OTHER=0x30000,PACK=0x40000,CHECKPOINTS=0x41000,IDS=0x42000,SESSION=0x43000,fixtures=4000;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,body={bytes:Buffer.alloc(0x4000)},other={bytes:Buffer.alloc(0x4000)},record={bytes:Buffer.alloc(780),body00:body},sourceLog=[],nativeLog=[];
 for(const buffer of [body.bytes,other.bytes,record.bytes])for(let offset=0;offset<buffer.length;offset+=4)buffer.writeInt32LE(signed(),offset);
 record.bytes.writeUInt32LE(BODY,0);record.bytes[0x20]=0;record.bytes[0x21]=1;record.bytes[0x1c]=fixture%4;record.bytes[0x1e]=fixture%3;record.bytes[0x249]=fixture%2;record.bytes[0x1f]=[0,1,239,240,241,255][fixture%6];
 body.bytes.writeInt32LE(fixture%17===0?-1:fixture%256,0x11c);body.bytes.writeInt16LE(fixture%7,0x668);other.bytes.writeInt16LE((fixture+4)%7,0x668);
 const checkpoints70=Buffer.alloc(4*20),checkpointIds90=Buffer.alloc(16);for(let index=0;index<4;index++){
  checkpointIds90[index*4]=index;checkpoints70[index*20]=fixture%256;checkpoints70[index*20+1]=index;checkpoints70.writeUInt16LE(random(65536),index*20+2);
  for(const offset of [4,6,8])checkpoints70.writeInt16LE(random(65536)-32768,index*20+offset);
  for(const offset of [12,14,16])checkpoints70.writeInt16LE(random(2049)-1024,index*20+offset);
  checkpoints70[index*20+18]=fixture%2;
 }
 const mode=fixture%3,clock=signed(),runtime={pack:{checkpointCount44:4,checkpoints70,checkpointIds90},session:{mode579:fixture%5===0?11:0},clock90a548:clock},tangent=Array.from({length:3},()=>signed()>>10);
 record.bytes.copy(bytes,RECORD);body.bytes.copy(bytes,BODY);other.bytes.copy(bytes,OTHER);checkpoints70.copy(bytes,CHECKPOINTS);checkpointIds90.copy(bytes,IDS);
 bytes.writeUInt32LE(PACK,0x90b98c);bytes[PACK+0x44]=4;bytes.writeUInt32LE(CHECKPOINTS,PACK+0x70);bytes.writeUInt32LE(IDS,PACK+0x90);bytes.writeUInt32LE(SESSION,0x5ecb1c);bytes[SESSION+0x579]=runtime.session.mode579;bytes.writeInt32LE(clock,0x90a548);
 const sourceOptions={trackBasis:(captured)=>{assert.equal(captured,body);sourceLog.push(['basis',Buffer.from(record.bytes)]);if(fixture%7===0){record.body00=other;record.bytes.writeUInt32LE(OTHER,0);}return tangent;},finishProgress:()=>{sourceLog.push(['finish',Buffer.from(record.bytes)]);record.bytes.writeInt32LE(0x1234,0x24);record.bytes[0x1c]=(record.bytes[0x1c]+1)&255;}};
 const expected=transitionCheckpoint(record,mode,runtime,sourceOptions);
 machine.externalCalls.set(0x417210,m=>{assert.equal(m.bytes.readUInt32LE(m.r.ESP),BODY);nativeLog.push(['basis',Buffer.from(m.bytes.subarray(RECORD,RECORD+780))]);if(fixture%7===0)m.bytes.writeUInt32LE(OTHER,RECORD);tangent.forEach((value,index)=>m.bytes.writeInt32LE(value,m.r.ECX+index*4));[0,65536,0].forEach((value,index)=>m.bytes.writeInt32LE(value,m.r.EDX+index*4));basisCalls++;});
 machine.externalCalls.set(0x449760,m=>{assert.equal(m.r.ECX,RECORD);nativeLog.push(['finish',Buffer.from(m.bytes.subarray(RECORD,RECORD+780))]);m.bytes.writeInt32LE(0x1234,RECORD+0x24);m.bytes[RECORD+0x1c]=(m.bytes[RECORD+0x1c]+1)&255;finishCalls++;});
 machine.entry=0x449d40;machine.r.ECX=RECORD;machine.r.EDX=mode;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.equal(machine.r.EAX,expected,`return ${fixture}`);returns[expected]++;assert.deepEqual(nativeLog,sourceLog,`calls ${fixture}`);assert.deepEqual(bytes.subarray(RECORD,RECORD+780),record.bytes,`record ${fixture}`);assert.deepEqual(bytes.subarray(BODY,BODY+0x4000),body.bytes,`body ${fixture}`);assert.deepEqual(bytes.subarray(OTHER,OTHER+0x4000),other.bytes,`other ${fixture}`);assert.deepEqual(bytes.subarray(CHECKPOINTS,CHECKPOINTS+80),checkpoints70);assert.deepEqual(bytes.subarray(IDS,IDS+16),checkpointIds90);
}
const report={method:'Complete449d40 checkpoint transition plus actual41c990 interpolation and44a560/4459f0 lap timer callees. Track-basis417210 and race-completion449760 are explicit state-mutating boundaries. Full780-byte record, two16384-byte bodies, checkpoint/ID tables and callback order compared. Synthetic mode0/1/2, signed projection/interpolation, sector gating, original-body capture with live body-pointer replacement, speed-direction branches, counter240 wrap, lap-forward/backward state and timing. No original process execution.',evidence:[...evidence.map(value=>value.evidence_id),table.evidence_id],instructions:instructions.length,fixtures,basisCalls,finishCalls,returns,instructionSteps:steps,matched:true};await writeFile('analysis/checkpoint-transition-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
