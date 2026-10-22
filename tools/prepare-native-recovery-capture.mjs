// Original47ccc0 entry/preRET observations; preparation never starts Redux.
import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeFrameCaptureConfig} from './prepare-native-frame-capture.mjs';
import {nativeRecoveryGlobalRegions} from './lib/native-recovery-context.mjs';
import {verifyNativeRecoveryParentBoundaries} from './lib/native-recovery-parent-replay.mjs';
import {nativePostFrameBoundaries} from './lib/native-post-frame-replay.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {nativeRecoverySoundCaptureRanges} from './lib/native-recovery-sound.mjs';

export const nativeRecoveryBoundaries=nativePostFrameBoundaries.parent;
export const nativeRecoveryApplicationBoundary=Object.freeze({entry:0x47d440,returnAddress:0x47cf3c,belowParentEsp:124});
const rva=address=>`0x${(address-0x400000).toString(16)}`;
export function nativeRecoveryApplicationRanges(){
  return [
    ...[...nativeFrameGlobalRegions,...nativeRecoveryGlobalRegions].map(({id,preferredAddress,length})=>({id,rva:rva(preferredAddress),length})),
    {id:'recovery-apply-body-header',baseRegister:'ecx',length:0x180},
    {id:'recovery-apply-physical-list',rva:rva(0x902bc0),dereferenceOffsets:['0'],length:96*4},
    {id:'recovery-apply-pack-header',rva:rva(0x90b98c),dereferenceOffsets:['0'],length:0xa0},
    {id:'recovery-apply-caller',baseRegister:'esp',length:4},
    {id:'recovery-apply-arguments',baseRegister:'esp',length:24},
    {id:'recovery-apply-position',baseRegister:'edx',length:12},
    {id:'recovery-apply-quaternion',baseRegister:'esp',dereferenceOffsets:['4'],length:16},
    {id:'recovery-apply-rotation',baseRegister:'esp',dereferenceOffsets:['8'],length:18},
    {id:'recovery-apply-route',baseRegister:'esp',dereferenceOffsets:['12'],length:12},
  ];
}

//44c2b0 publishes all four pointers after adding the actual loaded file base.
//A readableRegion is one observed VirtualQueryEx region, NOT an allocation
//capacity. Replay still proves every count/ID-derived logical byte is present.
export function nativeRecoveryDependencyRanges({maxRegionBytes=64*1024*1024}={}){
  if(!Number.isInteger(maxRegionBytes)||maxRegionBytes<1||maxRegionBytes>64*1024*1024)throw Error('Invalid recovery dependency region bound.');
  const region=(id,address)=>({id,rva:rva(address),dereferenceOffsets:['0'],readableRegion:true,maxRegionBytes});
  return [
    //47ea40 initializes six static4c-byte controls beginning at909060. Capture
    //storage itself; record+18 can instead contain sentinel12345678.
    {id:'recovery-participant-controls',rva:rva(0x909060),length:6*0x4c},
    region('recovery-route-groups-region',0x9092a0),
    region('recovery-route-points-region',0x9092a4),
    region('recovery-checkpoint-records-region',0x9092b0),
    region('recovery-checkpoint-ids-region',0x9092d0),
    //41ebb0 publishes one of two original eight-byte profile tables. It is
    //already initialized when six constructed participants reach phase4.
    {id:'recovery-profile-table',rva:rva(0x91f6a0),dereferenceOffsets:['0'],length:8},
  ];
}

