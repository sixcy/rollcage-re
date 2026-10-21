import {formatLapTimeDigits} from './lap-timing.mjs';
//445d40 packs six decimal nibbles. Signed negative inputs retain the native
//unmasked OR behavior; -1 and times>=maximum use the literal595999 sentinel.
export function packLapTime(time) {
 time|=0;if(time===-1||time>=0x4650000)return 0x595999;
 const whole=time>>11,digits=[Math.trunc(whole/6000)%10,Math.trunc(whole/600)%10,Math.trunc(whole/100)%6,Math.trunc(whole/10)%10,whole%10,(Math.imul(time>>4,10)>>>7)%10];
 return digits.reduce((value,digit)=>(value<<4)|digit,0)>>>0;
}
//449be0. Native-addressed caller memory preserves cached session pointers and
//body/record aliases across the formatting and conversion callbacks.
export function finishLapBookkeeping(record,{memory,handlers={}}) {
 const current=memory.readUInt32LE(record+0x2c),best=memory.readUInt32LE(record+0x30);
 if(best===0xffffffff||current<best)memory.writeUInt32LE(current,record+0x30);
 memory.writeUInt32LE(current,record+0x38);
 memory.writeUInt32LE(Math.floor(((memory.readInt32LE(0x90a548)<<11)>>>0)/3),record+0x4c);
 (handlers.formatTime4459f0??((allRows,address)=>formatLapTimeDigits(memory.subarray(address,address+0x30c),allRows)))(1,record);
 const lap=memory[record+0x1c];if(lap===0)return;
 const session=memory.readUInt32LE(0x5ecb1c);if(memory[session+0x58c]!==0)return;
 const time=memory.readUInt32LE(record+0x38);
 if(memory[session+0x551]!==1){
  const packed=(handlers.convertTime445d40??packLapTime)(time)>>>0,body=memory.readUInt32LE(record),index=memory.readUInt16LE(body+0x65e);
  memory.writeUInt32LE(packed,session+(index*0x37+lap)*4+0x2c);return;
 }
 const body=memory.readUInt32LE(record),index=memory.readUInt16LE(body+0x65e),packed=(handlers.convertTime445d40??packLapTime)(time)>>>0,base=session+index*0xdc;
 for(let slot=0;slot<5;slot++)if(packed<memory.readUInt32LE(base+0x30+slot*4)){
  for(let tail=4;tail>slot;tail--)memory.writeUInt32LE(memory.readUInt32LE(base+0x30+(tail-1)*4),base+0x30+tail*4);
  memory.writeUInt32LE(packed,base+0x30+slot*4);return;
 }
}
