import {createCapturedMemory} from './captured-memory.mjs';
import {validateCapturedGuardedPointerRanges} from './captured-guarded-pointer-ranges.mjs';

//486146 material-loop replacement reaches code7 through484bb0/40ea40.
//40dee8/40df02 establish the same490h owner extent as code2/code19.
export function nativeControlSurfaceSound7CaptureRange(){return {
  id:'control-surface-sound7-owner',rva:'0x2f2414',dereferenceOffsets:['0','0x1c'],dereferenceMinimumValues:[1,1],length:0x490
};}

//Only authenticated original parent-entry bytes can supply reconstruction input.
//Later checkpoint rows are comparison observations, never owner initializers.
export function nativeControlSurfaceSound7ObservedRegions(snapshot,moduleBaseAddress){
  if(snapshot?.breakpointId!=='native-control-before')throw Error('Surface sound7 input requires the original parent-entry observation.');
  if(!Number.isSafeInteger(moduleBaseAddress)||moduleBaseAddress<=0||moduleBaseAddress+0x2f2420>0x100000000)throw Error('Surface sound7 requires its actual bounded module base.');
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
  if(!Array.isArray(rows))throw Error('Surface sound7 requires actual captured range rows.');
  const banks=rows.filter(row=>row.id==='control-sound-bank-storage'),owners=rows.filter(row=>row.id==='control-surface-sound7-owner');
  if(banks.length!==1||owners.length!==1)throw Error('Surface sound7 requires one original bank storage and guarded owner observation.');
  const original=createCapturedMemory(rows),headerAddress=moduleBaseAddress+0x2f2414,header=original.span(headerAddress,12);
  const begin=header.readUInt32LE(),end=header.readUInt32LE(4),capacity=header.readUInt32LE(8),bank=banks[0],owner=owners[0];
  if(bank.rangeMode!=='vector-storage'||Number(bank.moduleBaseAddress)!==moduleBaseAddress||Number(bank.rootRva)!==0x2f2414||Number(bank.vectorHeaderAddress)!==headerAddress||bank.vectorHeaderHex!==header.toString('hex')||Number(bank.address)!==begin||Number(bank.vectorBegin)!==begin||Number(bank.vectorEnd)!==end||Number(bank.vectorCapacity)!==capacity||bank.bytes.length!==capacity-begin||bank.length!==bank.bytes.length||!begin||begin>end||end>capacity||(end-begin)%4||(capacity-begin)%4||capacity-begin>65536||bank.maxVectorBytes!==65536||(end-begin)/4<=7)throw Error('Surface sound7 requires its actual used bank slot and complete bounded vector capacity.');
  if(owner.rangeMode!=='guarded-pointer')throw Error('Surface sound7 requires its original guarded owner observation.');
  validateCapturedGuardedPointerRanges([...rows.filter(row=>row.rangeMode!=='guarded-pointer'),owner],{expectedDescriptors:[nativeControlSurfaceSound7CaptureRange()]});
  if(Number(owner.moduleBaseAddress)!==moduleBaseAddress)throw Error('Surface sound7 owner has a different original module base.');
  const address=original.span(begin+7*4,4).readUInt32LE();
  if(!address){if(owner.guardedStopIndex!==1||owner.bytes.length!==0||Number(owner.address)!==0)throw Error('Absent surface sound7 owner cannot grant replacement memory.');return [];}
  if(owner.guardedStopIndex!==null||Number(owner.address)!==address||owner.bytes.length!==0x490)throw Error('Surface sound7 owner differs from its actual bank slot/allocation.');
  return [{id:'control-surface-sound7-owner',address,length:0x490,comparison:'mutable',evidence:'Original parent-entry code7 owner reached by actual486146 material-loop replacement;40dee8/40df02 490h allocation. No channel backing, source object, allocator answer or native after state is supplied.'}];
}
