import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {formatLapTimeDigits,updateLapAdvance} from '../src/lap-timing.mjs';
const directory='analysis/native-simulation/results';
const {evidence,instructions}=await readInstructionEvidence(['122-respawn-advance-lap-assembly.json','128-lap-advance-notification-assembly.json'],{directory});
const reply=JSON.parse(await readFile(`${directory}/129-lap-time-digit-switch.json`,'utf8'));
const table=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);
assert.equal(table.normalized_result.complete,true);assert.equal(table.normalized_result.returned_bytes,32);
const machine=new BoundedX86(instructions,{tables:[table.normalized_result]}),RECORD=0x10000,BODY=0x20000;
let seed=0x4459f0ad,steps=0,formattedRows=0,capturedTimers=0;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
const edges=[-2147483648,-2147483647,-2049,-2048,-2047,-17,-16,-2,-1,0,1,15,16,17,127,128,2047,2048,2049,12288000,2147483646,2147483647];
const fixtures=6000;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const record=Buffer.alloc(780),body={bytes:Buffer.alloc(0x4000)};
 for(let offset=0;offset<record.length;offset+=4)record.writeInt32LE(random(),offset);
 for(let offset=0;offset<body.bytes.length;offset+=4)body.bytes.writeInt32LE(random(),offset);
 record.writeUInt32LE(BODY,0);for(let row=0;row<4;row++)record.writeInt32LE(fixture%3===0?edges[(fixture+row)%edges.length]:random(),0x2c+row*4);
 const all=fixture%3===0?0:fixture%3===1?1:-1,clock=fixture%2?random():edges[fixture%edges.length],advance=fixture<3000;
 if(advance){record[0x1c]=fixture%7;record[0x1e]=fixture%4===0?255:record[0x1c];record[0x20]=fixture%2;}
 record.copy(machine.bytes,RECORD);body.bytes.copy(machine.bytes,BODY);machine.bytes.writeInt32LE(clock,0x90a548);
 if(advance){
  if(record[0x1c]===record[0x1e]){capturedTimers++;if(record[0x20]!==0||record[0x1c]!==0)formattedRows+=4;}
  updateLapAdvance(record,{body,clock90a548:clock});machine.entry=0x44a560;machine.r.ECX=RECORD;
 }else{formatLapTimeDigits(record,all);formattedRows+=all?4:2;machine.entry=0x4459f0;machine.r.ECX=all;machine.r.EDX=RECORD;}
 machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.deepEqual(machine.bytes.subarray(RECORD,RECORD+record.length),record,`record ${fixture}`);
 assert.deepEqual(machine.bytes.subarray(BODY,BODY+body.bytes.length),body.bytes,`body ${fixture}`);
 assert.equal(machine.bytes.readInt32LE(0x90a548),clock);
}
const report={method:'Complete44a560 and4459f0 retained instruction replay, including original8-entry switch table. No mocked calls or arithmetic helpers. Full780-byte vehicle record and16384-byte body compared, including stale skipped rows and unsigned wrapped clock conversion. Synthetic signed timer edges/negative values, missing sentinel-1, all-row/alternate-row formatting, zero/nonzero lap/checkpoint branches. No original process execution.',evidence:[...evidence.map(value=>value.evidence_id),table.evidence_id],instructions:instructions.length,fixtures,lapAdvanceFixtures:3000,digitFixtures:3000,formattedRows,capturedTimers,instructionSteps:steps,matched:true};
await writeFile('analysis/lap-timing-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
