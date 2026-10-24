//Constructed original-instruction comparisons. No original process is run.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadRelocatedAudioFixture} from './lib/relocated-audio-fixtures.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {runNativeRacePausePolicy,runNativeRaceMusicState,runNativeRaceMusicCommand,compareNativeRaceHostParticipant,announceNativeReadyPeers,updateNativeNetworkCountdown} from '../src/native-race-pause-policy.mjs';
const original='C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const names=['20261024-race-pause-477730-assembly.json','20261024-race-pause-manager-4a60d0-assembly.json','20261024-race-pause-network-473060-assembly.json','20261024-race-pause-network-4725b0-assembly.json','20261024-race-pause-state-4772e0-assembly.json','915-race-phase-audio-start-assembly.json','938-race-phase-music-transition-assembly.json'];
const ports=new Map([[0x477730,runNativeRacePausePolicy],[0x4843a0,runNativeRaceMusicState],[0x484510,runNativeRaceMusicCommand],[0x4772e0,compareNativeRaceHostParticipant],[0x473060,announceNativeReadyPeers],[0x4725b0,updateNativeNetworkCountdown]]);
export async function loadNativeRacePauseProgram(base){
  const image=await loadRelocatedAudioFixture(base),p=await readInstructionEvidence(names,{directory:'analysis/native-simulation/results'}),file=await readFile(original);
  const pe=file.readUInt32LE(60),opt=pe+24,rva=file.readUInt32LE(opt+136),size=file.readUInt32LE(opt+140),relocs=new Map(),a=image.actual;
  for(let ptr=base+rva,end=ptr+size;ptr<end;){const page=image.memory.readUInt32LE(ptr),n=image.memory.readUInt32LE(ptr+4);for(let j=8;j<n;j+=2){const e=image.memory.readUInt16LE(ptr+j);if(e>>>12===3){const va=0x400000+page+(e&4095);relocs.set(va,(image.memory.readUInt32LE(a(va))-image.delta)>>>0);}}ptr+=n;}
  const rows=p.instructions.toSorted((x,y)=>x.address-y.address),instructions=rows.map((row,index)=>{const args=[...row.args];
    if((row.op==='CALL'||row.op.startsWith('J'))&&args.length===1&&/^0x[0-9a-f]+$/i.test(args[0]))args[0]='0x'+a(Number(args[0])).toString(16);
    else if(row.op!=='RET')for(let j=0,n=Math.min(15,(rows[index+1]?.address??row.address+1)-row.address);j+4<=n;j++){
      const old=relocs.get(row.address+j);if(old===undefined)continue;const found=[];for(const[i,arg]of args.entries())for(const match of arg.matchAll(/0x[0-9a-f]+/gi))if(Number(match[0])===old)found.push([i,match[0]]);
      //Listing gaps cannot assert a field belongs to this instruction.
      if(!found.length)continue;assert.equal(found.length,1);const[i,text]=found[0];args[i]=args[i].replace(text,'0x'+a(old).toString(16));}
    return {...row,address:a(row.address),args};});
  return {...image,instructions,evidence:p.evidence.map(e=>({id:e.evidence_id,sha256:e.subject.digest.sha256,procedure:e.parameters.procedure}))};
}

export function createNativeRacePauseFixture(image,{entry=0x477730,ecx=0,phase=4,mode=3,music=1,muted=1,ui=0,network=0,index=0,host=0,deadline=100,sample=99,ready=0x2000}={}){
  const memory=Buffer.from(image.memory),a=image.actual,S=0x1141000,session=0x1000000,settings=0x1010000,manager=0x1100000,participantRoot=0x1020000,body=0x1030000,put=(p,v)=>memory.writeUInt32LE(v>>>0,p);
  memory.fill(0x69,S-512,S+32);put(S,0xffffffff);put(a(0x5ecb1c),session);put(a(0x5ecefc),settings);put(session+0x57c,phase);memory[settings+0x410]=muted;
  put(a(0x6e6b4c),mode);put(a(0x9020a0),ui);put(a(0x6eafe0),network);put(a(0x6e675c),sample);put(a(0x6eaab4),deadline);put(a(0x6e9f70),host);put(a(0x9020c0),participantRoot);put(participantRoot,body);memory.writeUInt16LE(index,body+0x65e);
  put(a(0x714b08),manager);put(manager,a(0x5d4190));assert.equal(memory.readUInt32LE(a(0x5d4190)+12),a(0x4a60d0),'Original manager vtable0c');memory[manager+0x821]=0x69;
  memory.writeUInt16LE(music,a(0x6e6bd8));put(a(0x6e6b30),0x1234);put(a(0x56e0d4),0x1700010);
  for(let i=0;i<6;i++){put(a(0x6e7880)+i*0x67c,1);put(a(0x6e7ef8)+i*0x67c,ready);}
  const entryRegisters={EAX:0x12345678,EBX:0x11223344,ECX:ecx>>>0,EDX:0x55667788,EBP:0x22334455,ESI:0x33445566,EDI:0x44556677};
  return {memory,scratchBase:S,moduleBaseAddress:a(0x400000),entryRegisters,entry,image,manager,session,settings,body,participantRoot};
}

