//CONSTRUCTED transport only. Four endpoints are produced by retained original
//instructions, never by the source clock. Only a declared synthetic Win32 QPC
//result is supplied. This is not an original-process runtime observation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {BoundedX86} from '../../tools/lib/bounded-x86.mjs';
import {loadNativeClockInstructionProgram} from '../../tools/verify-native-race-step-clock-instructions.mjs';
import {createNativeRaceClockCaptureConfiguration} from '../../tools/lib/native-race-clock-capture.mjs';
import {nativeRaceClockCapability,nativeRaceClockPolicy,nativeRaceClockLayout,nativeRaceClockSites,nativeRaceClockRanges} from '../../tools/lib/native-race-clock-inputs.mjs';
import {REDUX_SHA256} from '../../tools/lib/retained-native-program.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),hex=n=>`0x${(n>>>0).toString(16).padStart(8,'0')}`;
const offsets={edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,cs:188,eflags:192,esp:196,ss:200,fpuControlWord:28,fpuStatusWord:32,mxcsr:228};
let programPromise;
let pePromise;
async function relocate(program,base){
  const file=await(pePromise??=readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'));assert.equal(sha(file),REDUX_SHA256);
  const delta=base-0x400000,actual=p=>p+delta,memory=Buffer.alloc(0x1800000);program.image.copy(memory,base,0x400000);
  const pe=file.readUInt32LE(60),optional=pe+24,rva=file.readUInt32LE(optional+136),size=file.readUInt32LE(optional+140),relocations=new Map();
  for(let p=0x400000+rva,end=p+size;p<end;){const page=program.image.readUInt32LE(p),length=program.image.readUInt32LE(p+4);assert.ok(length>=8&&length%2===0&&p+length<=end);
    for(let j=8;j<length;j+=2){const item=program.image.readUInt16LE(p+j);if(!item)continue;assert.equal(item>>>12,3);const original=0x400000+page+(item&4095),value=program.image.readUInt32LE(original);relocations.set(original,value);memory.writeUInt32LE(actual(value)>>>0,actual(original));}p+=length;}
  const rows=[...program.instructions,{address:0x450df0,op:'MOV',args:['ESI','dword ptr [0x006e6b4c]']}].sort((a,b)=>a.address-b.address);
  const instructions=rows.map((row,index)=>{const args=[...row.args],direct=(row.op==='CALL'||row.op.startsWith('J'))&&args.length===1&&/^0x[0-9a-f]+$/i.test(args[0]);
    if(direct)args[0]='0x'+actual(Number(args[0])).toString(16);
    else if(row.op!=='RET')for(let j=0,length=row.address===0x450df0?6:Math.min(15,(rows[index+1]?.address??row.address+1)-row.address);j+4<=length;j++){
      const old=relocations.get(row.address+j);if(old===undefined)continue;const matches=[];for(const[k,arg]of args.entries())for(const match of arg.matchAll(/0x[0-9a-f]+/gi))if(Number(match[0])===old)matches.push([k,match[0]]);
      assert.equal(matches.length,1,'Actual PE HIGHLOW identifies exactly one fixed operand');const[k,text]=matches[0];args[k]=args[k].replace(text,'0x'+actual(old).toString(16));}
    return {...row,address:actual(row.address),args};});return {memory,instructions,actual};
}
export async function createNativeRaceClockCaptureFixture({entryEsp:C=0x18000,moduleBaseAddress:base=0x400000,privateSpill=false,qpcResult=1,controlWord=0x7f}={}){
  const program=await(programPromise??=loadNativeClockInstructionProgram()),session=0x1400000,teb=0x1500000,pid=123,tid=456;
  const layout=nativeRaceClockLayout(C),sites=nativeRaceClockSites(base),policy=nativeRaceClockPolicy(),roles=['entry','counter-call','counter-return','return'];
  const image=await relocate(program,base),a=image.actual,machine=new BoundedX86(image.instructions,{entry:a(0x441c70)});machine.bytes=image.memory;const m=machine.bytes;
  m.fill(0x69,C-512,C+28);const put=(p,n)=>m.writeUInt32LE(n>>>0,p);
  put(C,a(0x450df0));put(C+24,a(0x440cd5));put(a(0x6e66f8),101);put(a(0x6e66e4),9);put(a(0x6eafe0),0x83);put(a(0x6e6c8c),1);
  m.writeBigInt64LE(0n,a(0x6e66b0));m.writeBigInt64LE(1000000n,a(0x7135a4));m.writeBigInt64LE(1000000000000n,a(0x7135ac));
  const qpc=0x1700014;put(a(0x56e0fc),qpc);put(a(0x56e114),0x1700010);put(a(0x90a548),288);put(a(0x6e675c),288);put(a(0x5ecb1c),session);put(session+0x57c,4);put(teb,0xffffffff);
  const incoming={EBX:0x12345678,EBP:0x87654321,ESI:0xabcdef01,EDI:0xfedcba98};Object.assign(machine.r,Object.fromEntries(Object.entries(incoming).map(([k,v])=>[k,v|0])),{ESP:C});machine.setFpuControlWord(controlWord);
  const endpoint=[],stop='CONSTRUCTED_CLOCK_RETURN';let calls=0;
  machine.onInstruction=address=>{
    const index=sites.findIndex(s=>s.address===address);if(index<0)return;
    let xmm0;try{xmm0=machine.xmmDouble('XMM0');}catch{}
    endpoint.push({role:roles[index],memory:Buffer.from(m),registers:{...machine.r,EIP:address},xmm0});if(index===3)throw Error(stop);
  };
  machine.externalCalls.set(qpc,cpu=>{
    calls++;assert.equal(cpu.r.ESP>>>0,layout.counterCallEsp);assert.equal(m.readUInt32LE(cpu.r.ESP),layout.outputAddress);
    put(cpu.r.ESP-4,a(0x489d13)); //Architectural CALL, before declared external API.
    if(privateSpill)m[layout.frame-64]^=0x80;
    //The failure fixture intentionally preserves the observed output preimage.
    if(qpcResult)m.writeBigInt64LE(1000003433333n,layout.outputAddress);
    cpu.r.EAX=qpcResult;cpu.r.ESP+=4;
  });
  try{machine.run(100000);assert.fail('Clock did not return to its retained caller.');}catch(error){if(!error.message.includes(stop))throw error;}
  assert.equal(calls,1);assert.deepEqual(endpoint.map(x=>x.role),roles);
  const {configuration}=createNativeRaceClockCaptureConfiguration(path.resolve('analysis/constructed-clock-fixture'),path.resolve('analysis/constructed-clock-fixture/capture'));
  const records=[],files=new Map(),snapshots=[];const add=r=>{records.push({...r,elapsedMs:r.elapsedMs??1});return records.at(-1);};
  const save=(name,bytes)=>{assert.ok(!files.has(name));files.set(name,Buffer.from(bytes));return {file:name,sha256:sha(bytes)};};
  const header=add({type:'capture',schemaVersion:1,executableSha256:REDUX_SHA256,executablePath:configuration.executablePath,workingDirectory:configuration.workingDirectory,
    arguments:configuration.arguments,maxDurationMs:90000,maxEvents:1000000,maxSnapshots:7,breakpointMode:'software-int3',cleanupPolicy:'freeze-or-prove-terminated-owned-threads-before-unpatch-and-termination',
    helperCapabilities:[nativeRaceClockCapability],raceClockObservation:policy});
  add({type:'owned-process',pid,tid,showWindow:false});add({type:'debug-event',ordinal:1,event:3,pid,tid});add({type:'module',kind:'main',baseAddress:hex(base),wow64:true});
  for(const p of configuration.breakpoints.slice(0,3))add({type:'breakpoint-installed',id:p.id,address:hex(base+Number(p.rva)),originalBytesHex:'83'});
  add({type:'breakpoint-installed',id:sites[0].id,address:hex(sites[0].address),originalBytesHex:'83'});
  for(const s of sites.slice(1))add({type:'breakpoint-installation-deferred',id:s.id,address:hex(s.address),originalBytesHex:s.bytesHex,
    activationBreakpointId:sites[0].id,activationSelection:'selected-owned-warm-clock-entry',capability:nativeRaceClockCapability,codeModified:false});
  const descriptor=Buffer.from('ff0f000000f34000','hex');descriptor.writeUInt16LE(teb&65535,2);descriptor[4]=(teb>>>16)&255;descriptor[7]=teb>>>24;
  const threadEnvironment={fsSelector:'0x00000053',descriptorHex:descriptor.toString('hex'),fsBase:hex(teb),sehWord:'0xffffffff',tid,selectorApi:'Wow64GetThreadSelectorEntry',contextSelectorOffset:144,source:'stopped-owned-thread-selector-query'};
  const makeSnapshot=(id,ordinal,event,registerValues,ranges,xmm0)=>{
    const context=Buffer.alloc(716),registers={};context.writeUInt32LE(0x1003f,0);context.writeUInt32LE(0x53,144);
    const values={...Object.fromEntries(Object.entries(registerValues).map(([name,value])=>[name.toLowerCase(),value>>>0])),cs:0x23,ss:0x2b,eflags:0x202,fpuControlWord:controlWord,fpuStatusWord:0x20,mxcsr:0x1fa7};
    for(const[name,offset]of Object.entries(offsets)){context.writeUInt32LE(values[name],offset);registers[name]=hex(values[name]);}
    if(xmm0!==undefined)context.writeDoubleLE(xmm0,364);
    const contextFile=`snapshot-${ordinal}-context.bin`;save(contextFile,context);
    const loadedRows=[...ranges,{id:'thread-seh-head',address:hex(teb),length:4,source:'stopped-owned-thread-fs-zero',bytes:Buffer.from('ffffffff','hex')}].map((row,index)=>{
      const {bytes,...rest}=row;return {...rest,...save(`snapshot-${ordinal}-range-${index}.bin`,bytes),bytes:Buffer.from(bytes)};
    });
    const snapshot={type:'snapshot',ordinal,breakpointId:id,hit:1,tid,registers,contextFile,contextSha256:sha(context),
      ranges:loadedRows.map(({bytes,...row})=>row),capturePhase:'before-declared-writes-before-original-instruction',observedElapsedMs:1,observedDebugEventOrdinal:event,threadEnvironment:structuredClone(threadEnvironment),elapsedMs:1};
    return {snapshot,loaded:{...structuredClone(snapshot),context,ranges:new Map(loadedRows.map(row=>[row.id,row]))}};
  };
  //Unmodified startup observations and the exact six established guarded writes.
  const roots={launcher:0x1300000,graphics:0x1310000,device:0x1320000};
  for(let i=0;i<3;i++){
    const p=configuration.breakpoints[i],ordinal=i+1,event=i+2,regs={EAX:0,EBX:0,ECX:roots.device,EDX:0,EBP:0,ESI:0,EDI:0,ESP:C,EIP:base+Number(p.rva)};
    add({type:'debug-event',ordinal:event,event:1,pid,tid});
    const ranges=p.ranges.map(d=>{
      const address=d.baseRegister?regs[d.baseRegister.toUpperCase()]+Number(d.offset??0):d.dereferenceOffsets?(i===0?roots.launcher:roots.graphics)+Number(d.offset??0):base+Number(d.rva)+Number(d.offset??0);
      const bytes=Buffer.alloc(d.length);if(d.id==='presentation')bytes.writeUInt32LE(1,0x20);
      return {id:d.id,address:hex(address),rootAddress:null,rootRva:d.rva??null,moduleBaseAddress:d.rva===undefined?null:hex(base),baseRegister:d.baseRegister??null,dereferenceOffsets:d.dereferenceOffsets??[],offset:d.offset??'0',length:d.length,bytes};
    });
    const {snapshot,loaded}=makeSnapshot(p.id,ordinal,event,regs,ranges);add(snapshot);snapshots.push(loaded);
    for(const w of configuration.phaseActions[i].writes){const address=w.baseRegister?regs[w.baseRegister.toUpperCase()]+Number(w.offset):w.dereferenceOffsets?(i===0?roots.launcher:roots.graphics)+Number(w.offset):base+Number(w.rva);
      const allowed=w.expectedAnyBytesHex??[w.expectedBytesHex];add({type:'intervention',breakpointId:p.id,hit:1,address:hex(address),replacementBytesHex:w.bytesHex,originalBytesHex:allowed[0],acceptedOriginalBytesHex:allowed});}
  }
  const originalRows=nativeRaceClockRanges(C,base,session),initialInputHex=Object.fromEntries(originalRows.map(row=>[row.id,endpoint[0].memory.subarray(row.address,row.address+row.length).toString('hex')]));
  for(let i=0;i<4;i++){
    const native=endpoint[i],s=sites[i],ordinal=i+4,event=i+5;add({type:'debug-event',ordinal:event,event:1,pid,tid});
    const ranges=originalRows.map(row=>({...row,address:hex(row.address),bytes:Buffer.from(native.memory.subarray(row.address,row.address+row.length))}));
    const {snapshot,loaded}=makeSnapshot(s.id,ordinal,event,native.registers,ranges,native.xmm0);
    const proof={type:'race-clock-admitted',role:roles[i],pid,tid,ownerMainTid:tid,breakpointId:s.id,mainModuleBaseAddress:hex(base),observedDebugEventOrdinal:event,snapshotOrdinal:ordinal,
      entryDebugEventOrdinal:5,entrySnapshotOrdinal:4,observationIndex:i+1,...Object.fromEntries(Object.entries(layout).map(([key,value])=>[key,key==='stackBytes'?value:hex(value)])),
      entryCaller:hex(a(0x450df0)),outerCaller:hex(a(0x440cd5)),sessionAddress:hex(session),logicalClock:288,initialDelivered:101,
      entryNonvolatile:['EBX','EBP','ESI','EDI'].map(n=>incoming[n]),initialControlWordHex:endpoint[0]&&Buffer.from([controlWord&255,controlWord>>>8]).toString('hex'),initialStatusWordHex:'2000',initialMxcsrHex:'a71f0000',initialInputHex,
      beforeSnapshotRangeResolution:true,beforeOriginalInstruction:true,originalInstructionBytesHex:s.bytesHex,originalInstructionVerified:true,
      callDebugEventOrdinal:i>=2?6:0,callSnapshotOrdinal:i>=2?5:0,activationDebugEventOrdinal:i?5:0,elapsedMs:1};
    add(proof);snapshot.raceClockObservation=structuredClone(proof);loaded.raceClockObservation=structuredClone(proof);add(snapshot);snapshots.push(loaded);
    if(i===0)for(const cold of sites.slice(1))add({type:'race-clock-breakpoint-activated',pid,tid,ownerMainTid:tid,id:cold.id,address:hex(cold.address),originalBytesHex:cold.bytesHex,patchBytesHex:'cc',
      activationBreakpointId:sites[0].id,activationSelection:'selected-owned-warm-clock-entry',capability:nativeRaceClockCapability,codeModified:true,
      observedDebugEventOrdinal:5,entryDebugEventOrdinal:5,entrySnapshotOrdinal:4,mainModuleBaseAddress:hex(base),rawHit:0,matchingHit:0,capturedHit:0,afterEntrySnapshotPublication:true,beforeOriginalInstruction:true});
  }
  const complete=add({type:'complete',reason:'snapshot-bound',snapshots:7,events:8,raceClockObservation:{selectedSnapshots:4,counterPairs:1,counterSnapshots:2,entryDebugEventOrdinal:5,entrySnapshotOrdinal:4,activationDebugEventOrdinal:5,returnDebugEventOrdinal:8,returnSnapshotOrdinal:7,returnValue:endpoint[3].registers.EAX>>>0}});
  return {authority:'constructed-retained-instructions-not-original-process',configuration,records,capture:{header,snapshots,complete},files,layout,incoming,endpoint};
}

export async function writeNativeRaceClockCaptureFixture(directory,options){
  const fixture=await createNativeRaceClockCaptureFixture(options);await mkdir(directory);
  for(const[name,bytes]of fixture.files)await writeFile(path.join(directory,name),bytes,{flag:'wx'});
  await writeFile(path.join(directory,'configuration.json'),JSON.stringify(fixture.configuration,null,2)+'\n',{flag:'wx'});
  await writeFile(path.join(directory,'trace.jsonl'),fixture.records.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
  return fixture;
}
