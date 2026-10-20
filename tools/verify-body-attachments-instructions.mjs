import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
const {evidence,instructions}=await readInstructionEvidence(['084-attachment-update-assembly.json','086-attachment-transform-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions,{entry:0x44f050});
const modes=['nearest-even','toward-zero','down','up'],fixtures=4000,TYPE4=0x70000,MODEL=0x50000,TYPE2=0x60000;
let seed=0x44f050ab,instructionSteps=0,processedBodies=0,transformedPoints=0,type1Writes=0,type2Writes=0,type4Writes=0,spatialMoves=0,appendedBodies=0,shrunkQueues=0,scratchMutations=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,fill=buffer=>{for(let index=0;index<buffer.length;index++)buffer[index]=random(256);return buffer;};
const positions=bytes=>[0,2,4].map(offset=>bytes.readInt16LE(0x10+offset));
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();machine.fpuRounding=modes[fixture%4];const bytes=machine.bytes,bodies=Array.from({length:7},(_,index)=>({address:0x10000+index*0x1000,position:Array.from({length:3},signed),rotation:Array.from({length:9},()=>random(65536)-32768),rotationPaddingD6:random(65536),attachmentHandles:Array.from({length:5},()=>((([0,1,2,3,4,15][random(6)])<<12)|random(8))),points:fill(Buffer.alloc(40))}));
 if(fixture%4===0)bodies[0].attachmentHandles=[0x2000,0x1001,0x4002,0x3003,0xf004];
 if(fixture%6===0){bodies[0].attachmentHandles=[0x2000,0,0,0,0];bodies[0].rotation=[4096,0,0,0,4096,0,0,0,4096];bodies[0].position=[0,0,0];bodies[0].points.fill(0);}
 const queue={entries:bodies.slice(),count:fixture%5},initialCount=queue.count,type1Records=fill(Buffer.alloc(8*8)),type4Records=fill(Buffer.alloc(8*12)),type2Objects=Array.from({length:8},(_,index)=>({index,address:TYPE2+index*0x100,bytes:fill(Buffer.alloc(64))})),scratch=fill(Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH)),nativeLog=[],sourceLog=[];
 if(fixture%6===0)type2Objects[0].bytes.fill(0,0x10,0x16);
 bytes.writeFloatLE(1/4096,0x5dc5f4);bytes.writeUInt32LE(queue.count,0x6e6ba0);queue.entries.forEach((body,index)=>bytes.writeUInt32LE(body.address,0x902040+index*4));
 const expectedBodies=[];
 bodies.forEach((body,index)=>{fill(bytes.subarray(body.address,body.address+0x800));body.position.forEach((value,axis)=>bytes.writeInt32LE(value,body.address+0x34+axis*4));body.rotation.forEach((value,lane)=>bytes.writeInt16LE(value,body.address+0xc4+lane*2));bytes.writeUInt16LE(body.rotationPaddingD6,body.address+0xd6);body.attachmentHandles.forEach((handle,lane)=>bytes.writeUInt16LE(handle,body.address+0x16a+lane*2));bytes.writeUInt32LE(MODEL+index*0x100,body.address+0x10);bytes.writeUInt16LE(0x80,MODEL+index*0x100+0x4c);body.points.copy(bytes,MODEL+index*0x100+0x80);expectedBodies.push(Buffer.from(bytes.subarray(body.address,body.address+0x800)));});
 type1Records.copy(bytes,0x90b688);type4Records.copy(bytes,TYPE4);type2Objects.forEach(target=>{target.bytes.copy(bytes,target.address);bytes.writeUInt32LE(target.address,0x80e660+target.index*4);});bytes.writeUInt32LE(0x78000,0x90b990);bytes.writeUInt32LE(TYPE4,0x7810c);scratch.copy(bytes,ATTACHMENT_SCRATCH_BASE);
 let nativeAppended=false,sourceAppended=false,nativeShrunk=false,sourceShrunk=false;
 machine.externalCalls.set(0x4748d0,m=>{
  const target=type2Objects.find(target=>target.address===m.r.ECX);assert.ok(target);nativeLog.push(['remove',target.index,positions(bytes.subarray(target.address,target.address+64))]);bytes[target.address]^=0x17;
  if(fixture%3===0){bytes.writeInt16LE(-32768,target.address+0x12);}
  if(!nativeAppended&&fixture%2===0){const index=bytes.readUInt32LE(0x6e6ba0);bytes.writeUInt32LE(bodies[4].address,0x902040+index*4);bytes.writeUInt32LE(index+1,0x6e6ba0);nativeAppended=true;}
  if(!nativeShrunk&&fixture%11===0){bytes.writeUInt32LE(0,0x6e6ba0);nativeShrunk=true;}
  if(fixture%7===0)bytes.writeFloatLE(-0.5,0x91cdc0);
  if(fixture%13===0)bytes.writeUInt16LE(0,bodies[0].address+0x16e);
 });
 machine.externalCalls.set(0x474670,m=>{const target=type2Objects.find(target=>target.address===m.r.ECX);assert.ok(target);nativeLog.push(['insert',target.index,[m.r.EDX,bytes.readInt32LE(m.r.ESP),bytes.readInt32LE(m.r.ESP+4)]]);bytes[target.address+1]^=0x29;});
 const report=updateBodyAttachments(queue,{pointsFor:body=>body.points,type1Records,type2Objects,type4Records,scratch,roundingMode:machine.fpuRounding,handlers:{
  removeTarget:target=>{
   sourceLog.push(['remove',target.index,positions(target.bytes)]);target.bytes[0]^=0x17;
   if(fixture%3===0)target.bytes.writeInt16LE(-32768,0x12);
   if(!sourceAppended&&fixture%2===0){queue.entries[queue.count]=bodies[4];queue.count++;sourceAppended=true;appendedBodies++;}
   if(!sourceShrunk&&fixture%11===0){queue.count=0;sourceShrunk=true;shrunkQueues++;}
   if(fixture%7===0){scratch.writeFloatLE(-0.5,0x91cdc0-ATTACHMENT_SCRATCH_BASE);scratchMutations++;}
   if(fixture%13===0)bodies[0].attachmentHandles[2]=0;
  },insertTarget:(target,positionQ16)=>{sourceLog.push(['insert',target.index,positionQ16]);target.bytes[1]^=0x29;}
 }});
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 assert.deepEqual(nativeLog,sourceLog,`spatial hooks fixture${fixture}`);assert.equal(bytes.readUInt32LE(0x6e6ba0),queue.count);assert.equal(queue.count,0);queue.entries.forEach((body,index)=>assert.equal(bytes.readUInt32LE(0x902040+index*4),body.address));
 assert.ok(bytes.subarray(ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH).equals(scratch),`all scratch bytes fixture${fixture}`);assert.ok(bytes.subarray(0x90b688,0x90b688+type1Records.length).equals(type1Records),`type1 fixture${fixture}`);assert.ok(bytes.subarray(TYPE4,TYPE4+type4Records.length).equals(type4Records),`type4 fixture${fixture}`);
 type2Objects.forEach(target=>assert.ok(bytes.subarray(target.address,target.address+target.bytes.length).equals(target.bytes),`type2 fixture${fixture}/${target.index}`));
 bodies.forEach((body,index)=>{body.attachmentHandles.forEach((handle,lane)=>expectedBodies[index].writeUInt16LE(handle,0x16a+lane*2));assert.ok(bytes.subarray(body.address,body.address+0x800).equals(expectedBodies[index]),`body fixture${fixture}/${index}`);assert.ok(bytes.subarray(MODEL+index*0x100+0x80,MODEL+index*0x100+0xa8).equals(body.points));});
 if(initialCount===0)assert.equal(report.processedBodies,0);for(const name of ['processedBodies','transformedPoints','type1Writes','type2Writes','type4Writes','spatialMoves']){if(name==='processedBodies')processedBodies+=report[name];else if(name==='transformedPoints')transformedPoints+=report[name];else if(name==='type1Writes')type1Writes+=report[name];else if(name==='type2Writes')type2Writes+=report[name];else if(name==='type4Writes')type4Writes+=report[name];else spatialMoves+=report[name];}
}
const report={method:'Complete44f050 processor and actual432080 x87 transform instructions. Only4748d0/474670 spatial handlers are explicit state-mutating mocks. All body/model-point/table bytes and entire1700-byte retained global scratch including padding/gaps compared; live queue append/shrink, handle mutation, scratch mutation, callback coordinate rereads, unsupported types and first-zero terminator. Exact dyadic signed-short/Q12 input domain uses binary64 x87 value stack, not a general80-bit emulation claim. Four declared rounding modes; no original process execution or authored model-point producer claim.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,roundingModes:modes,processedBodies,transformedPoints,type1Writes,type2Writes,type4Writes,spatialMoves,appendedBodies,shrunkQueues,scratchMutations,instructionSteps,matched:true};
await writeFile('analysis/body-attachments-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
