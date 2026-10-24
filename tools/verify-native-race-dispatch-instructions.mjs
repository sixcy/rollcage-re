//450d60 parent CONTROL fixtures only. The six child stand-ins below are
//explicitly synthetic; this does not execute or prove their game algorithms.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const children={call402d10:0x402d10,call406b80:0x406b80,call441c70:0x441c70,call44f3a0:0x44f3a0,call477730:0x477730,call450e50:0x450e50};
const sites=new Map([[0x450d9a,0x450d9f],[0x450da1,0x450da6],[0x450ddf,0x450de4],[0x450de6,0x450deb],[0x450deb,0x450df0],[0x450e01,0x450e06],[0x450e21,0x450e26],[0x450e33,0x450e38]]);
const nonvolatile=['EBX','EBP','ESI','EDI'];
const fieldSpans=[[0x91ce90,4],[0x5ecb1c,4],[0x5ecefc,4],[0x6e6b4c,4],[0x6e675c,4]];
const session1=0x1200000,session2=0x1210000,config1=0x1220000,config2=0x1230000;
const opaqueViews=[0x1240000,0x1240100];
const put=(m,p,v)=>m.writeUInt32LE(v>>>0,p);
const digest=b=>createHash('sha256').update(b).digest('hex');

export async function loadNativeRaceDispatchInstructionProgram(base=0x400000,{target='C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'}={}) {
  assert.ok(Number.isInteger(base)&&base>=0x100000&&base<=0x800000);
  const file=await readFile(target);assert.equal(digest(file),REDUX_SHA256);
  const pe=file.readUInt32LE(60),optional=pe+24,preferred=file.readUInt32LE(optional+28),delta=base-preferred;
  assert.equal(preferred,0x400000);assert.equal(file.readUInt16LE(optional),0x10b);
  const image=Buffer.alloc(0x1800000);
  for(let i=0;i<file.readUInt16LE(pe+6);i++) {const row=optional+file.readUInt16LE(pe+20)+i*40,start=file.readUInt32LE(row+20),length=file.readUInt32LE(row+16);file.copy(image,base+file.readUInt32LE(row+12),start,start+length);}
  const relocations=new Map(),relocationAddress=base+file.readUInt32LE(optional+136),relocationEnd=relocationAddress+file.readUInt32LE(optional+140);
  for(let p=relocationAddress;p<relocationEnd;) {const page=image.readUInt32LE(p),length=image.readUInt32LE(p+4);assert.ok(length>=8&&p+length<=relocationEnd);for(let j=8;j<length;j+=2){const item=image.readUInt16LE(p+j);if(!(item>>>12))continue;assert.equal(item>>>12,3);const address=base+page+(item&4095),value=image.readUInt32LE(address);relocations.set(preferred+page+(item&4095),value);put(image,address,value+delta);}p+=length;}
  const proof=await readInstructionEvidence(['001-frame-parent.json'],{directory:'analysis/physics-clock-elevated-20261022/results'});
  const childAbi=await readInstructionEvidence(['3650-weather-402d10-procedure_assembly.json','13007-race-viewports-406b80-procedure_assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok([...proof.evidence,...childAbi.evidence].every(e=>e.subject.digest.sha256===REDUX_SHA256));
  assert.deepEqual(childAbi.instructions.find(r=>r.address===0x402d9d),{address:0x402d9d,op:'RET',args:[]});
  const setterReturn=childAbi.instructions.find(r=>r.address>=0x406b80&&r.address<0x406c80&&r.op==='RET'&&r.args[0]==='0x8');
  assert.ok(setterReturn,'406b80 owns RET8');assert.equal(image[base+0x2d9d],0xc3);
  assert.equal(image.subarray(base+setterReturn.address-0x400000,base+setterReturn.address-0x400000+3).toString('hex'),'c20800');
  const original=proof.instructions,actual=p=>p+delta;
  const instructions=original.map((r,i)=>{const args=[...r.args],length=Math.min(15,(original[i+1]?.address??r.address+1)-r.address);
    for(let offset=0;offset+4<=length;offset++){const value=relocations.get(r.address+offset);if(value===undefined)continue;const hits=[];for(const[index,arg]of args.entries())for(const h of arg.matchAll(/0x[0-9a-f]+/gi))if(Number(h[0])===value)hits.push({index,text:h[0]});assert.equal(hits.length,1,'Original HIGHLOW must identify one fixed instruction operand');const hit=hits[0];args[hit.index]=args[hit.index].replace(hit.text,'0x'+actual(value).toString(16));}
    if((r.op==='CALL'||r.op.startsWith('J'))&&args.length===1&&/^0x[0-9a-f]+$/i.test(args[0]))args[0]='0x'+actual(Number(args[0])).toString(16);
    return {...r,address:actual(r.address),args};});
  return {base,image,instructions,actual,originalInstructions:original,targetSha256:REDUX_SHA256,evidence:[...proof.evidence,...childAbi.evidence].map(e=>e.evidence_id)};
}

export function nativeRaceDispatchScenarios() {
  const out=[];
  for(const flags of [0,2,4,6])for(const participants of [0,1,255])for(const phase of [-1,4,7])for(const rear of [0,1,255])out.push({label:`views-${flags}-${participants}-${phase}-${rear}`,flags,participants,phase,rear,foreground:0,background:0,scheduled:2,ticks:[1,7],pause:0});
  for(const foreground of [0,1,2,0xffffffff])for(const background of [0,1,0xffffffff])for(const pause of [0,1])out.push({label:`route-${foreground}-${background}-${pause}`,flags:4,participants:0,phase:4,rear:1,foreground,background,pause,scheduled:3,ticks:[7,0]});
  for(const scheduled of [0,1,2,3,0x80000000,0xffffffff])for(const early of [false,true])out.push({label:`count-${scheduled}-${early}`,flags:4,participants:0,phase:4,rear:1,foreground:early?1:0,background:0,pause:0,scheduled,ticks:scheduled<=3?Array.from({length:scheduled},(_,i)=>i===scheduled-1?0xffffffff:1):[0],sample:0xfffffffe});
  out.push(
    {label:'reread-view-flags',flags:4,participants:0,phase:4,rear:1,scheduled:1,ticks:[1],mutateViews:'flags'},
    {label:'reread-view-session-config-roots',flags:4,participants:1,phase:7,rear:0,scheduled:1,ticks:[1],mutateViews:'roots'},
    {label:'background-read-after-clock',flags:4,participants:0,phase:4,rear:1,scheduled:2,ticks:[1,1],backgroundAtClock:1,pause:1},
    {label:'background-latched-across-attachments',flags:4,participants:0,phase:4,rear:1,scheduled:2,ticks:[1,1],background:1,backgroundAtAttachments:0,pause:1},
    {label:'foreground-latched-across-attachments',flags:4,participants:0,phase:4,rear:1,scheduled:2,ticks:[1,1],foreground:1,backgroundAtAttachments:1,pause:0},
    {label:'live-parent-saved-word',flags:4,participants:0,phase:4,rear:1,scheduled:2,ticks:[1,1],mutateSaved:true});
  return out.map(s=>({foreground:0,background:0,pause:0,sample:17,...s}));
}

function fixture(program,scenario,index) {
  const memory=Buffer.from(program.image),{actual}=program,O=0x18000+(index&1)*4;
  memory.fill(0x39^(index&31),O-128,O+32);put(memory,O,0xffffffff);
  put(memory,actual(0x91ce90),scenario.flags);put(memory,actual(0x5ecb1c),session1);put(memory,actual(0x5ecefc),config1);put(memory,actual(0x6e6b4c),scenario.background);put(memory,actual(0x6e675c),scenario.sample);
  for(const s of [session1,session2]){memory[s+0x552]=s===session1?scenario.participants:0;put(memory,s+0x57c,s===session1?scenario.phase:4);}memory[config1+0x25]=scenario.rear;memory[config2+0x25]=1;
  const spans=[...fieldSpans.map(([p,length])=>({address:actual(p),length})),{address:actual(0x570244),length:17},{address:actual(0x570258),length:17},{address:O-128,length:160},...[session1,session2].map(address=>({address,length:0x580})),...[config1,config2].map(address=>({address,length:128}))];
  const source=createCapturedMemory(spans.map(({address,length},i)=>({id:'constructed-fixture-'+i,address,length,bytes:Buffer.from(memory.subarray(address,address+length))})),{aliases:fieldSpans.filter(([p])=>actual(p)!==p).map(([address,length])=>({address,targetAddress:actual(address),length}))});
  const entryRegisters={ECX:scenario.foreground>>>0,EBX:0x12345678,EBP:0x23456789,ESI:0x3456789a,EDI:0x456789ab};
  return {memory,source,spans,O,entryRegisters};
}

function standIns(program,scenario,O,trace) {
  let view=0,setters=0,tick=0;
  return Object.fromEntries(Object.entries(children).map(([name,entry])=>[name,request=>{
    const m=request.runtime.memory,C=request.runtime.scratchBase,args=request.args,actual=program.actual;
    assert.equal(request.targetAddress,actual(entry));assert.equal(m.readUInt32LE(C),request.returnAddress);
    assert.ok(Array.isArray(args));
    const known=Object.fromEntries(nonvolatile.map(r=>{const n=request.entryRegisters?.[r];assert.ok(Number.isInteger(n),`${name} actual ${r}`);return[r,n>>>0];}));
    let expectedReturn,expectedEsp=O-24;
    if(name==='call402d10'){expectedReturn=actual(view===0?0x450d9f:0x450de4);expectedEsp=O-32;assert.deepEqual(args,[actual(view===0?0x570258:0x570244),m.readUInt32LE(C+8)]);assert.equal(m.readUInt32LE(C+4),args[0]);}
    if(name==='call406b80'){expectedReturn=actual(setters===0?0x450da6:0x450deb);expectedEsp=O-32;assert.equal(request.ecx,opaqueViews[setters]);assert.equal(m.readUInt32LE(C+4),actual(setters===0?0x570258:0x570244));assert.deepEqual(args,[m.readUInt32LE(C+4),m.readUInt32LE(C+8)]);}
    if(name==='call441c70'){expectedReturn=actual(0x450df0);assert.deepEqual(args,[]);}
    if(name==='call44f3a0'){expectedReturn=actual(0x450e06);assert.deepEqual(args,[]);}
    if(name==='call477730'){expectedReturn=actual(0x450e26);assert.equal(request.ecx,0);assert.deepEqual(args,[]);}
    if(name==='call450e50'){expectedReturn=actual(0x450e38);expectedEsp=O-28;assert.equal(request.edx,tick);assert.deepEqual(args,[scenario.scheduled>>>0]);assert.equal(m.readUInt32LE(C+4),scenario.scheduled>>>0);assert.ok(tick<scenario.ticks.length,'Unexpected extra synthetic tick demand');}
    assert.equal(C,expectedEsp);assert.equal(request.returnAddress,expectedReturn);
    trace.push({name,entryEsp:C,returnAddress:request.returnAddress,args:[...args],nonvolatiles:known,...(name==='call406b80'||name==='call477730'?{ecx:request.ecx>>>0}:{}),...(name==='call450e50'?{edx:request.edx>>>0}:{}),stackHex:m.subarray(C,C+(name==='call402d10'||name==='call406b80'?12:name==='call450e50'?8:4)).toString('hex')});
    if(name==='call402d10')return opaqueViews[view++];
    if(name==='call406b80'){
      setters++;if(setters===1&&scenario.mutateViews==='flags')put(m,actual(0x91ce90),2);
      if(setters===1&&scenario.mutateViews==='roots'){put(m,actual(0x5ecb1c),session2);put(m,actual(0x5ecefc),config2);}
      if(setters===1&&scenario.mutateSaved)put(m,O-20,0xcafebabe);return;
    }
    if(name==='call441c70'){if(scenario.backgroundAtClock!==undefined)put(m,actual(0x6e6b4c),scenario.backgroundAtClock);return scenario.scheduled>>>0;}
    if(name==='call44f3a0'){if(scenario.backgroundAtAttachments!==undefined)put(m,actual(0x6e6b4c),scenario.backgroundAtAttachments);return;}
    if(name==='call477730')return scenario.pause>>>0;
    return scenario.ticks[tick++]>>>0;
  }]));
}

export async function verifyNativeRaceDispatchInstructions({output,bases=[0x400000,0x320000,0x730000],scenarios=nativeRaceDispatchScenarios()}={}) {
  const {runNativeRaceDispatch}=await import('../src/native-race-dispatch.mjs');
  assert.ok(Array.isArray(bases)&&bases.length>0&&bases.length<=16&&new Set(bases).size===bases.length,'Nonempty bounded distinct actual image bases');
  assert.ok(scenarios.length>0&&scenarios.length<=500);const reached=new Set(),branchCounts={},examples=[],inputEvidence=[];let parentInstructionCount;let fixtures=0,childCalls=0;
  for(const base of bases){const program=await loadNativeRaceDispatchInstructionProgram(base),machine=new BoundedX86(program.instructions,{entry:program.actual(0x450d60)});let currentSite,lastRet;parentInstructionCount=program.originalInstructions.length;inputEvidence.push({base,evidence:program.evidence});
    machine.onInstruction=at=>{const preferred=at-base+0x400000;reached.add(preferred);branchCounts['0x'+preferred.toString(16)]=(branchCounts['0x'+preferred.toString(16)]??0)+1;if(sites.has(preferred))currentSite=preferred;if(preferred===0x450e1e||preferred===0x450e4d)lastRet=preferred;};
    for(const [index,scenario] of scenarios.entries()){
      const f=fixture(program,scenario,index),sourceTrace=[],oracleTrace=[],calls=standIns(program,scenario,f.O,sourceTrace),instructionCalls=standIns(program,scenario,f.O,oracleTrace);
      machine.reset();machine.bytes=Buffer.from(f.memory);Object.assign(machine.r,Object.fromEntries(Object.entries(f.entryRegisters).map(([k,v])=>[k,v|0])),{ESP:f.O});
      for(const[name,target]of Object.entries(children))machine.externalCalls.set(program.actual(target),m=>{
        const entryEsp=m.r.ESP-4,returnAddress=program.actual(sites.get(currentSite));put(m.bytes,entryEsp,returnAddress);
        const args=name==='call402d10'||name==='call406b80'?[m.bytes.readUInt32LE(entryEsp+4),m.bytes.readUInt32LE(entryEsp+8)]:name==='call450e50'?[m.bytes.readUInt32LE(entryEsp+4)]:[];
        const result=instructionCalls[name]({runtime:{memory:m.bytes,scratchBase:entryEsp,moduleBaseAddress:base},targetAddress:program.actual(target),returnAddress,args,ecx:m.r.ECX>>>0,edx:m.r.EDX>>>0,entryRegisters:Object.fromEntries(nonvolatile.map(r=>[r,m.r[r]>>>0]))});
        if(result!==undefined)m.r.EAX=result|0;if(name==='call406b80')m.r.ESP+=8;
      });
      let source;try{source=runNativeRaceDispatch({memory:f.source.memory,moduleBaseAddress:base,scratchBase:f.O,entryRegisters:f.entryRegisters,calls});machine.run(20000);}catch(error){error.message+=`\nSynthetic parent-control ${scenario.label},base0x${base.toString(16)}`;throw error;}
      assert.deepEqual(sourceTrace,oracleTrace,`${scenario.label}: child control/stack transport`);
      const ticks=oracleTrace.filter(c=>c.name==='call450e50');assert.equal(source.iterations,ticks.length);assert.equal(source.successfulIterations,scenario.ticks.slice(0,ticks.length).filter(n=>n!==0).length);assert.equal(source.scheduledCount,scenario.scheduled>>>0);assert.equal(source.route,lastRet===0x450e1e?'sample-only':ticks.length?'physics':'no-ticks');
      assert.equal(source.eax>>>0,machine.r.EAX>>>0);assert.ok(source.registers);
      for(const[name,value]of Object.entries(source.registers)){assert.ok(['eax','ecx','ebx','ebp','esi','edi','esp','eip'].includes(name),'No inferred volatile/private register equality');const expected=name==='esp'?machine.r.ESP+4:name==='eip'?machine.bytes.readUInt32LE(machine.r.ESP):machine.r[name.toUpperCase()]>>>0;assert.equal(value>>>0,expected>>>0,`${scenario.label}: live ${name}`);}
      assert.equal(Object.keys(source.registers).length,8,'All known parent return fields');
      const projected=Buffer.from(f.memory);for(const span of f.spans)f.source.span(span.address,span.length).copy(projected,span.address);if(!projected.equals(machine.bytes)){const at=projected.findIndex((v,i)=>v!==machine.bytes[i]);assert.fail(`${scenario.label}: actualbyte0x${at.toString(16)} source${projected[at]} original${machine.bytes[at]}`);}
      fixtures++;childCalls+=sourceTrace.length;if(base===bases[0]&&scenario.label.startsWith('reread-')||base===bases[0]&&['background-read-after-clock','background-latched-across-attachments','foreground-latched-across-attachments','live-parent-saved-word'].includes(scenario.label))examples.push({label:scenario.label,eax:source.eax,iterations:source.iterations,calls:sourceTrace.map(c=>({name:c.name,args:c.args,ecx:c.ecx,edx:c.edx})),sample:f.source.memory.readUInt32LE(program.actual(0x6e675c)),returned:source.registers});
    }
  }
  const report={schemaVersion:1,matched:true,targetSha256:REDUX_SHA256,authority:'constructed-parent-control-fixtures-with-synthetic-in-image-child-outcomes',method:'Only retained450d60 executes in the instruction oracle; all6childcallbacks are explicitly synthetic and isolated to this comparison. Production default children and original-process behavior are not proved.',bases,scenarios:scenarios.length,fixtures,childCalls,parentInstructions:parentInstructionCount,parentInstructionsReached:reached.size,branchCounts,inputEvidence,sourceModuleSha256:digest(await readFile(new URL('../src/native-race-dispatch.mjs',import.meta.url))),declaredSyntheticScenarios:scenarios,stack:{bytesBefore:128,bytesAfter:32,knownReturnFields:8,sourceUsesDeclaredSparseFixtureSpans:true,wholeFixtureProjectionCompared:true},examples,limits:['No full-child equivalence, native process, clock scheduling or continuous tick claim.','Synthetic child outcomes/mutations are declared fixture inputs; no in-image answer callback is added to production defaults.','Only parent-defined/known return registers and published CALL arguments/saves are compared; volatileEDX/EFLAGS/unknown child-clobbered state remains unproved.','Opaque viewport pointers are passed between stand-ins; no fake viewport object storage or allocator result is admitted.']};
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const[output]=process.argv.slice(2);console.log(JSON.stringify(await verifyNativeRaceDispatchInstructions({output})));}
