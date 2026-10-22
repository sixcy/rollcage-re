import {abs32,multiplyQ16,divideQ16,vectorLengthQ16} from './fixed-integer.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {emitRawEffectParticles,emitRawBodyDebris,removeRawParticleSpatial,lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {releaseBodyAttachments} from './body-attachment-release.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));
const release=(object,runtime)=>runtime.handlers?.releaseAttachments44ef90?runtime.handlers.releaseAttachments44ef90({object,...runtime}):releaseBodyAttachments(object,runtime);

//48e800. Allocate the64*384-byte effect bank from the shared body arena and
//publish original texture/material fields. Other record bytes remain untouched.
export function initializeModelContactFragments({memory}) {
 const material=ptr(memory,0x90b988)+(memory.readUInt16LE(ptr(memory,0x90b990)+0x2e)+0x4d)*16;
 const cursor=ptr(memory,0x70dcf4);put(memory,0x70dcf4,cursor+0x6000);
 const c=ptr(memory,material+8),a=get(memory,material),b=get(memory,material+4),base=(ptr(memory,0x902eec)+(cursor&0xfffffffc))>>>0;
 put(memory,0x810938,64);put(memory,0x810924,base);
 for(let i=0;i<64;i++){
  const p=base+i*384;put(memory,p,14);put(memory,p+4,0);word(memory,p+8,0);put(memory,p+12,0);put(memory,p+0x34,0x80c08080);put(memory,p+0xac,0x80c08080);
  memory[p+0x2c]=0;memory[p+0x33]=12;memory[p+0x37]=0x98;memory[p+0xab]=12;memory[p+0xaf]=0x98;
  for(const[o,v]of[[0x50,a],[0x6c,b],[0x88,c],[0xa4,c>>>16],[0xc8,a],[0xe4,b],[0x100,c],[0x11c,c>>>16]])put(memory,p+o,v);
 }
 put(memory,0x810930,0);
}

//48e900. Ring reuse removes existing spatial membership, then publishes the
//three independently signed RNG offsets and normalizes their wrapped delta.
export function emitModelContactFragments(x,y,z,count,size,tag,{memory,scratchBase}) {
 const step=(size&255)>>>2,life=Math.imul(size&255,5);put(memory,0x810938,0);
 let base=ptr(memory,0x810924),index=ptr(memory,0x810930);
 while((ptr(memory,0x810938))<(count>>>0)){
  if(memory[base+index*384+0x2c]){removeRawParticleSpatial(base+index*384,{memory});base=ptr(memory,0x810924);index=ptr(memory,0x810930);}
  memory[base+index*384+0x2d]=tag&255;
  let seed=get(memory,0x5ec958);
  for(const address of[0x81092c,0x810934,0x810928]){seed=Math.imul(seed,0x41a7)&0x7fffffff;put(memory,address,seed>>>16);}
  put(memory,0x5ec958,seed);
  for(const address of[0x81092c,0x810934,0x810928])if(get(memory,address)>0x3fff)put(memory,address,-get(memory,address));
  const current=()=>ptr(memory,0x810924)+ptr(memory,0x810930)*384;
  [x,y,z].forEach((origin,axis)=>put(memory,current()+0x10+axis*4,(get(memory,[0x81092c,0x810934,0x810928][axis])<<(step&31))+origin));
  [x,y,z].forEach((origin,axis)=>put(memory,current()+0x1c+axis*4,get(memory,current()+0x10+axis*4)-origin));
  const target=current();let delta=vector(memory,target+0x1c);
  if(delta.some(v=>abs32(v)>0x230000)){delta=delta.map(v=>v>>3);put(memory,target+0x20,delta[1]);put(memory,target+0x24,delta[2]);put(memory,target+0x1c,delta[0]);}
  let squares=delta.map(v=>multiplyQ16(v,v));if(squares.reduce((a,b)=>a|b,0)&0xe0000000)squares=squares.map(v=>v>>>2);
  const magnitude=abs32(squares.reduce((a,b)=>(a+b)|0,0));put(memory,0x91d45c,magnitude);put(memory,0x91d460,Math.clz32(magnitude));
  const reciprocal=divideQ16(65536,vectorLengthQ16(delta));
  for(let axis=0;axis<3;axis++)put(memory,target+0x1c+axis*4,multiplyQ16(get(memory,target+0x1c+axis*4),reciprocal));
  memory[current()+0x2c]=255;put(memory,current()+0x28,life);word(memory,current()+0x2e,10);
  index=ptr(memory,0x810930);base=ptr(memory,0x810924);const p=base+index*384,position=vector(memory,p+0x10),found=lookupRawSpatialBucket(...position,{memory});
  put(memory,scratchBase-16,found.outside);put(memory,p+12,found.bucket+found.outside);
  const head=memory.readUInt16LE(found.bucket+10),id=((p-ptr(memory,0x902eec)+128)>>>7)&65535;
  put(memory,p+4,head);if(head)word(memory,(ptr(memory,0x902eec)-122+head*128)>>>0,id);word(memory,found.bucket+10,id);
  index=index+1===64?0:index+1;put(memory,0x810930,index);put(memory,0x810938,get(memory,0x810938)+1);
 }
}

