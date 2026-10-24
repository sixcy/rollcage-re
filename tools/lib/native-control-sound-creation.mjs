//Opt-in genuine48627c collision,48608f tyre-onset and4860db/486146 surface-loop paths. Other sites retain the
//existing explicit boundary. No native after bytes or allocator outputs enter.
import {createNativeControlAudioBindings,NativeControlAudioBoundary} from './native-control-audio.mjs';
import {createNativeFrameSoundBindings} from './native-frame-sound.mjs';
import {nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {nativeEffectStackLayout} from '../../src/native-effect-emitter.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

const u32=(value,label)=>{if(!Number.isInteger(value)||value<-2147483648||value>0xffffffff)throw Error(`Collision sound requires explicit x86 ${label}.`);return value>>>0;};
const fail=(message,details)=>{throw new NativeControlAudioBoundary(message,details);};

export async function verifyNativeControlSoundCreationEvidence(){
  const{instructions,evidence}=await readInstructionEvidence(['271-vehicle-state-485300-assembly.json','149-event-emitter-assembly.json','151-effect-dispatch-assembly.json'],{directory:'analysis/native-simulation/results'});
  if(evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Collision sound target differs.');
  for(const[address,op,args]of[[0x486223,'MOV',['ECX','dword ptr [EBX + 0x3e74]']],[0x486229,'MOV',['ESI','dword ptr [0x0090a548]']],[0x48622f,'MOVZX',['EDI','AL']],[0x486244,'MOV',['dword ptr [EBX + 0x3e74]','ESI']],[0x48627c,'CALL',['0x00484bb0']]]){
    const row=instructions.find(row=>row.address===address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Collision sound instruction differs at0x${address.toString(16)}.`);
  }
  for(const[address,op,args]of[[0x485b5a,'MOV',['EDI','dword ptr [ESP + 0x14]']],[0x486000,'MOV',['ESI','dword ptr [EBP*0x8 + 0x713194]']],[0x486033,'SAR',['ECX','0x12']],[0x486051,'SHL',['CL','0x2']],[0x48607a,'PUSH',['ECX']],[0x48607d,'MOVSX',['EAX','DX']],[0x486086,'MOV',['EAX','dword ptr [ESP + 0x54]']],[0x48608c,'MOVZX',['ECX','AL']],[0x48608f,'CALL',['0x00484bb0']]]){
    const row=instructions.find(row=>row.address===address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Tyre sound instruction differs at0x${address.toString(16)}.`);
  }
  for(const[address,op,args]of[[0x4860f6,'MOVSX',['ECX','byte ptr [EBP*0x8 + 0x7131b2]']],[0x486102,'CMP',['word ptr [EBP*0x8 + 0x7131b6]','0x1']],[0x486121,'CALL',['dword ptr [EAX + 0x34]']],[0x486124,'MOV',['EAX','dword ptr [ESP + 0x28]']],[0x48612d,'CMP',['byte ptr [EBX + 0x6b4]','0x1']],[0x486137,'PUSH',['ECX']],[0x486138,'PUSH',['0x0']],[0x48613a,'PUSH',['ECX']],[0x48613b,'PUSH',['0x9']],[0x48613d,'PUSH',['0x0']],[0x48613f,'PUSH',['-0x1']],[0x486141,'PUSH',['0x0']],[0x486143,'MOVZX',['ECX','AL']],[0x486146,'CALL',['0x00484bb0']]]){
    const row=instructions.find(row=>row.address===address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Surface-loop sound instruction differs at0x${address.toString(16)}.`);
  }
  for(const[address,op,args]of[[0x48606a,'CMP',['AX','0x1']],[0x48606e,'JLE',['0x004860bd']],[0x4860bd,'CMP',['ESI','0x7f']],[0x4860c2,'PUSH',['0x0']],[0x4860c4,'PUSH',['0x0']],[0x4860c6,'PUSH',['ECX']],[0x4860c7,'PUSH',['0x9']],[0x4860c9,'MOVSX',['EAX','DX']],[0x4860cf,'PUSH',['0x0']],[0x4860d1,'PUSH',['EAX']],[0x4860d2,'MOV',['EAX','dword ptr [ESP + 0x40]']],[0x4860d6,'PUSH',['0x0']],[0x4860d8,'MOVZX',['ECX','AL']],[0x4860db,'CALL',['0x00484bb0']]]){
    const row=instructions.find(row=>row.address===address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Surface-loop start instruction differs at0x${address.toString(16)}.`);
  }
  return{targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id)};
}

export async function verifyNativeControlSoundSelectionEvidence(){
  const {instructions,evidence}=await readInstructionEvidence(['153-sound-channel-selection-assembly.json','158-sound-channel-position-assembly.json','12281-wave-owner-loop-flag-assembly.json','9266-audio-retirement-children-procedure_assembly.json','20261024-callback-40f240-assembly.json','9143-audio-listener-child-40f2a0-procedure_assembly.json','12248-queued-audio-lambda-0x40ee80-procedure_assembly.json'],{directory:'analysis/native-simulation/results'});
  if(evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Sound selector target differs.');
  for(const [address,op,args]of [[0x40db53,'JLE',['0x0040dbe0']],[0x40dc34,'CALL',['dword ptr [EDX + 0x4]']],[0x40db88,'CALL',['dword ptr [EDX + 0x4]']],[0x40dc49,'CMP',['EAX','0x10']],[0x40dc4c,'JNC',['0x0040dcc3']],[0x40d735,'CALL',['dword ptr [EAX + 0x8]']],[0x4ad500,'MOV',['AL','byte ptr [ECX + 0x45c]']]]){
    const row=instructions.find(row=>row.address===address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Sound selector instruction differs at0x${address.toString(16)}.`);
  }
  return {targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id),scope:'Original adaptive selection, duplicate descriptor copies, unsigned channel limit and positional source calls; no allocator or source outcome supplied.'};
}

export function createNativeControlSoundCreationBindings(options={}){
  const{memory,moduleBaseAddress=0x400000,numericalContext,nativeTls,source}=options;
  const base=createNativeControlAudioBindings(options),sound=source?.sound??createNativeFrameSoundBindings({memory,moduleBaseAddress,numericalContext,nativeTls}),creationEvents=[];
  if(sound.soundRuntime?.memory!==memory)throw Error('Collision sound must share its original source memory.');
  const actual=p=>nativeCodeAddress(p,{moduleBaseAddress});
  const surfaceStart484bb0=request=>{
    const meta=request.nativeCaller;
    if(request.memory!==memory||request.runtime?.memory!==memory||request.runtime.nativeAudioCalls!==true||meta.callerAddress!==actual(0x485300))fail('Surface-loop start lacks its actual485300 caller.',{nativeCaller:meta});
    const entry=u32(meta.entryEsp,'surface start ESP'),outer=u32(meta.callerEntryEsp,'surface audio ESP'),body=u32(meta.entryRegisters?.EBX,'surface start body'),ebp=u32(meta.entryRegisters?.EBP,'surface participant scale'),local=outer-84;
    if(entry!==outer-116||request.scratchBase!==entry||request.runtime.scratchBase!==entry||meta.returnAddress!==actual(0x4860e0)||memory.readUInt32LE(entry)!==actual(0x4860e0))fail('Surface-loop start caller ESP/return differs.',{nativeCaller:meta});
    if(ebp>25||ebp%5)fail('Surface-loop start participant scale differs.',{nativeCaller:meta});
    const audio=0x713190+ebp*8,material=memory.readInt32LE(local+0x18);
    if(material<0||material>26)fail('Surface-loop start material exceeds its source table.',{material});
    const table=0x5750d0+material*20,loop=memory.readInt32LE(table+4),pitch=memory.readInt32LE(table+12),allow=memory.readInt32LE(table+16),rpm=u32(meta.entryRegisters.EDI,'source-produced full RPM');
    for(const[offset,value]of[[0x3c,memory.readInt32LE(table)],[0x28,loop],[0x2c,memory.readInt32LE(table+8)],[0x14,pitch],[0x20,allow]])if(memory.readInt32LE(local+offset)!==value)fail('Surface-loop start material/table locals differ.',{material,offset});
    const abs=value=>value<0?-value|0:value,slip=Math.min((abs(memory.readInt32LE(body+0x5f8))+abs(memory.readInt32LE(body+0x530)))|0,0x1e0000),units=slip>>16;
    if(memory.readUInt32LE(audio+4)!==127||memory.readInt16LE(audio+38)>1||memory.readInt32LE(local+0x24)!==units||!(units>6||allow))fail('Surface-loop start lacks its initial surface/slip/counter producer.',{material,units});
    if(u32(meta.entryRegisters.ESI,'source-produced surface')!==127||(rpm<<16>>16)!==memory.readInt16LE(audio+24)||u32(meta.entryRegisters.EAX,'source-produced loop EAX')!==(loop>>>0))fail('Surface-loop start surface/RPM/loop registers differ.',{nativeCaller:meta});
    const args=request.args;if(!Array.isArray(args)||args.length!==7)fail('Surface-loop start requires seven caller words.');
    let unused=slip;const amount=(((slip>>18)&2)|1)+4;
    if((args[4]|0)!==slip){
      if(units<=6||(args[4]|0)!==amount<<2||memory[body+0x718]!==10||memory.readUInt16LE(body+0x71e)!==0x108||memory[body+0x71d]!==40||memory.readUInt16LE(body+0x71a)!==amount*10)fail('Surface-loop start smoke/ECX producer differs.',{slip,argument:args[4]});
      unused=amount<<2;
    }
    const code=loop&255,expected=[0,pitch<<16>>16,0,9,unused,0,0];
    if(request.ecx!==code||u32(request.edx,'surface start EDX')!==body+0x34||meta.entryRegisters.ECX!==code||u32(meta.entryRegisters.EDX,'surface start metadata EDX')!==body+0x34)fail('Surface-loop start body/code registers differ.',{nativeCaller:meta});
    for(let i=0;i<7;i++)if(u32(args[i],`surface start argument${i}`)!==u32(expected[i],`surface start expected${i}`)||memory.readUInt32LE(entry+4+i*4)!==u32(args[i],`surface start stored${i}`))fail('Surface-loop start argument producer differs.',{index:i});
    const entryRegisters={ebx:body,ebp,esi:127,edi:rpm,ecx:code,edx:body+0x34,eax:loop>>>0},event={kind:'surface-loop-start',callAddress:actual(0x4860db),returnAddress:actual(0x4860e0),entryEsp:entry,callerEntryEsp:outer,entryRegisters,args:args.map(v=>v|0),layout:nativeEffectStackLayout(entry),completed:false};creationEvents.push(event);
    try{const result=sound.call484bb0({memory,code,registerEdx:body+0x34,args,scratchBase:entry,nativeStack:{entryRegisters}});event.completed=true;event.result=result;return result;}
    catch(error){event.error=error.message;error.nativeControlSoundCreation={...event};throw error;}
  };
  const surface484bb0=request=>{
    const meta=request.nativeCaller;
    if(request.memory!==memory||request.runtime?.memory!==memory||request.runtime.nativeAudioCalls!==true||meta.callerAddress!==actual(0x485300))fail('Surface-loop sound lacks its actual485300 caller.',{nativeCaller:meta});
    const entry=u32(meta.entryEsp,'surface emitter ESP'),outer=u32(meta.callerEntryEsp,'surface audio ESP'),body=u32(meta.entryRegisters?.EBX,'surface body'),ebp=u32(meta.entryRegisters?.EBP,'surface participant scale'),local=outer-84;
    if(entry!==outer-116||request.scratchBase!==entry||request.runtime.scratchBase!==entry||meta.returnAddress!==actual(0x48614b)||memory.readUInt32LE(entry)!==actual(0x48614b))fail('Surface-loop sound caller ESP/return differs.',{nativeCaller:meta});
    if(ebp>25||ebp%5)fail('Surface-loop sound participant scale differs.',{nativeCaller:meta});
    const audio=0x713190+ebp*8,material=memory.readInt32LE(local+0x18);
    if(material<0||material>26)fail('Surface-loop sound material exceeds its source table.',{material});
    const table=0x5750d0+material*20,loop=memory.readInt32LE(table+4),surface=memory.readUInt32LE(audio+4),rpm=u32(meta.entryRegisters.EDI,'source-produced full RPM');
    for(const[offset,value]of[[0x3c,memory.readInt32LE(table)],[0x28,loop],[0x2c,memory.readInt32LE(table+8)],[0x14,memory.readInt32LE(table+12)],[0x20,memory.readInt32LE(table+16)]])if(memory.readInt32LE(local+offset)!==value)fail('Surface-loop source material/table locals differ.',{material,offset});
    const abs=value=>value<0?-value|0:value,slip=Math.min((abs(memory.readInt32LE(body+0x5f8))+abs(memory.readInt32LE(body+0x530)))|0,0x1e0000),units=slip>>16;
    if(surface===127||material===memory.readInt8(audio+34)||memory.readInt16LE(audio+38)!==1||memory.readInt32LE(local+0x24)!==units||!(units>6||memory.readInt32LE(table+16)))fail('Surface-loop sound lacks its material-change/slip/counter producer.',{material,surface,units});
    if(u32(meta.entryRegisters.ESI,'source-produced old surface')!==surface||(rpm<<16>>16)!==memory.readInt16LE(audio+24)||u32(meta.entryRegisters.EAX,'source-produced loop EAX')!==(loop>>>0))fail('Surface-loop source surface/RPM/loop registers differ.',{nativeCaller:meta});
    //486121 is conditional on the old handle and its real source pointee.
    //A reached clear must already have executed the genuine game child here.
    const object=surface>256?memory.readUInt32LE(surface):0;
    if(object){const previous=base.events.at(-1);if(previous?.site!==0x486121||previous.method!==0x34||previous.object!==object||previous.entryEsp!==local-4||previous.entryRegisters.EBX!==body||u32(previous.entryRegisters.ESI,'stopped surface')!==surface||u32(previous.entryRegisters.EDI,'stopped RPM')!==rpm||memory.readUInt32LE(object+0x94c)!==0)fail('Surface-loop sound lacks its genuine preceding source stop.',{surface,object});}
    const code=loop&255,repeat=memory[body+0x6b4]===1?1:0,args=request.args,expected=[0,-1,0,9,repeat,0,repeat];
    if(request.ecx!==code||u32(request.edx,'surface EDX')!==body+0x34||meta.entryRegisters.ECX!==code||u32(meta.entryRegisters.EDX,'surface metadata EDX')!==body+0x34)fail('Surface-loop sound body/code registers differ.',{nativeCaller:meta});
    if(!Array.isArray(args)||args.length!==7)fail('Surface-loop sound requires seven caller words.');
    for(let i=0;i<7;i++)if(u32(args[i],`surface argument${i}`)!==u32(expected[i],`surface expected${i}`)||memory.readUInt32LE(entry+4+i*4)!==u32(args[i],`surface stored${i}`))fail('Surface-loop sound argument producer differs.',{index:i});
    const entryRegisters={ebx:body,ebp,esi:surface,edi:rpm,ecx:code,edx:body+0x34,eax:loop>>>0},event={kind:'surface-loop-replacement',callAddress:actual(0x486146),returnAddress:actual(0x48614b),entryEsp:entry,callerEntryEsp:outer,entryRegisters,args:args.map(v=>v|0),layout:nativeEffectStackLayout(entry),completed:false};creationEvents.push(event);
    try{const result=sound.call484bb0({memory,code,registerEdx:body+0x34,args,scratchBase:entry,nativeStack:{entryRegisters}});event.completed=true;event.result=result;return result;}
    catch(error){event.error=error.message;error.nativeControlSoundCreation={...event};throw error;}
  };
  const tyre484bb0=request=>{
    const meta=request.nativeCaller;
    if(request.memory!==memory||request.runtime?.memory!==memory||request.runtime.nativeAudioCalls!==true||meta.callerAddress!==actual(0x485300))fail('Tyre sound lacks its actual485300 caller.',{nativeCaller:meta});
    const entry=u32(meta.entryEsp,'tyre emitter ESP'),outer=u32(meta.callerEntryEsp,'tyre audio ESP');
    if(entry!==outer-116||request.scratchBase!==entry||request.runtime.scratchBase!==entry||meta.returnAddress!==actual(0x486094)||memory.readUInt32LE(entry)!==actual(0x486094))fail('Native485300 reached unbound tyre caller ESP/return.',{nativeCaller:meta});
    const body=u32(meta.entryRegisters?.EBX,'tyre body'),ebp=u32(meta.entryRegisters?.EBP,'tyre participant scale'),local=outer-84;
    if(ebp>25||ebp%5)fail('Tyre sound participant scale differs.',{nativeCaller:meta});
    const audio=0x713190+ebp*8,material=memory.readInt32LE(local+0x18);
    if(material<0||material>26)fail('Tyre sound material exceeds its source table.',{material});
    const table=0x5750d0+material*20,firstCode=memory.readInt32LE(local+0x3c),pitch=memory.readInt32LE(local+0x14),allowLowSlip=memory.readInt32LE(local+0x20);
    if(firstCode!==memory.readInt32LE(table)||pitch!==memory.readInt32LE(table+12)||allowLowSlip!==memory.readInt32LE(table+16))fail('Tyre sound source material/table locals differ.',{material});
    const abs=value=>value<0?-value|0:value,slip=Math.min((abs(memory.readInt32LE(body+0x5f8))+abs(memory.readInt32LE(body+0x530)))|0,0x1e0000),slipUnits=slip>>16;
    if(memory.readInt32LE(local+0x24)!==slipUnits||!(slipUnits>6||allowLowSlip)||memory.readInt16LE(audio+38)!==5)fail('Tyre sound lacks its actual slip/counter producer.',{slip,slipUnits});
    let unused=slip;
    //The original smoke branch already published WORD108h at+71e, so its
    //post-write value cannot recover the old guard. Source ECX's PUSH word
    //distinguishes the two genuine producer outcomes without after input.
    const args=request.args,smokeAmount=((((slip>>18)&2)|1)+4),smokeUnused=smokeAmount<<2;
    if(!Array.isArray(args)||args.length!==7)fail('Tyre sound requires seven actual caller words.');
    if((args[4]|0)!==slip){
      if((args[4]|0)!==smokeUnused||memory[body+0x718]!==10||memory.readUInt16LE(body+0x71e)!==0x108||memory[body+0x71d]!==40||memory.readUInt16LE(body+0x71a)!==smokeAmount*10)fail('Tyre sound smoke/ECX producer differs.',{slip,argument:args[4]});
      unused=smokeUnused;
    }
    const code=firstCode&255,expected=[0,pitch<<16>>16,0,7,unused,0,0];
    if(request.ecx!==code||u32(request.edx,'tyre EDX')!==body+0x34||meta.entryRegisters.ECX!==code||u32(meta.entryRegisters.EDX,'tyre metadata EDX')!==body+0x34)fail('Tyre sound body/code registers differ.',{nativeCaller:meta});
    for(let i=0;i<7;i++)if(u32(args[i],`tyre argument${i}`)!==u32(expected[i],`tyre expected argument${i}`)||memory.readUInt32LE(entry+4+i*4)!==u32(args[i],`tyre stored argument${i}`))fail('Tyre sound argument producer differs.',{index:i});
    const surface=memory.readUInt32LE(audio+4),rpm=u32(meta.entryRegisters.EDI,'source-produced full RPM');
    if(u32(meta.entryRegisters.ESI,'source-produced surface')!==surface||(rpm<<16>>16)!==memory.readInt16LE(audio+24))fail('Tyre sound source surface/RPM metadata differs.',{nativeCaller:meta});
    const entryRegisters={ebx:body,ebp,esi:surface,edi:rpm,ecx:code,edx:body+0x34,eax:firstCode>>>0};
    if(meta.entryRegisters.EAX!==undefined&&u32(meta.entryRegisters.EAX,'tyre EAX')!==entryRegisters.eax)fail('Tyre sound supplied EAX contradicts its genuine producer.');
    const event={kind:'tyre-onset',callAddress:actual(0x48608f),returnAddress:actual(0x486094),entryEsp:entry,callerEntryEsp:outer,entryRegisters,args:args.map(value=>value|0),layout:nativeEffectStackLayout(entry),completed:false};creationEvents.push(event);
    try{const result=sound.call484bb0({memory,code,registerEdx:body+0x34,args,scratchBase:entry,nativeStack:{entryRegisters}});event.completed=true;event.result=result;return result;}
    catch(error){event.error=error.message;error.nativeControlSoundCreation={...event};throw error;}
  };
  const call484bb0=request=>{
    const meta=request?.nativeCaller;
    if(meta?.callAddress===actual(0x4860db))return surfaceStart484bb0(request);
    if(meta?.callAddress===actual(0x486146))return surface484bb0(request);
    if(meta?.callAddress===actual(0x48608f))return tyre484bb0(request);
    if(meta?.callAddress!==actual(0x48627c))return base.handlers.call484bb0(request);
    if(request.memory!==memory||request.runtime?.memory!==memory||request.runtime.nativeAudioCalls!==true||meta.callerAddress!==actual(0x485300))fail('Collision sound lacks its actual485300 caller.',{nativeCaller:meta});
    const entry=u32(meta.entryEsp,'emitter ESP'),outer=u32(meta.callerEntryEsp,'audio ESP'),body=u32(meta.entryRegisters?.EBX,'body'),ebp=u32(meta.entryRegisters?.EBP,'participant scale');
    if(entry!==outer-116||request.scratchBase!==entry||request.runtime.scratchBase!==entry||meta.returnAddress!==actual(0x486281)||memory.readUInt32LE(entry)!==actual(0x486281))fail('Collision sound caller ESP/return differs.',{nativeCaller:meta});
    if(ebp>25||ebp%5||request.ecx!==19||u32(request.edx,'EDX')!==body+0x34||meta.entryRegisters.ECX!==19||u32(meta.entryRegisters.EDX,'metadata EDX')!==body+0x34)fail('Collision sound body/index/registers differ.',{nativeCaller:meta});
    const collision=memory.readUInt8(body+0x66f),clock=memory.readUInt32LE(body+0x3e74),args=request.args;
    //486244 has already published the actual MOV ESI,[90a548] value here.
    //Recover that source-produced value, never a native post-call observation.
    if(!(collision&0xe0)||clock!==memory.readUInt32LE(0x90a548))fail('Collision sound reached without its source collision/timestamp producer.',{body,collision,clock});
    if(!Array.isArray(args)||args.length!==7)fail('Collision sound requires seven actual caller words.');
    const expected=[0,collision+256,Math.min(collision*48,16383),7,args[4],0,0];
    for(let i=0;i<7;i++)if(u32(args[i],`argument${i}`)!==u32(expected[i],`expected argument${i}`)||memory.readUInt32LE(entry+4+i*4)!==u32(args[i],`stored argument${i}`))fail('Collision sound argument producer differs.',{index:i,nativeCaller:meta});
    const entryRegisters={ebx:body,ebp,esi:clock,edi:collision,ecx:19,edx:body+0x34,eax:collision+256};
    for(const name of['ESI','EDI','EAX'])if(meta.entryRegisters[name]!==undefined&&u32(meta.entryRegisters[name],name)!==entryRegisters[name.toLowerCase()])fail(`Collision sound supplied ${name} contradicts its genuine producer.`);
    const event={callAddress:actual(0x48627c),returnAddress:actual(0x486281),entryEsp:entry,callerEntryEsp:outer,entryRegisters,args:args.map(value=>value|0),layout:nativeEffectStackLayout(entry),completed:false};creationEvents.push(event);
    try{const result=sound.call484bb0({memory,code:19,registerEdx:body+0x34,args,scratchBase:entry,nativeStack:{entryRegisters}});event.completed=true;event.result=result;return result;}
    catch(error){event.error=error.message;error.nativeControlSoundCreation={...event};throw error;}
  };
  return{...base,handlers:{...base.handlers,call484bb0},creationEvents,
    get comparisonRegions(){return[...base.comparisonRegions,...sound.comparisonRegions];},
    limits:[...base.limits,'Opt-in48627c/48608f/4860db/486146 only: genuine source collision or material/slip/counter/preceding-stop producers and full source RPM metadata establish484bb0 registers. Populated owners/channels and services remain genuine reached dependencies.']};
}
