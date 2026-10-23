import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {selectModelDestructionObserver} from '../src/placed-object-damage.mjs';
import {selectCameraTrigger} from '../src/camera-route-triggers.mjs';
import {updateCamera} from '../src/camera-update.mjs';

test('417720 fallback publishes the actual module pointer, matching SHA-verified PE relocation and retained instructions',async()=>{
  for(const moduleBaseAddress of[0x400000,0x6e0000]){
    const fixture=await loadRelocatedAudioFixture(moduleBaseAddress),actual=p=>moduleBaseAddress+p-0x400000;
    const known=[[0x6e6550,4],[0x9205a0,16]],position=0x1100000,output=0x1100100,stack=0x1101000;
    const captured=createCapturedMemory([...known.map(([p,length])=>({address:actual(p),bytes:Buffer.alloc(length,0x69)})),{address:position,bytes:Buffer.alloc(12)},{address:output,bytes:Buffer.alloc(8,0xa5)},{address:stack-64,bytes:Buffer.alloc(128,0x35)}],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))});
    captured.memory.writeInt32LE(0,0x6e6550);[-5,7,11].forEach((value,i)=>captured.memory.writeInt32LE(value<<16,position+i*4));
    const machine=new BoundedX86(fixture.instructions);machine.bytes=Buffer.from(fixture.memory);
    for(const[p,length]of[...known.map(([p,length])=>[actual(p),length]),[position,12],[output,8],[stack-64,128]])captured.span(p,length).copy(machine.bytes,p);
    machine.entry=actual(0x417720);Object.assign(machine.r,{ECX:position,ESP:stack});machine.bytes.writeUInt32LE(0xffffffff,stack);machine.bytes.writeUInt32LE(output,stack+4);machine.bytes.writeInt32LE(0,stack+8);machine.run();
    selectModelDestructionObserver(position,output,0,{memory:captured.memory,scratchBase:stack});
    assert.deepEqual(captured.span(actual(0x9205a0),16),machine.bytes.subarray(actual(0x9205a0),actual(0x9205a0)+16));
    assert.equal(captured.memory.readUInt32LE(output),machine.bytes.readUInt32LE(output));
    assert.equal(captured.memory.readUInt32LE(output),actual(0x9205a0));
    assert.deepEqual([...captured.span(output+4,4)],[0xa5,0xa5,0xa5,0xa5]);
  }
});

