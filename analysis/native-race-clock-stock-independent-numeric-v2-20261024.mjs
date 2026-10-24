//Retained-instruction audit only. Run from repository root; never launches the
//target. Runtime bytes come solely from original entry plus the one QPC result.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {verifyNativeRaceClockCaptureRecords} from '../tools/lib/native-race-clock-capture.mjs';
import {createNativeRaceClockInputs} from '../tools/lib/native-race-clock-inputs.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {loadNativeClockInstructionProgram,originalClockTarget} from '../tools/verify-native-race-step-clock-instructions.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

const input='analysis/native-race-clock-stock-capture-v2-20261024';
const output='analysis/native-race-clock-stock-independent-numeric-audit-v2-20261024.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const capture=await loadPhysicsCapture(input,{expectedSha256:'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'});
const traceBytes=await readFile(input+'/trace.jsonl'),configurationBytes=await readFile(input+'/configuration.json');
const records=traceBytes.toString().trim().split(/\r?\n/).map(JSON.parse),configuration=JSON.parse(configurationBytes);
const proof=verifyNativeRaceClockCaptureRecords({capture,configuration,records}),base=proof.moduleBaseAddress,delta=base-0x400000;
const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:base}),l=inputs.layout,physical=createCapturedMemory(inputs.rows),memory=physical.memory;
const at=(snapshot,id)=>{const row=snapshot.ranges.get(id);assert.ok(row);return row;};
const stackByte=(snapshot,address)=>{const row=at(snapshot,'race-clock-stack');return row.bytes[address-Number(row.address)];};
const observedCounter=at(proof.counterReturn,'race-clock-stack').bytes.subarray(l.outputAddress-l.stackAddress,l.outputAddress-l.stackAddress+8);
const observedBool=proof.counterReturn.context.readUInt32LE(176),qpc=at(proof.entry,'race-clock-qpc-import').bytes.readUInt32LE();

//Read original code/relocations to relocate retained instruction operands.
//The PE image returned here is NEVER installed as interpreter runtime memory.
const program=await loadNativeClockInstructionProgram(),parent=await readInstructionEvidence(['001-frame-parent.json'],{directory:'analysis/physics-clock-elevated-20261022/results'});
const original=new Map(program.instructions.map(row=>[row.address,row]));
original.set(0x450df0,parent.instructions.find(row=>row.address===0x450df0));
const file=await readFile(originalClockTarget),pe=file.readUInt32LE(60),optional=pe+24,imageSize=file.readUInt32LE(optional+56);
const relocRva=file.readUInt32LE(optional+136),relocLength=file.readUInt32LE(optional+140),relocations=new Map();
for(let p=0x400000+relocRva,end=p+relocLength;p<end;){
  const page=program.image.readUInt32LE(p),length=program.image.readUInt32LE(p+4);assert.ok(length>=8&&length%2===0&&p+length<=end);
  for(let i=8;i<length;i+=2){const word=program.image.readUInt16LE(p+i),type=word>>>12;if(!type)continue;assert.equal(type,3);const address=0x400000+page+(word&4095);relocations.set(address,program.image.readUInt32LE(address));}
  p+=length;
}
const ordered=[...original.values()].sort((a,b)=>a.address-b.address),relocatedOperands=[];
const instructions=ordered.map((row,index)=>{
  const args=[...row.args],opcode=program.image[row.address];let length=Math.min(15,(ordered[index+1]?.address??row.address+1)-row.address);
  if([0xc3,0xcb,0xcc].includes(opcode))length=1;else if([0xc2,0xca].includes(opcode))length=3;else if(opcode===0xe9)length=5;else if(opcode===0xeb)length=2;
  for(let offset=0;offset+4<=length;offset++)if(relocations.has(row.address+offset)){
    const value=relocations.get(row.address+offset),matches=[];
    for(const[index,arg]of args.entries())for(const m of arg.matchAll(/0x[0-9a-f]+/gi))if(Number(m[0])===value)matches.push({index,start:m.index,text:m[0]});
    assert.equal(matches.length,1,`Exact original HIGHLOW operand${row.address.toString(16)}`);const match=matches[0];
    args[match.index]=args[match.index].slice(0,match.start)+`0x${(value+delta).toString(16)}`+args[match.index].slice(match.start+match.text.length);
    relocatedOperands.push({instructionAddress:row.address,operandAddress:row.address+offset,preferredValue:value,actualValue:value+delta});
  }
  if((row.op==='CALL'||row.op.startsWith('J'))&&args.length===1&&/^0x[0-9a-f]+$/i.test(args[0])){const target=Number(args[0]);if(target>=0x400000&&target<0x400000+imageSize)args[0]=`0x${(target+delta).toString(16)}`;}
  return {...row,address:row.address+delta,args};
});

