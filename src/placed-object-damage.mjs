import {abs32,multiplyQ16,lookupSqrt,transformShortQ12,vectorLengthQ16} from './fixed-integer.mjs';
import {emitRawEffectParticles,emitRawBodyDebris,lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {spatialBucketContainsSector} from './track-deformation.mjs';
import {copyToNativeMemory} from './native-memory-spans.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));
const copy=(m,a,b)=>{for(const o of[0,4,8])put(m,b+o,get(m,a+o));};

//421da0. Shape configuration, body and linked placement pointers stay live.
export function damagePlacedObject(object,body,shapeSlot,velocity,{memory,scratchBase,handlers={},...runtime}) {
 const context={...runtime,memory,scratchBase,handlers},offset=shapeSlot<<2,configuration=ptr(memory,object+0x194)+offset;
 put(memory,scratchBase-4,offset);put(memory,scratchBase-12,configuration);
 if((memory[configuration+3]&15)!==4)return 0;
 let tail=object;while(ptr(memory,tail+0x1b0))tail=ptr(memory,tail+0x1b0);
 if(!memory[tail+0x198])return 0;
 const components=[2,6,10].map(o=>memory.readInt16LE(velocity+o)),squared=components.reduce((sum,x)=>(sum+Math.imul(x,x))|0,0),magnitude=abs32(squared);
 put(memory,0x91d45c,magnitude);put(memory,0x91d460,Math.clz32(magnitude));
 const speed=lookupSqrt(magnitude);put(memory,scratchBase-8,speed);
 const mass=get(memory,body+0xa8),heavy=[12,17].includes(get(memory,body)&511),scaled=heavy?mass<<6:((mass>>2)+(mass>>1))|0;
 put(memory,scratchBase-16,scaled);
 const damage=multiplyQ16(scaled,speed),state=get(memory,configuration);
 if((((state>>>28)-damage)|0)>0)return 0;
 put(memory,configuration,state&0xfffffff);
 const liveConfiguration=ptr(memory,object+0x194)+offset;
 put(memory,liveConfiguration,(get(memory,liveConfiguration)&0xf5ffffff)|0x5000000);
 word(memory,object+8,memory.readUInt16LE(object+8)|((1<<((shapeSlot|0)&31))&65535));
 const emit=(target,index,extra)=>handlers.call480900?handlers.call480900({object:target,shapeSlot:index,velocity,extra,...context,scratchBase:scratchBase-0x30}):emitPlacedShapeDebris(target,index,velocity,{...context,scratchBase:scratchBase-0x30});
 emit(object,shapeSlot,shapeSlot);
 tail=object;while(ptr(memory,tail+0x1b0))tail=ptr(memory,tail+0x1b0);
 memory[tail+0x198]=(memory[tail+0x198]-1)&255;
 if(heavy){
  const count=memory[ptr(memory,tail+0x10)+0x27];
  for(let slot=0;slot<count;slot++){
   const p=ptr(memory,tail+0x194)+slot*4,state=get(memory,p);
   if((state&0xf000000)===0x4000000){const next=(state&0xf5ffffff)|0x5000000;put(memory,p,next);emit(tail,slot,next);}
  }
  memory[tail+0x198]=0;
 }
 if(!memory[tail+0x198]){
  if(handlers.call415190)handlers.call415190({object:tail,...context,scratchBase:scratchBase-0x28});
  else queueDestroyedPlacedObjects(tail,{...context,scratchBase:scratchBase-0x28});
 }
 return 1;
}

//480900. Velocity is shifted in-place once per invocation; destruction can
//invoke this repeatedly with the same pointer. The center's stale fourth short
//and shared matrix globals retain their native bytes.
export function emitPlacedShapeDebris(object,shapeSlot,velocity,{memory,scratchBase,handlers={},soundRuntime}) {
 const model=ptr(memory,object+0x10),shapes=model+memory.readUInt16LE(model+0x34),offset=Math.imul(shapeSlot,20),local=scratchBase-0x14;
 for(const o of[0,4,8])put(memory,velocity+o,get(memory,velocity+o)>>9);
 for(const o of[0,2,4])word(memory,local+o,memory.readUInt16LE(shapes+offset+o));
 for(const o of[0,4,8,12,16])put(memory,0x91d360+o,get(memory,object+0xc4+o));
 for(let i=0;i<9;i++)memory.writeFloatLE(Math.fround(memory.readInt16LE(0x91d360+i*2)*memory.readFloatLE(0x5dc5f4)),0x91cdc0+(Math.floor(i/3)*4+i%3)*4);
 put(memory,0x91d3e4,get(memory,local));put(memory,0x91d3e8,get(memory,local+4));
 const transformed=transformShortQ12(Array.from({length:9},(_,i)=>memory.readInt16LE(0x91d360+i*2)),[0,2,4].map(o=>memory.readInt16LE(0x91d3e4+o)));
 transformed.forEach((x,i)=>put(memory,0x91d448+i*4,x));
 const x=((transformed[0]<<16)+get(memory,object+0x34))|0,z=((transformed[2]<<16)+get(memory,object+0x3c))|0;
 let y=((transformed[1]<<16)+get(memory,object+0x38))|0;
 y=(y-(((ptr(memory,shapes+offset+12)>>>10)&0x7ff)<<14))|0;
 const burst=()=>{
  put(memory,local,x);put(memory,local+4,y);put(memory,local+8,z);
  const cursor=get(memory,0x9153dc),next=(cursor+1)|0,position=0x919020+Math.imul(cursor,12);
  put(memory,position,x);put(memory,position+4,y);put(memory,position+8,z);put(memory,0x9153dc,(next>>>0)<24?next:0);
  const args=[0,0x400,12000,6,next,0,0];
  if(handlers.call484bb0)handlers.call484bb0({code:17,position,args,memory,scratchBase:scratchBase-0x54});
  else emitNativeEffect(17,position,args,{dispatch40ea40:request=>dispatchNativeSound(request,soundRuntime??{memory,handlers})});
  if(handlers.call435f20)handlers.call435f20({position:local,velocity,count:4,color:get(memory,0x9153d8),kind:4,memory,scratchBase:scratchBase-0x44});
  else emitRawEffectParticles(local,velocity,4,get(memory,0x9153d8),4,{memory});
  if(handlers.call475a10)handlers.call475a10({position:local,velocity,count:4,memory,scratchBase:scratchBase-0x3c});
  else emitRawBodyDebris(local,velocity,4,{memory});
 };
 burst();y=(y+(((ptr(memory,shapes+offset+12)>>>10)&0x7ff)<<15))|0;burst();
}

//415190. Queue append counter/head are retained in registers until the chain
//has been traversed; callbacks cannot observe partly published cursors.
export function queueDestroyedPlacedObjects(object,{memory,scratchBase,handlers={},...runtime}) {
 let cursor=memory[0x9207e1],count=memory[0x9207e0],tail=object;
 for(;;){const row=0x9205e0+cursor*8;count=(count+1)&255;put(memory,row,tail);cursor=(cursor+1)&255;if(cursor>=64)cursor=0;
  const next=ptr(memory,tail+0x19c);if(!next){put(memory,row+4,255);break;}put(memory,row+4,cursor);tail=next;
 }
 const xy=Buffer.from(memory.subarray(tail+0x34,tail+0x3c)),z=get(memory,tail+0x3c);
 put(memory,scratchBase-4,z);memory[0x9207e1]=cursor;memory[0x9207e0]=count;copyToNativeMemory(memory,scratchBase-12,xy);
 if(memory[ptr(memory,0x5ecb1c)+0x58c]!==2){
  const context={...runtime,memory,handlers,scratchBase:scratchBase-0x14};
  if(handlers.call41a5d0)handlers.call41a5d0({object:tail,position:scratchBase-12,...context});
  else startModelDestructionCamera(tail,scratchBase-12,context);
 }
 return 0;
}

//417720. Unsigned distance-to-desired-radius ordering and native fallback.
export function selectModelDestructionObserver(position,output,distance,{memory,scratchBase,handlers={}}) {
 const radius=Math.imul(distance>>2,distance>>2);let best=0xffffffff,selected=-1;
 if(get(memory,0x6e6550)>1){
  const origin=vector(memory,position),{bucket,outside}=lookupRawSpatialBucket(...origin,{memory});put(memory,scratchBase-16,outside);
  const sector=memory.readUInt16LE(ptr(memory,0x9092c0)+(memory.readUInt16LE(bucket+6)&0x3fff)*6+2)&127;
  put(memory,scratchBase-16,sector);
  for(let i=0;i<get(memory,0x6e6550);i++){
   const row=0x91f6c0+i*56;if(get(memory,row)===1)continue;
   const squared=origin.reduce((sum,x,axis)=>{const delta=((x-get(memory,row+4+axis*4))|0)>>18;return(sum+Math.imul(delta,delta))|0;},0),score=abs32((abs32(squared)-radius)|0)>>>0;
   if(score<best&&(handlers.call4176b0?handlers.call4176b0({sector,position:row+4,memory,scratchBase:scratchBase-0x2c}):spatialBucketContainsSector(sector,row+4,{memory,scratchBase:scratchBase-0x2c}))){best=score;selected=i;}
  }
  put(memory,output,0x91f6c0+selected*56);if(selected!==-1)return;
 }
 put(memory,0x9205a0,0);const xy=Buffer.from(memory.subarray(position,position+8));copyToNativeMemory(memory,0x9205a4,xy);const z=get(memory,position+8);
 put(memory,0x9205a4,get(memory,0x9205a4)-0x320000);put(memory,0x9205a8,get(memory,0x9205a8)-0xc80000);put(memory,0x9205ac,z-0x320000);put(memory,output,0x9205a0);
}

//41a570: unsigned initial clamp/division, then signed maximum/minimum.
export function computeModelCameraDuration(observer,position,divisor,maximum,{memory,scratchBase}) {
 const delta=[0,4,8].map(o=>((get(memory,observer+o)-get(memory,position+o))|0)>>9);delta.forEach((x,i)=>put(memory,scratchBase-12+i*4,x));
 let squares=delta.map(x=>multiplyQ16(x,x));if(squares.reduce((a,b)=>a|b,0)&0xe0000000)squares=squares.map(x=>x>>>2);
 const sum=squares.reduce((a,b)=>(a+b)|0,0),magnitude=abs32(sum);put(memory,0x91d45c,magnitude);put(memory,0x91d460,Math.clz32(magnitude));
 const doubled=(vectorLengthQ16(delta)*2)>>>0;if(!(divisor>>>0))throw Error('Native model camera duration division by zero.');
 let duration=Math.trunc(Math.max(doubled,0xa00)/(divisor>>>0))|0;
 if(duration>=(maximum<<8))duration=maximum<<8;return duration>85?duration:85;
}

//41a5d0: destroyed-model observer activation. No device/game callbacks.
export function startModelDestructionCamera(object,position,{memory,scratchBase,handlers={},...runtime}) {
 put(memory,scratchBase-4,object);
 if(get(memory,0x6e6550)<2||memory.readInt16LE(0x91ffb2)<45)return;
 const xy=Buffer.from(memory.subarray(position,position+8));copyToNativeMemory(memory,0x91ff90,xy);put(memory,0x91ff98,get(memory,position+8));
 put(memory,0x91ff80,15);put(memory,0x91ffb2,0x640000);
 selectModelDestructionObserver(position,scratchBase-4,1500,{...runtime,memory,handlers,scratchBase:scratchBase-0x18});
 const selected=ptr(memory,scratchBase-4),selectedXY=Buffer.from(memory.subarray(selected+4,selected+12));copyToNativeMemory(memory,0x91ff84,selectedXY);put(memory,0x91ff8c,get(memory,selected+12));put(memory,0x9200c0,object);
 put(memory,0x91ffa8,computeModelCameraDuration(0x91ff84,position,700,4,{memory,scratchBase:scratchBase-0x20}));word(memory,0x91ffb6,0);
}
