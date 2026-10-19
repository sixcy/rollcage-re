// FUN_00417210 with its mode-specific axis policy (0x44a1c0) and route sign
// (0x449cd0). Context fields come from per-player runtime progression state.
import {signedShort,add32} from './fixed-integer.mjs';
import {unpackCollisionNormal} from './collision-grid.mjs';
export function selectTrackBasisAxis(cellRef,{mode,progressStage}) {
 const sector=cellRef&255,row=signedShort(cellRef>>>16),progress=progressStage&255;
 if((mode&255)===12) {
  if(progress===6&&sector===0)return row>23?-1:row>=16?2:1;
  if(((progress-7)&255)<=6&&sector>=4){if(sector<=5)return 1;if(sector===24){if(row>23)return -1;if(row<19)return 1;}}
 }else if((mode&255)===11) {
  if(progress===4){if(sector===5)return row>70?-1:row>=60?3:1;if(sector===3||sector===4)return 1;if(sector===16)return -1;}
  else if(progress===11){if(sector===10||sector===2)return -1;if(sector===8||sector===7)return 1;}
 }
 return 0;
}
export function readVehicleTrackBasis(data,grid,cellRef,context) {
 if((cellRef|0)<0)return null;
 if(!context||!['mode','progressStage','routeIndex'].every(key=>Number.isInteger(context[key])))throw Error('Track basis requires explicit mode, progress stage and route index.');
 const sector=grid.sectors[cellRef&255],row=signedShort(cellRef>>>16),column=(cellRef<<16)>>24;
 if(!sector||row<0||row>sector.rows||column<0||column>sector.columns)throw Error('Track-basis registration exceeds its vertex grid.');
 let first=row*(sector.columns+1)+column,second,packet=row*sector.columns+column,axis=selectTrackBasisAxis(cellRef,context);
 if(axis>1){if(column===sector.columns){second=first;first--;packet--;}else second=first+1;axis=axis===2?-1:1;}
 else {if(row===sector.rows){second=first;first-=sector.columns+1;packet-=sector.columns;}else second=first+sector.columns+1;}
 const a=sector.vertices[first],b=sector.vertices[second];if(!a||!b||packet<0||packet>=sector.cells.length)throw Error('Track-basis neighbor or packet exceeds its sector.');
 if(axis===0) {
  const offset=data.readUInt32LE(0xa0)+(context.routeIndex&255)*20;
  if(!Number.isSafeInteger(offset)||offset<0||offset+20>data.length)throw Error('Track-basis route vector exceeds resource bounds.');
  const route=[12,14,16].map(delta=>data.readInt16LE(offset+delta)),dot=route.reduce((sum,value,index)=>add32(sum,Math.imul(value,b[index]-a[index])),0);axis=dot>=0?1:-1;
 }else axis=axis===1?0:-1;
 const tangentQ16=[0,1,2].map(index=>{const value=(a[index]-b[index])<<12;return axis<0?(-value)|0:value;});
 const normalIndex=sector.cells[packet].rawNormalIndex,normal=grid.normals[normalIndex];if(!normal)throw Error('Track-basis packet normal is unavailable.');
 return {tangentQ16,normalQ16:unpackCollisionNormal(normal.packed).map(value=>value<<8)};
}