const ledger=[],images={},registerChecks={},reached=new Map(),children=new Map();let ip,actor='instruction',afterApi=false,apiCalls=0,targetClock,scaleBits;
const widths={Int8:1,UInt8:1,Int16LE:2,UInt16LE:2,UInt16BE:2,Int32LE:4,UInt32LE:4,FloatLE:4,DoubleLE:8,BigInt64LE:8,BigUInt64LE:8};
const access=(kind,address,length)=>ledger.push({order:ledger.length,kind,address,length,actor,instructionAddress:ip,afterApi});
const tracked=new Proxy(memory,{get(target,key){
  if(typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)){access('read',Number(key),1);return target[key];}
  if(typeof key==='string')for(const[kind,prefix]of[['read','read'],['write','write']])if(key.startsWith(prefix)&&widths[key.slice(prefix.length)])return(...args)=>{access(kind,kind==='read'?args[0]:args[1],widths[key.slice(prefix.length)]);return target[key](...args);};
  if(key==='subarray')return(start,end)=>{access('read',start,end-start);return target.subarray(start,end);};
  return target[key];
},set(target,key,value){assert.ok(typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key));access('write',Number(key),1);target[key]=value;return true;}});
const machine=new BoundedX86(instructions,{entry:base+0x41c70});machine.bytes=tracked;
const context=proof.entry.context;
for(const[name,offset]of Object.entries({EDI:156,ESI:160,EBX:164,EDX:168,ECX:172,EAX:176,EBP:180,ESP:196}))machine.r[name]=context.readInt32LE(offset);
const flags=context.readUInt32LE(192);machine.z=!!(flags&64);machine.s=!!(flags&128);machine.o=!!(flags&2048);machine.c=!!(flags&1);machine.p=!!(flags&4);machine.a=!!(flags&16);
machine.setFpuControlWord(inputs.numericalContext.x87.controlWord);machine.sseRounding=inputs.numericalContext.sse.roundingMode;
for(let i=0;i<8;i++)machine.setXmmLanes('XMM'+i,[0,4,8,12].map(offset=>context.readInt32LE(364+i*16+offset)));
const unknown=Symbol('QPC volatile register output not admitted');
const byInstruction=new Map(instructions.map(row=>[row.address,row])),independentZeroIdioms=[];
machine.r=new Proxy(machine.r,{get(target,key){
  if(target[key]===unknown){
    const instruction=byInstruction.get(ip);
    if(instruction?.op==='XOR'&&instruction.args[0]===key&&instruction.args[1]===key){
      independentZeroIdioms.push({instructionAddress:ip,register:key});return 0; //Unknown XOR itself is exactly zero, without an input answer.
    }
    throw Error(`Read of unobserved QPC volatile${String(key)}`);
  }
  return target[key];
},set(target,key,value){target[key]=value;return true;}});
const compareRegisters=(names,snapshot)=>names.map(name=>({name,instruction:machine.r[name.toUpperCase()]>>>0,native:Number(snapshot.registers[name])>>>0,matched:(machine.r[name.toUpperCase()]>>>0)===(Number(snapshot.registers[name])>>>0)}));
const snap=stage=>{images[stage]=new Map(inputs.semanticRegions.map(r=>[r.id,Buffer.from(physical.span(r.address,r.length))]));};
machine.onInstruction=address=>{
  ip=address;reached.set(address,(reached.get(address)??0)+1);
  if([0x489cd0,0x568d6e,0x568c41,0x568bfd,0x568f10,0x569380].some(p=>p+delta===address))children.set(address,(children.get(address)??0)+1);
  if(address===base+0x89d11){assert.equal(machine.r.ESP,l.counterCallEsp);snap('counterCall');registerChecks.counterCall=compareRegisters(['eax','ebx','ebp','esi','edi','esp'],proof.counterCall);}
  if(address===base+0x89d13){assert.equal(machine.r.ESP,l.counterReturnEsp);snap('counterReturn');registerChecks.counterReturn=compareRegisters(['eax','ebx','ebp','esi','edi','esp'],proof.counterReturn);}
  if(address===base+0x41ccb){const b=Buffer.alloc(8);b.writeDoubleLE(machine.xmmDouble('XMM0'));scaleBits=b.toString('hex');}
  if(address===base+0x41cd0)targetClock=machine.r.EAX>>>0;
  if(address===base+0x50df0){snap('returned');registerChecks.returned=compareRegisters(['eax','ebx','ebp','esi','edi','esp'],proof.returned);throw Error('Independent original clock RET endpoint reached.');}
};
machine.externalCalls.set(qpc,m=>{
  assert.equal(ip,base+0x89d11);assert.equal(++apiCalls,1);assert.equal(m.r.ESP,l.counterCallEsp);
  const pointer=memory.readUInt32LE(l.counterCallEsp);assert.equal(pointer,l.outputAddress);
  assert.deepEqual(physical.span(pointer,8),at(proof.counterCall,'race-clock-stack').bytes.subarray(pointer-l.stackAddress,pointer-l.stackAddress+8));
  //Only the architectural CALL and authenticated8-byte external outcome/BOOL.
  actor='architectural-call';m.bytes.writeUInt32LE(base+0x89d13,l.frame-8);
  actor='api-outcome';for(let i=0;i<8;i++)m.bytes[pointer+i]=observedCounter[i];m.r.EAX=observedBool|0;m.r.ESP+=4;
  //Discard volatile outputs rather than borrowing them from native-after.
  m.r.ECX=unknown;m.r.EDX=unknown;for(let i=0;i<8;i++)m.setXmmLanes('XMM'+i,[undefined,undefined,undefined,undefined]);
  actor='instruction';afterApi=true;
});
assert.throws(()=>machine.run(100000),/Independent original clock RET endpoint reached/);
assert.equal(apiCalls,1);assert.ok(Object.values(registerChecks).flat().every(row=>row.matched));
const comparisons={};
for(const[stage,snapshot]of[['counterCall',proof.counterCall],['counterReturn',proof.counterReturn],['returned',proof.returned]]){
  const details=inputs.semanticRegions.map(region=>{const expected=at(snapshot,region.id).bytes,actual=images[stage].get(region.id),differences=[];for(let i=0;i<expected.length;i++)if(actual[i]!==expected[i])differences.push({address:region.address+i,offset:i,instruction:actual[i],native:expected[i]});return {id:region.id,address:region.address,length:region.length,differingBytes:differences.length,differences};});
  comparisons[stage]={matched:details.every(r=>!r.differingBytes),bytesCompared:details.reduce((n,r)=>n+r.length,0),differingBytes:details.reduce((n,r)=>n+r.differingBytes,0),regions:details};
}
const nativeScale=proof.returned.context.subarray(364,372).toString('hex');assert.equal(proof.returned.context.readUInt32LE()&0x10020,0x10020);assert.equal(scaleBits,nativeScale);
assert.ok(comparisons.counterCall.matched);assert.ok(comparisons.returned.regions.filter(r=>r.id!=='race-clock-stack').every(r=>r.differingBytes===0));
const apiChanges=[];for(let p=l.stackAddress;p<l.stackAddress+540;p++)if(stackByte(proof.counterCall,p)!==stackByte(proof.counterReturn,p))apiChanges.push({address:p,before:stackByte(proof.counterCall,p),after:stackByte(proof.counterReturn,p),kind:p<l.frame-8?'private-api-stack':p<l.frame-4?'architectural-call-return':p>=l.outputAddress&&p<l.outputAddress+8?'counter-output':'other'});
const privateBytes=apiChanges.filter(row=>row.kind==='private-api-stack'),privateSet=new Set(privateBytes.map(row=>row.address)),ownWrites=new Set(),afterOwnWrites=new Set(),unresolvedPrivateReads=[];
for(const op of ledger)if(op.actor==='instruction'||op.actor==='architectural-call')for(let p=op.address;p<op.address+op.length;p++){
  if(op.kind==='write'){ownWrites.add(p);if(op.afterApi)afterOwnWrites.add(p);}
  if(op.kind==='read'&&op.afterApi&&privateSet.has(p)&&!afterOwnWrites.has(p))unresolvedPrivateReads.push({address:p,instructionAddress:op.instructionAddress,order:op.order});
}
assert.equal(unresolvedPrivateReads.length,0);
const nativeFinalByte=p=>{const row=inputs.semanticRegions.find(r=>p>=r.address&&p<r.address+r.length);assert.ok(row);return at(proof.returned,row.id).bytes[p-row.address];};
const mismatchingOwnWrites=[...ownWrites].filter(p=>physical.span(p,1)[0]!==nativeFinalByte(p));assert.equal(mismatchingOwnWrites.length,0);
const surviving=comparisons.returned.regions.flatMap(r=>r.differences);assert.ok(surviving.every(row=>privateSet.has(row.address)&&!afterOwnWrites.has(row.address)));
const numericalStates=[proof.entry,proof.counterCall,proof.counterReturn,proof.returned].map(s=>({ordinal:s.ordinal,cw:s.context.readUInt16LE(28),sw:s.context.readUInt16LE(32),mxcsr:s.context.readUInt32LE(228)}));
assert.ok(numericalStates.every(s=>s.cw===numericalStates[0].cw&&s.sw===numericalStates[0].sw&&s.mxcsr===numericalStates[0].mxcsr));assert.equal(machine.fpuControlWord,numericalStates[0].cw);
const runtimePins=['tools/lib/bounded-x86.mjs','tools/lib/native-race-clock-inputs.mjs','tools/lib/native-race-clock-capture.mjs','analysis/native-race-clock-stock-independent-numeric-v2-20261024.mjs'];
const report={schemaVersion:1,kind:'original-entry-retained-instruction-warm-clock-numeric-audit',targetSha256:program.targetSha256,transportVerified:true,inputDirectory:input,
  inputPins:{traceSha256:sha(traceBytes),configurationSha256:sha(configurationBytes),contexts:capture.snapshots.map(s=>({ordinal:s.ordinal,file:s.contextFile,sha256:s.contextSha256}))},
  moduleBaseAddress:base,ownerPid:proof.ownerPid,ownerMainTid:proof.ownerMainTid,layout:l,originalEntryOnly:true,initialMappedBytes:physical.mappedBytes,aliasesApplied:0,runtimePeDefaultsCopied:0,
  retainedInstructionEvidence:[...program.evidence,...parent.evidence.map(e=>e.evidence_id)],relocatedOperands,visitedInstructions:reached.size-1,instructionVisits:[...reached.values()].reduce((a,b)=>a+b,0)-1,children:Object.fromEntries([...children].map(([p,n])=>['0x'+p.toString(16),n])),
  api:{calls:apiCalls,iatTarget:qpc,outputAddress:l.outputAddress,bytesAdmitted:8,outputHex:observedCounter.toString('hex'),returnedBool:observedBool,extraGameOrPrivateBytesAdmitted:0,volatileEcxEdxAndAllXmmMadeUnknownAfterApi:true,noUnknownVolatileReadBeforeRealOverwrite:true,independentZeroIdioms},
  numeric:{instructionScaledHex:scaleBits,nativeFinalXmm0LowHex:nativeScale,scaledClockMatched:scaleBits===nativeScale,instructionScaleValue:proof.returned.context.readDoubleLE(364),instructionConvertedTargetLow:targetClock,instructionCount:machine.r.EAX>>>0,nativeCount:Number(proof.returned.registers.eax),returnedEip:base+0x50df0},
  registerChecks,numericalContext:{observed:numericalStates,instructionControlWord:machine.fpuControlWord,controlWordMatched:true,rawNativeStatesUnchanged:true,independentX87StatusAndSseStickyModel:false},
  strictComparisons:comparisons,strictWhole540Matched:comparisons.returned.matched,strictWhole540StillFalse:!comparisons.returned.matched,
  footprint:{events:ledger.length,instructionReads:ledger.filter(r=>r.actor==='instruction'&&r.kind==='read').length,instructionWrites:ledger.filter(r=>r.actor==='instruction'&&r.kind==='write').length,
    ownWrittenBytes:ownWrites.size,mismatchingFinalOwnWrittenBytes:mismatchingOwnWrites.length,privateApiChangedBytes:privateBytes.length,
    privateBytesOverwrittenByGenuineLaterGameStores:privateBytes.filter(r=>afterOwnWrites.has(r.address)).map(r=>r.address),
    remainingFinalPrivateDifferences:surviving.length,privateReadBeforeGenuineWrite:unresolvedPrivateReads,
    apiChanges,ledgerSha256:sha(Buffer.from(JSON.stringify(ledger))),ledger},
  filePins:await Promise.all(runtimePins.map(async path=>({path,sha256:sha(await readFile(path))}))),
  conclusion:'Independent original instruction replay matches clockvalue/count/counters/knownreturnABI from entry plus actualQPC8B/BOOL only. Everyremainingstrictdifference is unused survivingAPIprivate residue within this one observedgame interval; it is retained, not masked or copied. Full540-bytepostcallstate doesnotmatch.',
  limits:['No production clock/conversion function executed and no game-child answer hooks were supplied.','Only this closed warmcall is tested. No cadence, next parent tick, coldQPF or widerconcurrency proof.',
    'CompleteEFLAGS/volatileprivateABI and SSE/x87sticky-status computation are outside this interpreter proof; nativeCWSW/MXCSR areobserved separately.',
    'Private residue has no read-before-own-write in this observed441c70 tail. Future callers may consume it; no globalirrelevance or fullstateequivalence claim.'],productionEdits:0,nativeLaunches:0,newReaSessions:0};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,numeric:report.numeric,strictWhole540Matched:report.strictWhole540Matched,stageDifferences:Object.fromEntries(Object.entries(comparisons).map(([s,c])=>[s,c.differingBytes])),ownWrites:ownWrites.size,ownWriteMismatch:mismatchingOwnWrites.length,privateApiBytes:privateBytes.length,remainingPrivate:surviving.length,unresolvedPrivateReads:unresolvedPrivateReads.length}));
