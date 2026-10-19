import table from './yaw-table.json' with {type:'json'};
import {add32,subtract32} from './fixed-integer.mjs';
const productShift8=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>8n));
// FUN_00429360 / 00423ab0 use a byte yaw and signed Q14 table entries,
// truncated to Q8 before their separate 64-bit products and shifts.
export function rotateModelYaw(vector,index) {
 if(!Number.isInteger(index)||index<0||index>256)throw Error('Model yaw lookup index must be from 0 to 256.');
 const sine=table.values[index]>>6,cosine=table.values[index+64]>>6;
 return [add32(productShift8(vector[0],cosine),productShift8(vector[2],sine)),vector[1],
  add32(productShift8((-vector[0])|0,sine),productShift8(vector[2],cosine))];
}
export function rotateModelYawPoint(pointQ8,positionQ16,index) {
 const position=positionQ16.map(value=>value>>8),relative=pointQ8.map((value,i)=>subtract32(value,position[i]));
 return rotateModelYaw(relative,index).map((value,i)=>add32(value,position[i]));
}
export function toModelYawQuery(query,positionQ16,yaw) {
 return {...query,originQ8:rotateModelYawPoint(query.originQ8,positionQ16,256-yaw),deltaQ8:rotateModelYaw(query.deltaQ8,256-yaw)};
}
