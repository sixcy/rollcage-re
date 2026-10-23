// Planning/ABI arithmetic only. No capture options, service outcome adapter,
// process API, scheduling intervention, or game-child replacement lives here.
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';

function pointer(value,label) {
  if (!Number.isSafeInteger(value)||value<1||value>0xffffffff) throw Error(`Invalid worker mixer ${label}.`);
  return value;
}
export function workerMixerLookupServiceLayout({gainEntryEsp,manager,moduleBaseAddress=0x400000,lookup=1}) {
  pointer(gainEntryEsp,'gain entry ESP');pointer(manager,'manager');pointer(moduleBaseAddress,'module base');
  if (![1,2].includes(lookup)) throw Error('Only the two retained nonspatial worker lookups are derived.');
  const actual=p=>pointer(moduleBaseAddress+p-0x400000,'relocated code address');
  const parameterFrame=pointer(gainEntryEsp-0x174,'parameter frame');
  const lookupEntryEsp=pointer(gainEntryEsp-(lookup===1?0x17c:0x198),'lookup entry ESP');
  const frameEsp=pointer(lookupEntryEsp-16,'lookup frame ESP'), lock=pointer(manager+0x854,'critical section');
  pointer(lock+31,'complete lock and wrapper extent');
  const lookupCaller=actual(lookup===1?0x4b1304:0x4a7ca1);
  const sites=[
    {id:'enter-before',preferredAddress:0x4a79ff,esp:frameEsp-4,role:'pre-call',apis:['EnterCriticalSection'],argumentWords:1},
    {id:'enter-after-thread-before',preferredAddress:0x4a7a05,esp:frameEsp,role:'post-call-and-pre-call',apis:['EnterCriticalSection','GetCurrentThreadId'],argumentWords:0},
    {id:'thread-after',preferredAddress:0x4a7a0b,esp:frameEsp,role:'post-call-before-game-wrapper-stores',apis:['GetCurrentThreadId'],argumentWords:0},
    {id:'leave-before',preferredAddress:0x4a7a4d,esp:frameEsp-4,role:'pre-call',apis:['LeaveCriticalSection'],argumentWords:1},
    {id:'leave-after',preferredAddress:0x4a7a53,esp:frameEsp,role:'post-call-before-game-pops',apis:['LeaveCriticalSection'],argumentWords:0},
  ].map(p=>({...p,address:actual(p.preferredAddress),callerWordAddress:lookupEntryEsp,callerWord:lookupCaller,
    mixerIdWordAddress:lookupEntryEsp+4,stackBytesThroughMixerId:lookupEntryEsp+8-p.esp}));
  return {planningOnly:true,capturePolicyImplemented:false,lookup,gainEntryEsp,parameterFrame,lookupEntryEsp,frameEsp,lookupCaller,
    lockAddress:lock,win32Span:{address:lock,length:24},gameWrapperSpan:{address:lock+24,length:8},
    services:[
      {api:'EnterCriticalSection',preCallEsp:frameEsp-4,serviceEntryEsp:frameEsp-8,postCallEsp:frameEsp,returnAddress:actual(0x4a7a05),args:[lock],returnValueDefined:false},
      {api:'GetCurrentThreadId',preCallEsp:frameEsp,serviceEntryEsp:frameEsp-4,postCallEsp:frameEsp,returnAddress:actual(0x4a7a0b),args:[],returnValueDefined:true},
      {api:'LeaveCriticalSection',preCallEsp:frameEsp-4,serviceEntryEsp:frameEsp-8,postCallEsp:frameEsp,returnAddress:actual(0x4a7a53),args:[lock],returnValueDefined:false},
    ],sites,gameStores:[{preferredAddress:0x4a7a0b,operation:'increment wrapper depth',address:lock+24},
      {preferredAddress:0x4a7a0e,operation:'store returned TID',address:lock+28},
      {preferredAddress:0x4a7a40,operation:'decrement wrapper depth',address:lock+24},
      {preferredAddress:0x4a7a45,operation:'clear wrapper owner only when depth becomes zero',address:lock+28}],
    limits:['Layout is derived from retained game instructions; it does not prove these services were observed.',
      'A service outcome must match its exact before ABI and 24-byte Win32 preimage. The following eight bytes remain game-owned.',
      'No void EAX result is invented; GetCurrentThreadId requires the actual owned caller identity.',
      'The second lookup is a later possible nonspatial path; reached mixer/waveform/voice inputs remain mandatory.']};
}

export async function verifyWorkerMixerServicePlanEvidence() {
  const proof=await readInstructionEvidence(['11733-audio-sample-backend-4a79f0.json','12339-audio-selection-4b12d0-assembly.json','12361-audio-spatial-4a7c10-assembly.json'],{directory:'analysis/native-simulation/results'});
  if(proof.evidence.some(e=>e.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Worker mixer service target differs.');
  const listing=new Map(proof.instructions.map(r=>[r.address,r]));
  const expected=[
    [0x4b12d0,'PUSH',['EBP']],[0x4b12d1,'LEA',['EBP','[ESP + -0x70]']],[0x4b12d5,'SUB',['ESP','0x164']],
    [0x4b12e3,'PUSH',['EBX']],[0x4b12f1,'PUSH',['ESI']],[0x4b12f5,'PUSH',['EDI']],
    [0x4b12fb,'PUSH',['dword ptr [ESI + 0x438]']],[0x4b1301,'CALL',['dword ptr [EAX + 0x48]']],
    [0x4b1929,'PUSH',['EAX']],[0x4b192a,'PUSH',['ESI']],[0x4b192b,'CALL',['0x004a7c10']],
    [0x4a7c10,'SUB',['ESP','0x8']],[0x4a7c13,'PUSH',['ESI']],[0x4a7c18,'PUSH',['EDI']],
    [0x4a7c86,'PUSH',['dword ptr [ESI + 0x438]']],[0x4a7c9e,'CALL',['dword ptr [EAX + 0x48]']],
    [0x4a79f0,'PUSH',['EBX']],[0x4a79f1,'PUSH',['EBP']],[0x4a79f6,'PUSH',['ESI']],[0x4a79f7,'PUSH',['EDI']],
    [0x4a79f8,'LEA',['EDI','[EBX + 0x854]']],[0x4a79fe,'PUSH',['EDI']],[0x4a79ff,'CALL',['dword ptr [0x0056e094]']],
    [0x4a7a05,'CALL',['dword ptr [0x0056e09c]']],[0x4a7a0b,'INC',['dword ptr [EDI + 0x18]']],
    [0x4a7a0e,'MOV',['dword ptr [EDI + 0x1c]','EAX']],[0x4a7a26,'CALL',['dword ptr [EAX]']],
    [0x4a7a40,'DEC',['dword ptr [EDI + 0x18]']],[0x4a7a45,'MOV',['dword ptr [EDI + 0x1c]','0x0']],
    [0x4a7a4c,'PUSH',['EDI']],[0x4a7a4d,'CALL',['dword ptr [0x0056e090]']],[0x4a7a53,'POP',['EDI']],[0x4a7a59,'RET',['0x4']],
  ];
  for(const[address,op,args]of expected){const row=listing.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Worker service ABI instruction differs at ${address.toString(16)}.`);}
  return {verified:true,targetSha256:REDUX_SHA256,evidenceIds:proof.evidence.map(e=>e.evidence_id),checkedInstructions:expected.length};
}