export async function verifyNativeRecoveryDependencyProducers(){
  const evidence=await readInstructionEvidence(['732-world-resource-loader-assembly.json','2457-autonomous-initializer-dispatch-assembly.json','1879-contact-profile-initializer-assembly.json'],{directory:'analysis/native-simulation/results'});
  if(evidence.evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Native recovery producer target SHA differs.');
  const listing=new Map(evidence.instructions.map(row=>[row.address,row]));
  for(const[address,op,args]of [
    [0x44c472,'MOV',['ECX','dword ptr [ESI + 0x8c]']],[0x44c47e,'ADD',['ECX','EDI']],
    [0x44c480,'MOV',['EAX','dword ptr [ESI + 0x98]']],[0x44c486,'ADD',['EAX','EDI']],
    [0x44c4a0,'ADD',['dword ptr [ECX]','EDI']],
    [0x44cb0c,'MOV',['[0x009092a0]','EAX']],[0x44cb15,'MOV',['[0x009092a4]','EAX']],
    [0x44cb84,'MOV',['[0x009092b0]','EAX']],[0x44cb91,'MOV',['[0x009092d0]','EAX']],
    [0x47f004,'MOV',['EBP','0x909060']],
    [0x41ebc2,'MOV',['ECX','0x5eae0c']],[0x41ebd3,'MOV',['EAX','0x5eae14']],[0x41ebdb,'MOV',['[0x0091f6a0]','EAX']],
  ]){
    const actual=listing.get(address);if(actual?.op!==op||JSON.stringify(actual.args)!==JSON.stringify(args))throw Error(`Native recovery dependency producer differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds:evidence.evidence.map(row=>row.evidence_id)};
}

export async function createNativeRecoveryCaptureConfig(directory,output,{frames,skipFrames=0,stackBytesBefore=4096,maxRegionBytes=64*1024*1024,attachmentWindowBytes=1024,selection='all',maxCandidateFrames=1200,maxApplicationSnapshots=64}={}){
  if(!['all','first-respawn-application'].includes(selection))throw Error('Unknown native recovery selection.');
  const selected=selection==='first-respawn-application';frames??=selected?1:3;
  if(selected&&(frames!==1||!Number.isInteger(maxCandidateFrames)||maxCandidateFrames<1||maxCandidateFrames>10000||!Number.isInteger(maxApplicationSnapshots)||maxApplicationSnapshots<1||maxApplicationSnapshots>64))throw Error('Selected recovery requires one parent,1..10000 candidates and1..64 application snapshots.');
  if(!Number.isInteger(stackBytesBefore)||stackBytesBefore<104)throw Error('Recovery observation requires the parent local/callee frame below entryESP.');
  const [boundaries,producers]=await Promise.all([verifyNativeRecoveryParentBoundaries(),verifyNativeRecoveryDependencyProducers()]);
  const result=await createNativeFrameCaptureConfig(directory,output,{frames,skipFrames,stackBytesBefore,maxRegionBytes,attachmentWindowBytes});
  const globals=nativeRecoveryGlobalRegions.map(({id,preferredAddress,length})=>({id,rva:rva(preferredAddress),length}));
  const dependencies=nativeRecoveryDependencyRanges({maxRegionBytes});
  for(const[oldId,id,address]of [['native-frame-before','native-recovery-before',nativeRecoveryBoundaries.entry],['native-frame-after','native-recovery-after',nativeRecoveryBoundaries.exit]]){
    const bp=result.configuration.breakpoints.find(row=>row.id===oldId);bp.id=id;bp.rva=rva(address);bp.ranges.push(...structuredClone([...globals,...dependencies]));
    if(new Set(bp.ranges.map(row=>row.id)).size!==bp.ranges.length)throw Error('Recovery observation range IDs overlap the bootstrap.');
  }
  if(selected){
    result.configuration.maxSnapshots+=maxApplicationSnapshots;
    for(const bp of result.configuration.breakpoints.filter(row=>['native-recovery-before','native-recovery-after'].includes(row.id)))bp.ranges.push(...nativeRecoverySoundCaptureRanges({maxRegionBytes,includeChannelVector:false}));
    result.configuration.breakpoints.push({id:'native-recovery-apply-entry',rva:rva(nativeRecoveryApplicationBoundary.entry),ranges:nativeRecoveryApplicationRanges()});
    result.configuration.pendingFrameObserver={beforeBreakpointId:'native-recovery-before',afterBreakpointId:'native-recovery-after',eventBreakpointId:'native-recovery-apply-entry',maxPendingBytes:128*1024*1024,maxCandidateFrames,maxEventSnapshots:maxApplicationSnapshots,eventStackOffset:-nativeRecoveryApplicationBoundary.belowParentEsp,eventReturnRva:rva(nativeRecoveryApplicationBoundary.returnAddress),eventPointerRegister:'ecx',eventRecordBytes:1,eventPoolRoot:{id:'recovery-body-arena-root',rva:rva(0x6e6b40),length:4},eventPoolCapacity:{id:'recovery-body-arena-used-bytes',rva:rva(0x70dcf4),length:4}};
  }
  return {...result,selection,evidenceIds:[...new Set([...result.evidenceIds,...boundaries.evidenceIds,...producers.evidenceIds])],limitations:[
    'Ordinary parent observations may contain no rejection/respawn; exact replay does not imply positive recovery coverage.',
    'Route/checkpoint roots are actual loader publications; observed commit regions are not invented logical capacities. Missing count/ID-derived bytes fail replay.',
    'Clone workspace and70eb18 may legitimately contain zero before a query; neither is dereferenced by this configuration. Participant controller sentinel12345678 is not chased.',
    'Reached external controller/audio/service allocations beyond captured roots remain explicit dependencies, never supplied fallback state.',
    ...result.limitations,
  ]};
}

async function requireNew(filename){
  try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(`Refusing existing recovery output: ${filename}`);
}
export async function prepareNativeRecoveryCapture(directory,output,filename,options={}){
  const result=await createNativeRecoveryCaptureConfig(directory,output,options);
  await requireNew(result.configuration.outputDirectory);await requireNew(filename);
  await writeFile(filename,`${JSON.stringify(result.configuration,null,2)}\n`,{flag:'wx'});
  return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,frames:result.frames,skipFrames:result.skipFrames,stackBytesBefore:result.stackBytesBefore,evidence:result.evidenceIds,method:'Prepared only: genuine active47ccc0 entry/preRET47d02d observations with captured native recovery descendants. No physics/rejection/route/pose writes and no process launched.',limits:result.limitations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[directory,output,filename,frames,skipFrames='0',stackBytesBefore='4096',selection='all']=process.argv.slice(2);
  if(!directory||!output||!filename||process.argv.length>9)throw Error('Usage: node tools/prepare-native-recovery-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [FRAMES] [SKIP_FRAMES] [STACK_BYTES_BEFORE] [all|first-respawn-application]');
  console.log(JSON.stringify(await prepareNativeRecoveryCapture(directory,output,filename,{frames:frames===undefined?undefined:Number(frames),skipFrames:Number(skipFrames),stackBytesBefore:Number(stackBytesBefore),selection})));
}
