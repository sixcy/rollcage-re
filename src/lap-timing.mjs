//4459f0 packs eight HUD glyph nibbles from each Q11 centisecond timer.
//All storage aliases the caller's native vehicle record, including stale rows.
export function formatLapTimeDigits(record,allRows=0) {
 if(!Buffer.isBuffer(record)||record.length<0x4c)throw Error('Lap timing requires the native record through byte4b.');
 for(let row=0;row<4;row++){
  if(!allRows&&(row===1||row===3))continue;
  const time=record.readInt32LE(0x2c+row*4),whole=time>>11;
  const digits=time===-1?[11,11,10,11,11,10,11,11]:[
   Math.trunc(whole/6000)%10,Math.trunc(whole/600)%10,10,
   Math.trunc(whole/100)%6,Math.trunc(whole/10)%10,10,whole%10,
   (Math.imul(time>>4,10)>>>7)%10
  ];
  let packed=0;for(let index=0;index<8;index++)packed|=(digits[index]&15)<<(index*4);
  record.writeInt32LE(packed,0x3c+row*4);
 }
 return record;
}

//44a560 captures the current timer at38, sets body66c, and formats all rows.
//The clock shift wraps before unsigned division by3; it is not a float timer.
export function updateLapAdvance(record,{body,clock90a548}={}) {
 if(!Buffer.isBuffer(record)||record.length<0x50)throw Error('Lap advance requires native record bytes through4f.');
 if(record[0x1e]!==record[0x1c])return;
 record.writeInt32LE(record.readInt32LE(0x2c),0x38);
 let code=0x4f;
 if(record[0x20]===0){
  if(record[0x1c]===0)return;
  if(!Number.isInteger(clock90a548))throw Error('Lap advance requires the explicit clock90a548.');
  record.writeUInt32LE(Math.trunc(((clock90a548<<11)>>>0)/3),0x4c);code=0xbf;
 }
 if(!Buffer.isBuffer(body?.bytes)||body.bytes.length<0x66d)throw Error('Lap advance requires the selected native body bytes.');
 body.bytes[0x66c]=code;
 formatLapTimeDigits(record,1);
}
