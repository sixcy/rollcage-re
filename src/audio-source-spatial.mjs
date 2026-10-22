import {getGameAudioSamplePositionAddress} from './audio-sample-controls.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
function save(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
//4aa090, listener virtual slot8.
export function getAudioListenerPositionAddress(listener){return listener+0x20;}
//4020e0, original four-lane vector constructor (the fourth DWORD is zero).
export function writeAudioSpatialDifference(output,x,y,z,{memory:m}){m.writeFloatLE(x,output);m.writeFloatLE(y,output+4);m.writeFloatLE(z,output+8);put(m,output+12,0);return output;}
//4a9da0: sample pointer is the caller-owned argument at native entryESP+4.
export function selectClosestAudioListener(manager,runtime){
 const{memory:m,scratchBase:S}=runtime,F=S-56;
 save(runtime,S,[['EBX',-44]]);m.writeFloatLE(m.readFloatLE(0x5dcabc),F+16);
 let sample=ptr(m,S+4);save(runtime,S,[['EBP',-48],['ESI',-52],['EDI',-56]]);put(m,F+36,manager);
 let target=ptr(m,ptr(m,sample)+0x60);put(m,F-4,0x4a9dc6);if(target!==0x4ad410)throw Error('Unported audio source position getter0x'+target.toString(16));
 const position=getGameAudioSamplePositionAddress(sample);m.writeFloatLE(m.readFloatLE(position),F+28);m.writeFloatLE(m.readFloatLE(position+4),F+24);
 const z=m.readFloatLE(position+8),vector=ptr(m,manager+0x82c);m.writeFloatLE(z,F+20);
 let iterator=ptr(m,vector),end=ptr(m,vector+4),count=iterator>end?0:((end-iterator+3)>>>0)>>>2,closest=0;
 for(let i=0;i<count;i++,iterator+=4){
  const listener=ptr(m,iterator);put(m,F+32,listener);target=ptr(m,ptr(m,listener)+8);put(m,F-4,0x4a9e13);if(target!==0x4aa090)throw Error('Unported audio listener position getter0x'+target.toString(16));
  const p=getAudioListenerPositionAddress(listener),dz=f32(m.readFloatLE(p+8)-m.readFloatLE(F+20)),dy=f32(m.readFloatLE(p+4)-m.readFloatLE(F+24)),dx=f32(m.readFloatLE(p)-m.readFloatLE(F+28));
  put(m,F-4,0x4a9e3c);writeAudioSpatialDifference(F+40,dx,dy,dz,runtime);
  const x=m.readFloatLE(F+40),y=m.readFloatLE(F+44),z=m.readFloatLE(F+48),distance=f32(f32(f32(y*y)+f32(x*x))+f32(z*z));
  if(m.readFloatLE(F+16)>distance){closest=ptr(m,F+32);m.writeFloatLE(distance,F+16);}
 }
 sample=ptr(m,S+4);const distance=m.readFloatLE(F+16);m.writeFloatLE(distance,sample+0x970);put(m,sample+0x96c,closest||ptr(m,ptr(m,F+36)+0x828));return closest;
}
//4a4d00: the game wrapper's only numeric child is the genuine CRT sqrt.
export function sqrtAudioSourceDistance(value,runtime){const{memory:m,scratchBase:S}=runtime;save(runtime,S,[['EBP',-4]]);const entry=((S-4)&~7)-4;put(m,entry,0x4a4d0f);if(typeof runtime.services?.libraryCall!=='function')throw Error('Audio distance requires CRT sqrt service.');return f32(runtime.services.libraryCall('sqrt',[f32(value)],{...runtime,scratchBase:entry}));}
