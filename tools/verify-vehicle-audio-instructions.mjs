import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateVehicleAudio, initializeVehicleAudioTables} from '../src/vehicle-audio.mjs';

const directory = 'analysis/native-simulation/results';
const own = await readInstructionEvidence(['271-vehicle-state-485300-assembly.json'], {directory});
const tables = await Promise.all(['708-vehicle-audio-tables.json', '709-vehicle-audio-float-constants.json', '710-vehicle-audio-horn-sequences.json', '711-vehicle-audio-one.json', '712-vehicle-audio-minus-one.json'].map(async name => {
  const reply = JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
  return reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
}));
const machine = new BoundedX86(own.instructions), BODY = 0x10000, OTHER = 0x20000, SESSION = 0x30000, PACK = 0x40000, SECTORS = 0x41000, SECTOR = 0x42000, MATERIAL = 0x43000;
const CHANNELS = 0x50000, SOURCES = 0x60000, VTABLE = 0x70000, STACK = 0x9000, METHOD = 0x700000;
const contracts = [{id:'484bb0',args:7},{id:'484cb0',args:4},{id:'484d10',args:0},{id:'484d30',args:1},{id:'484d90',args:0},{id:'40e5e0',args:1},{id:'407380',args:5},{id:'4074e0',args:0},{id:'407570',args:1},{id:'407670',args:1}];
let seed = 0x485300ad, instructionSteps = 0, virtualCalls = 0, boundaryCalls = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const put = (memory,address,value) => memory.writeInt32LE(value|0,address), word = (memory,address,value) => memory.writeUInt16LE(value&65535,address);
const fixtures = 6000, branchVisits = new Map();
const initialized = Buffer.alloc(0xa00000, 0x69); initializeVehicleAudioTables(initialized);
for (const table of (JSON.parse(await readFile('src/vehicle-audio-tables.json', 'utf8'))).tables) {
  const address = Number(table.address), expected = Buffer.alloc(table.bytes_hex.length / 2);
  const carrier = tables.find(item => address >= Number(item.normalized_result.address) && address + expected.length <= Number(item.normalized_result.address) + item.normalized_result.bytes_hex.length / 2).normalized_result;
  Buffer.from(carrier.bytes_hex, 'hex').copy(expected, 0, address - Number(carrier.address), address - Number(carrier.address) + expected.length);
  assert.deepEqual(initialized.subarray(address, address + expected.length), expected, `retained table${table.address}`);
}
assert.equal(initialized.readUInt32LE(0x5eced4), 0x69696969);
machine.onInstruction = address => {if ([0x485533,0x4855c6,0x485765,0x4857cb,0x4858f3,0x485937,0x485a34,0x485a70,0x485b49,0x485fc9,0x486076,0x4860c2,0x486124,0x4861d8,0x486240].includes(address)) branchVisits.set(address,(branchVisits.get(address)??0)+1);};
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const memory = machine.bytes;
  memory.fill(0,0x713190,0x7132e0); memory.fill(0,0x909300,0x90a548); memory.fill(0x51,STACK-256,STACK+64);
  for (const item of tables) Buffer.from(item.normalized_result.bytes_hex,'hex').copy(memory,Number(item.normalized_result.address));
  const index = random(6), audio = 0x713190 + index*40, horn = 0x713280 + index*16, record = 0x909300 + index*0x30c;
  put(memory,0x5ecb1c,SESSION); put(memory,0x90b98c,PACK); put(memory,PACK,SECTORS); put(memory,SECTORS,SECTOR); memory[SECTOR+4]=random(2)?2:0;
  put(memory,record,fixture%17===0?OTHER:BODY); memory[record+0x258]=random(4); word(memory,record+0x25c,random(4)-1);
  put(memory,SESSION+0x57c,random(7)); word(memory,SESSION+0x61c,random(2)); memory[SESSION+0x585]=random(2); memory[SESSION+index+0x1c]=random(7); put(memory,SESSION+0x724,random(2));
  put(memory,0x811180,random(2)); put(memory,0x811184,random(2)?BODY:OTHER); put(memory,0x81118c,random(65537)); put(memory,0x5eced4,[index,-1,7][random(3)]);
  put(memory,0x90a548,random(10000)); memory[0x6e6bdc]=random(64);
  for (const body of [BODY,OTHER]) {
    memory[body+0x4b4]=random(2); memory[body+0x57c]=random(2); memory[body+0x64d]=random(256); memory[body+0x64f]=random(2);
    put(memory,body+0x5f8,(random(61)-30)*65536); put(memory,body+0x530,(random(61)-30)*65536);
    put(memory,body+0x5d4,(random(32001)-16000)*256); put(memory,body+0x50c,(random(32001)-16000)*256); put(memory,body+0x6b0,(random(20001)-10000)*16);
    for (const offset of [0x3e8,0x4b0,0x578,0x640]) put(memory,body+offset,random(300001)-100000);
    for (const offset of [0xc4,0xca,0xd0]) word(memory,body+offset,random(8193)-4096);
    for (const offset of [0x680,0x684,0x688]) put(memory,body+offset,random(200001)-100000);
    put(memory,body+0x1d0,fixture%3?MATERIAL:0); put(memory,body+0x1ec,fixture%4?MATERIAL+32:0); put(memory,body+0x11c,fixture%5?0:-1);
    memory[body+0x6b4]=random(3); memory[body+0x718]=[8,9,10][random(3)]; memory[body+0x710]=random(2)?0x20:0; memory[body+0x714]=random(2)?0x20:0;
    memory[body+0x71e]=random(13); memory[body+0x722]=random(2); memory[body+0x70a]=random(2); memory[body+0x66f]=random(256); memory[body+0x670]=0x69;
    put(memory,body+0x3e74,fixture%3?random(10000):-1);
  }
  memory[MATERIAL+12]=random(3); memory[MATERIAL+44]=random(30);
  put(memory,audio,random(16001)*65536+random(65536));
  for(const offset of [4,8,12,16,20]) put(memory,audio+offset,[0,127,256,CHANNELS+random(8)*16][random(4)]);
  word(memory,audio+24,random(30001)-10000); word(memory,audio+26,random(32001)-16000); word(memory,audio+28,random(7)); word(memory,audio+30,random(8)-2);
  memory[audio+32]=random(3); memory[audio+33]=random(5); memory[audio+34]=random(27); word(memory,audio+36,random(16001)); word(memory,audio+38,random(7)-1);
  put(memory,horn,random(3)?255:0); put(memory,horn+4,random(20)); put(memory,horn+8,random(2)?127:CHANNELS); put(memory,horn+12,random(10000));
  for (let channel=0;channel<8;channel++) {put(memory,CHANNELS+channel*16,fixture%19===0?0:SOURCES+channel*16); put(memory,SOURCES+channel*16,VTABLE);}
  for(const method of [0x14,0x20,0x34,0x38]) put(memory,VTABLE+method,METHOD+method);
  const source = Buffer.from(memory), sourceLog = [], nativeLog = [];
  const service = (memory,log,id,ecx,edx,args) => {
    const meaningful = id==='484cb0'?[ecx&255,edx&255]:id==='4074e0'||id==='484d10'?[ecx,null]:[ecx,edx];
    const normalized=args.slice(); if(id==='484bb0')normalized[4]=null;
    log.push([id,...meaningful,normalized]); if(log===nativeLog)boundaryCalls++;
    if(fixture%13===0&&id==='484cb0')memory[BODY+0x6b4]^=1;
    if(fixture%17===0&&id==='484bb0'&&ecx===0)word(memory,audio+26,memory.readUInt16LE(audio+26)+31);
    if(fixture%19===0&&id==='40e5e0')put(memory,audio+12,CHANNELS+((fixture+log.length)%8)*16);
    if(fixture%23===0&&id==='407670'){put(memory,record,OTHER);word(memory,record+0x25c,5);}
    if(fixture%29===0&&id==='407380')memory[BODY+0x6b4]=2;
    if(id==='484bb0'||id==='484cb0') return CHANNELS+((ecx&255)%8)*16;
    return 0;
  };
  const sourceService=(memory,log,object,method,args)=>{log.push(['virtual',object,method,args]);if(log===nativeLog)virtualCalls++;if(fixture%31===0&&method===0x14)memory[BODY+0x66f]=0xe0;return method===0x38?fixture%2:0;};
  const handlers=Object.fromEntries(contracts.map(({id})=>[`call${id}`,request=>service(source,sourceLog,id,request.ecx,request.edx,request.args)]));
  handlers.sourceCall=(object,method,args)=>sourceService(source,sourceLog,object,method,args);
  for(const {id,args:count}of contracts) machine.externalCalls.set(Number(`0x${id}`),m=>{const args=Array.from({length:count},(_,i)=>m.bytes.readInt32LE(m.r.ESP+i*4));m.r.EAX=service(memory,nativeLog,id,m.r.ECX,m.r.EDX,args);});
  for(const method of [0x14,0x20,0x34,0x38])machine.externalCalls.set(METHOD+method,m=>{const args=method===0x34?[]:[method===0x14?m.bytes.readFloatLE(m.r.ESP):m.bytes.readInt32LE(m.r.ESP)];m.r.EAX=sourceService(memory,nativeLog,m.r.ECX,method,args);m.r.ESP+=args.length*4;});
  updateVehicleAudio(BODY,index,{memory:source,scratchBase:STACK,handlers});
  machine.entry=0x485300;machine.r.ECX=BODY;machine.r.EDX=index;machine.r.ESP=STACK;memory.writeUInt32LE(0xffffffff,STACK);instructionSteps+=machine.run();
  try {
    assert.deepEqual(nativeLog,sourceLog,'calls');
    for(const[address,length]of [[BODY,0x4000],[OTHER,0x4000],[SESSION,0x800],[0x713190,0x150],[0x909300,0x1248],[0x5eced0,8],[CHANNELS,128],[SOURCES,128]]) {
      const actual=memory.subarray(address,address+length),expected=source.subarray(address,address+length);
      if(!actual.equals(expected)){const offset=actual.findIndex((value,i)=>value!==expected[i]);assert.fail(`firstdiff0x${(address+offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
    }
  } catch(error) {console.error({fixture,index,body:BODY,audio:audio.toString(16),native:nativeLog,source:sourceLog});throw error;}
}
const report={method:'Complete485300 vehicle sound/feedback parent. Ten game-owned audio/haptics calls are explicit contract fixtures; direct libaudio virtual calls execute explicit service contracts. These contracts preserve parent arithmetic, control flow, guard/capture/reload/argument/side-effect order; they do not substitute for the separately recovered game callees or complete audio runtime. Original tables/constants and horn sequences mapped from retained bytes. Synthetic raw body/session/record/sector/channel state; no original executable or device execution.',evidence:[...own.evidence,...tables].map(item=>item.evidence_id),instructions:own.instructions.length,fixtures,boundaryCalls,virtualCalls,branchVisits:Object.fromEntries([...branchVisits].map(([address,count])=>[`0x${address.toString(16)}`,count])),instructionSteps,matched:true};
await writeFile('analysis/vehicle-audio-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
