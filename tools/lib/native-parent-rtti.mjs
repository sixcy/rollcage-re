//Typed external MSVCR120!__RTDynamicCast boundary only. No game object,
//viewport map, allocation, or intermediate native memory is supplied.
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativeParentRttiSites=Object.freeze([
  Object.freeze({id:'native-parent-rtti-call',preferredAddress:0x402d86}),
  Object.freeze({id:'native-parent-rtti-return',preferredAddress:0x402d8b}),
]);
export function nativeParentRttiObservationRanges(){return [
  {id:'native-parent-rtti-context',baseRegister:'esp',length:52},
  {id:'native-parent-rtti-camera-return',baseRegister:'esp',offset:256,length:4},
  {id:'native-parent-rtti-clock',rva:'0x50a548',length:4},
];}
const uint=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw Error(`Native parent RTTI requires actual32-bit ${label}.`);return n;};
const order=row=>{const n=row?.observedDebugEventOrdinal;if(!Number.isSafeInteger(n)||n<1)throw Error('Native parent RTTI requires original event ordering.');return n;};
const authenticatedServices=new WeakSet();
export function assertNativeParentRttiService(service){if(!authenticatedServices.has(service))throw Error('Parent tail accepts only the authenticated typed CRT dynamicCast binding.');}
const range=(row,id,address,length)=>{const part=row.ranges instanceof Map?row.ranges.get(id):row.ranges?.find(x=>x.id===id);if(!part||Number(part.address)!==address||part.bytes.length!==length)throw Error(`Native parent RTTI ${id} address/length differs.`);return part.bytes;};

