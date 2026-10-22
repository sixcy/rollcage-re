import test from 'node:test';
import assert from 'node:assert/strict';
import {getAudioDebuggerCategory} from '../src/xaudio-manager-construction.mjs';
import {getApplicationDebugger,appendApplicationDebuggerRecord} from '../src/application-bootstrap.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),ptr=(m,p)=>m.readUInt32LE(p);
test('cold native category registers a real record through actual vector growth',()=>{
 const memory=Buffer.alloc(0x800000),object=0x100000,S=0x9000,trace=[];put(memory,0x714afc,object);put(memory,0x715b08,1);memory[object+0x24]=1;put(memory,object+0x106c,7);let heap=0x200000;
 const runtime={memory,scratchBase:S,sehWord:0x12345678,nativeCategoryFrame:true,entryRegisters:{ECX:0x11223344,EBP:0x778899},services:{platformCall(name,args){trace.push([name,...args]);return name==='GetCurrentThreadId'?99:0;},libraryCall(name,args){trace.push([name,...args]);if(name==='operatorNew'){const p=heap;heap+=args[0]+16;return p;}if(name==='operatorDelete')return 0;throw Error(name);}}};
 assert.equal(getAudioDebuggerCategory(runtime),7);const vector=object+0x1048,record=ptr(memory,vector);assert.equal(ptr(memory,vector+4),record+16);assert.deepEqual(Array.from({length:4},(_,i)=>ptr(memory,record+i*4)),[7,0x5d3b98,0,0]);assert.equal(ptr(memory,object+0x106c),8);assert.equal(ptr(memory,object+28),0);assert.equal(ptr(memory,object+32),0);assert(trace.some(([n])=>n==='operatorNew'));assert.equal(ptr(memory,S-12),0x12345678);
});
test('raw debugger wrapper preserves its aligned return and incoming ECX producer',()=>{
 const memory=Buffer.alloc(0x800000),S=0x9004;put(memory,0x715b08,1);put(memory,0x714afc,0x100000);assert.equal(getApplicationDebugger({memory,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{ECX:0x46464941,EBP:123}}),0x100000);assert.equal(ptr(memory,S-4),123);assert.equal(ptr(memory,0x8ffc),0x4a0e8b);assert.equal(ptr(memory,0x8ff8),0x46464941);assert.throws(()=>getApplicationDebugger({memory,scratchBase:S,nativeDebuggerFrame:'wrapper',entryRegisters:{EBP:123}}),/entry ESP and ECX/);
});
test('native append rebases an aliased record after growth and aligns its captured offset',()=>{
 const memory=Buffer.alloc(0x800000),vector=0x100000,input=0x110000,output=0x120000;put(memory,vector,input);put(memory,vector+4,input+16);put(memory,vector+8,input+16);[11,22,33,44].forEach((v,i)=>put(memory,input+i*4,v));const released=[];
 appendApplicationDebuggerRecord(vector,input+3,{memory,scratchBase:0x9000,nativeDebuggerRecords:true,entryRegisters:{EBP:17,EBX:19,ESI:23,EDI:29},sehWord:31,handlers:{allocate(n){assert.equal(n,32);return output;},free(p){released.push(p);}}});assert.deepEqual(released,[input]);assert.equal(ptr(memory,vector),output);assert.equal(ptr(memory,vector+4),output+32);assert.deepEqual(Array.from({length:4},(_,i)=>ptr(memory,output+16+i*4)),[11,22,33,44]);
});
