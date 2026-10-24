//Own402d10/406b80 wrapper instructions only. String/map stand-ins deliberately
//isolate the parent ABI; their algorithm/private-stack equivalence is NOT proved.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {loadNativeRaceDispatchInstructionProgram} from './verify-native-race-dispatch-instructions.mjs';
import {runNativeViewportLookup,runNativeViewportEnable} from '../src/native-viewport-dispatch.mjs';
const put=(m,p,v)=>m.writeUInt32LE(v>>>0,p),hash=b=>createHash('sha256').update(b).digest('hex');
const S=0x18000,APP=0x1200000,RECORD=0x1300000,NAME=0x1310000,HEAP=0x1320000,OWNER=0x1330000;
const initial={ECX:APP,EBX:0x12345678,EBP:0x23456789,ESI:0x3456789a,EDI:0x456789ab,EAX:0x56789abc,EDX:0x6789abcd};
const nonvol=['EBX','EBP','ESI','EDI'];
export async function loadNativeViewportWrapperProgram(base){
  const p=await loadNativeRaceDispatchInstructionProgram(base),proof=await readInstructionEvidence(['3650-weather-402d10-procedure_assembly.json','13007-race-viewports-406b80-procedure_assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok(proof.evidence.every(e=>e.subject.digest.sha256===p.targetSha256));
  //Only image-range absolute literals/code operands relocate; small structural
  //offsets and FFFFFFFF remain raw. PE HIGHLOW loading itself is independently
  //checked by the shared parent loader before these exact wrapper listings.
  const instructions=proof.instructions.map(r=>({...r,address:p.actual(r.address),args:r.args.map(arg=>arg.replace(/0x[0-9a-f]+/gi,h=>{const n=Number(h);return n>=0x400000&&n<0xa00000?'0x'+p.actual(n).toString(16):h;}))}));
  const cookie=p.actual(0x568162),bytes=p.image.subarray(cookie,cookie+10);assert.equal(bytes[0],0x3b);assert.equal(bytes[1],0x0d);assert.equal(bytes.readUInt32LE(2),p.actual(0x5e8890));assert.equal(bytes.subarray(6).toString('hex'),'7502f3c3');
  //REP RET has ordinary RET architectural state. No unknown function body is
  //replaced: these three decoded instructions are pinned to original PE bytes.
  instructions.push({address:cookie,op:'CMP',args:['ECX',`dword ptr [0x${p.actual(0x5e8890).toString(16)}]`]},
    {address:cookie+6,op:'JNZ',args:['0x'+p.actual(0x56816c).toString(16)]},{address:cookie+8,op:'RET',args:[]});
  return {...p,instructions:instructions.sort((a,b)=>a.address-b.address),wrapperEvidence:proof.evidence.map(e=>e.evidence_id),cookieHelperBytesHex:bytes.toString('hex'),initializedLookupAddresses:proof.instructions.filter(r=>r.address>=0x402d10&&r.address<=0x402d38||r.address>=0x402d77&&r.address<=0x402d9d).map(r=>r.address),enableAddresses:proof.instructions.filter(r=>r.address>=0x406b80&&r.address<=0x406c6b).map(r=>r.address)};
}

function common(p,index){const m=Buffer.from(p.image),entry=S+(index&1)*4; m.fill(0x49^(index&31),entry-256,entry+32);put(m,entry,0xffffffff);put(m,p.actual(0x5e8890),index%3===0?0:index%3===1?0xbb40e64e:0xf1234567);put(m,p.actual(0x6efb38),APP);put(m,p.actual(0x56e470),0x1600010);put(m,p.actual(0x56e210),0x1600020);return {m,entry};}
function checkedRequest(request,expected,trace){const {runtime:r,args}=request;assert.equal(r.scratchBase,expected.entry);assert.equal(request.returnAddress,expected.returned);assert.equal(r.memory.readUInt32LE(expected.entry),expected.returned);assert.equal(r.nativeTls.sehWord,expected.seh);assert.deepEqual(args,expected.args);if(expected.ecx!==undefined)assert.equal(request.ecx,expected.ecx);trace.push({kind:expected.kind,entry:expected.entry,returned:expected.returned,args:[...args],ecx:expected.ecx,nonvolatile:Object.fromEntries(nonvol.map(k=>[k,request.entryRegisters[k]>>>0])),stackHex:r.memory.subarray(expected.entry,expected.entry+4+args.length*4).toString('hex')});}
function isolatedChildren(p,scenario,entry,trace){const F=entry-60,key=F+16;return {
  call405310(request){checkedRequest(request,{kind:'synthetic-string',entry:F-12,returned:p.actual(0x406bf8),seh:F+48,args:[request.args[0],scenario.nullName?0:scenario.length],ecx:key},trace);const m=request.runtime.memory,[source,length]=request.args;
    if(length>=16){put(m,key,HEAP);put(m,key+20,31);m.subarray(source,source+length).copy(m.subarray(HEAP,HEAP+length));m[HEAP+length]=0;}else{m.subarray(source,source+length).copy(m.subarray(key,key+length));m[key+length]=0;}
    put(m,key+16,length);if(scenario.enabledAfterString!==undefined)put(m,entry+8,scenario.enabledAfterString);
  },
  call404fa0(request){checkedRequest(request,{kind:'synthetic-map',entry:F-8,returned:p.actual(0x406c1d),seh:F+48,args:[key],ecx:APP+0x7c},trace);const m=request.runtime.memory;
    if(scenario.enabledAfterMap!==undefined)put(m,entry+8,scenario.enabledAfterMap);if(scenario.owner)put(m,F+40,OWNER);if(scenario.savedAlias)put(m,F+4,0xcafebabe);if(scenario.badCookie)put(m,F+44,m.readUInt32LE(F+44)^1);return RECORD;
  }
};}

export async function verifyNativeViewportDispatchInstructions({output,bases=[0x400000,0x320000,0x730000]}={}){
  assert.ok(bases.length>0&&new Set(bases).size===bases.length);let lookupCases=0,enableCases=0,unknownEaxCases=0,initializedLookupAddresses,enableAddresses;const wrapperVisits=new Set(),examples=[],cookieProof=[];
  const scenarios=[];for(const length of [0,1,15,16,17])for(const enabled of [0,1,2,0xffffffff])scenarios.push({label:`length${length}-enabled${enabled}`,length,enabled});
  scenarios.push({label:'null-name',length:0,enabled:1,nullName:true},{label:'enabled-late-string',length:16,enabled:0,enabledAfterString:1},{label:'enabled-latched-map',length:15,enabled:1,enabledAfterMap:0},{label:'owner-delete-array',length:15,enabled:1,owner:true},{label:'both-frees',length:16,enabled:2,owner:true},{label:'live-saved-edi',length:1,enabled:1,savedAlias:true});
  for(const base of bases){const p=await loadNativeViewportWrapperProgram(base);initializedLookupAddresses=p.initializedLookupAddresses;enableAddresses=p.enableAddresses;cookieProof.push({base,bytesHex:p.cookieHelperBytesHex,evidence:p.wrapperEvidence});
    const code=p.instructions;
    for(let i=0;i<4;i++){
      const f=common(p,i),m=f.m,entry=f.entry,argsExpected=[APP,0,p.actual(0x6e213c),p.actual(0x6e20a4),0],tls={sehWord:0x77ffe000},sourceTrace=[];put(m,entry+4,0x11223344);put(m,entry+8,0x55667788);
      const oracle=new BoundedX86(code,{entry:p.actual(0x402d10)});oracle.bytes=Buffer.from(m);Object.assign(oracle.r,Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v|0])),{ESP:entry});oracle.fs0=tls.sehWord;
      const returned=i===0?0:APP+i*16;
      oracle.externalCalls.set(p.actual(0x56932a),cpu=>{const call=cpu.r.ESP-4;put(cpu.bytes,call,p.actual(0x402d8b));assert.deepEqual(Array.from({length:5},(_,n)=>cpu.bytes.readUInt32LE(call+4+n*4)),argsExpected);assert.equal(cpu.fs0,entry-12);cpu.r.EAX=returned;cpu.r.ECX=0x7a7a7a7a;cpu.r.EDX=0x6b6b6b6b;});
      oracle.onInstruction=at=>wrapperVisits.add(at-base+0x400000);
      const source=runNativeViewportLookup({memory:m,moduleBaseAddress:base,scratchBase:entry,entryRegisters:initial,nativeTls:tls,services:{libraryCall(name,args,child){assert.equal(name,'__RTDynamicCast');assert.deepEqual(args,argsExpected);assert.equal(child.scratchBase,entry-44);assert.equal(m.readUInt32LE(entry-44),p.actual(0x402d8b));assert.equal(tls.sehWord,entry-12);sourceTrace.push({name,args});return returned;}}});oracle.run();
      assert.deepEqual(m,oracle.bytes);assert.equal(tls.sehWord,oracle.fs0);for(const[k,v]of Object.entries(source.registers)){const expected=k==='esp'?oracle.r.ESP+4:k==='eip'?oracle.bytes.readUInt32LE(oracle.r.ESP):oracle.r[k.toUpperCase()]>>>0;assert.equal(v,expected,`lookup ${k}`);}assert.equal(source.registers.ecx,(m.readUInt32LE(p.actual(0x5e8890))^(entry-16))>>>0);assert.equal(source.transitivePrivateAbiComplete,false);lookupCases++;
    }
    for(const[index,scenario]of scenarios.entries()){
      const f=common(p,index+4),m=f.m,entry=f.entry,F=entry-60,tls={sehWord:0x77ffe000};m.fill(0x50,NAME,NAME+scenario.length);m[NAME+scenario.length]=0;put(m,entry+4,scenario.nullName?0:NAME);put(m,entry+8,scenario.enabled);
      const sourceTrace=[],oracleTrace=[],sourceChildren=isolatedChildren(p,scenario,entry,sourceTrace),oracleChildren=isolatedChildren(p,scenario,entry,oracleTrace),external=[];
      const source=runNativeViewportEnable({memory:m,moduleBaseAddress:base,scratchBase:entry,entryRegisters:initial,nativeTls:tls,calls:sourceChildren,handlers:{free(pointer,child){assert.equal(pointer,HEAP);assert.equal(child.scratchBase,F-8);assert.equal(m.readUInt32LE(F-8),p.actual(0x406c4b));external.push('string');}},services:{libraryCall(name,args,child){assert.equal(name,'operatorDeleteArray');assert.deepEqual(args,[OWNER]);assert.equal(child.scratchBase,F-8);assert.equal(m.readUInt32LE(F-8),p.actual(0x406c2f));external.push('array');}}});
      const oracle=new BoundedX86(code,{entry:p.actual(0x406b80)});
      //Fresh declared inputs, independent of every source output byte.
      const original=common(p,index+4).m;original.fill(0x50,NAME,NAME+scenario.length);original[NAME+scenario.length]=0;put(original,entry+4,scenario.nullName?0:NAME);put(original,entry+8,scenario.enabled);oracle.bytes=original;
      Object.assign(oracle.r,Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v|0])),{ESP:entry});oracle.fs0=0x77ffe000;
      for(const[target,name,ret,clean]of [[0x405310,'call405310',0x406bf8,8],[0x404fa0,'call404fa0',0x406c1d,4]])oracle.externalCalls.set(p.actual(target),cpu=>{const entryEsp=cpu.r.ESP-4;put(cpu.bytes,entryEsp,p.actual(ret));const args=Array.from({length:clean/4},(_,n)=>cpu.bytes.readUInt32LE(entryEsp+4+n*4));const result=oracleChildren[name]({runtime:{memory:cpu.bytes,scratchBase:entryEsp,nativeTls:{get sehWord(){return cpu.fs0;}}},args,ecx:cpu.r.ECX>>>0,edx:cpu.r.EDX>>>0,entryRegisters:Object.fromEntries(nonvol.map(k=>[k,cpu.r[k]>>>0])),returnAddress:p.actual(ret)});if(result!==undefined)cpu.r.EAX=result|0;else cpu.r.EAX=0x13579bdf;cpu.r.ECX=0x77777777;cpu.r.EDX=0x66666666;cpu.r.ESP+=clean;});
      oracle.externalCalls.set(0x1600010,cpu=>{put(cpu.bytes,cpu.r.ESP-4,p.actual(0x406c2f));assert.equal(cpu.bytes.readUInt32LE(cpu.r.ESP),OWNER);cpu.r.EAX=0xdeadbeef|0;});
      oracle.externalCalls.set(0x1600020,cpu=>{put(cpu.bytes,cpu.r.ESP-4,p.actual(0x406c4b));assert.equal(cpu.bytes.readUInt32LE(cpu.r.ESP),HEAP);cpu.r.EAX=0xabcdef12|0;});
      oracle.onInstruction=at=>wrapperVisits.add(at-base+0x400000);oracle.run();assert.deepEqual(sourceTrace,oracleTrace);assert.deepEqual(m,oracle.bytes);assert.equal(tls.sehWord,oracle.fs0);
      for(const[k,v]of Object.entries(source.registers)){const expected=k==='esp'?oracle.r.ESP+12:k==='eip'?oracle.bytes.readUInt32LE(oracle.r.ESP):oracle.r[k.toUpperCase()]>>>0;assert.equal(v,expected,`${scenario.label} ${k}`);}if(source.eax===undefined)unknownEaxCases++;assert.equal(source.registers.ecx,m.readUInt32LE(p.actual(0x5e8890)));assert.equal(source.enabled,(scenario.enabledAfterString??scenario.enabled)===1);assert.equal(m[RECORD+0x34],source.enabled?1:0);enableCases++;
      if(base===bases[0]&&['enabled-late-string','enabled-latched-map','both-frees','live-saved-edi'].includes(scenario.label))examples.push({label:scenario.label,enabled:source.enabled,registers:source.registers,external,scope:source.scope});
    }
  }
  const coverage={initializedLookupInstructions:initializedLookupAddresses.length,initializedLookupReached:initializedLookupAddresses.filter(a=>wrapperVisits.has(a)).length,enableInstructions:enableAddresses.length,enableReached:enableAddresses.filter(a=>wrapperVisits.has(a)).length};assert.equal(coverage.initializedLookupReached,coverage.initializedLookupInstructions);assert.equal(coverage.enableReached,coverage.enableInstructions);
  const report={schemaVersion:1,matched:true,targetSha256:'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5',authority:'constructed-owned-wrapper-instructions-with-isolated-synthetic-string-map-children',bases,lookupCases,enableCases,unknownEaxCases,wrapperInstructionsReached:wrapperVisits.size,coverage,cookieProof,examples,sourceSha256:hash(await readFile(new URL('../src/native-viewport-dispatch.mjs',import.meta.url))),limits:['Only initialized nonnull402d10 path; cold bootstrap remains a reached unclosed ABI.','406b80 own frames/control/cookies/SEH/pops are compared with synthetic405310/404fa0 outcomes; their transitive private ABI and real allocation/string/map instructions remain unclosed.','CRT dynamicCast EAX and free outcomes are explicitly declared constructed services, not native original-process observations.','Unknown EAX after voidfree and other unproven volatile registers are omitted, never filled from a native result.']};if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){console.log(JSON.stringify(await verifyNativeViewportDispatchInstructions({output:process.argv[2]})));}
