import {createCapturedMemory} from './captured-memory.mjs';

//40ea40 reads the live owner vector;40dee8/40df02 allocate490h owners.
//Observation limits bound transport, not native capacities or default data.
export function nativeControlSound19CaptureRanges(){
  return [
    {id:'control-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536},
    {id:'control-sound19-owner',rva:'0x2f2414',dereferenceOffsets:['0','0x4c'],dereferenceMinimumValues:[1,1],length:0x490},
  ];
}

//Called only on an authenticated parent-entry snapshot. Guard proofs require
//independent header/slot bytes, and a false guard admits no replacement owner.
export function nativeControlSound19ObservedRegions(snapshot,moduleBaseAddress){
  const rows=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges,m=createCapturedMemory(rows),header=moduleBaseAddress+0x2f2414;
  const bytes=m.span(header,12),begin=bytes.readUInt32LE(),end=bytes.readUInt32LE(4),capacity=bytes.readUInt32LE(8),storage=rows.find(row=>row.id==='control-sound-bank-storage'),ownerRow=rows.find(row=>row.id==='control-sound19-owner');
  if(!storage||storage.rangeMode!=='vector-storage'||Number(storage.vectorHeaderAddress)!==header||storage.vectorHeaderHex!==bytes.toString('hex')
    ||Number(storage.vectorBegin)!==begin||Number(storage.vectorEnd)!==end||Number(storage.vectorCapacity)!==capacity||storage.maxVectorBytes!==65536
    ||begin>end||end>capacity||(end-begin)%4||(capacity-begin)%4||capacity-begin>65536||Number(storage.address)!==begin||storage.bytes.length!==capacity-begin)throw Error('Collision-sound bank storage differs from its actual vector header.');
  if((end-begin)/4<=19)throw Error('Collision-sound observation requires code19 within the actual used vector.');
  if(!ownerRow||ownerRow.rangeMode!=='guarded-pointer')throw Error('Collision-sound owner requires its actual guarded observation.');
  const owner=m.span(begin+19*4,4).readUInt32LE(),regions=[{id:'control-sound-bank-capacity',address:begin,length:capacity-begin,comparison:'mutable',evidence:'Actual sound-owner vector begin/end/capacity; entire observed capacity retained and compared.'}];
  if(!owner){
    if(ownerRow.guardedStopIndex!==1||ownerRow.bytes.length!==0||Number(ownerRow.address)!==0)throw Error('Null sound19 slot must grant no owner storage.');
  }else{
    if(ownerRow.guardedStopIndex!==null||Number(ownerRow.address)!==owner||ownerRow.bytes.length!==0x490)throw Error('Collision-sound owner extent differs from its actual slot.');
    regions.push({id:'control-sound19-owner',address:owner,length:0x490,comparison:'mutable',evidence:'Actual nonnull code19 bank slot and complete490h sound owner;40dee8 allocation/40df02 construction.'});
  }
  return regions;
}
