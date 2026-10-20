// Native0x413fc0. The gameplay meaning of these16-byte records is unresolved.
// All bytes other than signed status+6 remain untouched.
export function updateWorldEffectRecords(records,{count,effectFlag,originS16,strength}={}) {
 if(!Buffer.isBuffer(records)||(records.length&15))throw Error('World effect records require complete16-byte records.');
 if(!Number.isInteger(count)||count<0||count>0x7fffffff||count>records.length/16)throw Error('World effect records require an explicit in-bounds count.');
 for(const [name,value]of [['effectFlag',effectFlag],['strength',strength]])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error(`World effect records require signed32 ${name}.`);
 if(!Array.isArray(originS16)||originS16.length!==3||originS16.some(value=>!Number.isInteger(value)||value< -32768||value>32767))throw Error('World effect records require an explicit signed-short origin.');
 if(effectFlag===0||count===0)return 0;
 const numerator=strength<<15;let updated=0;
 for(let index=0;index<count;index++){
  const base=index*16,status=records.readInt8(base+6);if(status<=0)continue;
  let distance=0;
  for(let axis=0;axis<3;axis++){const delta=(records.readInt16LE(base+axis*2)-originS16[axis])>>2,squared=Math.imul(delta,delta);if(squared>distance)distance=squared;}
  if(distance===0)distance=1;
  const next=(status+(1-Math.trunc(numerator/distance)))|0;
  records[base+6]=next>0?next&255:0;updated++;
 }
 return updated;
}
