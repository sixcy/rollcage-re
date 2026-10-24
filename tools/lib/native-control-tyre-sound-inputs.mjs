import {createCapturedMemory} from './captured-memory.mjs';
import {validateCapturedGuardedPointerRanges} from './captured-guarded-pointer-ranges.mjs';

//Same40dee8/40df02 490h owner allocation as the existing sound19 observer.
//Only the independently reached48608f sound2 bank slot is added here.
export function nativeControlTyreSound2CaptureRange(){return {
  id:'control-tyre-sound2-owner',rva:'0x2f2414',dereferenceOffsets:['0','0x8'],dereferenceMinimumValues:[1,1],length:0x490
};}

export function nativeControlTyreSound2ObservedRegions(snapshot,moduleBaseAddress){
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
  const original=createCapturedMemory(rows),headerAddress=moduleBaseAddress+0x2f2414,header=original.span(headerAddress,12);
  const begin=header.readUInt32LE(),end=header.readUInt32LE(4),capacity=header.readUInt32LE(8);
  const bank=rows.find(row=>row.id==='control-sound-bank-storage'),owner=rows.find(row=>row.id==='control-tyre-sound2-owner');
  if(!bank||bank.rangeMode!=='vector-storage'||Number(bank.vectorHeaderAddress)!==headerAddress||bank.vectorHeaderHex!==header.toString('hex')||Number(bank.address)!==begin||Number(bank.vectorBegin)!==begin||Number(bank.vectorEnd)!==end||Number(bank.vectorCapacity)!==capacity||bank.bytes.length!==capacity-begin||begin>end||end>capacity||(end-begin)%4||(capacity-begin)%4||capacity-begin>65536||bank.maxVectorBytes!==65536||(end-begin)/4<=2)throw Error('Tyre sound2 requires the independently observed used bank slot and bounded vector storage.');
  if(!owner||owner.rangeMode!=='guarded-pointer')throw Error('Tyre sound2 requires its original guarded owner observation.');
  validateCapturedGuardedPointerRanges([...rows.filter(row=>row.rangeMode!=='guarded-pointer'),owner],{expectedDescriptors:[nativeControlTyreSound2CaptureRange()]});
  if(Number(owner.moduleBaseAddress)!==moduleBaseAddress)throw Error('Tyre sound2 owner has a different original module base.');
  const address=original.span(begin+8,4).readUInt32LE();
  if(!address){if(owner.guardedStopIndex!==1||owner.bytes.length!==0||Number(owner.address)!==0)throw Error('Absent tyre owner cannot grant replacement memory.');return [];}
  if(owner.guardedStopIndex!==null||Number(owner.address)!==address||owner.bytes.length!==0x490)throw Error('Tyre sound2 owner differs from its actual bank slot/allocation.');
  return [{id:'control-tyre-sound2-owner',address,length:0x490,comparison:'mutable',evidence:'Original parent-entry nonnull code2 owner; same40dee8/40df02 490h allocation, reached from actual48608f tyre producer. No native after state is supplied.'}];
}
