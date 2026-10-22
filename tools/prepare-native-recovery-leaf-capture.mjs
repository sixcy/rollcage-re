//Observer-only complete47d040/47d440 leaf captures; never starts Redux.
import {lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeRecoveryCaptureConfig} from './prepare-native-recovery-capture.mjs';
import {recoveryLeafPolicy} from './lib/native-recovery-leaf-replay.mjs';
import {nativeRecoveryLeafIds} from './check-native-recovery-leaf-replay.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';
const rva=address=>`0x${(address-0x400000).toString(16)}`;
export function nativeRecoveryLeafArgumentRanges(stage,{atExit=false}={}){
 const policy=recoveryLeafPolicy(stage);if(typeof atExit!=='boolean')throw Error('Recovery leaf exit selection must be boolean.');
 //47d040 overwrites its quaternion/output argument slots, and47d440 uses
 //its quaternion slot as4286e0's outside result. Their original pointers must
 //not be chased again at preRET.47ccc0 preserves body inEDI/rotation inESI;
 //its quaternion is parentS-24 and query output parentS-44.
 return [
  {id:'leaf-arguments',baseRegister:'esp',length:policy.stackBytesAfter},
  {id:'leaf-body-header',baseRegister:atExit?'edi':'ecx',length:0x180},
  atExit?{id:'leaf-position',rva:rva(0x70eb0c),length:12}:{id:'leaf-position',baseRegister:'edx',length:12},
  atExit?{id:'leaf-quaternion',baseRegister:'esp',offset:String(stage==='query'?96:100),length:16}:{id:'leaf-quaternion',baseRegister:'esp',dereferenceOffsets:['4'],length:16},
  atExit?{id:'leaf-rotation',baseRegister:'esi',length:18}:{id:'leaf-rotation',baseRegister:'esp',dereferenceOffsets:['8'],length:18},
  stage==='query'?(atExit?{id:'leaf-query-output',baseRegister:'esp',offset:'76',length:4}:{id:'leaf-query-output',baseRegister:'esp',dereferenceOffsets:['16'],length:4}):{id:'leaf-route',baseRegister:'esp',dereferenceOffsets:['12'],length:12},
 ];
}
export async function verifyNativeRecoveryLeafCaptureInputs(){
 const evidence=await readInstructionEvidence(['098-post-frame-body-states-assembly.json','100-respawn-position-query-assembly.json','102-respawn-apply-assembly.json'],{directory:'analysis/native-simulation/results'});
 if(evidence.evidence.some(row=>row.subject?.digest?.sha256!==REDUX_SHA256))throw Error('Recovery leaf input evidence target differs.');
 const listing=new Map(evidence.instructions.map(row=>[row.address,row]));
 for(const[address,op,args]of[
  [0x47ccc0,'SUB',['ESP','0x54']],[0x47cef7,'LEA',['EAX','[ESP + 0x38]']],[0x47cefe,'LEA',['EAX','[ESP + 0x54]']],[0x47cf07,'LEA',['ESI','[EDI + 0xc4]']],
  [0x47cf0d,'MOV',['ECX','EDI']],[0x47cf0f,'PUSH',['ESI']],[0x47cf10,'PUSH',['EAX']],[0x47cf11,'CALL',['0x0047d040']],
  [0x47cf2f,'LEA',['EAX','[ESP + 0x58]']],[0x47cf33,'MOV',['ECX','EDI']],[0x47cf35,'PUSH',['ESI']],[0x47cf36,'PUSH',['EAX']],[0x47cf37,'CALL',['0x0047d440']],
  [0x47d07c,'MOV',['dword ptr [ESP + 0x28]','0xf9e']],[0x47d3b6,'MOV',['dword ptr [ESP + 0x34]','EBP']],[0x47d69f,'LEA',['EAX','[ESP + 0x14]']],
  [0x47d423,'POP',['EDI']],[0x47d424,'POP',['ESI']],[0x47d42b,'POP',['EDI']],[0x47d42c,'POP',['ESI']],
  [0x47d6e9,'POP',['EDI']],[0x47d6ea,'POP',['ESI']],[0x47d6fb,'POP',['EDI']],[0x47d6fc,'POP',['ESI']],
 ])if(listing.get(address)?.op!==op||JSON.stringify(listing.get(address)?.args)!==JSON.stringify(args))throw Error(`Recovery leaf pointed-input evidence differs at0x${address.toString(16)}.`);
 return {evidenceIds:evidence.evidence.map(row=>row.evidence_id)};
}
export async function createNativeRecoveryLeafCaptureConfig(directory,output,{stage='query',frames=1,skipFrames=0,stackBytesBefore=4096,maxRegionBytes=64*1024*1024,attachmentWindowBytes=1024}={}){
 const policy=recoveryLeafPolicy(stage),ids=nativeRecoveryLeafIds(stage);
 if(frames!==1||skipFrames!==0)throw Error('Recovery leaf capture admits one first matching call; alternative exits cannot share skip counters.');
 const proof=await verifyNativeRecoveryLeafCaptureInputs(),result=await createNativeRecoveryCaptureConfig(directory,output,{frames:1,skipFrames:0,stackBytesBefore,maxRegionBytes,attachmentWindowBytes,selection:'all'}),config=result.configuration;
 if(config.pendingFrameObserver)throw Error('Recovery leaf baseline cannot inherit a pending parent selector.');
 const before=config.breakpoints.find(row=>row.id==='native-recovery-before'),after=config.breakpoints.find(row=>row.id==='native-recovery-after');
 if(!before||!after)throw Error('Complete recovery bootstrap lacks its original parent observations.');
 before.id=ids.before;before.rva=rva(policy.entry);before.stopAfterHits=0;after.id=ids.after[0];after.rva=rva(policy.exits[0]);after.stopAfterHits=1;
 for(const[bp,atExit]of[[before,false],[after,true]]){
  const stack=bp.ranges.find(row=>row.id==='frame-stack');if(!stack)throw Error('Recovery bootstrap lacks its declared native stack.');stack.length=stackBytesBefore+policy.stackBytesAfter;
  bp.ranges.push(...nativeRecoveryLeafArgumentRanges(stage,{atExit}));if(new Set(bp.ranges.map(row=>row.id)).size!==bp.ranges.length)throw Error('Recovery leaf observation IDs overlap the complete bootstrap.');
 }
 const alternate=structuredClone(after);alternate.id=ids.after[1];alternate.rva=rva(policy.exits[1]);config.breakpoints.push(alternate);
 if(config.phaseActions?.some(row=>[ids.before,...ids.after].includes(row.breakpointId)))throw Error('Recovery leaf observations cannot perform writes.');
 return {...result,stage,frames:1,skipFrames:0,stackBytesAfter:policy.stackBytesAfter,evidenceIds:[...new Set([...result.evidenceIds,...proof.evidenceIds])],limitations:[
  'Baseline observation only: no rejected-body state, route, pose, quaternion, query result or physics values are written.',
  'Only the first matching active-phase4 leaf call is admitted. Both native preRETs have independent stop1 bounds and zero skips.',
  'Pointed input descriptors target the47ccc0 caller, including its nonnull quaternion; another caller is rejected by replay.',
  'Exit pointer observations use restored caller registers and proved parent locals because native argument slots are overwritten.',
  'A session transition away from phase4 during a leaf needs a separate selection policy; this baseline does not claim it.',
  ...result.limitations,
 ]};
}
async function requireNew(filename){try{await lstat(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(`Refusing existing recovery leaf output: ${filename}`);}
export async function prepareNativeRecoveryLeafCapture(directory,output,filename,options={}){
 const result=await createNativeRecoveryLeafCaptureConfig(directory,output,options);await requireNew(result.configuration.outputDirectory);await requireNew(filename);await writeFile(filename,JSON.stringify(result.configuration,null,2)+'\n',{flag:'wx'});
 return {configuration:path.resolve(filename),output:result.configuration.outputDirectory,stage:result.stage,stackBytesBefore:result.stackBytesBefore,stackBytesAfter:result.stackBytesAfter,evidence:result.evidenceIds,method:'Prepared only: complete first active recovery leaf entry and both possible preRET observations. No game launched and no recovery/route/pose/physics writes.',limits:result.limitations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[directory,output,filename,stage='query',stackBytesBefore='4096']=process.argv.slice(2);if(!directory||!output||!filename||process.argv.length>7)throw Error('Usage: node tools/prepare-native-recovery-leaf-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE query|apply [STACK_BYTES_BEFORE]');console.log(JSON.stringify(await prepareNativeRecoveryLeafCapture(directory,output,filename,{stage,stackBytesBefore:Number(stackBytesBefore)})));}
