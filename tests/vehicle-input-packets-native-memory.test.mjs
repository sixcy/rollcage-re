import test from 'node:test';
import assert from 'node:assert/strict';
import {pollInputPacket,convertInputPacket} from '../src/vehicle-input-packets.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const imageLiterals=new Set([0x6eafe0,0x5ecefc,0x6e675c,0x5eb518,0x6e7880,0x6ea69c,0x6e7bd8,0x6e7bdc,0x6e7be0,0x6e78b0,0x6e78b4,0x6e7ac4,0x6e7ac8,0x6e7edc,0x6e9f70,0x6e7edf,0x90955e]);
function relocated(instructions,delta){
  const labels=new Set(instructions.map(row=>row.address));
  return instructions.map(row=>({...row,address:row.address+delta,args:row.args.map(argument=>argument.replace(/0x[0-9a-f]+/g,token=>{
    const value=Number(token);if(labels.has(value)||imageLiterals.has(value))return `0x${(value+delta).toString(16)}`;
    assert.ok(value<0x400000||value>=0xa00000,`Unclassified retained image literal ${token}`);return token;
  }))}));
}
function fixture(moduleBaseAddress,scenario){
  const delta=moduleBaseAddress-0x400000,actual=p=>p+delta,index=scenario.index,offset=index*0x67c,config=0x1000000,pointer=0x1100000,status=0x1100010,stack=0x1200000;
  const known=[[0x6eafe0,4],[0x5ecefc,4],[0x6e675c,4],[0x5eb518,4],[0x6ea69c,4],[0x6e9f70,4],[0x90955e+index*0x30c,2],
    [0x6e7880+offset,4],[0x6e78b0+offset,8],[0x6e7ac4+offset,8],[0x6e7bd8+offset,64*12],[0x6e7edc+offset,12]];
  const captured=createCapturedMemory([...known.map(([address,length])=>({address:actual(address),bytes:Buffer.alloc(length,0xa5)})),{address:config,bytes:Buffer.alloc(0x40)},{address:pointer,bytes:Buffer.alloc(4,0xa5)},{address:status,bytes:Buffer.alloc(8,0xa5)}],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))});
  const m=captured.memory;m.writeUInt32LE(scenario.flags,0x6eafe0);m.writeUInt32LE(config,0x5ecefc);m.writeUInt32LE(scenario.clock,0x6e675c);m.writeUInt32LE(scenario.fallback??0,0x5eb518);m.writeUInt32LE(100,0x6ea69c);m.writeInt32LE(scenario.selected??-1,0x6e9f70);m.writeUInt16LE(0x87,0x90955e+index*0x30c);m.writeUInt32LE(1,0x6e7880+offset);
  Buffer.from('ff4700ab00817f55','hex').copy(captured.span(actual(0x6e7ac4+offset),8));Buffer.from('807400cd00ff8155','hex').copy(captured.span(actual(0x6e78b0+offset),8));
  for(let row=0;row<64;row++){const target=actual(0x6e7bd8+offset+row*12);m.writeUInt32LE(row===3?99:row===9?98:101,target);m.writeUInt32LE(0x00100040+row,target+4);m.writeUInt32LE(0x007fff00,target+8);}
  const spans=[...known.map(([address,length])=>({address:actual(address),length})),{address:config,length:0x40},{address:pointer,length:4},{address:status,length:8}];
  return {...captured,actual,index,config,pointer,status,stack,spans};
}

test('471250/433200 execute genuine preferred andASLR sampled-input paths on sparse native memory',async()=>{
  const {instructions,evidence}=await readInstructionEvidence(['461-physical-input-packet-assembly.json','465-input-packet-transform-assembly.json'],{directory:'analysis/native-simulation/results'});assert.ok(evidence.every(row=>row.subject?.digest?.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const scenarios=[{index:0,flags:0,clock:0},{index:3,flags:0,clock:10},{index:5,flags:0,clock:10},{index:1,flags:3,clock:10},{index:2,flags:0x83,clock:10},{index:1,flags:0x83,clock:10,selected:1},{index:0,flags:3,clock:10,fallback:1}];
  for(const moduleBaseAddress of [0x400000,0x6e0000]){
    const delta=moduleBaseAddress-0x400000,machine=new BoundedX86(relocated(instructions,delta));machine.bytes=Buffer.alloc(0x1400000);
    for(const scenario of scenarios){const f=fixture(moduleBaseAddress,scenario);machine.reset();for(const row of f.spans)f.span(row.address,row.length).copy(machine.bytes,row.address);machine.entry=0x471250+delta;Object.assign(machine.r,{ECX:scenario.index,EDX:f.status,ESP:f.stack});machine.bytes.writeUInt32LE(0xffffffff,f.stack);machine.bytes.writeUInt32LE(f.pointer,f.stack+4);machine.run();
      pollInputPacket(scenario.index,f.pointer,f.status,{memory:f.memory});for(const row of f.spans)assert.deepEqual(f.span(row.address,row.length),machine.bytes.subarray(row.address,row.address+row.length),`${moduleBaseAddress.toString(16)} index${scenario.index}/0x${row.address.toString(16)}`);
      assert.equal(f.memory.readUInt32LE(f.pointer),f.actual(0x6e7edc+scenario.index*0x67c));assert.equal(f.memory.readUInt32LE(0x5ecefc),f.config,'Opaque configuration heap identity is preserved.');
    }
  }
});
test('433200 sparse initialization preserves repeated low/high DWORD pairs before finalpacket header',()=>{
  const packet=0x10000,status=0x20000,known=[[0x90955e+4*0x30c,2],[0x6eafe0,4]],captured=createCapturedMemory([...known.map(([address,length])=>({address,bytes:Buffer.alloc(length)})),{address:packet,bytes:Buffer.alloc(16,0xa5)},{address:status,bytes:Buffer.alloc(8)}]),writes=[];
  const m=new Proxy(captured.memory,{get(target,key){if(key==='writeInt32LE')return (value,address)=>{if(address>=packet&&address<packet+12)writes.push([address-packet,value|0]);return target.writeInt32LE(value,address);};return Reflect.get(target,key);}});
  convertInputPacket(4,packet,status,{memory:m});assert.deepEqual(writes,[[0,0],[4,0],[0,0],[4,0],[8,0],[0,0xffff4100|0]]);assert.deepEqual([...captured.span(packet+12,4)],[0xa5,0xa5,0xa5,0xa5]);
});