export function compareNativeRacePauseFixture(fixture){
  const {image,entry}=fixture,machine=new BoundedX86(image.instructions,{entry:image.actual(entry)});machine.bytes=Buffer.from(fixture.memory);Object.assign(machine.r,Object.fromEntries(Object.entries(fixture.entryRegisters).map(([k,v])=>[k,v|0])),{ESP:fixture.scratchBase});
  const api=[],sourceApi=[];let callSite;
  machine.onInstruction=address=>{if(address===image.actual(0x48454a))callSite=address;};
  machine.externalCalls.set(0x1700010,cpu=>{assert.equal(callSite,image.actual(0x48454a));const S=cpu.r.ESP>>>0,args=Array.from({length:5},(_,i)=>cpu.bytes.readUInt32LE(S+i*4));
    cpu.bytes.writeUInt32LE(image.actual(0x484550),S-4);api.push({entryEsp:S-4,args,byte:cpu.bytes[args[1]],eax:cpu.r.EAX>>>0,ecx:cpu.r.ECX>>>0});cpu.bytes.writeUInt32LE(1,args[3]);cpu.r.EAX=1;cpu.r.ESP+=20;});
  const runtime={...fixture,services:{platformCall(name,args,context){assert.equal(name,'WriteFile');assert.equal(context.nativeRaceMusicWrite.iatTarget,0x1700010);
    sourceApi.push({entryEsp:context.scratchBase,args,byte:fixture.memory[args[1]],eax:context.entryRegisters.EAX,ecx:context.entryRegisters.ECX});fixture.memory.writeUInt32LE(1,args[3]);return 1;}}};
  const output=ports.get(entry)(runtime),steps=machine.run(10000);assert.deepEqual(sourceApi,api,'Only synthetic Windows WriteFile has exact source/native ABI');
  if(!fixture.memory.equals(machine.bytes)){const p=fixture.memory.findIndex((v,i)=>v!==machine.bytes[i]);assert.fail(`Source/native memory differs at0x${p.toString(16)} source${fixture.memory[p]} native${machine.bytes[p]}`);}
  for(const[name,value]of Object.entries(output.registers)){const expected=name==='esp'?(machine.r.ESP+4)>>>0:name==='eip'?0xffffffff:machine.r[name.toUpperCase()]>>>0;assert.equal(value,expected,`Original instruction register ${name}`);}
  return {steps,apiCalls:api.length,output};
}

export function compareNativeRacePauseBoundary(fixture,target){
  const original=Buffer.from(fixture.memory),{image,entry}=fixture,a=image.actual;
  let sourceError;try{ports.get(entry)(fixture);}catch(error){sourceError=error;}
  assert.ok(sourceError?.nativeRacePauseBoundary,sourceError?.stack??'Expected a genuine game boundary');assert.equal(sourceError.nativeRacePauseBoundary.preferredTarget,target);
  const rows=[...image.instructions];if(!rows.some(r=>r.address===a(target)))rows.push({address:a(target),op:'NOP',args:[]});
  const machine=new BoundedX86(rows,{entry:a(entry)});machine.bytes=original;Object.assign(machine.r,Object.fromEntries(Object.entries(fixture.entryRegisters).map(([k,v])=>[k,v|0])),{ESP:fixture.scratchBase});
  machine.onInstruction=address=>{if(address===a(target))throw Error('PROVEN_PAUSE_CHILD_ENTRY');};
  assert.throws(()=>machine.run(10000),/PROVEN_PAUSE_CHILD_ENTRY/);assert.equal(machine.r.ESP>>>0,sourceError.nativeRacePauseBoundary.entryEsp);
  if(!fixture.memory.equals(machine.bytes)){const p=fixture.memory.findIndex((v,i)=>v!==machine.bytes[i]);assert.fail(`Stopped source/native memory differs0x${p.toString(16)} source${fixture.memory[p]} native${machine.bytes[p]}`);}
  return sourceError.nativeRacePauseBoundary;
}

export async function verifyNativeRacePauseInstructions({output}={}){
  let fixtures=0,instructions=0,apiCalls=0;const evidence=[];
  for(const base of[0x400000,0x730000,0x320000]){const image=await loadNativeRacePauseProgram(base);evidence.push(...image.evidence);
    const cases=[];
    for(const phase of[-1,4,6,7,8])for(const music of[0,1,2,0x1002])for(const muted of[0,1])cases.push({phase,music,muted});
    for(const ecx of[1,0x100,0xffffffff])for(const mode of[0,1,3,0xffffffff])cases.push({ecx,mode});
    for(const ecx of[0,1,2,3,8,9,255,0x12340000,0x12340001,0x80000000,0xffffff01])for(const music of[0,1,2])cases.push({entry:0x4843a0,ecx,music,muted:0});
    for(const ecx of[0,2,3,8,9,255,0x12340003])cases.push({entry:0x484510,ecx});
    for(const host of[0,1,5,0xffffffff])for(const index of[0,1,5,0xffff])cases.push({entry:0x4772e0,index,host});
    for(const network of[0,1,0x41,0x81,0x20c1])cases.push({entry:0x473060,network});
    for(const network of[0,0x400,0x1400])for(const sample of[0,99,100,0xffffffff])cases.push({entry:0x4725b0,network,sample});
    for(const network of[1,0x41,0x81,0x12340001])cases.push({network});
    for(const options of cases){try{const result=compareNativeRacePauseFixture(createNativeRacePauseFixture(image,options));fixtures++;instructions+=result.steps;apiCalls+=result.apiCalls;}catch(e){e.message+=`\nbase0x${base.toString(16)} fixture${JSON.stringify(options)}`;throw e;}}
  }
  const report={schemaVersion:1,matched:true,authority:'constructed-inputs-with-retained-original-instructions',fixtures,instructionSteps:instructions,syntheticWriteFileCalls:apiCalls,
    evidence:[...new Map(evidence.map(e=>[e.id,e])).values()],limits:['No original-process pause comparison.','UI477f30/render477b00 and relocated legacy network/refresh dependencies remain explicit.','Native472615 timer caller and unknown legacy volatile registers remain unbound.']};
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyNativeRacePauseInstructions({output:process.argv[2]})));
