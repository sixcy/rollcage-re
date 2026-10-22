import sqrtTable from './sqrt-table.json' with {type:'json'};
// Integer primitives matching the x86 fixed-point paths. Products use the signed
// 64-bit intermediate, shift arithmetically, then keep the low signed 32 bits.
export const i32=value=>Number(BigInt.asIntN(32,BigInt(value)));
export const add32=(a,b)=>(a+b)|0;
export const subtract32=(a,b)=>(a-b)|0;
export const abs32=value=>((value^(value>>31))-(value>>31))|0;
export const multiplyQ16=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>16n));
export function divideQ16(numerator,denominator) {
 if((denominator|0)===0)throw Error('Fixed-point division by zero.');
 const quotient=(BigInt(numerator|0)<<16n)/BigInt(denominator|0);
 if(quotient< -2147483648n||quotient>2147483647n)throw Error('Fixed-point division overflows an x86 signed quotient.');
 return Number(quotient);
}
// FUN_0041ca60, including normalization/truncation before its 16-bit root walk.
// The supported mathematical input domain is nonnegative signed Q16.
export function sqrtQ16(value) {
 if(!Number.isInteger(value)||value<0||value>0x7fffffff)throw Error('Fixed-point square root requires nonnegative signed Q16.');
 let shift=(Math.clz32(value)-2)&~1,scaled;
 if(shift<17)scaled=shift<1?value>>((-shift)&31):value<<shift;
 else{shift=16;scaled=value<<16;}
 let root=0,square=0,bit=0x8000;
 for(let step=15;step>=0;step--) {
  const candidate=(square+((bit+root*2)<<step))|0;
  if(candidate<=scaled){root=(root+bit)|0;square=candidate;}
  bit=(bit>>>1)|((bit&1)<<31);
 }
 return root<<(((16-shift)/2)&31);
}
export const dotQ16=(a,b)=>a.reduce((sum,value,index)=>add32(sum,multiplyQ16(value,b[index])),0);
export function crossQ16(a,b) {
 return [subtract32(multiplyQ16(a[1],b[2]),multiplyQ16(a[2],b[1])),
  subtract32(multiplyQ16(a[2],b[0]),multiplyQ16(a[0],b[2])),
  subtract32(multiplyQ16(a[0],b[1]),multiplyQ16(a[1],b[0]))];
}
export function multiplyQuaternionQ16(a,b) {
 const vector=crossQ16(a.slice(1),b.slice(1));
 return [subtract32(multiplyQ16(a[0],b[0]),dotQ16(a.slice(1),b.slice(1))),
  ...vector.map((value,index)=>add32(add32(value,multiplyQ16(a[0],b[index+1])),multiplyQ16(b[0],a[index+1])))];
}
export function multiplyMatrixQ16(a,b) {
 return Array.from({length:9},(_,index)=>{const row=Math.floor(index/3),col=index%3;
  return dotQ16(a.slice(row*3,row*3+3),[b[col],b[col+3],b[col+6]]);});
}
export const transformVectorQ16=(matrix,vector)=>[0,1,2].map(row=>dotQ16(matrix.slice(row*3,row*3+3),vector));
// FUN_00432e70 returns an integer root, using its normalized 192-entry table.
export function lookupSqrt(value) {
 if(!Number.isInteger(value)||value<0||value>0x7fffffff)throw Error('Lookup square root requires a nonnegative signed integer.');
 if(value===0)return 0;
 const evenLeading=Math.clz32(value)&~1,shift=evenLeading-24;
 const normalized=shift<0?value>>(-shift):value<<shift;
 return (sqrtTable.values[normalized-64]<<((31-evenLeading)>>1))>>>12;
}
export function normalizeQuaternionQ16(quaternion,nativeState) {
 const large=quaternion.some(value=>abs32(value)>0xb40000);
 let length;
 if(large) {
  const integers=quaternion.map(value=>Math.trunc(value/65536));
  const squared=integers.reduce((sum,value)=>add32(sum,Math.imul(value,value)),0);
  nativeState?.sqrtLookup(squared);length=Math.min(lookupSqrt(squared),0x7ff8)<<16;
 }else {const squared=dotQ16(quaternion,quaternion);nativeState?.sqrtLookup(squared);length=lookupSqrt(squared)<<8;}
 if(length===0)return quaternion.slice();
 const scale=divideQ16(65536,length);
 return quaternion.map(value=>multiplyQ16(value,scale));
}
// FUN_0041c9c0: vector length with the native squared-component overflow test.
export function vectorLengthQ16(vector) {
 let squared=vector.map(value=>multiplyQ16(value,value));
 const scale=squared.reduce((bits,value)=>bits|value,0)&0xe0000000?1:0;
 if(scale)squared=squared.map(value=>value>>>2);
 return sqrtQ16(squared.reduce(add32,0))<<scale;
}
export const signedShort=value=>(value<<16)>>16;
// FUN_004334b0 consumes signed shorts, accumulates integer products, then shifts
// once. Per-product Q16 rounding would change this path.
export function transformShortQ12(matrix,vector) {
 return [0,1,2].map(row=>vector.reduce((sum,value,col)=>add32(sum,Math.imul(signedShort(matrix[row*3+col]),signedShort(value))),0)>>12);
}
