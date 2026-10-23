//Opt-in genuine48627c collision-sound path. Other creation sites retain the
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
  return{targetSha256:REDUX_SHA256,evidenceIds:evidence.map(row=>row.evidence_id)};
}

export function createNativeControlSoundCreationBindings(options={}){
  const{memory,moduleBaseAddress=0x400000,numericalContext,nativeTls,source}=options;
  const base=createNativeControlAudioBindings(options),sound=source?.sound??createNativeFrameSoundBindings({memory,moduleBaseAddress,numericalContext,nativeTls}),creationEvents=[];
  if(sound.soundRuntime?.memory!==memory)throw Error('Collision sound must share its original source memory.');
  const actual=p=>nativeCodeAddress(p,{moduleBaseAddress});
  const call484bb0=request=>{
    const meta=request?.nativeCaller;
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
    limits:[...base.limits,'Opt-in48627c only: actual source timestamp/collision producers establish all484bb0 registers. Populated owners/channels and services remain genuine reached dependencies.']};
}
