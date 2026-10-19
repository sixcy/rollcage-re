import {placementMatrix} from './fixed-math.mjs';
// BTP records consumed by the GFXM/BTP loader FUN_0044c2b0.
export function parsePlacements(data,models) {
 if(!Buffer.isBuffer(data)||data.length<0x40||data.toString('ascii',0,4)!=='BTP ')throw Error('Invalid BTP placement header.');
 const count=data.readUInt32LE(0x14),offset=data.readUInt32LE(0x28);
 if(offset+count*56>data.length)throw Error('BTP placement records exceed resource bounds.');
 const records=Array.from({length:count},(_,index)=>{
  const p=offset+index*56,flags=data.readUInt16LE(p),type=flags&0x3ff;
  const record={index,offset:p,flags,type,position:[8,10,12].map(a=>data.readInt16LE(p+a)),
   angles:[14,16,18].map(a=>data.readInt16LE(p+a)),raw:Buffer.from(data.subarray(p,p+56))};
  if(type===0) {
   record.modelIndex=data[p+3];
   if(!models[record.modelIndex])throw Error(`Placement ${index} references missing model ${record.modelIndex}.`);
   record.uvStarts=[40,42,44].map(a=>data.readUInt16LE(p+a));
   record.matrix=placementMatrix(record.angles);
  }
  return record;
 });
 return {count,offset,records};
}
