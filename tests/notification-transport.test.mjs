import test from 'node:test';
import assert from 'node:assert/strict';
import {sendNotificationPacket} from '../src/notification-transport.mjs';
const packet=0x20000,scratch=0x50000;
function fixture(){const memory=Buffer.alloc(0xa00000);memory.writeInt32LE(0,0x6e9f70);memory.writeInt32LE(1,0x6e7880);return memory;}
test('invalid local participant and short type2 messages take their distinct status paths',()=>{const memory=fixture();memory.writeInt32LE(6,0x6e9f70);assert.equal(sendNotificationPacket(2,packet,20,0,{memory,scratchBase:scratch}),1);memory.writeInt32LE(0,0x6e9f70);assert.equal(sendNotificationPacket(2,packet,7,0,{memory,scratchBase:scratch}),0);});
test('recipient routing stops on the first successful lower send',()=>{
 const memory=fixture();memory.writeInt32LE(1,0x6e7880+0x67c);let calls=0;
 const result=sendNotificationPacket(2,packet,73,1,{memory,scratchBase:scratch,handlers:{call4a0210:request=>{assert.equal(request.ecx,packet);assert.equal(request.edx,73);calls++;return 0;}}});assert.equal(result,0);assert.equal(calls,1);
});
test('direct interface uses probe CL for routing and increments byte sequence with wrap',()=>{
 const memory=fixture(),iface=0x30000,vtable=0x31000;memory.writeUInt32LE(iface,0x6e6d10);memory.writeUInt32LE(vtable,iface);memory.writeUInt32LE(0x12345678,vtable+0x50);memory[0x6e65db]=255;let sent=0;
 const result=sendNotificationPacket(2,packet,20,0,{memory,scratchBase:scratch,handlers:{call471820:()=>({eax:1,ecx:8,edx:99}),call4a0180:request=>{assert.equal(request.edx,99);return 17;},constructAddress49ea00:()=>{},sendInterface:request=>{assert.equal(request.functionAddress,0x12345678);assert.deepEqual(request.args,[packet,20,1,0,0]);sent++;return 0;}}});assert.equal(result,0);assert.equal(memory[packet+1],255);assert.equal(memory[0x6e65db],0);assert.equal(memory.readUInt16LE(packet+2),65535);assert.equal(memory.readUInt32LE(packet+4),17);assert.equal(sent,1);
});