//48edb0. Expiration unregisters inline using the captured arena base, but the
//expired record still receives its final position/acceleration update.
export function updateModelContactFragments({memory}) {
 const arena=ptr(memory,0x902eec);let p=ptr(memory,0x810924);put(memory,0x810938,64);
 for(let i=0;i<64;i++,p+=384){
  if(!memory[p+0x2c])continue;
  memory[p+0x2c]=(memory[p+0x2c]-1)&255;
  if(!memory[p+0x2c]){
   const previous=memory.readUInt16LE(p+6),next=memory.readUInt16LE(p+4);
   if(!previous){word(memory,(ptr(memory,p+12)&0xfffffffe)+10,next);if(next){const address=(arena-128+next*128)>>>0;if(address)word(memory,address+6,0);}}
   else{if(next){const address=(arena-128+next*128)>>>0;if(address)word(memory,address+6,previous);}word(memory,(arena-124+previous*128)>>>0,next);}
   put(memory,p+4,0);
  }
  const speed=get(memory,p+0x28);
  for(let axis=0;axis<3;axis++)put(memory,p+0x10+axis*4,get(memory,p+0x10+axis*4)+Math.imul(get(memory,p+0x1c+axis*4)>>1,speed));
  if(speed<9)put(memory,p+0x28,4);
  else{const deceleration=memory.readInt16LE(p+0x2e);put(memory,p+0x28,speed-deceleration);if(deceleration>1)word(memory,p+0x2e,deceleration-1);}
  put(memory,p+0x14,get(memory,p+0x14)+0x48000);
 }
}

//48ec50. Captures its descriptor/group pointers, reloads the group count after
//each emitted shape, and does not rotate authored centers by placement yaw.
export function breakClassOneModel(object,{memory,scratchBase,handlers={},soundRuntime,...runtime}) {
 const group=ptr(memory,0x909294)+memory.readUInt16LE(object+0x190)*16,model=ptr(memory,object+0x10);let shape=model+memory.readUInt16LE(model+0x34),index=0;
 const position=scratchBase-0x14;put(memory,scratchBase-0x20,0);put(memory,scratchBase-0x18,group);put(memory,scratchBase-0x1c,shape);
 if(memory[group+6])do{
  const tag=memory[ptr(memory,0x909290)+(memory.readUInt16LE(object+0x18e)+index)*8+3],center=[memory.readInt16LE(shape),memory.readInt16LE(shape+2),memory.readInt16LE(shape+4)];
  center.forEach((v,axis)=>put(memory,position+axis*4,(v<<16)+get(memory,object+0x34+axis*4)));
  if((memory[ptr(memory,object+0x194)+index*4+3]&15)===2)emitModelContactFragments(...vector(memory,position),tag,tag>>>1,tag,{memory,scratchBase:scratchBase-0x48});
  const cursor=get(memory,0x9153dc),next=(cursor+1)|0,target=0x919020+Math.imul(cursor,12);vector(memory,position).forEach((v,axis)=>put(memory,target+axis*4,v));put(memory,0x9153dc,(next>>>0)<24?next:0);
  emitNativeEffect(14,target,[0,0x400,12000,6,next,0,0],{dispatch40ea40:request=>dispatchNativeSound(request,soundRuntime??{memory,handlers})});
  emitRawEffectParticles(position,object+0x40,1,get(memory,0x9153d8),4,{memory});emitRawBodyDebris(position,object+0x40,1,{memory});
  index++;shape+=20;put(memory,scratchBase-0x20,index);put(memory,scratchBase-0x1c,shape);
 }while(index<memory[group+6]);
 removeBodySpatial(object,{memory});release(object,{...runtime,memory,handlers,scratchBase:scratchBase-0x38});memory[object+0x19a]=5;return 1;
}

//4142a0. The row address is captured before attachment release. Model count
//and configuration pointer are subsequently reloaded on each iteration.
export function breakClassTwoModel(object,{memory,scratchBase,handlers={},...runtime}) {
 const row=0x920800+memory[object+0x19b]*16;memory[object+0x19a]=5;removeBodySpatial(object,{memory});release(object,{...runtime,memory,handlers,scratchBase:scratchBase-12});
 for(let index=0;index<memory[ptr(memory,object+0x10)+0x27];index++){const p=ptr(memory,object+0x194)+index*4;put(memory,p,(get(memory,p)&0xf5ffffff)|0x5000000);}
 memory[row+9]=1;
}
