import constants from './track-trigger-constants.json' with {type:'json'};
import {reduceRawCameraDirection} from './camera-pose-helpers.mjs';
import {rawVectorLength} from './raw-vector-normalization.mjs';
import {abs32,divideQ16,multiplyQ16} from './fixed-integer.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
//41aab0. Literal original per-track trigger segments are parent stack data,
//written in original order; capture markers retain the real alias timing.
export function initializeTrackTriggerSegments(runtime){const{memory:m,scratchBase:S,entryRegisters={},services}=runtime,F=S-0x474,probe=S-0x464;put(m,S-8,ptr(m,0x5e8890)^probe);for(const[name,o]of[['EBX',12],['EBP',8],['ESI',4],['EDI',0]])if(entryRegisters[name]!==undefined)put(m,F+o,entryRegisters[name]);let session,mode;
 for(const op of constants.operations){if(op.captureSession)session=ptr(m,0x5ecb1c);else if(op.captureMode)mode=m[session+0x579];else if(op.width===2)m.writeUInt16LE(op.value&65535,F+op.offset);else put(m,F+op.offset,op.value);}
 let count=get(m,0x6e6550);
 if(mode<20&&ptr(m,F+0x3c8+mode*4)){let index=0,row=0x91f6c4+Math.imul(count,56);do{const input=F+0x28+((get(m,F+0x418+mode*4)+index)<<4);if(count<40){count++;put(m,row-4,1);put(m,row,m.readInt16LE(input)<<16);put(m,row+4,(m.readInt16LE(input+2)-50)<<16);put(m,row+8,m.readInt16LE(input+4)<<16);put(m,row+12,m.readInt16LE(input+8)<<16);put(m,row+16,(m.readInt16LE(input+10)-50)<<16);put(m,row+20,m.readInt16LE(input+12)<<16);row+=56;}mode=m[session+0x579];index++;}while(index<ptr(m,F+0x3c8+mode*4));put(m,0x6e6550,count);}
 let index=0,record=0x91f6f0;
 while(index<count){if(get(m,record-48)===1){for(const[o,a,b]of[[-8,-32,-44],[-4,-28,-40],[0,-24,-36]])put(m,record+o,get(m,record+a)-get(m,record+b));for(const o of[0,4,8])put(m,F+0x1c+o,get(m,record-8+o));put(m,F-4,0x41b722);const shift=reduceRawCameraDirection(F+0x1c,runtime);put(m,F-4,0x41b72d);put(m,record+4,rawVectorLength(F+0x1c,runtime)<<shift);
  for(const[o,a,b]of[[-20,-8,-44],[-16,-4,-40],[-12,0,-36]])put(m,record+o,(get(m,record+a)>>1)+get(m,record+b));put(m,F-4,0x41b75c);reduceRawCameraDirection(record-8,runtime);
  const x=get(m,record-8);if(abs32(x)>0x230000||abs32(get(m,record-4))>0x230000||abs32(get(m,record))>0x230000){put(m,record-4,get(m,record-4)>>3);put(m,record,get(m,record)>>3);put(m,record-8,x>>3);}
  put(m,F-4,0x41b79f);const length=rawVectorLength(record-8,runtime);put(m,F-4,0x41b7ab);put(m,F+0x18,divideQ16(65536,length));for(const o of[-8,-4,0]){put(m,F+0x14,get(m,record+o));put(m,record+o,multiplyQ16(get(m,F+0x14),get(m,F+0x18)));}count=get(m,0x6e6550);
 }index++;record+=56;}
 const cookie=(ptr(m,S-8)^probe)>>>0;put(m,probe-4,0x41b825);if(services?.securityCookie)services.securityCookie(cookie,{...runtime,scratchBase:probe-4});else if(cookie!==ptr(m,0x5e8890))throw Error('Native track-trigger security cookie mismatch.');
}
