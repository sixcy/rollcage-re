import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {finishRaceProgress} from '../src/race-completion.mjs';
import {finishLapBookkeeping} from '../src/lap-bookkeeping.mjs';
import {finishVehicleBookkeeping} from '../src/finish-bookkeeping.mjs';
import {stepReplayControl} from '../src/replay-codec.mjs';
import {setSessionInputFlag} from '../src/session-input-flag.mjs';
const directory='analysis/native-simulation/results';
const numericBookkeeping=process.argv.includes('--bookkeeping');
const numericReplay=process.argv.includes('--replay');if(numericReplay&&!numericBookkeeping)throw Error('--replay requires --bookkeeping');
const {evidence,instructions}=await readInstructionEvidence(['124-respawn-finish-progress-assembly.json',...(numericBookkeeping?['137-lap-bookkeeping-assembly.json','128-lap-advance-notification-assembly.json','143-lap-time-pack-assembly.json','139-finish-bookkeeping-assembly.json','145-finish-score-assembly.json']:[]),...(numericReplay?['178-race-vehicle-shutdown-assembly.json','186-replay-finalize-assembly.json','180-race-end-state-assembly.json']:[])],{directory});
const constants=await Promise.all(['140-race-finish-default-name.json','141-race-finish-suffix.json'].map(async name=>{const reply=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);}));
const machine=new BoundedX86(instructions),source=Buffer.alloc(machine.bytes.length),RECORD=0x909300,SESSION=0x60000,SECOND=0x62000,PACK=0x64000,BODY=0x10000,STRIDE=0x4000,CONTROLLER=numericReplay?0x100000:0x30000,controllerStride=numericReplay?0x20000:0x4000,SCRATCH=0x9000-0xd8-12;
const tables=[];
if(numericBookkeeping)for(const name of ['129-lap-time-digit-switch.json','147-lap-time-pack-switch.json','146-finish-skill-tables.json']){const reply=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));tables.push(reply.structuredContent??JSON.parse(reply.content.find(value=>value.type==='text').text));}
if(numericReplay){const reply=JSON.parse(await readFile(`${directory}/189-replay-dispatch-tables.json`,'utf8'));tables.push(reply.structuredContent??JSON.parse(reply.content.find(value=>value.type==='text').text));}
let seed=0x449760ba,steps=0,callbackCount=0,notifications=0,finalizations=0,sessionReplacements=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},fixtures=2400;
const ranges=[[BODY,STRIDE*4],[CONTROLLER,numericReplay?0x80000:0x20000],[SESSION,0x6000],[0x6e7800,0x2000],[RECORD,0x30c*4],[0x91ffb0,8],[0x5ec958,4],[0x5ecb1c,4],[0x6e6560,0x40],...(numericReplay?[[0x849480,0x110],[0x91ce90,4]]:[])];
const callCounts={};
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();machine.bytes.fill(0xa5);const bytes=machine.bytes,bodyIndex=fixture%3,recordAddress=RECORD+bodyIndex*0x30c;
 for(const value of tables)Buffer.from(value.normalized_result.bytes_hex,'hex').copy(bytes,Number(value.normalized_result.address));
 for(const value of constants){assert.equal(value.normalized_result.complete,true);Buffer.from(value.normalized_result.bytes_hex,'hex').copy(bytes,Number(value.normalized_result.address));}
 bytes.fill(0x36,SCRATCH,SCRATCH+0x100);bytes.writeUInt32LE(SESSION,0x5ecb1c);bytes.writeUInt32LE(PACK,0x90b98c);bytes.writeInt32LE(random(0xffffffff)|0,0x5ec958);bytes.writeUInt32LE(0x12345678,0x5e8890);bytes.writeInt32LE(random(0xffffffff)|0,0x91ffb4);
 const mode=[0,1,3,4,8][fixture%5],limit=[0,1,3,5,255][Math.floor(fixture/5)%5],lap=[0,1,2,4,5,6,254,255][Math.floor(fixture/25)%8],count=[0,1,2,3][Math.floor(fixture/200)%4];
 for(const address of [SESSION,SECOND]){
  bytes.fill(0,address,address+0xb00);bytes[address+0x551]=mode;bytes[address+0x586]=limit;bytes[address+0x58c]=fixture%7===0?1:fixture%7===1?2:0;bytes[address+0xa86]=fixture%3===0?1:0;bytes[address+0x54d]=count;bytes[address+0x721]=fixture%2?0x80:0;bytes.writeInt32LE([4,5,6][fixture%3],address+0x57c);for(let index=0;index<4;index++)bytes[address+0x1c+index]=10+index;
 }
 bytes[SECOND+0x586]=(limit+1)&255;bytes[PACK+0x46]=fixture%7===0?1:2;bytes.writeUInt32LE(fixture%3===0?0:0x47,0x6eafe0);
 for(let index=0;index<4;index++){
  const record=RECORD+index*0x30c,body=BODY+index*STRIDE;bytes.writeUInt32LE(body,record);bytes[record+0x1c]=lap;bytes[record+0x1e]=fixture%8===0?(lap+1)&255:lap;bytes[record+0x249]=fixture%4===0?1:0;bytes[record+0x258]=fixture%3===0?1:0;bytes.writeInt16LE(-20-index,record+0x25c);
  bytes[body+0x671]=fixture%6===0?1:0;bytes.writeUInt16LE(index,body+0x65e);bytes[body+0x718]=fixture%9===0?8:0;const controller=CONTROLLER+index*controllerStride;bytes.writeUInt32LE(fixture%4===0?0:controller,body+0x660);bytes.writeInt32LE([2,5,7][index%3],controller+0x1e880);
  if(numericReplay){bytes.writeUInt16LE(0,controller);bytes.writeUInt16LE(0,controller+2);bytes.writeUInt32LE(controller+8,controller+0x4e28);bytes.writeUInt16LE(1,controller+0x4e2c);bytes.writeUInt16LE(bytes.readUInt16LE(body+0x710),controller+0x4e2e);for(let axis=0;axis<3;axis++){const p=controller+[0x4e30,0x14c24,0x19a50][axis];bytes[p]=bytes[body+0x708+axis];bytes[p+2]=0;bytes.writeUInt32LE(1024,p+4);bytes.writeUInt16LE(0,p+8);}}
  if(numericBookkeeping){bytes.writeUInt32LE(0x67000,body+0xc);bytes.writeUInt32LE(0x6500c,record+0x54);bytes.writeInt32LE(0,record+0x58);}
  bytes.fill(0,0x6e7894+index*0x67c,0x6e7894+index*0x67c+64);if(fixture%4!==1)bytes.write(`Driver${index}\0`,0x6e7894+index*0x67c,'ascii');
 }
 bytes[recordAddress+0x249]=fixture%5===0?1:0;
 if(numericReplay)bytes.writeInt32LE(0,0x9020a0);
 if(numericBookkeeping){bytes.writeUInt32LE(0x65000,PACK+0x60);bytes.writeUInt32LE(0x68000,PACK+0x7c);bytes.writeUInt32LE(0,0x67000);bytes.writeUInt32LE(1<<16,0x68000);bytes.fill(0,0x65000,0x65018);bytes.writeUInt16LE(2,0x6500c);bytes[0x65011]=7;bytes.writeUInt32LE(0x66000,0x65014);bytes.fill(0,0x66000,0x66020);bytes.writeInt16LE(1,0x66010);bytes.writeInt32LE(fixture,0x90a548);}
 //Both all-finished and unfinished-registry branches, while the selected
 //record is allowed to be absent from the captured registry count.
 if(fixture%6===0)for(let index=0;index<count;index++)bytes[RECORD+index*0x30c+0x249]=1;
 bytes.copy(source);const expectedLog=[],actualLog=[];
 const cstr=(memory,p)=>{let end=p;while(memory.readUInt8(end)!==0)end++;return memory.subarray(p,end).toString('hex');};
 const apply=(memory,name,{ecx,edx,args})=>{
  if(numericBookkeeping&&name==='call449be0')return finishLapBookkeeping(ecx,{memory});
  if(numericBookkeeping&&name==='call491be0')return finishVehicleBookkeeping(ecx,{memory});
  if(numericReplay&&name==='call42ab90')return stepReplayControl(ecx,{memory});
  if(numericReplay&&name==='call41a670')return setSessionInputFlag(ecx,{memory});
  const info={name,ecx:ecx??null,edx:edx??null,args:args??[],record:Buffer.from(memory.subarray(recordAddress,recordAddress+0x30c)),session:memory.readUInt32LE(0x5ecb1c)};
  if(name==='call4a0620')info.text=cstr(memory,ecx);
  const log=memory===source?expectedLog:actualLog;log.push(info);
  if(name==='call4579e0')memory.write(`Car${edx}\0`,ecx,'ascii');
  if(name==='call472700')memory.write(fixture%13===0?'\0':`P${ecx}\0`,args[1],'ascii');
  if(name==='call47b920'&&fixture%11===0)memory.writeUInt32LE(SECOND,0x5ecb1c);
  if(name==='call449be0'&&fixture%13===0)memory.writeUInt32LE(SECOND,0x5ecb1c); //ESI deliberately remains captured.
  if(name==='call491be0'&&fixture%5===0)memory.writeUInt32LE(SECOND,0x5ecb1c);
  if(name==='call42ab90'&&fixture%11===0)memory[SESSION+0x54d]=Math.max(0,memory[SESSION+0x54d]-1);
  if(name==='call41a670')memory.writeInt32LE(65535,0x91ffb4);
  return name==='call471800'?fixture%2:undefined;
 };
 const addresses={call47b920:0x47b920,call449be0:0x449be0,call4579e0:0x4579e0,call472700:0x472700,call4a0620:0x4a0620,call491be0:0x491be0,call407710:0x407710,call471800:0x471800,call472560:0x472560,call42ab90:0x42ab90,call41a670:0x41a670};
 const handlers=Object.fromEntries(Object.keys(addresses).map(name=>[name,options=>apply(source,name,options)]));
 finishRaceProgress(recordAddress,{memory:source,scratchBase:SCRATCH,handlers});
 for(const [name,address]of Object.entries(addresses))machine.externalCalls.set(address,m=>{
  const noRegisters=name==='call471800'||name==='call472560',argCount=name==='call472700'?2:0;
  const result=apply(m.bytes,name,{ecx:noRegisters?undefined:m.r.ECX,edx:name==='call4579e0'||name==='call472700'?m.r.EDX:undefined,args:Array.from({length:argCount},(_,index)=>m.bytes.readUInt32LE(m.r.ESP+index*4))});if(typeof result==='number')m.r.EAX=result;
 });
 machine.externalCalls.set(0x568162,()=>{});machine.entry=0x449760;machine.r.ECX=recordAddress;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.deepEqual(actualLog,expectedLog,`callbacks ${fixture}`);
 for(const [start,length]of ranges)assert.deepEqual(bytes.subarray(start,start+length),source.subarray(start,start+length),`range ${start.toString(16)} fixture ${fixture}`);
 assert.deepEqual(bytes.subarray(SCRATCH+0x18,SCRATCH+0xd0),source.subarray(SCRATCH+0x18,SCRATCH+0xd0),`string scratch ${fixture}`);
 for(const item of actualLog){callCounts[item.name]=(callCounts[item.name]??0)+1;if(item.name==='call4a0620')notifications++;if(item.name==='call41a670')finalizations++;}callbackCount+=actualLog.length;if(bytes.readUInt32LE(0x5ecb1c)!==SESSION)sessionReplacements++;
}
const report={method:`Complete449760 parent with original default-name/suffix bytes and forward ABI string moves. ${numericBookkeeping?'Actual449be0/4459f0/445d40 and491be0/48da10 numeric bookkeeping, with original switch/threshold tables.':'Bookkeeping callees are explicit mutation mocks.'} ${numericReplay?'Actual42ab90/42b280 replay codec and41a670 flag helper with full nonoverlapping controller storage.':''} Remaining pickup/message/network services are explicit state-mutating mocks; security cookie check admitted. Full selected/registry records, four rawbodies, controllers, session regions, player names, RNG/globals, string scratch and callback arguments/order compared. Covers early/wrapped laps, unlimited mode, mode1/4, notification/localized and literal suffix branches, captured versus replaced session pointers, unfinished/all-finished scan, live cleanup counts and signed sound IDs. No original process execution.`,evidence:[...evidence.map(item=>item.evidence_id),...constants.map(item=>item.evidence_id),...tables.map(item=>item.evidence_id)],instructions:instructions.length,fixtures,callbackCount,notifications,finalizations,sessionReplacements,callCounts,instructionSteps:steps,matched:true};await writeFile(numericReplay?'analysis/race-completion-replay-chain-instruction-check.json':numericBookkeeping?'analysis/race-completion-chain-instruction-check.json':'analysis/race-completion-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
