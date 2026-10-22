import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const actualAudio = process.argv.includes('--actual-audio');
const own = await readInstructionEvidence(['310-race-step-parent-assembly.json', ...(actualAudio ? ['9190-sound-manager-level-procedure_assembly.json'] : [])], {directory:'analysis/native-simulation/results'});
const machine = new BoundedX86(own.instructions), names = [...new Set(own.instructions.filter(item => item.op === 'CALL' && /^0x/.test(item.args[0])).map(item => Number(item.args[0]).toString(16)))];
const BODY=0x10000, OTHER=0x28000, A=0x50000, B=0x51000, CONFIG=0x52000, SCENE=0x53000, ROWS=0x54000, TARGET=0x55000, MANAGER=0x56000, VTABLE=0x57000, SERVICE=0x58000, COUNT=0x59000, STACK=0x9000;
const knownEcx=new Set(['410220','431750','485300','42a6e0','42be80','42a9a0','443d90','48d680','499de0','41d2b0','416400','4180a0','44d960']);
const put=(memory,p,value)=>memory.writeInt32LE(value|0,p), word=(memory,p,value)=>memory.writeUInt16LE(value&65535,p);
let seed=0x450e50ad,instructionSteps=0,calls=0,advanced=0,finalIteration=0,restoreAliases=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const fixtures=4000;
for(let fixture=0;fixture<fixtures;fixture++){
  machine.reset();const memory=machine.bytes;memory.fill(0,0x909300,0x90a548);memory.fill(0x51,STACK-256,STACK+64);
  put(memory,0x5ecb1c,A);memory[A+0x54d]=random(7);memory[B+0x54d]=random(7);put(memory,A+0x57c,random(7));put(memory,B+0x57c,random(7));memory[A+0x58b]=random(2);memory[B+0x58b]=random(2);
  put(memory,0x5ecefc,CONFIG);memory[CONFIG+0x28]=random(2);put(memory,CONFIG+0x404,random(2));put(memory,0x90b990,SCENE);memory[SCENE+0xfc]=random(2);put(memory,0x90b994,ROWS);put(memory,0x90b998,random(7)-1);
  put(memory,0x80b5e0,BODY);put(memory,BODY+0x188,random(2));put(memory,0x714b08,MANAGER);put(memory,MANAGER,VTABLE);put(memory,VTABLE+0x5c,actualAudio ? 0x4a90e0 : SERVICE);
  put(memory,COUNT,random(5)-1);put(memory,0x6fb9a4,[0,1,31,32,-1,0x7fffffff][random(6)]);put(memory,0x712fbc,random(0xffffffff));put(memory,0x5ecdb8,random(0xffffffff));put(memory,0x90a548,random(0xffffffff));put(memory,0x6e675c,random(0xffffffff));
  for(let index=0;index<6;index++){
    const body=BODY+index*0x4000,record=0x909300+index*0x30c;put(memory,record,body);put(memory,body+0x690,random(2));put(memory,body+0x694,random(0xffffffff));put(memory,body+0x710,random(0xffffffff));memory[body+0x718]=[8,9,10][random(3)];
    const row=ROWS+index*24;put(memory,row,fixture%17===0?row+6:TARGET+index*8);word(memory,row+4,random(65536));word(memory,row+6,random(65536));word(memory,row+8,random(65536));
  }
  const iteration=random(5),total=random(5),source=Buffer.from(memory),sourceLog=[],nativeLog=[];
  const invoke=(bytes,log,id,ecx,edx,entry)=>{
    log.push([id,knownEcx.has(id)?ecx:null,id==='485300'||id==='42a6e0'?edx:null,entry]);
    if(id==='410220'&&fixture%17===0)put(bytes,0x5ecb1c,B);
    if(id==='431750'&&fixture%19===0)put(bytes,0x5ecb1c,A);
    if(id==='485300'&&fixture%23===0)bytes[ecx+0x718]=9;
    if(id==='49bbc0'&&fixture%5===0)put(bytes,0x5ecb1c,bytes.readUInt32LE(0x5ecb1c)===A?B:A);
    if(id==='47ccc0'&&fixture%7===0)put(bytes,0x5ecb1c,B);
    if(id==='4180a0'&&fixture%11===0)put(bytes,COUNT,ecx===0?4:ecx===2?1:bytes.readInt32LE(COUNT));
    if(id==='480e90'&&fixture%13===0)put(bytes,STACK+4,iteration+1);
    if(id==='484880'&&fixture%29===0){put(bytes,0x90a548,0x7fffffff);put(bytes,0x6e675c,-1);}
    if(id==='41bef0')return bytes.readInt32LE(COUNT);
    if(id==='47f370')return fixture%2;
    return 0;
  };
  const handlers=Object.fromEntries(names.map(id=>[`call${id}`,request=>invoke(source,sourceLog,id,request.ecx,request.edx,request.scratchBase)]));
  if (!actualAudio) handlers.audioManagerCall=(manager,method,args)=>{sourceLog.push(['manager',manager,method,args]);put(source,TARGET+60,args[0]);};
  for(const id of names)machine.externalCalls.set(Number(`0x${id}`),m=>{m.r.EAX=invoke(memory,nativeLog,id,m.r.ECX,m.r.EDX,m.r.ESP-4);});
  machine.externalCalls.set(SERVICE,m=>{const arg=memory.readInt32LE(m.r.ESP);nativeLog.push(['manager',m.r.ECX,0x5c,[arg]]);put(memory,TARGET+60,arg);m.r.ESP+=4;});
  const expected=runRaceUpdate(iteration,total,{memory:source,scratchBase:STACK,handlers});machine.entry=0x450e50;machine.r.EDX=iteration;machine.r.ESP=STACK;put(memory,STACK,-1);put(memory,STACK+4,total);instructionSteps+=machine.run();
  try{
    assert.equal(machine.r.EAX,expected,'return');assert.deepEqual(nativeLog,sourceLog,'call sequence/known arguments');
    for(const[p,n]of [[BODY,0x18000],[OTHER,0x18000],[A,0x2000],[CONFIG,0x5000],[ROWS,0x1000],[TARGET,0x100],[MANAGER,0x854],[0x909300,0x1248],[0x90a548,4],[0x6e675c,4],[0x6e6bd4,4],[0x712fbc,4],[0x6fb9a4,4],[0x5ecdb0,12],[STACK+4,4]])assert.deepEqual(memory.subarray(p,p+n),source.subarray(p,p+n),`state0x${p.toString(16)}`);
  }catch(error){console.error({fixture,iteration,total,native:nativeLog,source:sourceLog});throw error;}
  calls+=nativeLog.length;if(expected)advanced++;if(nativeLog.some(item=>item[0]==='42b530'))finalIteration++;if(fixture%17===0&&memory[SCENE+0xfc])restoreAliases++;
}
const report={method:'Complete450e50 caller ordering and owned state writes, including all42 direct callees and final manager virtual service. Every gamecallee is an explicit state-mutating boundary fixture: this verifies caller policy, not the unresolved game stages. Compares known consumed register arguments, native callee-entry ESP, complete body/session/configuration/restored-coordinate/record/global state and EAX. Opaque callees volatile register inputs are not assigned gameplay meaning; their interfaces remain to trace before feature closure. Synthetic session-pointer/count replacement, aliased coordinate restoration, live dynamic-object count, late stack argument mutation, mirrored sound scales and clock-wrap fixtures; no process execution.',evidence:own.evidence.map(item=>item.evidence_id),instructions:own.instructions.length,fixtures,calls,advanced,finalIteration,restoreAliases,instructionSteps,matched:true};
if (actualAudio) {report.actualSoundManagerLevel = true; report.method += ' In this variant final SoundManager virtual5c executes actual4a90e0 with no game/platform contract for that call; raw master-level bits and complete manager storage compare. The42 direct game stages remain explicit contracts.';}
const output = actualAudio ? 'analysis/race-update-sound-manager-level-instruction-check.json' : 'analysis/race-update-instruction-check.json';
try {await writeFile(output,JSON.stringify(report,null,2),actualAudio ? {flag:'wx'} : undefined);} catch(error) {if (!actualAudio || error.code !== 'EEXIST') throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);}console.log(JSON.stringify(report));
