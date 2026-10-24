import {nativeGlobalAddress} from './native-global-address.mjs';
import {appendAuthoredRaceObject} from './race-object-construction.mjs';
import {initializeAuthoredObjectAttachments} from './track-object-metadata.mjs';
import {createWormholeRenderParticle} from './wormhole-visuals.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);

//44cc53..44ccb7 and44cfc2..44d0b7, owned sections of44c2b0 rather
//than new native callees. F, index and the child entry/registers are the
//original parent's live state, including shared attachment numbering.
export function constructTrackNonordinaryObject(authored,pack,index,F,target,runtime,child) {
 const {memory:m}=runtime;let body;
 if(target===0x44cc53){put(m,F-4,0x44cc5b);body=appendAuthoredRaceObject(authored,child);put(m,F-4,F+20);put(m,F-8,0x44cc6c);initializeAuthoredObjectAttachments(body,authored,F+20,{...child,scratchBase:F-8,entryRegisters:{...child.entryRegisters,EBX:body}});let special=get(m,0x6e6518);for(const o of[28,29])if(m[authored+o]){put(m,0x6f9690+Math.imul(special,8),body);put(m,0x6f9694+Math.imul(special,8),m[authored+o]);special=special+1|0;put(m,0x6e6518,special);}pack=ptr(m,0x90b990);
 }else if(target===0x44cfc2||target===0x44d043){const color=target===0x44d043;if(color){m[F+19]=m[authored+30];m[F+36]=m[authored+4];}else{m[F+52]=m[authored+5];m[F+40]=m[authored+4];}const args=[m.readUInt16LE(authored+12),m.readUInt16LE(authored+6),get(m,F+(color?36:40)),color?128:get(m,F+52)];for(let i=0;i<4;i++)put(m,F-16+i*4,args[i]);put(m,F-20,color?0x44d078:0x44cff1);body=createWormholeRenderParticle(m.readUInt16LE(authored+8),m.readUInt16LE(authored+10),args[0],args[1],args[2],args[3],{...child,scratchBase:F-20});index=get(m,F+24);
  if(color){const counter=get(m,F+20);put(m,F+20,counter+1);put(m,body,13);put(m,nativeGlobalAddress(m, 0x80e660)+counter*4,body);m[body+0x90]=m[authored+28];m[body+0x91]=m[authored+29];m[body+0x92]=m[F+19];word(m,body+0x93,255);pack=ptr(m,0x90b990);}else{put(m,body,2);const n=get(m,0x6e6cbc);if(n<40){const row=nativeGlobalAddress(m, 0x80dfa0)+Math.imul(n,12);put(m,row,m.readInt16LE(body+16)<<16);put(m,row+4,m.readInt16LE(body+18)<<16);put(m,0x6e6cbc,n+1);put(m,row+8,m.readInt16LE(body+20)<<16);}}
 }else throw Error('Unsupported native nonordinary constructor target0x'+target.toString(16));
 return {body,index,pack};
}
