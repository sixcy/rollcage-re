import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {finishLapBookkeeping,packLapTime} from '../src/lap-bookkeeping.mjs';
const directory='analysis/native-simulation/results',{evidence,instructions}=await readInstructionEvidence(['137-lap-bookkeeping-assembly.json','128-lap-advance-notification-assembly.json','143-lap-time-pack-assembly.json'],{directory}),tables=[];
for(const name of ['129-lap-time-digit-switch.json','147-lap-time-pack-switch.json']){const reply=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));tables.push(reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text));}
const machine=new BoundedX86(instructions,{tables:tables.map(item=>item.normalized_result)}),boundary=await readInstructionEvidence(['137-lap-bookkeeping-assembly.json'],{directory}),mockMachine=new BoundedX86(boundary.instructions),memory=Buffer.alloc(0xa00000),record=0x10000,bodies=[0x20000,0x24000],sessions=[0x30000,0x38000];
let seed=0x449be0ad,steps=0,insertions=0,callbacks=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,edges=[-2147483648,-2049,-2048,-17,-2,-1,0,1,2047,2048,0x464ffff,0x4650000,2147483647];
const fixtures=5000;
for(let fixture=0;fixture<fixtures;fixture++){
 const mocked=fixture>=4000,m=mocked?mockMachine:machine;m.reset();memory.fill(0xa5,record,record+780);memory.fill(0x5a,bodies[0],bodies[1]+0x4000);for(const session of sessions)memory.fill(0x7d,session,session+0x4000);
 memory.writeUInt32LE(bodies[0],record);memory[record+0x1c]=[0,1,2,5,255][fixture%5];memory.writeInt32LE(fixture%2?edges[fixture%edges.length]:signed(),record+0x2c);memory.writeInt32LE([signed(),-1][fixture%2],record+0x30);memory.writeInt32LE(signed(),0x90a548);memory.writeUInt32LE(sessions[0],0x5ecb1c);
 bodies.forEach((body,index)=>memory.writeUInt16LE((fixture+index)%4,body+0x65e));
 for(const session of sessions){memory[session+0x58c]=fixture%7===0?1:0;memory[session+0x551]=fixture%3===0?1:0;for(let index=0;index<4;index++)for(let slot=0;slot<5;slot++)memory.writeUInt32LE(fixture%5===0?0xffffffff:fixture%5===1?0:fixture%5===2?slot*1000:random(0xffffffff),session+index*0xdc+0x30+slot*4);}
 const ranges=[[record,780],[bodies[0],0x8000],...sessions.map(p=>[p,0x4000]),[0x90a548,4],[0x5ecb1c,4]];for(const [p,n]of ranges)memory.copy(m.bytes,p,p,p+n);
 const sourceLog=[],nativeLog=[];
 function format(target,all,address,log){log.push(['format',all,address,target.readUInt32LE(address+0x38),target.readUInt32LE(address+0x4c)]);target[address+0x1c]=fixture%6;target.writeUInt32LE(sessions[1],0x5ecb1c);target[sessions[1]+0x58c]=0;target[sessions[1]+0x551]=fixture%2;}
 function convert(target,time,log){log.push(['convert',time]);target.writeUInt32LE(bodies[1],record);target[record+0x1c]=7;target.writeUInt32LE(sessions[0],0x5ecb1c);return fixture%3===0?0xffffffff:fixture%3===1?0:1234;}
 finishLapBookkeeping(record,{memory,handlers:mocked?{formatTime4459f0:(all,address)=>format(memory,all,address,sourceLog),convertTime445d40:time=>convert(memory,time,sourceLog)}:{}});
 if(mocked){m.externalCalls.set(0x4459f0,n=>format(n.bytes,n.r.ECX,n.r.EDX,nativeLog));m.externalCalls.set(0x445d40,n=>{n.r.EAX=convert(n.bytes,n.r.ECX>>>0,nativeLog)|0;});callbacks+=sourceLog.length;}
 m.entry=0x449be0;m.r.ECX=record;m.r.ESP=0x9000;m.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=m.run();for(const [p,n]of ranges)assert.deepEqual(m.bytes.subarray(p,p+n),memory.subarray(p,p+n),`bytes ${fixture}/${p.toString(16)}`);assert.deepEqual(nativeLog,sourceLog,`calls ${fixture}`);if(memory[record+0x1c]&&memory[sessions[mocked?1:0]+0x58c]===0)insertions++;
}
const packFixtures=3000;
for(let fixture=0;fixture<packFixtures;fixture++){machine.reset();const time=fixture%2?edges[fixture%edges.length]:signed(),expected=packLapTime(time);machine.entry=0x445d40;machine.r.ECX=time;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();assert.equal(machine.r.EAX>>>0,expected,`packed ${fixture}/${time}`);}
const report={method:'Complete449be0 lap bookkeeping with actual4459f0 digit formatting and445d40 packed-time conversion plus original switch bytes.4000 complete numeric fixtures,1000 boundary-callback fixtures verify cached session/lap/index behavior under live record/session/body changes, and3000 independent signed packed-time fixtures. Full780-byte record,two16384-byte bodies,two16384-byte sessions and globals compared. Covers unsigned minimum/sentinel, wrapped clock division, strict best-five insertion and per-lap indexing. No original process execution.',evidence:[...evidence,...tables].map(item=>item.evidence_id),instructions:instructions.length,fixtures,completeNumericFixtures:4000,callbackFixtures:1000,packFixtures,eligibleWrites:insertions,callbackCalls:callbacks,instructionSteps:steps,matched:true};await writeFile('analysis/lap-bookkeeping-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