test('417720 selected authored observer retains real spatial lookup and sector child while publishing the actual module row',async()=>{
  for(const moduleBaseAddress of[0x400000,0x6e0000]){
    const fixture=await loadRelocatedAudioFixture(moduleBaseAddress),actual=p=>moduleBaseAddress+p-0x400000;
    const known=[[0x6e6550,4],[0x91f6c0,112],[0x9205a0,16],[0x909254,4],[0x909278,4],[0x9092c0,4],[0x90924c,4]];
    const position=0x1100000,output=0x1100100,stack=0x1101000,rows=0x1120000,indices=0x1121000,bucket=0x1122000,regions=0x1123000,ranges=0x1124000;
    const heap=[[position,12],[output,8],[stack-256,512],[rows,4096],[indices,512],[bucket,16],[regions,6],[ranges,4]];
    const captured=createCapturedMemory([...known.map(([p,length])=>({address:actual(p),bytes:Buffer.alloc(length)})),...heap.map(([address,length])=>({address,bytes:Buffer.alloc(length)}))],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory;
    for(const[p,value]of[[0x6e6550,2],[0x909254,rows],[0x909278,bucket],[0x9092c0,regions],[0x90924c,ranges]])m.writeUInt32LE(value,p);
    for(let i=0;i<256;i++){m.writeUInt16LE(0xff00,rows+i*16);m.writeUInt32LE(indices,rows+i*16+12);}
    m.writeUInt16LE(3,regions+2);m.writeUInt16LE(7,ranges+2);
    [0,4,8].forEach((offset,i)=>{m.writeInt32LE([5,7,11][i]<<16,position+offset);m.writeInt32LE([6,8,12][i]<<16,0x91f6c4+offset);m.writeInt32LE([500,500,500][i]<<16,0x91f6c4+56+offset);});
    const machine=new BoundedX86(fixture.instructions);machine.bytes=Buffer.from(fixture.memory);
    for(const[p,length]of[...known.map(([p,length])=>[actual(p),length]),...heap])captured.span(p,length).copy(machine.bytes,p);
    machine.entry=actual(0x417720);Object.assign(machine.r,{ECX:position,ESP:stack});machine.bytes.writeUInt32LE(0xffffffff,stack);machine.bytes.writeUInt32LE(output,stack+4);machine.bytes.writeInt32LE(0,stack+8);machine.run();
    selectModelDestructionObserver(position,output,0,{memory:m,scratchBase:stack});
    assert.equal(m.readUInt32LE(output),machine.bytes.readUInt32LE(output));assert.equal(m.readUInt32LE(output),actual(0x91f6c0));
    for(const[p,length]of known)assert.deepEqual(captured.span(actual(p),length),machine.bytes.subarray(actual(p),actual(p)+length));
    assert.equal(m.readUInt32LE(0x909254),rows,'Opaque spatial heap identity remains unchanged.');
  }
});

test('417ee0 actual nearest/line/root descendants publish a relocated trigger pointer into persistent camera fields',async()=>{
  for(const moduleBaseAddress of[0x400000,0x6e0000]){
    const fixture=await loadRelocatedAudioFixture(moduleBaseAddress),actual=fixture.actual,session=0x1100000,body=0x1101000,output=0x1102000,stack=0x1104000;
    const known=[[0x5ecb1c,4],[0x91ff80,0x184],[0x90a548,4],[0x909300,0x30c],[0x6e6550,4],[0x91f6c0,56],[0x91d45c,8]];
    const captured=createCapturedMemory([...known.map(([p,n])=>({address:actual(p),bytes:Buffer.from(fixture.memory.subarray(actual(p),actual(p)+n))})),{address:session,bytes:Buffer.alloc(0xb00)},{address:body,bytes:Buffer.alloc(0x800)},{address:output,bytes:Buffer.alloc(8,0xa5)},{address:stack-4096,bytes:Buffer.alloc(8192,0x35)}],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory;
    m.subarray(0x91ff80,0x91ff80+0x184).fill(0);m.subarray(0x91f6c0,0x91f6c0+56).fill(0);
    m.writeUInt32LE(session,0x5ecb1c);m[session+0x54d]=1;m.writeInt16LE(60,0x91ffb2);m.writeUInt32LE(540,0x90a548);m.writeInt32LE(-1,0x91ff80+0x178);
    m.writeUInt32LE(body,0x909300);m.writeInt32LE(100<<16,body+0x34);m.writeInt32LE(8<<16,body+0x68);m[body+0x718]=10;m.writeInt32LE(1,0x6e6550);m.writeInt32LE(1,0x91f6c0);m.writeInt32LE(1024<<16,0x91f6d0);
    const machine=new BoundedX86(fixture.instructions);machine.bytes=Buffer.from(fixture.memory);
    for(const[p,n]of[...known.map(([p,n])=>[actual(p),n]),[session,0xb00],[body,0x800],[output,8],[stack-4096,8192]])captured.span(p,n).copy(machine.bytes,p);
    machine.entry=actual(0x417ee0);Object.assign(machine.r,{ECX:output,EDX:output+4,ESP:stack});machine.bytes.writeUInt32LE(0xffffffff,stack);machine.bytes.writeUInt32LE(0,stack+4);machine.run();
    const result=selectCameraTrigger(0,output,output+4,{memory:m,scratchBase:stack});assert.equal(result,machine.r.EAX|0);assert.equal(result,1);
    assert.deepEqual(captured.span(output,8),machine.bytes.subarray(output,output+8));assert.equal(m.readUInt32LE(output+4),actual(0x91f6c0));
    assert.equal(m.readUInt32LE(0x909300),body,'The actual vehicle heap identity is never module-rebased.');
  }
});

test('4180a0 entry stages the actual participant record before its genuine formatter boundary',async()=>{
  for(const moduleBaseAddress of[0x400000,0x6e0000]){
    const fixture=await loadRelocatedAudioFixture(moduleBaseAddress),actual=fixture.actual,stack=0x1104000,boundary=0x1106000;
    const known=[[0x5e8890,4],[0x5ec120,16],[0x91ff80,0x184],[0x91ceb0,4],[0x909300,0x30c],[0x56e224,4]];
    const captured=createCapturedMemory([...known.map(([p,n])=>({address:actual(p),bytes:Buffer.from(fixture.memory.subarray(actual(p),actual(p)+n))})),{address:stack-4096,bytes:Buffer.alloc(8192,0x35)}],{aliases:known.map(([address,length])=>({address,targetAddress:actual(address),length}))}),m=captured.memory;
    m.writeInt32LE(0,0x5ec120);m.writeFloatLE(200,0x91ceb0);m.writeUInt32LE(boundary,0x56e224);
    const machine=new BoundedX86(fixture.instructions);machine.bytes=Buffer.from(fixture.memory);
    for(const[p,n]of[...known.map(([p,n])=>[actual(p),n]),[stack-4096,8192]])captured.span(p,n).copy(machine.bytes,p);
    const stop=Error('Observed actual CRT formatter entry');machine.externalCalls.set(boundary,()=>{throw stop;});machine.entry=actual(0x4180a0);Object.assign(machine.r,{ECX:0,ESP:stack});machine.bytes.writeUInt32LE(0xffffffff,stack);
    assert.throws(()=>machine.run(),error=>error.message.endsWith(stop.message));
    assert.throws(()=>updateCamera(0,{memory:m,scratchBase:stack,handlers:{formatCameraName(){throw stop;}}}),error=>error===stop);
    assert.equal(m.readUInt32LE(stack-204+0x1c),machine.bytes.readUInt32LE(stack-204+0x1c));
    assert.equal(m.readUInt32LE(stack-204+0x1c),actual(0x909300));
  }
});
