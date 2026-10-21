import test from 'node:test';
import assert from 'node:assert/strict';
import {runRaceProgressPass} from '../src/race-progress-pass.mjs';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
const RECORD=0x909300,SESSION=0x50000,SECOND=0x52000,PACK=0x60000,SCRATCH=0x70000;
function fixture(scores,ranks=scores.map((_,index)=>index+1)){
 const memory=Buffer.alloc(0xa00000);memory.writeUInt32LE(SESSION,0x5ecb1c);memory.writeUInt32LE(PACK,0x90b98c);memory[SESSION+0x54d]=scores.length;memory[PACK+0x44]=1;
 for(let index=0;index<scores.length;index++){const record=RECORD+index*0x30c;memory[record+0x1d]=ranks[index];memory.writeInt32LE(scores[index],record+0x24);}
 return {memory,scratchBase:SCRATCH,handlers:{call48da10:()=>{},call449d40:()=>{}}};
}
const ranks=memory=>Array.from({length:memory[SESSION+0x54d]},(_,index)=>memory[RECORD+index*0x30c+0x1d]);
test('zero checkpoints and modes3/8 gate the pass before any child call',()=>{
 for(const mode of [0,3,8]){const options=fixture([1,2]);options.memory[SESSION+0x551]=mode;if(mode===0)options.memory[PACK+0x44]=0;delete options.handlers;runRaceProgressPass(options);assert.deepEqual(ranks(options.memory),[1,2]);}
});
test('captured count completes all route selections before all transitions despite session replacement',()=>{
 const options=fixture([1,2,3]),calls=[];options.handlers.call48da10=request=>{calls.push(['select',request.ecx]);request.memory.writeUInt32LE(SECOND,0x5ecb1c);request.memory[SECOND+0x54d]=0;};options.handlers.call449d40=request=>{assert.equal(request.edx,0);calls.push(['transition',request.ecx]);};runRaceProgressPass(options);
 assert.deepEqual(calls,[...Array.from({length:3},(_,index)=>['select',RECORD+index*0x30c]),...Array.from({length:3},(_,index)=>['transition',RECORD+index*0x30c])]);
});
test('one reverse adjacent sweep moves the largest score forward and keeps the remaining partial order',()=>{const options=fixture([10,20,30,40]);runRaceProgressPass(options);assert.deepEqual(ranks(options.memory),[2,3,4,1]);});
test('equal scores preserve existing rank order independently of registry traversal',()=>{const options=fixture([100,100,100],[3,1,2]);runRaceProgressPass(options);assert.deepEqual(ranks(options.memory),[3,1,2]);});
test('a finished leading record blocks overtaking, while a finished trailing record can advance',()=>{
 const leading=fixture([10,20,30]);leading.memory[RECORD+0x249]=1;runRaceProgressPass(leading);assert.deepEqual(ranks(leading.memory),[1,3,2]);
 const trailing=fixture([10,20,30]);trailing.memory[RECORD+2*0x30c+0x249]=1;runRaceProgressPass(trailing);assert.deepEqual(ranks(trailing.memory),[2,3,1]);
});
test('lap/progress sums wrap signed32 before comparison',()=>{const options=fixture([0x7fffffff,0]);options.memory[RECORD+0x1c]=255;runRaceProgressPass(options);assert.deepEqual(ranks(options.memory),[2,1]);});
test('duplicate ranks retain readable stale scratch pointers and can update a record outside the captured registry',()=>{
 const options=fixture([10,20],[1,1]),third=RECORD+2*0x30c;options.memory.writeUInt32LE(third,SCRATCH+16);options.memory.writeInt32LE(0,third+0x24);runRaceProgressPass(options);
 assert.equal(options.memory[third+0x1d],2);assert.equal(options.memory[RECORD+0x30c+0x1d],1);assert.equal(options.memory[RECORD+0x1d],1);
});
test('default children use coherent record views and allow the native negative-terrain early return',()=>{
 const options=fixture([10]),body=0x10000;options.memory.writeUInt32LE(body,RECORD);options.memory.writeInt32LE(-1,body+0x11c);delete options.handlers;options.progression=createRespawnRuntime({memory:options.memory,recordCount:1,bodyStorage:[{address:body,length:0x4000}],scratchBase:0x80000});runRaceProgressPass(options);assert.equal(options.memory[RECORD+0x1d],1);
});
