import {nativeGlobalAddress} from './native-global-address.mjs';
import {createRawBody} from './raw-body-construction.mjs';
import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {quaternionMatrix} from './fixed-math.mjs';
import {initializeAuthoredObjectQuaternion} from './race-object-construction.mjs';
import {initializeAuthoredObjectAttachments, registerTrackMaterialPolygons} from './track-object-metadata.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
function callLibrary(runtime,F,name,args,ret){const{memory:m}=runtime;for(let i=0;i<args.length;i++)put(m,F-args.length*4+i*4,args[i]);const entry=F-(args.length+1)*4;put(m,entry,ret);if(!runtime.services?.libraryCall)throw Error('Track loader requires CRT '+name);return runtime.services.libraryCall(name,args,{...runtime,scratchBase:entry});}

//44ccbc..44cfb7: an extracted owned section of44c2b0, not a native callee.
//F is the actual parent frame; runtime and child retain their distinct original
//entry stacks/registers. No extra native CALL/return or scratch writes occur.
export function constructTrackPlacedObject(authored,pack,F,runtime,child) {
 const {memory:m}=runtime;let index;
 put(m,F-4,authored+28);put(m,F-8,0x1b4);put(m,F-12,0x44ccd4);const body=createRawBody(ptr(m,ptr(m,pack+24)+m[authored+3]*4),m.readUInt16LE(authored),0x1b4,authored+28,{...child,scratchBase:F-12});m[body+0x169]=m[authored+38];for(const[o,s]of[[0x180,32],[0x184,34],[0x188,36]])put(m,body+o,m.readUInt16LE(authored+s)+get(m,F+68));put(m,body+0x1a8,3);put(m,body+0x1ac,3);for(const[o,s]of[[0x1a0,40],[0x1a2,42],[0x1a4,44]])word(m,body+o,m.readUInt16LE(authored+s));m[body+0x1a6]=m[authored+28];m[body+0x1a7]=m[authored+29];word(m,body+0x18c,m.readUInt16LE(authored+26));word(m,body+0x18e,m.readUInt16LE(authored+24));m[body+0x199]=m.readInt16LE(authored+16)>>4;word(m,body+0x190,m.readUInt16LE(authored+6));m[body+0x19a]=m[authored+31];
   if(m.readUInt16LE(authored+6)===65535)m[body+0x198]=0;else{put(m,body+0x1b0,0);if(!m[authored+22])put(m,body+0x19c,0);else{const previous=ptr(m,F+44);put(m,body+0x19c,previous);m[previous+0x198]=0;put(m,previous+0x1b0,body);}const group=m.readUInt16LE(authored+6);put(m,F+44,body);m[body+0x198]=m[ptr(m,pack+128)+group*16+7];}
   index=get(m,F+24);word(m,body+0x192,index);put(m,ptr(m,F+28)+index*4,body);put(m,body+0x194,get(m,F+72)+m.readUInt16LE(authored+20)*4);callLibrary(runtime,F,'memset',[body+0x34,0,216],0x44ce1e);put(m,F+60,m.readInt16LE(authored+18));put(m,F+64,m.readInt16LE(authored+16));initializeAuthoredObjectQuaternion(m.readInt16LE(authored+14),get(m,F+64),get(m,F+60),body+0x58,runtime);put(m,F-4,0x44ce9f);quaternionMatrix([0,4,8,12].map(o=>get(m,body+0x58+o))).forEach((v,i)=>word(m,body+0xc4+i*2,v));for(const o of[0,2,4])put(m,body+0x34+o*2,m.readInt16LE(authored+8+o)<<16);
   put(m,F-4,F+20);put(m,F-8,0x44cecc);initializeAuthoredObjectAttachments(body,authored,F+20,{...child,scratchBase:F-8,entryRegisters:{...child.entryRegisters,EBP:body,EBX:m.readInt16LE(authored+18)?Math.imul(m.readInt16LE(authored+18),0x6488)>>9:m.readInt16LE(authored+16)?Math.imul(m.readInt16LE(authored+16),0x6488)>>9:m.readInt16LE(authored+14)>>1}});const found=lookupRawSpatialBucket(get(m,body+0x34),get(m,body+0x38),get(m,body+0x3c),runtime);put(m,F+56,found.outside?1:0);const tagged=found.bucket+(found.outside?1:0);put(m,body+12,tagged);const id=(((body-ptr(m,nativeGlobalAddress(m, 0x902eec))+128)>>>0)>>>7)&65535,next=m.readUInt16LE((tagged&~1)+8);if(!next)put(m,body+4,0);else{put(m,body+4,next);word(m,ptr(m,nativeGlobalAddress(m, 0x902eec))+next*128-122,id);}word(m,(tagged&~1)+8,id);
   if(m[body+0x19a]===2){const red=m[authored+4],green=m[authored+5],blue=m[authored+2];put(m,F+64,red);const light=get(m,0x9207e4),row=0x920800+Math.imul(light,16);m[body+0x19b]=light&255;put(m,0x9207e4,light+1);for(let a=0;a<3;a++)word(m,row+a*2,m.readUInt16LE(body+0x36+a*4));m[row+6]=m[F+64];m[row+7]=green;m[row+8]=blue;put(m,row+12,body);m[row+9]=0;}
   put(m,F-4,0x44cf99);registerTrackMaterialPolygons(body,child);if(!m[body+0x19a]){const n=get(m,0x6e6514);put(m,0x920b40+Math.imul(n,12),body);put(m,0x6e6514,n+1);}pack=ptr(m,0x90b990);
 return {body,index,pack};
}
