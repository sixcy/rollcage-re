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

export async function verifyNativeParentWeatherRttiEvidence(){
  const proof=await readInstructionEvidence(['3601-object-effect-496700-procedure_assembly.json','3611-object-effect-498030-procedure_assembly.json','3626-weather-40ab70-procedure_assembly.json'],{directory:'analysis/native-simulation/results'});
  if(proof.evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Weather RTTI evidence target differs.');
  const rows=new Map(proof.instructions.map(row=>[row.address,row]));
  const expected=[
    ...['ECX','EBX','EBP','ESI','EDI'].map((reg,i)=>[0x496700+i,'PUSH',[reg]]),
    [0x49681d,'CALL',['0x00498030']],[0x498030,'SUB',['ESP','0x130']],
    ...['EBX','ESI','EDI'].map((reg,i)=>[0x498053+i,'PUSH',[reg]]),
    [0x49808d,'CALL',['0x0040ab70']],[0x4980f0,'CALL',['0x0040ab70']],
    ...['ECX','EBX','ESI','EDI'].map((reg,i)=>[0x40ab70+i,'PUSH',[reg]]),
    [0x40ab7a,'LEA',['ECX','[ESI + 0x1]']],
    ...[0x40abdf,0x40abe3,0x40abe7].map(address=>[address,'PUSH',['dword ptr [ESP + 0x1c]']]),
    [0x40abeb,'PUSH',['EBX']],[0x40abec,'PUSH',['EDI']],[0x40abed,'PUSH',['ECX']],
    [0x40abee,'CALL',['0x00402d10']],[0x40abf3,'ADD',['ESP','0x4']],[0x40abf8,'CALL',['0x00407050']]
  ];
  for(const[address,op,args]of expected){const row=rows.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Weather RTTI retained caller differs at0x${address.toString(16)}.`);}
  return {targetSha256:REDUX_SHA256,evidenceIds:proof.evidence.map(row=>row.evidence_id),scope:'Original weather direct-query caller and game argument publication; external outcomes are separate runtime observations.'};
}

//The named source option is a typed CRT service. Preferred source type tokens
//are explicitly converted to actual module arguments at this boundary.
//Default support is4180a0's common41a0c3 caller. The opt-in weather contract
//additionally admits exactly the two source498030 direct40ab70 queries.
export function createNativeParentRttiBindings({capture,pair,memory,initialSpan,moduleBaseAddress=pair?.moduleBaseAddress,weatherScreenQueries=false}={}){
  if(!capture||!pair||!memory||typeof initialSpan!=='function')throw Error('Native parent RTTI requires captured lineage and original input coverage.');
  if(typeof weatherScreenQueries!=='boolean')throw Error('Native parent weather RTTI option must be boolean.');
  const base=uint(moduleBaseAddress,'module base'),U=uint(pair.before.registers.esp,'parent entry ESP'),S=U-20,R=S-216,Q=R-40;
  const actual=p=>nativeCodeAddress(p,{moduleBaseAddress:base}),tid=pair.before.tid;
  const begin=pair.postphysics?.auxiliary,cameras=pair.postphysics?.cameras,end=weatherScreenQueries?pair.postphysics?.['world-effects']:cameras;
  const weatherOutputs=n=>n===1?[U-336,U-332,U-340,U-328]:[U-344,U-336,U-332,U-328];
  const events=[],records=[];let index=0,weatherCalls=0;
  const candidates=capture.snapshots.filter(row=>nativeParentRttiSites.some(site=>row.breakpointId===site.id));
  //Absence remains an explicit reached service failure, including saved V6.
  if(candidates.length){
    if(!begin||!end||!cameras)throw Error('Native parent RTTI requires enclosing auxiliary/cameras checkpoints.');
    if(order(begin)<=order(pair.before)||order(end)<=order(begin)||begin.tid!==tid||end.tid!==tid)throw Error('Native parent RTTI enclosing parent order/thread differs.');
    const selected=candidates.filter(row=>row.tid===tid&&order(row)>order(begin)&&order(row)<order(end));
    for(let i=1;i<selected.length;i++)if(order(selected[i])<=order(selected[i-1]))throw Error('Native parent RTTI observation sequence is not strictly ordered.');
    for(let i=0;i<selected.length;i+=2){
      const before=selected[i],after=selected[i+1];
      if(!after||before.breakpointId!=='native-parent-rtti-call'||after.breakpointId!=='native-parent-rtti-return'||order(before)>=order(after))throw Error('Native parent RTTI requires ordered external call/return pairs.');
      const observedQ=uint(before.registers.esp,'ESP'),weather=weatherScreenQueries&&observedQ===U-460;
      const weatherQueryIndex=weather?++weatherCalls:0,contextLength=weather?68:52;
      if(weather&&(weatherQueryIndex>2||order(before)<=order(cameras))||!weather&&order(after)>=order(cameras))throw Error('Native parent RTTI caller is outside its camera/weather stage.');
      for(const[row,address]of [[before,0x402d86],[after,0x402d8b]]){
        if(uint(row.registers.eip,'EIP')!==actual(address)||uint(row.registers.esp,'ESP')!==(weather?U-460:Q))throw Error('Native parent RTTI caller address/ESP differs from the recovered common camera path.');
        const context=range(row,'native-parent-rtti-context',observedQ,contextLength);
        //41a0c0 PUSH1,41a0c2 PUSHname,41a0c3 CALL: R+4=name,
        //R+8=mode1. Since Q=R-40, those are context+44/+48.
        if(weather){
          const words=[actual(0x40abf3),U-319,U-320,...weatherOutputs(weatherQueryIndex)];
          if(words.some((value,n)=>context.readUInt32LE(40+n*4)!==value)
            ||range(row,'native-parent-rtti-weather-query-return',U-376,4).readUInt32LE()!==actual(weatherQueryIndex===1?0x498092:0x4980f5)
            ||range(row,'native-parent-rtti-weather-screen-return',U-44,4).readUInt32LE()!==actual(0x496822)
            ||range(row,'native-parent-rtti-weather-parent-return',S,4).readUInt32LE()!==actual(0x451116)
            ||!range(row,'native-parent-rtti-weather-name',U-320,9).equals(Buffer.from('0 Player\0','ascii')))throw Error('Native parent RTTI weather query caller/outputs/name differ.');
        }else if(context.readUInt32LE(40)!==actual(0x41a0c8)||context.readUInt32LE(44)!==S-40||context.readUInt32LE(48)!==1||range(row,'native-parent-rtti-camera-return',S,4).readUInt32LE()!==actual(0x451107))throw Error('Native parent RTTI enclosing camera return/arguments differ.');
        if(range(row,'native-parent-rtti-clock',actual(0x90a548),4).readUInt32LE()!==pair.logicalClock)throw Error('Native parent RTTI logical clock differs.');
      }
      const input=range(before,'native-parent-rtti-context',observedQ,contextLength).subarray(0,20),returned=range(after,'native-parent-rtti-context',observedQ,contextLength).subarray(0,20);
      if(!input.equals(returned))throw Error('Native parent RTTI external arguments changed across its call.');
      const args=Array.from({length:5},(_,i)=>input.readUInt32LE(i*4));
      if(args[1]!==0||args[2]!==actual(0x6e213c)||args[3]!==actual(0x6e20a4)||args[4]!==0)throw Error('Native parent RTTI actual type arguments differ.');
      const eax=uint(after.registers.eax,'external EAX');
      //A new allocation or a guessed subobject is not admitted by its result.
      if(!eax)throw Error('Native parent RTTI null result has no supported viewport storage.');
      initialSpan(eax,0x84);
      records.push({before,after,args,eax,weather,weatherQueryIndex,R:observedQ+40,Q:observedQ});
    }
    if(!records.length)throw Error('Native parent RTTI observations lack the selected parent thread/order.');
    if(weatherScreenQueries&&weatherCalls!==2)throw Error('Native parent RTTI lacks both separately observed weather query outcomes.');
  }
  function crtDynamicCast(application,delta,sourceType,targetType,isReference,runtime){
    const weather=weatherScreenQueries&&runtime.scratchBase===U-420,sourceR=weather?U-420:R,sourceQ=sourceR-40;
    if(runtime.memory!==memory||runtime.scratchBase!==sourceR||delta!==0||sourceType!==0x6e213c||targetType!==0x6e20a4||isReference!==0)throw Error('Native parent RTTI source call lacks its recovered common-tail frame/type tokens.');
    const args=[application>>>0,0,actual(sourceType),actual(targetType),0];
    //Validate carried source stack even when no external record exists. A
    //missing-outcome error must not mask an incorrect game-caller ABI.
    if(memory.readUInt32LE(0x6efb38)!==args[0])throw Error('Native parent RTTI source arguments or parent lineage differ from the original external boundary.');
    const sourceWeatherIndex=events.filter(row=>row.family==='weather-screen').length+1;
    if(weather){
      const words=[actual(0x40abf3),U-319,U-320,...weatherOutputs(sourceWeatherIndex)];
      if(sourceWeatherIndex>2||words.some((v,n)=>memory.readUInt32LE(sourceR+n*4)!==v)||memory.readUInt32LE(U-376)!==actual(sourceWeatherIndex===1?0x498092:0x4980f5)||memory.readUInt32LE(U-44)!==actual(0x496822)||memory.readUInt32LE(S)!==actual(0x451116))throw Error('Native parent RTTI source weather caller/outputs differ from original instructions.');
    }else if(memory.readUInt32LE(R+4)!==S-40||memory.readUInt32LE(R+8)!==1||memory.readUInt32LE(S)!==actual(0x451107))throw Error('Native parent RTTI source arguments or parent lineage differ from the original external boundary.');
    const record=records[index];if(!record)throw Error('Viewport application requires authenticated CRT dynamicCast call/return evidence.');
    if(record.weather!==weather||record.R!==sourceR||record.Q!==sourceQ||weather&&record.weatherQueryIndex!==sourceWeatherIndex||args.some((v,i)=>v!==record.args[i]))throw Error('Native parent RTTI source arguments or parent lineage differ from the original external boundary.');
    //Record the SOURCE formatter's lookup key for later semantic comparison.
    //These are not observed native string bytes or replacement map contents.
    const sourceNameAddress=memory.readUInt32LE(sourceR+(weather?8:4)),sourceName=[];
    for(let i=0;;i++){if(i>=32)throw Error('Native parent camera name exceeds its signed-integer formatter domain.');const byte=memory[sourceNameAddress+i];if(!byte)break;sourceName.push(byte);}
    //Only the proven PUSH argument words and CALL return are published. Saved
    //ECX/SEH/private CRT bytes are not reconstructed from native observations.
    if(weather&&!Buffer.from([...sourceName,0]).equals(Buffer.from('0 Player\0','ascii')))throw Error('Native parent RTTI source weather name differs from its observed query.');
    for(let i=4;i>=0;i--)memory.writeUInt32LE(args[i],sourceQ+i*4);
    memory.writeUInt32LE(actual(0x402d8b),sourceQ-4);
    events.push(Object.freeze({callOrdinal:record.before.ordinal,returnOrdinal:record.after.ordinal,entryEsp:sourceQ-4,wrapperEntryEsp:sourceR,args:Object.freeze(args),eax:record.eax,sourceNameAddress,sourceNameHex:Buffer.from(sourceName).toString('hex'),family:weather?'weather-screen':'camera',...(weather?{weatherQueryIndex:sourceWeatherIndex}:{}),authority:'observed-external-MSVCR120-__RTDynamicCast'}));
    index++;return record.eax;
  }
  authenticatedServices.add(crtDynamicCast);
  return {crtDynamicCast,events,assertComplete({through}={}){const required=weatherScreenQueries&&through==='cameras'?records.filter(row=>!row.weather).length:records.length;if(index!==required)throw Error('Native parent RTTI has unused external outcomes.');},
    limits:['Only the typed external EAX is supplied; all game fields remain carried source state.','Original402d10 saved ECX/SEH and CRT private scratch are not reconstructed by this adapter.']};
}
