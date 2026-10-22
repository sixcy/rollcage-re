const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),f32=Math.fround;
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
function truncate(m,p,value){m.writeFloatLE(value,p);const bits=get(m,p),exponent=(bits>>23&255)-127,sign=bits>>31;return((((bits|0xff800000)<<8)>>>((31-exponent)&31))^sign)-sign&~(exponent>>31);}
function format(decoder,runtime,returned){const m=runtime.memory,stream=ptr(m,decoder+12),target=ptr(m,ptr(m,stream)+16);if(target!==0x4b3ed0)throw Error(`Unported stream PCM format target0x${target.toString(16)}.`);put(m,runtime.scratchBase-40,returned);return stream+8;}
//4af880 consumes the existing decoded buffer. Equal formats honor the raw
//requested byte limit. Conversion follows available input frames and original
//channel/width policy, retaining native argument overwrites and phase residue.
export function resampleGameAudioStream(decoder,output,requestedBytes,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-36;if(!Number.isInteger(S))throw Error('Stream PCM requires native entry ESP.');save(runtime,S,[['EBX',-24],['EBP',-28],['ESI',-32],['EDI',-36]]);put(m,F+16,decoder);
 let fmt=format(decoder,runtime,0x4af895);const targetChannels=m.readUInt16LE(fmt+2);put(m,F+32,targetChannels);fmt=format(decoder,runtime,0x4af8a5);let same=true;for(let o=0;o<16;o+=4)if(get(m,decoder+0x80+o)!==get(m,fmt+o)){same=false;break;}if(same&&m.readUInt16LE(decoder+0x90)!==m.readUInt16LE(fmt+16))same=false;let bytes;
 if(same){bytes=Math.min(ptr(m,decoder+0x9c),ptr(m,S+8));const args=[ptr(m,S+4),ptr(m,decoder+0x98),bytes];args.forEach((v,i)=>put(m,F-12+i*4,v));put(m,F-16,0x4af8ef);runtime.services.libraryCall('memcpy',args,{...runtime,scratchBase:F-16});}
 else{
  const channels=m.readUInt16LE(decoder+0x82),alignment=m.readUInt16LE(decoder+0x8c);put(m,S+8,channels);put(m,F+28,alignment);if(!alignment)throw RangeError('Native stream PCM alignment divide by zero.');const frames=Math.trunc(get(m,decoder+0xa0)/alignment)|0;put(m,F+20,frames);const width=m.readUInt16LE(decoder+0x8e)>>>3;const sourceRate=f32(ptr(m,decoder+0x84));m.writeFloatLE(sourceRate,F+24);fmt=format(decoder,runtime,0x4af952);const ratio=f32(sourceRate/f32(ptr(m,fmt+4)));let phase=m.readFloatLE(decoder+0x94),index=truncate(m,F+24,phase),destination=ptr(m,S+4),lastSample=0;
  while(index<frames){let offset=Math.imul(index,alignment);for(let channel=0;channel<get(m,S+8);channel++){const input=ptr(m,decoder+0x98)+offset;if(width===1)lastSample=(m[input]-128)<<8;else if(width===2)lastSample=m.readInt16LE(input);else if(width===4)lastSample=m.readInt16LE(input+2);m.writeUInt16LE(lastSample&65535,destination);offset=offset+width|0;destination=destination+2|0;}
   const liveChannels=get(m,S+8);if(liveChannels<get(m,F+32)){let input=destination-liveChannels*2;for(let i=0;i<get(m,F+32)-liveChannels;i++){m.writeUInt16LE(m.readUInt16LE(input),destination);input+=2;destination+=2;}}
   const previous=phase;phase=f32(m.readFloatLE(decoder+0x94)+ratio);m.writeFloatLE(phase,F+24);m.writeFloatLE(phase,decoder+0x94);index=truncate(m,F+24,phase);if(phase===previous&&index<frames)throw RangeError('Native stream PCM phase makes no progress.');
  }bytes=destination-ptr(m,S+4)|0;
 }
 const phase=m.readFloatLE(decoder+0x94),integer=truncate(m,S+4,phase);m.writeFloatLE(phase,S+8);const floor=integer-(ptr(m,S+8)>>>31)|0;m.writeFloatLE(f32(phase-f32(floor)),decoder+0x94);return bytes;
}
