import test from 'node:test';
import assert from 'node:assert/strict';
import table from '../src/finish-skill-tables.json' with {type:'json'};
import {finishVehicleBookkeeping,selectFinishRoute} from '../src/finish-bookkeeping.mjs';
const record=0x10000,body=0x20000,otherBody=0x28000,pack=0x40000,bucket=0x50000,groups=0x60000,points=0x61000,map=0x62000;
function fixture(){const memory=Buffer.alloc(0xa00000);Buffer.from(table.hex,'hex').copy(memory,0x570680);memory.writeUInt32LE(body,record);memory.writeUInt32LE(groups,record+0x54);memory[groups+5]=7;memory.writeInt32LE(0x12345678,record+0x58);return memory;}
test('finish thresholds use the actual byte tables and include the final entry',()=>{
 for(const [value,expected]of [[0,[0,0,0]],[255,[32,31,15]]]){const memory=fixture();[0x708,0x709,0x70a].forEach(offset=>memory[body+offset]=value);finishVehicleBookkeeping(record,{memory,handlers:{finish48da10:()=>{}}});assert.deepEqual([0x720,0x721,0x722].map(offset=>memory[body+offset]),expected);assert.equal(memory[body+0x718],8);}
});
test('finish clears only global low words and keeps original-body resets separate from re-linked checkpoints',()=>{
 const memory=fixture();memory.fill(0xff,body+0x6c4,body+0x6da);memory.writeUInt32LE(0xaabbccdd,0x6e6570);memory.writeUInt32LE(0x11223344,0x6e658c);memory.writeUInt16LE(8,otherBody+0x65e);
 const quotient=finishVehicleBookkeeping(record,{memory,handlers:{finish48da10:()=>{memory.writeUInt32LE(otherBody,record);memory.writeUInt32LE(0xffffffff,0x90a548);}}});
 assert.equal(memory.readUInt32LE(0x6e6570),0xaabb0000);assert.equal(memory.readUInt32LE(0x6e658c),0x11220000);assert.equal(memory.readUInt16LE(otherBody+0x6c0),7);assert.equal(memory.readUInt16LE(otherBody+0x6c2),0x5678);assert.ok(memory.subarray(body+0x6c4,body+0x6d9).every(value=>value===0));assert.equal(memory[body+0x6d9],2);assert.equal(quotient,1);
});
function routes(memory){memory.writeUInt32LE(pack,0x90b98c);memory.writeUInt32LE(groups,pack+0x60);memory.writeUInt32LE(map,pack+0x7c);memory.writeUInt32LE(bucket|1,body+0xc);for(let index=0;index<3;index++){memory.writeUInt16LE(1,groups+index*12);memory.writeUInt32LE(points+index*0x100,groups+index*12+8);}memory.writeUInt32LE(groups,record+0x54);memory.writeInt32LE(0,record+0x58);memory.writeUInt32LE(1<<16,map);}
test('spatial fallback wins an exact squared-distance tie',()=>{const memory=fixture();routes(memory);selectFinishRoute(record,{memory});assert.equal(memory.readUInt32LE(record+0x54),groups+12);assert.equal(memory.readUInt32LE(record+0x58),0);});
test('noncyclic link candidates are bounded by the original route count',()=>{
 const memory=fixture();routes(memory);memory.writeUInt16LE(3,groups);for(let index=0;index<3;index++){const p=points+index*16;memory.writeInt16LE(100,p);memory.writeUInt32LE(2|(2<<5),p+12);}memory.writeInt16LE(200,points+0x100);selectFinishRoute(record,{memory});assert.equal(memory.readUInt32LE(record+0x54),groups+24);assert.equal(memory.readUInt32LE(record+0x58),2);
});
test('null original route leaves all record bytes unchanged',()=>{const memory=fixture();memory.writeUInt32LE(0,record+0x54);const expected=Buffer.from(memory.subarray(record,record+780));selectFinishRoute(record,{memory});assert.deepEqual(memory.subarray(record,record+780),expected);});
