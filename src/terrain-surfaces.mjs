// FUN_00488bf0 resolves cell references through packet +4 to a sixteen-byte
// descriptor. FUN_0041c080 consumes its +12 category / grip-reduction bits.
import {signedShort} from './fixed-integer.mjs';
export function readTerrainSurface(data,scene,cellRef) {
 if((cellRef|0)<0)return null;
 const sectorIndex=cellRef&255,column=(cellRef<<16)>>24,row=signedShort(cellRef>>>16),sector=scene.segments[sectorIndex];
 if(!sector||row<0||row>=sector.rows||column<0||column>=sector.columns)throw Error('Terrain surface cell reference exceeds its sector grid.');
 const cell=row*sector.columns+column,packet=sector.packetsOffset+cell*8;
 if(packet<0||packet+8>data.length)throw Error('Terrain surface packet exceeds resource bounds.');
 const index=data.readUInt32LE(packet+4),offset=scene.uvTable+index*16;
 if(!Number.isSafeInteger(offset)||offset<0||offset+16>data.length)throw Error('Terrain surface descriptor exceeds resource bounds.');
 const flags=data.readUInt32LE(offset+12);
 return {cellRef:cellRef>>>0,sector:sectorIndex,row,column,index,offset,flags,category:flags&255,gripReduction:(flags>>>8)&31,raw:Buffer.from(data.subarray(offset,offset+16))};
}
