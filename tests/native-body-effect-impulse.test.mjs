import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {applyNativeBodyEffectImpulse} from '../src/native-body-effect-impulse.mjs';
import {applyBodyEffectImpulse} from '../src/body-effect-impulse.mjs';
import {emitNativeEffectOnStack} from '../src/native-effect-emitter.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawTerrainGrid,queryRawTerrain} from '../src/raw-terrain-query.mjs';
import {verifyNativeBodyEffectStack} from '../tools/verify-native-body-effect-stack.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
const program=await loadRetainedNativeProgram();
const incoming={ebx:0x11223344,ebp:0x55667788,esi:6,edi:0x20000},B=0x9000,body=0x20000,state=0x30000;
function fixture({type=3,active=true,timer=1,strength=32,position=[4*65536,-12*65536,8*65536],cooldown=0}={}){
 const m=program.initializeMemory(Buffer.alloc(0xa00000));m.fill(0xa5,B-400,B+40);const d=(p,v)=>m.writeInt32LE(v|0,p);
 d(B,0x47a913);d(body,type);position.forEach((v,i)=>d(body+0x34+i*4,v));d(body+0x110,-1);d(body+0x6bc,active?state:-1);m[state]=1;m[state+1]=30;m[state+8]=timer;m[body+0x66f]=cooldown;
 [4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>m.writeInt16LE(v,body+0xc4+i*2));
 [9,8,7].forEach((v,i)=>d(body+0x674+i*4,v));d(0x91cd8c,strength);d(0x713180,0x31000);for(let i=0;i<64;i++)m[0x31000+i]=i;
 //Actual40ea40 naturally-null bank branch, interpreted rather than mocked.
 d(0x6f2414,0x32000);d(0x6f2418,0x32100);
 return m;
}
function compare(memory,options={}){
 //The finite-x87 oracle explicitly rejects NaN FLD. Zero-strength has only
 //exact zero FILDs before its SSE invalid and uses the existing masked FISTP
 //oracle; all finite cases use the exact PC24 oracle.
 const machine=new BoundedX86(program.instructions,{entry:0x47b020,fpuPrecisionBits:memory.readInt32LE(0x91cd8c)===0?undefined:24});memory.copy(machine.bytes);Object.assign(machine.r,{ECX:body,ESP:B,...Object.fromEntries(Object.entries(incoming).map(([k,v])=>[k.toUpperCase(),v|0]))});machine.fpuRounding='nearest-even';
 const visits=new Set();machine.onInstruction=a=>{visits.add(a);if(a===0x484c70)options.afterEmission?.(machine.bytes);if(a===0x47b16b||a===0x47b276)throw Error('test-parent-preRET');};assert.throws(()=>machine.run(100000),/test-parent-preRET/);
 const handlers=options.afterEmission?{call484bb0:runtime=>{const result=emitNativeEffectOnStack(runtime.code,runtime.registerEdx,runtime.args,runtime);options.afterEmission(memory);return result;}}:{};
 applyNativeBodyEffectImpulse(body,{memory,scratchBase:B,nativeStack:{entryRegisters:incoming,...options},roundingMode:'nearest-even',handlers});
 const difference=memory.findIndex((value,index)=>value!==machine.bytes[index]);assert.equal(difference,-1,difference<0?'':`first differing byte0x${difference.toString(16)} source${memory[difference]} native${machine.bytes[difference]}`);
 return {machine,visits};
}
test('47b020 active producer and482730 preserve all actual memory including saved/local stack',()=>{
 for(const timer of[1,0])for(const strength of[0,4,32,100,-32]){
  const m=fixture({timer,strength}),{visits}=compare(m);assert.ok(visits.has(0x4343e0));assert.ok(visits.has(0x482730));assert.equal(visits.has(0x484bb0),timer===0);assert.equal(visits.has(0x40ea40),timer===0);
  assert.equal(m[state+8],timer===0?10:timer);assert.ok(m.subarray(state+9,state+73).includes(0x70));
 }
});
test('actual emission preserves original owner while later direction/lookup/code/body-pointer reads remain live',()=>{
 const m=fixture({timer:0}),replacement=0x33000;
 const {visits}=compare(m,{afterEmission:memory=>{
  memory.writeUInt32LE(replacement,body+0x6bc);memory[replacement]=1;
  memory.writeInt32LE(512,B-12);memory.writeInt32LE(-128,B-8);memory.writeInt32LE(2048,B-4);
  memory.writeInt16LE(-4096,body+0xc4);memory.writeUInt32LE(0x34000,0x713180);memory.fill(37,0x34000,0x34040);
  memory.writeInt32LE(0x91,B-56);
 }});
 assert.ok(visits.has(0x484bb0)&&visits.has(0x40ea40));assert.equal(m[state+9+37],0x91);assert.equal(m[state+1],27);assert.equal(m[state+8],10);assert.equal(m[replacement+9+37],0);
});
test('47b020 ordinary branches match every byte through length/root/division children and early exits',()=>{
 for(const type of[3,7,12,1,4])for(const position of[[1,2,3],[1028*65536,0,0],[-1,-2,-3],[4*65536,-12*65536,8*65536],[0x20000000,0x10000000,-0x10000000]])for(const cooldown of[0,255])compare(fixture({type,active:false,position,cooldown}));
});
test('optional entry observer is frozen, exact, and cannot change physics via returned values',()=>{
 const m=fixture(),records=[];compare(m,{onEnter:record=>{records.push(record);assert.ok(Object.isFrozen(record));assert.ok(Object.isFrozen(record.entryRegisters));assert.ok(Object.isFrozen(record.originQ16));return {strength:0};}});
 assert.equal(records.length,1);assert.equal(records[0].entryEsp,B);assert.equal(records[0].returnAddress,0x47a913);assert.equal(records[0].bodyHeaderHex.length,0x180*2);assert.deepEqual(records[0].entryRegisters,incoming);
 assert.throws(()=>applyBodyEffectImpulse({address:body,bytes:Buffer.alloc(0x720)},{nativeStack:{memory:m,scratchBase:B,entryRegisters:incoming}}),/actual shared/);
 assert.throws(()=>applyNativeBodyEffectImpulse(body,{memory:m,scratchBase:B,nativeStack:{entryRegisters:{}},roundingMode:'nearest-even'}),/incoming ebx/);
});
test('zero-bound terrain query consumes the active saved impulse scalar and preserves stale direction identity',()=>{
 const m=fixture(),{machine}=compare(m),S=B+96,out=S-228,record=0x35000,list=0x36000,verticesAddress=0x37000,Q=S-400,vertices=[],d=(p,v)=>m.writeInt32LE(v|0,p);
 for(let row=0;row<3;row++)for(let column=0;column<3;column++)vertices.push([column*32,0,-row*32,0]);vertices.forEach((v,i)=>v.forEach((x,j)=>m.writeInt16LE(x,verticesAddress+i*8+j*2)));
 d(body+0x154,list);m.writeUInt16LE(1,body+0x15c);m[list]=0;m[list+3]=2;d(list+8,768<<10);d(list+12,verticesAddress);
 d(0x90b98c,0x38000);d(0x38000,0x38100);d(0x38100,0x38200);d(0x3820c,2);
 [4096,0,-4096].forEach((v,i)=>d(record+8+i*4,v));[0,0,0].forEach((v,i)=>d(record+20+i*4,v));d(record+64,0);d(Q,-1);d(Q+4,out);d(Q+8,0);
 const scalar=m.readInt32LE(out+24),contactTime=m.readInt32LE(out+32);assert.ok(scalar<0);assert.equal(contactTime,B-12);
 m.copy(machine.bytes);machine.entry=0x424ff0;machine.onInstruction=undefined;Object.assign(machine.r,{ECX:body,EDX:record,ESP:Q});machine.run(100000);
 const views=createPhysicsRuntimeViews({memory:m,bodyStorage:[{address:body,length:0x4000}],bodyLists:[{address:0x1000,capacity:1}],candidateMapping:{terrainVerticesFor:()=>verticesAddress}}),grid=createRawTerrainGrid({sectors:[{index:0,columns:2,rows:2,vertices}]},()=>verticesAddress,{memory:m});
 assert.equal(queryRawTerrain(body,record,out,0,{memory:m,views,grid,roundingMode:'nearest-even'}),machine.r.EAX);
 assert.deepEqual(m.subarray(out,out+36),machine.bytes.subarray(out,out+36));assert.equal(m.readInt32LE(out+28),0);assert.equal(m.readInt32LE(out+24),scalar);assert.equal(m.readInt32LE(out+32),contactTime);
});
test('actual4749e0 active producer and following initial terrain queries match mapped state and reached stack inputs',async()=>{
 const report=await verifyNativeBodyEffectStack();assert.equal(report.matched,true);assert.equal(report.cases.length,8);assert.ok(report.cases.every(row=>row.terrainQueries>0&&row.mappedComparedBytes===10420224));assert.ok(report.cases.some(row=>row.wheelVehicle&&row.actualEmitterReached));
});
test('disjoint sparse-ASLR producer retains real pointers across ordinary/fallback/active/emission branches',()=>{
 const actualBody=0x33000000,actualState=0x34000000,actualLookup=0x35000000,actualBank=0x36000000,entry=0x31001000,relocation=0x200000;
 for(const options of[{active:false,position:[-1,-2,-3]},{active:false},{active:false,type:7},{active:true,timer:1},{active:true,timer:0},{active:true,timer:1,strength:0}]){
  const dense=fixture(options);compare(dense);const initial=fixture(options),rows=[{address:entry-400,bytes:Buffer.from(initial.subarray(B-400,B+40))},{address:actualBody,bytes:Buffer.from(initial.subarray(body,body+0x720))},{address:actualState,bytes:Buffer.from(initial.subarray(state,state+0x8c))},{address:actualLookup,bytes:Buffer.from(initial.subarray(0x31000,0x31040))},{address:actualBank,bytes:Buffer.alloc(256)}],aliases=[];
  for(const[address,length]of[[0x91cd80,16],[0x91d45c,8],[0x713180,4],[0x6f2414,8],[0x5dc774,4],[0x5dca88,4]]){rows.push({address:address+relocation,bytes:Buffer.from(initial.subarray(address,address+length))});aliases.push({address,targetAddress:address+relocation,length});}
  const{memory:m,mappedBytes}=createCapturedMemory(rows,{aliases}),regs={...incoming,edi:actualBody};
  m.writeUInt32LE(0x47a913+relocation,entry);m.writeUInt32LE(options.active===false?0xffffffff:actualState,actualBody+0x6bc);m.writeUInt32LE(actualLookup,0x713180);m.writeUInt32LE(actualBank,0x6f2414);m.writeUInt32LE(actualBank+256,0x6f2418);
  const target={address:actualBody,bytes:m.subarray(actualBody,actualBody+0x720)};
  applyBodyEffectImpulse(target,{roundingMode:'nearest-even',nativeStack:{memory:m,scratchBase:entry,moduleBaseAddress:0x600000,entryRegisters:regs}});
  const expectedBody=Buffer.from(dense.subarray(body,body+0x720));expectedBody.writeUInt32LE(options.active===false?0xffffffff:actualState,0x6bc);
  assert.deepEqual(m.subarray(actualBody,actualBody+0x720),expectedBody,JSON.stringify(options));assert.deepEqual(m.subarray(actualState,actualState+0x8c),dense.subarray(state,state+0x8c));assert.deepEqual(m.subarray(0x91d45c,0x91d464),dense.subarray(0x91d45c,0x91d464));assert.ok(mappedBytes<4096);
  if(options.active!==false){const T=entry-116;assert.equal(m.readUInt32LE(T+0x10),entry-12);assert.equal(m.readUInt32LE(T+0x28),actualState);assert.equal(m.readUInt32LE(entry-60),0x47b161+relocation);}
  assert.equal(m.readUInt32LE(entry),0x47a913+relocation);assert.throws(()=>m.readInt32LE(actualBody-4),/Uncaptured/);
 }
});
