import test from 'node:test';
import assert from 'node:assert/strict';
import {getGameAsyncFileManager,queueGameAsyncFilePath,trimGameAsyncFilePaths,flushGameAsyncFilePaths,destroyGameAsyncFileManager,destroyGameAsyncFileGuard} from '../src/game-async-file-manager.mjs';
import {verifyGameAsyncFileManager} from '../tools/verify-game-async-file-manager-instructions.mjs';
const fixture=()=>{const memory=Buffer.alloc(0xa00000),exits=[],freed=[],platform=[];let next=0x300000;return{memory,scratchBase:0x9000,sehWord:0,exits,freed,platform,services:{libraryCall(name,args){if(name==='operatorNew'){const p=next;next=next+args[0]+31&~15;memory.fill(0xcd,p,next);return p;}if(name==='registerExit')exits.push(args[0]);else if(name==='operatorDeleteArray')freed.push(args[0]);else assert.equal(name,'operatorDelete');return 0;},platformCall(name,args){platform.push([name,...args]);return name==='GetCurrentThreadId'?77:0;}}};};

test('wide-path retention owns at most251 entries and frees in original FIFO order',()=>{
  const r=fixture(),manager=getGameAsyncFileManager(r),paths=Array.from({length:252},(_,i)=>0x180000+i*32);
  for(const path of paths)queueGameAsyncFilePath(manager,path,r);
  assert.equal(r.memory.readUInt32LE(manager+52),251);assert.deepEqual(r.freed,[paths[0]]);assert.equal(r.memory.readInt32LE(manager+24),0);assert.equal(r.memory.readInt32LE(manager+28),0);
  assert.deepEqual(r.exits,[0x56d970,0x56d910,0x4a0db0]);trimGameAsyncFilePaths(manager,-1,r);assert.equal(r.freed.length,1);flushGameAsyncFilePaths(r);assert.deepEqual(r.freed,paths);assert.equal(r.memory.readUInt32LE(manager+48),0);
});
test('constructor and destructor preserve the upper half of the flag DWORD',()=>{
  const r=fixture();r.memory.writeUInt32LE(0xa7a7a7a7,0x715a70);getGameAsyncFileManager(r);assert.equal(r.memory.readUInt32LE(0x715a70),0xa7a70001);destroyGameAsyncFileManager(r);assert.equal(r.memory.readUInt32LE(0x715a70),0xa7a70100);assert.equal(r.memory.readUInt32LE(0x715a74),0);destroyGameAsyncFileGuard(r);assert.deepEqual(r.platform.at(-1),['DeleteCriticalSection',0x715a24]);
});
test('singleton rechecks publication after entering its critical section',()=>{
  const r=fixture(),base=r.services.platformCall;r.services.platformCall=(name,args)=>{if(name==='EnterCriticalSection'&&args[0]===0x715a24)r.memory.writeUInt32LE(0x100000,0x714af4);return base(name,args);};assert.equal(getGameAsyncFileManager(r),0x100000);assert.deepEqual(r.exits,[0x56d970]);assert.equal(r.memory.readUInt32LE(0x715a20),1);assert.equal(r.memory.readUInt32LE(0x715a3c),0);
});
test('actual native manager lifecycle includes queue growth, trim and allocator-mutated live input',async()=>{
  const report=await verifyGameAsyncFileManager({scenarios:3,queues:270,output:null});assert.equal(report.matched,true);assert.equal(report.retiredPaths,810);assert(report.mutatedInputs>0);assert(report.actualGameCalls['40eee0']>0);assert.equal(report.actualGameCalls['56d910'],3);
});