export async function verifyNativeParentRttiEvidence(){
  const importAuditPath='analysis/native-parent-rtti-import-identity-20261023.json';
  const importBytes=await readFile(importAuditPath),importSha256=createHash('sha256').update(importBytes).digest('hex'),importAudit=JSON.parse(importBytes);
  if(importSha256!=='4527fe82d302cd3d108b3430de1d6cc442b08df45a6f83e119eb802212c78fc9'||importAudit.targetSha256!==REDUX_SHA256
    ||importAudit.call?.preferredAddress!==0x402d86||importAudit.call.bytesHex!=='e89f651600'||importAudit.call.targetPreferredAddress!==0x56932a
    ||importAudit.thunk?.preferredAddress!==0x56932a||importAudit.thunk.bytesHex!=='ff25c4e45600'||importAudit.thunk.iatPreferredAddress!==0x56e4c4
    ||importAudit.iat?.preferredAddress!==0x56e4c4||importAudit.importIdentity?.dll!=='MSVCR120.dll'||importAudit.importIdentity.name!=='__RTDynamicCast')throw Error('Native parent RTTI original PE import identity differs.');
  const proof=await readInstructionEvidence(['310-race-step-parent-assembly.json','3650-weather-402d10-procedure_assembly.json','3507-view-stage-4180a0-assembly.json'],{directory:'analysis/native-simulation/results'});
  for(const[file,address,disassembly]of [['4482-camera-mode-41a0b9.json',0x41a0b9,'LEA EAX,[ESP + 0xa4]'],['4513-camera-mode-41a0c0.json',0x41a0c0,'PUSH 0x1'],['4543-camera-mode-41a0c2.json',0x41a0c2,'PUSH EAX'],['4571-camera-mode-41a0c3.json',0x41a0c3,'CALL 0x00402d10']]){
    const outer=JSON.parse(await readFile(`analysis/native-simulation/results/${file}`)),caller=outer.structuredContent??JSON.parse(outer.content[0].text);
    if(caller.subject?.digest?.sha256!==REDUX_SHA256||Number(caller.raw_result?.address)!==address||caller.raw_result?.raw_disassembly!==disassembly)throw Error('Native RTTI common camera caller differs.');
    proof.evidence.push(caller);
  }
  proof.instructions.push({address:0x41a0c3,op:'CALL',args:['0x00402d10']});
  if(proof.evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Native RTTI evidence target differs.');
  const rows=new Map(proof.instructions.map(row=>[row.address,row]));
  for(const [address,op,args]of [[0x451102,'CALL',['0x004180a0']],[0x4180a0,'SUB',['ESP','0xbc']],[0x41a0c3,'CALL',['0x00402d10']],[0x402d77,'PUSH',['0x0']],[0x402d79,'PUSH',['0x6e20a4']],[0x402d7e,'PUSH',['0x6e213c']],[0x402d83,'PUSH',['0x0']],[0x402d85,'PUSH',['EAX']],[0x402d86,'CALL',['0x0056932a']],[0x402d8b,'ADD',['ESP','0x14']]]){
    const row=rows.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Native RTTI instruction differs at0x${address.toString(16)}.`);
  }
  return {targetSha256:REDUX_SHA256,evidenceIds:proof.evidence.map(row=>row.evidence_id),staticImportIdentity:{auditPath:importAuditPath,sha256:importSha256,
    dll:importAudit.importIdentity.dll,name:importAudit.importIdentity.name,iatPreferredAddress:importAudit.iat.preferredAddress,runtimeResolvedIdentityProved:false}};
}

//The named source option is a typed CRT service. Preferred source type tokens
//are explicitly converted to actual module arguments at this boundary.
//Current support is ONLY4180a0's common41a0c3 caller; other depths must fail.
export function createNativeParentRttiBindings({capture,pair,memory,initialSpan,moduleBaseAddress=pair?.moduleBaseAddress}={}){
  if(!capture||!pair||!memory||typeof initialSpan!=='function')throw Error('Native parent RTTI requires captured lineage and original input coverage.');
  const base=uint(moduleBaseAddress,'module base'),U=uint(pair.before.registers.esp,'parent entry ESP'),S=U-20,R=S-216,Q=R-40;
  const actual=p=>nativeCodeAddress(p,{moduleBaseAddress:base}),tid=pair.before.tid;
  const begin=pair.postphysics?.auxiliary,end=pair.postphysics?.cameras;
  const events=[],records=[];let index=0;
  const candidates=capture.snapshots.filter(row=>nativeParentRttiSites.some(site=>row.breakpointId===site.id));
  //Absence remains an explicit reached service failure, including saved V6.
  if(candidates.length){
    if(!begin||!end)throw Error('Native parent RTTI requires enclosing auxiliary/cameras checkpoints.');
    if(order(begin)<=order(pair.before)||order(end)<=order(begin)||begin.tid!==tid||end.tid!==tid)throw Error('Native parent RTTI enclosing parent order/thread differs.');
    const selected=candidates.filter(row=>row.tid===tid&&order(row)>order(begin)&&order(row)<order(end));
    for(let i=1;i<selected.length;i++)if(order(selected[i])<=order(selected[i-1]))throw Error('Native parent RTTI observation sequence is not strictly ordered.');
    for(let i=0;i<selected.length;i+=2){
      const before=selected[i],after=selected[i+1];
      if(!after||before.breakpointId!=='native-parent-rtti-call'||after.breakpointId!=='native-parent-rtti-return'||order(before)>=order(after))throw Error('Native parent RTTI requires ordered external call/return pairs.');
      for(const[row,address]of [[before,0x402d86],[after,0x402d8b]]){
        if(uint(row.registers.eip,'EIP')!==actual(address)||uint(row.registers.esp,'ESP')!==Q)throw Error('Native parent RTTI caller address/ESP differs from the recovered common camera path.');
        const context=range(row,'native-parent-rtti-context',Q,52);
        if(context.readUInt32LE(40)!==actual(0x41a0c8)||context.readUInt32LE(44)!==1||context.readUInt32LE(48)!==S-40||range(row,'native-parent-rtti-camera-return',S,4).readUInt32LE()!==actual(0x451107))throw Error('Native parent RTTI enclosing camera return/arguments differ.');
        if(range(row,'native-parent-rtti-clock',actual(0x90a548),4).readUInt32LE()!==pair.logicalClock)throw Error('Native parent RTTI logical clock differs.');
      }
      const input=range(before,'native-parent-rtti-context',Q,52).subarray(0,20),returned=range(after,'native-parent-rtti-context',Q,52).subarray(0,20);
      if(!input.equals(returned))throw Error('Native parent RTTI external arguments changed across its call.');
      const args=Array.from({length:5},(_,i)=>input.readUInt32LE(i*4));
      if(args[1]!==0||args[2]!==actual(0x6e213c)||args[3]!==actual(0x6e20a4)||args[4]!==0)throw Error('Native parent RTTI actual type arguments differ.');
      const eax=uint(after.registers.eax,'external EAX');
      //A new allocation or a guessed subobject is not admitted by its result.
      if(!eax)throw Error('Native parent RTTI null result has no supported viewport storage.');
      initialSpan(eax,0x84);
      records.push({before,after,args,eax});
    }
    if(!records.length)throw Error('Native parent RTTI observations lack the selected parent thread/order.');
  }
  function crtDynamicCast(application,delta,sourceType,targetType,isReference,runtime){
    if(runtime.memory!==memory||runtime.scratchBase!==R||delta!==0||sourceType!==0x6e213c||targetType!==0x6e20a4||isReference!==0)throw Error('Native parent RTTI source call lacks its recovered common-tail frame/type tokens.');
    const record=records[index];if(!record)throw Error('Viewport application requires authenticated CRT dynamicCast call/return evidence.');
    const args=[application>>>0,0,actual(sourceType),actual(targetType),0];
    if(args.some((v,i)=>v!==record.args[i])||memory.readUInt32LE(0x6efb38)!==args[0]||memory.readUInt32LE(R+4)!==1||memory.readUInt32LE(R+8)!==S-40||memory.readUInt32LE(S)!==actual(0x451107))throw Error('Native parent RTTI source arguments or parent lineage differ from the original external boundary.');
    //Only the proven PUSH argument words and CALL return are published. Saved
    //ECX/SEH/private CRT bytes are not reconstructed from native observations.
    for(let i=4;i>=0;i--)memory.writeUInt32LE(args[i],Q+i*4);
    memory.writeUInt32LE(actual(0x402d8b),Q-4);
    events.push(Object.freeze({callOrdinal:record.before.ordinal,returnOrdinal:record.after.ordinal,entryEsp:Q-4,wrapperEntryEsp:R,args:Object.freeze(args),eax:record.eax,authority:'observed-external-MSVCR120-__RTDynamicCast'}));
    index++;return record.eax;
  }
  authenticatedServices.add(crtDynamicCast);
  return {crtDynamicCast,events,assertComplete(){if(index!==records.length)throw Error('Native parent RTTI has unused external outcomes.');},
    limits:['Only the typed external EAX is supplied; all game fields remain carried source state.','Original402d10 saved ECX/SEH and CRT private scratch are not reconstructed by this adapter.']};
}
