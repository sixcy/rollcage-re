import {allocateRawEffectParticle,registerRawEffectSpatial} from './body-retirement-effects.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const rng=seed=>Math.imul(seed,0x41a7)&0x7fffffff;
const doubledColor=(memory,p)=>{let color=0xff000000;for(let i=0;i<3;i++)color|=Math.min(255,memory[p+i]*2)<<(i*8);return color|0;};
const jitter=(memory,particle,seed,shift)=>{
 for(let axis=0;axis<3;axis++)put(memory,particle+0x88+axis*4,get(memory,particle+0x88+axis*4)+((((seed>>>(15+axis*5))&31)-16)<<shift));
};

//44f910. Source is an existing Q16 position, not a new authored emitter
//record. Native writes precede each next source read, preserving aliases.
export function activateRawPersistentEmitter(position,{memory}) {
 const cursor=ptr(memory,0x6fbb14),next=(cursor+1)>>>0,record=(0x6ff140+Math.imul(cursor,20))>>>0;
 word(memory,record+6,4);
 for(let axis=0;axis<3;axis++)word(memory,record+axis*2,memory.readUInt16LE(position+2+axis*4));
 put(memory,record+8,0x404040);put(memory,record+12,900);put(memory,record+16,4);memory[record+11]=0x15;put(memory,0x6fbb14,next<10?next:0);
}

//44f7a0. ECX is a12-byte target, EDX the particle type. The first stack
//argument supplies only a low16 vertical component, even for the type27 caller.
export function emitRawAttachmentParticle(target,type,vertical,jitterBase,flags,{memory}) {
 const particle=allocateRawEffectParticle({memory}),shift=(((flags>>>2)&0x3ffffffb)+jitterBase)|0;
 word(memory,particle+0x9c,0);word(memory,particle+0x9e,vertical);const seed=rng(get(memory,0x5ec958));put(memory,particle,type);put(memory,particle+0xa0,0x80000000);
 put(memory,particle+0x88,memory.readInt16LE(target)<<16);put(memory,particle+0x8c,memory.readInt16LE(target+2)<<16);
 const z=memory.readInt16LE(target+4)<<16;put(memory,0x5ec958,seed);put(memory,particle+0x90,z);jitter(memory,particle,seed,shift);
 registerRawEffectSpatial(particle,...[0,4,8].map(offset=>get(memory,particle+0x88+offset)),{memory});
 const mesh=ptr(memory,flags&0x10?0x919140:0x9153d8);memory[particle+0x94]=1;put(memory,particle+0xa4,mesh);put(memory,particle+0x98,doubledColor(memory,target+8));return particle;
}

//44f740. Every reached type1 handle overwrites the active type2 target's
//field90; the last one wins. The scalar table has64-byte records.
export function updateRawType2Attachment(body,handle,{memory}) {
 const target=ptr(memory,0x80e660+(handle&4095)*4);if(!memory[target+0x94])return;
 for(let i=0;i<5;i++) {
  const current=memory.readUInt16LE(body+0x16a+i*2),type=current>>>12;if(!type)return;
  if(type===1)put(memory,target+0x90,get(memory,0x80f56c+(current&4095)*64)*2);
 }
}

//44f3a0. Optional in-place swap removal deliberately advances the scan after
//a duplicate; it is not interchangeable with a Set or a stable unique filter.
export function updateRawAttachmentEffects({memory}) {
 let count=ptr(memory,0x6e6b1c);
 if(memory[ptr(memory,0x5ecb1c)+0x552]) {
  put(memory,0x6e6b20,0);
  for(let index=0;index<count;index++) {
   const body=ptr(memory,0x902f00+index*4);
   for(let scan=0;scan<count;scan++)if(scan!==index&&body===ptr(memory,0x902f00+scan*4)) {
    put(memory,0x902f00+scan*4,ptr(memory,0x902f00+(count-1)*4));count--;
   }
  }
 }
 const report={bodies:0,particles:0,type2Visits:0};
 for(let index=0;index<count;index++) {
  const body=ptr(memory,0x902f00+index*4),level=ptr(memory,0x90b990);report.bodies++;
  for(let i=0;i<5;i++) {
   const handle=memory.readUInt16LE(body+0x16a+i*2),type=handle>>>12,id=handle&4095;if(!type)break;
   if(type===2){updateRawType2Attachment(body,handle,{memory});report.type2Visits++;}
   else if(type===3) {
    const target=ptr(memory,level+0x108)+id*12,counter=(memory.readInt16LE(target+6)+1)<<16>>16;word(memory,target+6,counter);
    if(counter>=3) {
     word(memory,target+6,0);const flags=memory[target+11],size=flags&0xef,particle=emitRawAttachmentParticle(target,27,Math.imul(size,-0x20000),14,flags,{memory});
     memory[particle+0x95]=(size+3)*4;word(memory,particle+0x96,40);report.particles++;
    }
   }else if(type===4) {
    const target=ptr(memory,level+0x10c)+id*12,flags=memory[target+11],particle=emitRawAttachmentParticle(target,28,0x4000,17,flags,{memory});
    memory[particle+0x95]=((flags&0xef)+40)*2;word(memory,particle+0x96,8);report.particles++;
   }
  }
 }
 put(memory,0x6e6b1c,0);return report;
}

//44f990. Ten persistent20-byte emitter records retain their own countdown,
//cadence, color and flags. Mesh9153d8 and initial RNG are captured once.
export function updateRawPersistentEmitters({memory}) {
 const mesh=ptr(memory,0x9153d8);let seed=get(memory,0x5ec958),emitted=0;
 for(let record=0x6ff140;record<0x6ff208;record+=20) {
  const remaining=get(memory,record+12);if(remaining<=0)continue;
  const life=(remaining-1)|0;put(memory,record+12,life);
  const cadence=(memory.readInt16LE(record+6)+1)<<16>>16;word(memory,record+6,cadence);if(cadence<get(memory,record+16))continue;
  const first=rng(seed),interval=first>>>28;put(memory,record+16,interval);word(memory,record+6,0);const flags=memory[record+11];
  if(life<450){const shade=(Math.trunc((life<<8)/605)+64)>>2;for(let channel=0;channel<3;channel++)memory[record+8+channel]=shade;}
  const particle=allocateRawEffectParticle({memory});put(memory,particle,34);put(memory,particle+0xa0,0x80000000);put(memory,particle+0x9c,0xfc000000);
  for(let axis=0;axis<3;axis++)put(memory,particle+0x88+axis*4,memory.readInt16LE(record+axis*2)<<16);
  seed=rng(first);put(memory,0x5ec958,seed);jitter(memory,particle,seed,((flags>>>2)&0xfb)+15);
  registerRawEffectSpatial(particle,...[0,4,8].map(offset=>get(memory,particle+0x88+offset)),{memory});
  put(memory,particle+0xa4,flags&0x10?ptr(memory,0x919140):mesh);memory[particle+0x94]=1;put(memory,particle+0x98,doubledColor(memory,record+8));
  memory[particle+0x95]=((flags&0xef)+3)*4;word(memory,particle+0x96,interval*8+68);seed=get(memory,0x5ec958);emitted++;
 }
 return emitted;
}
