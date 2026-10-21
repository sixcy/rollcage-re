import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {stepReplayControl,updateReplayChecksum} from '../src/replay-codec.mjs';
const directory='analysis/native-simulation/results',{evidence,instructions}=await readInstructionEvidence(['178-race-vehicle-shutdown-assembly.json','186-replay-finalize-assembly.json'],{directory}),tables=[];
for(const name of ['189-replay-dispatch-tables.json','146-finish-skill-tables.json']){const reply=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));tables.push(reply.structuredContent??JSON.parse(reply.content.find(value=>value.type==='text').text));}
const machine=new BoundedX86(instructions,{tables:tables.map(value=>value.normalized_result)}),memory=Buffer.alloc(0xa00000),BODY=0x10000,CONTROLLER=0x20000,SIZE=0x1e884,headers=[0x4e30,0x14c24,0x19a50];
let seed=0x42ab90cd,steps=0,checksums=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},fixtures=5000,stateCounts={};
for(const table of tables)Buffer.from(table.normalized_result.bytes_hex,'hex').copy(memory,Number(table.normalized_result.address));
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const state=fixture%8,checksumOnly=fixture>=4000;memory.fill(0xa5,BODY,BODY+0x4000);memory.fill(0x36,CONTROLLER,CONTROLLER+SIZE);
 memory.writeUInt32LE(fixture%17===0?0:CONTROLLER,BODY+0x660);memory.writeInt32LE(fixture%23===0?1:0,0x9020a0);memory.writeInt32LE(fixture%13===0?0:1,0x90a548);memory.writeInt32LE(state,CONTROLLER+0x1e880);memory.writeUInt16LE(random(32),CONTROLLER);memory.writeUInt16LE(random(65536),CONTROLLER+2);memory.writeUInt32LE(CONTROLLER+8+memory.readUInt16LE(CONTROLLER),CONTROLLER+0x4e28);
 memory.writeUInt16LE([0,1,15,127,511,8191,32767,32768,65535][fixture%9],CONTROLLER+0x4e2c);memory.writeInt16LE([-2,-1,0,1,2,32767][fixture%6],CONTROLLER+0x1e87c);
 const masks=[1,2,16,32,256,0x30,0x11,0,0xffff,0x8000,0x4010],oldMask=masks[Math.floor(fixture/8)%masks.length];memory.writeUInt16LE(oldMask,CONTROLLER+0x4e2e);memory.writeUInt32LE(((fixture%3===0?oldMask:random(65536))|0xa5a50000)>>>0,BODY+0x710);
 for(let index=0;index<64;index++)memory[CONTROLLER+8+index]=random(256);
 if(state===5){
  const p=memory.readUInt32LE(CONTROLLER+0x4e28),kind=Math.floor(fixture/8)%5,firstCode=random(8),secondCode=random(8);
  if(kind===0){memory[p]=(firstCode<<4)|random(16);}
  if(kind===1){memory[p]=0x80|(random(16)<<1)|random(2);memory[p+1]=random(256);}
  if(kind===2){memory[p]=0xc0|(firstCode<<2)|(secondCode>>1);memory[p+1]=((secondCode&1)<<7)|random(128);}
  if(kind===3){memory[p]=0xa0|(random(16)<<1)|(secondCode>>3);memory[p+1]=((secondCode&7)<<5)|random(32);}
  if(kind===4){memory[p]=0xe0|random(32);memory[p+1]=random(256);memory[p+2]=random(256);memory[p+3]=random(256);}
 }
 for(let axis=0;axis<3;axis++){
  const p=CONTROLLER+headers[axis];memory[p]=random(256);memory[p+1]=random(256);memory[p+2]=[0,1,126,127][fixture%4];memory.writeUInt32LE(fixture%7===0?0:100,p+4);memory.writeUInt16LE(16,p+8);memory.writeUInt16LE(fixture%3===0?16:random(16),p+10);memory[BODY+0x708+axis]=fixture%4===0?memory[p]:random(256);for(let index=0;index<64;index++)memory[p+12+index]=random(256);
 }
 memory.copy(machine.bytes,BODY,BODY,BODY+0x4000);memory.copy(machine.bytes,CONTROLLER,CONTROLLER,CONTROLLER+SIZE);memory.copy(machine.bytes,0x9020a0,0x9020a0,0x9020a4);memory.copy(machine.bytes,0x90a548,0x90a548,0x90a54c);
 if(checksumOnly){const validate=fixture%2!==0;updateReplayChecksum(CONTROLLER,{memory,validate});machine.entry=0x42b280;machine.r.ECX=CONTROLLER;machine.r.EDX=validate?1:0;checksums++;}
 else{stepReplayControl(BODY,{memory});machine.entry=0x42ab90;machine.r.ECX=BODY;stateCounts[state]=(stateCounts[state]??0)+1;}
 machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.deepEqual(machine.bytes.subarray(BODY,BODY+0x4000),memory.subarray(BODY,BODY+0x4000),`body ${fixture}`);assert.deepEqual(machine.bytes.subarray(CONTROLLER,CONTROLLER+SIZE),memory.subarray(CONTROLLER,CONTROLLER+SIZE),`controller ${fixture}`);
}
const report={method:'Complete42ab90 replay record/playback caller plus42b280 checksum, with original jump tables and5706a0 control-bit decode table. No mocked calls/arithmetic. Full16384-byte body and125060-byte controller/stream storage compared. Synthetic allstates0..7, control masks/five packet forms, signed frame limits, byte axis run/delta/literal data, capacity/terminal transitions, input dword upper-word clearing, native pause/clock/null guards, and standalone checksum compute/validate. No original process execution.',evidence:[...evidence.map(value=>value.evidence_id),...tables.map(value=>value.evidence_id)],instructions:instructions.length,fixtures,replayFixtures:4000,checksumFixtures:checksums,stateCounts,instructionSteps:steps,matched:true};await writeFile('analysis/replay-codec-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
