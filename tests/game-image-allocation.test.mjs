import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {allocateGameImagePalette} from '../src/game-image-allocation.mjs';

test('palette malloc wrapper matches native success and declared failure-report ABI', async () => {
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions.filter(i=>i.address!==0x4a1fe0)),put=(m,p,v)=>m.writeInt32LE(v|0,p);
  for(const S of [0x9000,0x9200,0x9400])for(const bytes of [0,1,1024,65535])for(const failed of [false,true]){
    const memory=program.initializeMemory(Buffer.alloc(0xa00000)),sourceCalls=[],nativeCalls=[],entryRegisters={ESI:0x12345678,EDI:0x87654321|0};memory.fill(0x36,S-128,S+32);put(memory,0x56e258,0x591000);memory.copy(machine.bytes);machine.reset();memory.copy(machine.bytes);
    const invoke=(m,log,name,args)=>{log.push([name,...args]);if(name==='allocate'){if(failed)return 0;m.fill(0xcd,0x200000,0x200000+bytes);return 0x200000;}return 0;};
    machine.externalCalls.set(0x591000,cpu=>{cpu.r.EAX=invoke(cpu.bytes,nativeCalls,'allocate',[cpu.bytes.readUInt32LE(cpu.r.ESP)]);});machine.externalCalls.set(0x4a1fe0,cpu=>{cpu.r.EAX=invoke(cpu.bytes,nativeCalls,'allocationFailure4a1fe0',Array.from({length:4},(_,i)=>cpu.bytes.readUInt32LE(cpu.r.ESP+i*4)));});
    machine.onInstruction=p=>{if(p===0x4a3295)put(machine.bytes,machine.r.ESP-4,0x4a329b);if(p===0x4a32b4)put(machine.bytes,machine.r.ESP-4,0x4a32b9);};
    const actual=allocateGameImagePalette(bytes,{memory,scratchBase:S,entryRegisters,services:{libraryCall:(name,args)=>invoke(memory,sourceCalls,name,args)},handlers:{allocationFailure4a1fe0:(...args)=>invoke(memory,sourceCalls,'allocationFailure4a1fe0',args.slice(0,4))}});
    machine.entry=0x4a3290;machine.r.ECX=bytes;machine.r.ESP=S;Object.assign(machine.r,entryRegisters);put(machine.bytes,S,-1);machine.run();assert.equal(machine.r.EAX>>>0,actual);assert.deepEqual(sourceCalls,nativeCalls);assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000));assert.deepEqual(memory.subarray(S-28,S),machine.bytes.subarray(S-28,S));
  }
});
