import test from 'node:test';
import assert from 'node:assert/strict';
import {finishRaceProgress} from '../src/race-completion.mjs';
const RECORD=0x909300,BODY=0x10000,SESSION=0x20000,PACK=0x30000,SCRATCH=0x8000;
function fixture(){
 const memory=Buffer.alloc(0x920000);memory.writeUInt32LE(BODY,RECORD);memory.writeUInt32LE(SESSION,0x5ecb1c);memory.writeUInt32LE(PACK,0x90b98c);memory[RECORD+0x1c]=memory[RECORD+0x1e]=1;memory[SESSION+0x586]=3;memory[SESSION+0x54d]=1;memory.writeInt32LE(4,SESSION+0x57c);
 const calls=[],handlers=Object.fromEntries(['47b920','449be0','491be0','407710','471800','472560','42ab90','41a670','4579e0','472700','4a0620'].map(address=>[`call${address}`,options=>{calls.push([address,options]);if(address==='471800')return 0;}]));
 const run=()=>finishRaceProgress(RECORD,{memory,scratchBase:SCRATCH,handlers});return {memory,calls,handlers,run};
}
test('an earlier lap increments alone after clearing progress and requires no reached handlers',()=>{
 const {memory}=fixture();memory[RECORD+0x1c]=1;memory[RECORD+0x1e]=2;memory.writeInt32LE(12345,RECORD+0x24);
 finishRaceProgress(RECORD,{memory,scratchBase:SCRATCH});assert.equal(memory[RECORD+0x1c],2);assert.equal(memory[RECORD+0x1e],2);assert.equal(memory.readInt32LE(RECORD+0x24),0);assert.equal(memory[BODY+0x66d],0);
});
test('unlimited mode wraps both lap bytes before touching the body or invoking bookkeeping',()=>{
 const {memory,run,calls}=fixture();memory[RECORD+0x1c]=memory[RECORD+0x1e]=255;memory[SESSION+0x58c]=1;memory[BODY+0x671]=7;
 run();assert.equal(memory[RECORD+0x1c],0);assert.equal(memory[RECORD+0x1e],0);assert.equal(memory[BODY+0x671],7);assert.equal(calls.length,0);
});
test('mode4 clamps laps and decrements the reversed opponent record rather than the next vehicle',()=>{
 const {memory,run}=fixture();memory[SESSION+0x551]=4;memory[RECORD+0x1c]=memory[RECORD+0x1e]=5;memory.writeUInt16LE(0,BODY+0x65e);memory[0x90960c+0x1c]=3;memory[0x90960c+0x1e]=4;
 run();assert.equal(memory[RECORD+0x1c],5);assert.equal(memory[RECORD+0x1e],5);assert.equal(memory[0x90960c+0x1c],2);assert.equal(memory[0x90960c+0x1e],3);
});
test('last unfinished participant blocks session shutdown until its live finished bit changes',()=>{
 const {memory,run,calls}=fixture(),second=RECORD+0x30c,secondBody=BODY+0x1000;memory.writeUInt32LE(secondBody,second);memory[SESSION+0x54d]=2;memory[SESSION+0x586]=1;
 run();assert.equal(memory.readInt32LE(SESSION+0x57c),5);assert.equal(memory[RECORD+0x249]&1,1);assert.ok(!calls.some(([address])=>address==='41a670'));
 memory[second+0x249]=1;run();assert.equal(memory.readInt32LE(SESSION+0x57c),6);assert.ok(calls.some(([address])=>address==='41a670'));
});
test('cleanup reads the body pointer twice and stores the final callback-updated frame word',()=>{
 const {memory,handlers,run,calls}=fixture();memory[SESSION+0x586]=1;memory.writeInt32LE(65535,0x91ffb4);let count=0;
 handlers.call42ab90=({ecx})=>{calls.push(['42ab90',{ecx}]);if(count++===0)memory.writeUInt32LE(BODY+0x1000,RECORD);};
 handlers.call41a670=()=>memory.writeInt32LE(65536,0x91ffb4);
 run();assert.deepEqual(calls.filter(([address])=>address==='42ab90').map(([,args])=>args.ecx),[BODY,BODY+0x1000]);assert.equal(memory.readUInt16LE(0x91ffb2),1);
});
test('literal finish notifications retain the actual driver bytes and bypass localized phrase generation',()=>{
 const {memory,handlers,run}=fixture();memory[SESSION+0x586]=1;memory[SESSION+0x721]=0x80;memory[PACK+0x46]=2;memory.writeInt32LE(0x47,0x6eafe0);memory.write('Cyril\0',0x6e7894,'ascii');memory.write(' crosses the finish line\0',0x5d32c8,'ascii');let text;
 handlers.call4a0620=({ecx})=>{text=memory.subarray(ecx,memory.indexOf(0,ecx)).toString('ascii');};handlers.call472700=()=>assert.fail('literal branch must not format a translated phrase');
 run();assert.equal(text,'Cyril crosses the finish line');assert.equal(memory[RECORD+0x24a],1);assert.equal(memory[RECORD+0x249]&1,1);
});
test('bookkeeping replacement of the session pointer does not change the captured session until a native reload',()=>{
 const {memory,handlers,run}=fixture(),replacement=0x40000;memory[SESSION+0x551]=1;memory[replacement+0x551]=4;
 handlers.call449be0=()=>memory.writeUInt32LE(replacement,0x5ecb1c);
 run();assert.equal(memory[RECORD+0x1c],1);assert.equal(memory[RECORD+0x1e],1);assert.equal(memory.readUInt32LE(0x5ecb1c),replacement);
});

test('the default lap award calls execute two real RNG transitions and fill both pickup slots',()=>{
 const {memory,handlers,run}=fixture();delete handlers.call47b920;memory[SESSION+0x551]=1;memory[SESSION+0xa86]=1;memory[BODY+0x68c]=memory[BODY+0x68d]=255;memory[RECORD+0x1d]=1;memory.writeInt32LE(1,0x5ec954);
 run();assert.equal(memory[BODY+0x68d],4);assert.equal(memory[BODY+0x68c],4);assert.equal(memory.readInt32LE(0x5ec954),Math.imul(16807,16807)&0x7fffffff);
});
