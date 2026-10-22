import yaw from './yaw-table.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),short=v=>(v<<16)>>16;
const rng=seed=>Math.imul(seed,0x41a7)&0x7fffffff;
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));
const copy=(m,a,b)=>{for(const o of[0,4,8])put(m,b+o,get(m,a+o));};
export function initializeBodyRetirementEffectTables(memory){yaw.values.forEach((value,i)=>word(memory,0x5ed030+i*2,value));return memory;}

//4746f0. Search alternating rows and retain the nearest interval endpoint.
export function findNearestRawSpatialColumn(rows,z,x,{memory}){
 let bestDistance=255,best=0,result=0;
 for(let step=1;;step++){
  const offset=step>>1,row=short(step&1?z+offset:z-offset);
  if((step&1)?row<256:row>=0){
   let ranges=rows+row*16,indices=ptr(memory,ranges+12);
   if(indices)for(let remaining=6;remaining>0;remaining--,ranges+=2){
    const range=memory.readUInt16LE(ranges);if(range===255)break;
    const low=range&255,high=range>>>8;
    if(x>=low&&x<=high)return indices+(x-low)*2;
    let distance=Math.abs(low-x);result=distance;
    if(distance<bestDistance){bestDistance=distance;best=indices;if(distance===1)return best;}
    distance=Math.abs(high-x);result=distance;
    if(distance<bestDistance){bestDistance=distance;best=indices+(high-low)*2;if(distance===1)return best;}
    indices+=(high-low+1)*2;result=best;
   }
  }
  if(bestDistance*2<=step+1)return result;
 }
}

//4286e0. Packed row ranges select a column; tagged vertical entries select Y.
export function lookupRawSpatialBucket(x,y,z,{memory}){
 const rowIndex=((z>>24)+128)&65535,xIndex=((x>>24)+128)&65535,yIndex=((y>>24)+32)&65535,rows=ptr(memory,0x909254);
 let ranges=rows+rowIndex*16,indices=ptr(memory,ranges+12),offset=0,selected,outside=0;
 if(indices){
  for(let remaining=6;remaining>0;remaining--,ranges+=2){
   const range=memory.readUInt16LE(ranges),low=range&255,high=range>>>8;
   if(range===255||xIndex<low){outside=1;break;}
   if(xIndex<=high){selected=indices+(offset+xIndex-low)*2;break;}
   offset+=high-low+1;
  }
  if(selected===undefined&&!outside)selected=indices+offset*2;
 }else outside=1;
 if(outside)selected=findNearestRawSpatialColumn(rows,rowIndex,xIndex,{memory});
 let bucket=ptr(memory,0x909278)+memory.readUInt16LE(selected);
 while(get(memory,bucket+4)<0&&yIndex<=((ptr(memory,bucket+12)>>>13)&63))bucket+=12;
 return {bucket,outside};
}

//4748d0, particle-head sibling of physical474850.
export function removeRawParticleSpatial(particle,{memory}){
 const previous=memory.readUInt16LE(particle+6);
 if(!previous){const bucket=ptr(memory,particle+12)&0xfffffffe;word(memory,bucket+10,memory.readUInt16LE(particle+4));const next=memory.readUInt16LE(particle+4);if(next){const p=(ptr(memory,0x902eec)-128+next*128)>>>0;if(p)word(memory,p+6,0);}}
 else{const next=memory.readUInt16LE(particle+4),base=ptr(memory,0x902eec);if(next){const p=(base-128+next*128)>>>0;if(p)word(memory,p+6,previous);}word(memory,(base-124+previous*128)>>>0,memory.readUInt16LE(particle+4));}
 put(memory,particle+4,0);
}

//435df0. Free-list allocation or oldest eligible active-list reuse.
export function allocateRawEffectParticle({memory}){
 let particle=ptr(memory,0x6e65b4),head,previous;
 if(particle){put(memory,0x6e65b4,get(memory,particle+0xac));head=ptr(memory,0x6e65c0);previous=ptr(memory,0x6e65c8);}
 else{
  head=ptr(memory,0x6e65c0);particle=head;
  while(get(memory,particle+0xb0)!==0){particle=ptr(memory,particle+0xa8);if(!particle){particle=head;break;}}
  previous=ptr(memory,particle+0xac);const next=ptr(memory,particle+0xa8);
  if(previous)put(memory,previous+0xa8,next);else head=next;
  if(next){put(memory,next+0xac,previous);previous=ptr(memory,0x6e65c8);}
 }
 put(memory,particle+0xac,previous);put(memory,particle+0xa8,0);put(memory,0x6e65c8,particle);
 if(previous)put(memory,previous+0xa8,particle);put(memory,0x6e65c0,head||particle);
 if(memory[particle+0x94]===1)removeRawParticleSpatial(particle,{memory});
 put(memory,particle+0xb0,0);put(memory,particle+0xb4,0);return particle;
}

//474670, also inlined by435f20. Registration precedes later position jitter.
export function registerRawEffectSpatial(particle,x,y,z,{memory}){
 const found=lookupRawSpatialBucket(x,y,z,{memory}),tagged=found.bucket+found.outside;put(memory,particle+12,tagged);
 const bucket=tagged&0xfffffffe,id=((particle-ptr(memory,0x902eec)+128)>>>7)&65535,head=memory.readUInt16LE(bucket+10);
 put(memory,particle+4,head);if(head)word(memory,ptr(memory,0x902eec)-122+head*128,id);word(memory,bucket+10,id);
 return found;
}

//4386b0. Original alpha table and the extra kind4000 green-channel RNG step.
export function calculateRawEffectColor(kind,lifetime,{memory}){
 kind>>>=0;lifetime>>>=0;
 if(kind===0x10)return((Math.min(200,Math.imul(lifetime,16)>>>0)<<24)|0xffffff)|0;
 if(kind===4)return((Math.min(128,Math.imul(lifetime,4)>>>0)<<24)|0xffffff)|0;
 let index;
 if(kind===8)index=Math.min(63,Math.imul(lifetime,2)>>>0);
 else if(kind===1){if(lifetime>31)return -1;index=lifetime;}
 else if(kind===0x4000){index=Math.min(63,Math.imul(lifetime,6)>>>0);const seed=rng(get(memory,0x5ec958));put(memory,0x5ec958,seed);return((Math.imul(memory.readInt16LE(0x5ed12e-index*2),255)>>14)<<24)|((((seed>>>16)&127)+64)<<8)|255;}
 else return 0;
 return((Math.imul(memory.readInt16LE(0x5ed12e-index*2),255)>>14)<<24)|0xffffff;
}

//435f20. All five native particle kinds and their exact RNG/write order.
export function emitRawEffectParticles(position,velocity,count,color,kind,{memory}){
 count>>>=0;kind|=0;color|=0;const type=kind&65535;
 let base=type===8?(count+3)|0:type===4?((count>>>1)+2)|0:type===1||type===16?((count>>>2)+1)|0:type===0x4000?400:0;
 if(!base)return 0;
 const total=Math.max(1,Math.imul(get(memory,0x5eb500),base)>>>8),frames=color>>>24;let frame=0;
 for(let remaining=total;remaining>0;remaining--){
  const p=allocateRawEffectParticle({memory});word(memory,p+0xa2,kind);let seed=rng(get(memory,0x5ec958));put(memory,p,9);copy(memory,position,p+0x88);put(memory,0x5ec958,seed);
  const value=(seed>>>15)&65535;let life;
  if(type===8){memory[p+0x95]=(value&63)+142;life=((value>>5)&31)+32;}
  else if(type===1){memory[p+0x95]=(count+3)*2;life=(value&15)+48;}
  else if(type===4){memory[p+0x95]=((value&31)+8)*2;life=((value>>5)&31)+48;}
  else if(type===16){put(memory,p+0xb0,1);memory[p+0x95]=(value&31)+16;life=short(((((value>>5)&31)+Math.imul(count,8))*4+0x348)|0);}
  else{memory[p+0x95]=(value&3)+3;life=45;}
  word(memory,p+0x96,life);registerRawEffectSpatial(p,...vector(memory,p+0x88),{memory});memory[p+0x94]=1;
  if(kind&12){for(let i=0;i<3;i++){seed=rng(seed);word(memory,p+0x9c+i*2,(get(memory,velocity+i*4)>>8)-8192+((seed>>>15)*0x4000>>>16));}put(memory,0x5ec958,seed);}
  if(short(kind)===16){seed=rng(seed);put(memory,p+0x88,get(memory,p+0x88)+(((seed>>>18)-8192)<<(count&31)));seed=rng(seed);put(memory,0x5ec958,seed);put(memory,p+0x90,get(memory,p+0x90)+(((seed>>>18)-8192)<<(count&31)));}
  else if(short(kind)===1){seed=rng(seed);put(memory,p+0x88,get(memory,p+0x88)+Math.imul((seed>>>18)-8192,1024));seed=rng(seed);put(memory,p+0x90,get(memory,p+0x90)+Math.imul((seed>>>18)-8192,1024));seed=rng(seed);put(memory,0x5ec958,seed);put(memory,p+0x8c,get(memory,p+0x8c)+Math.imul(-8-(seed>>>18),1024));put(memory,p+0x9e,0);word(memory,p+0x9c,0);}
  else if(short(kind)===0x4000){
   seed=rng(seed);const v=(seed>>>15)&65535,a=v&255,b=v>>>8;seed=rng(seed);put(memory,0x5ec958,seed);const scale=(seed|0x1fff0000)>>>16;
   word(memory,p+0x9c,Math.imul(memory.readInt16LE(0x5ed0b0+a*2),memory.readInt16LE(0x5ed030+b*2))>>14);
   word(memory,p+0x9e,Math.imul(memory.readInt16LE(0x5ed030+a*2),memory.readInt16LE(0x5ed030+b*2))>>14);word(memory,p+0xa0,memory.readInt16LE(0x5ed0b0+b*2));
   for(const offset of[0x9c,0x9e,0xa0]){const scaled=short(Math.imul(memory.readInt16LE(p+offset),scale)>>16);word(memory,p+offset,(scaled>>3)+scaled);}put(memory,p+0x8c,get(memory,p+0x8c)-0x1000000);
  }
  put(memory,p+0x98,calculateRawEffectColor(type,life,{memory}));put(memory,p+0xa4,color);memory[p+0xa6]=frame;frame=(frame+1)>>>0;if(frame>=frames)frame=0;
 }
 return total;
}

//475a10. Debris free/active index arrays and actual packed spatial insertion.
export function emitRawBodyDebris(position,velocity,count,{memory}){
 let remaining=(Math.imul(count,3)+12)|0;if(remaining<=0)return 0;
 const free=ptr(memory,0x902b7c);let freeLast=get(memory,0x902b8c),activeCount=get(memory,0x902b88),emitted=0;
 while(remaining>0&&freeLast>=0){
  const id=memory.readUInt16LE(free+freeLast*2);freeLast--;word(memory,ptr(memory,0x902b80)+activeCount*2,id);activeCount++;
  const p=(ptr(memory,0x902b84)+(id<<7))>>>0;word(memory,p+0x6a,1);copy(memory,position,p+0x4c);registerRawEffectSpatial(p,...vector(memory,p+0x4c),{memory});
  let seed=rng(get(memory,0x5ec958));word(memory,p+8,((seed>>>15)*16>>>16)+39);
  for(let i=0;i<3;i++){seed=rng(seed);put(memory,p+0x58+i*4,Math.imul((seed>>>20)-1024,2048)+((get(memory,velocity+i*4)>>2)&0xfffff800));}put(memory,0x5ec958,seed);
  for(let i=0;i<3;i++)word(memory,p+0x64+i*2,memory.readUInt16LE(p+0x4e+i*4));put(memory,p+0x30,0x2f6f6f);put(memory,p+0x14,0xae00052f);remaining--;emitted++;
 }
 put(memory,0x902b88,activeCount);put(memory,0x902b8c,freeLast);return emitted;
}

//44d230. Decode up to four authored sector ranges and expand around midpoint.
export function expandRawTerrainRanges(bucket,output,mode,{memory}){
 for(let i=0;i<4;i++)put(memory,output+i*4,0);
 const descriptor=ptr(memory,bucket+4),lookup=ptr(memory,0x9092c0)+((descriptor>>>16)&0x3fff)*6;
 const tag=memory.readUInt16LE(lookup+2)&127,center=memory.readUInt16LE(lookup)&1023,packed=ptr(memory,bucket);
 if(packed&1){let value=((center-((packed>>>7)&63))&4095)<<8;value^=Math.imul((packed&126)+center*2,0x80000);put(memory,output,value);memory[output]=tag;}
 else{
  let cursor=(packed&0x1fff)+ptr(memory,0x90924c)+(descriptor&65535)*2;
  for(let i=0;i<4;i++){
   const target=output+i*4,first=memory.readUInt16LE(cursor);let stop;
   if(!(first&1)){
    const second=memory.readUInt16LE(cursor+2),pair=(first|(second<<16))>>>0;
    put(memory,target,(memory[target]|((first&0xffe)<<7))^Math.imul(((pair&0xff000)+(first&0xffe)*0x800)|0,256));memory[target]=(second>>>4)&127;stop=second&0x800;cursor+=4;
   }else{
    let value=ptr(memory,target);value=(value^((((center-((first>>>7)&63))<<8)^value)&0xfff00))|0;
    value=(((first>>>1&63)+center)<<20)^(value&0xfffff);put(memory,target,value);memory[target]=tag;stop=first&0x2000;cursor+=2;
   }
   if(stop)break;
  }
 }
 const segments=ptr(memory,0x909240);
 if((mode|0)===10){
  for(let i=0;i<4;i++){const target=output+i*4,packed=ptr(memory,target);if(!packed)break;const maximum=ptr(memory,ptr(memory,segments+(packed&255)*4)+12),high=((packed&0xfff00000)+0x100000)|0;let value=high^(packed&0xfffff);put(memory,target,value);if(maximum<(high>>>20))put(memory,target,(maximum<<20)^(value&0xfffff));}
  return;
 }
 const delta=(mode-10)|0,half=Math.trunc(delta/2)&31,absoluteHalf=Math.trunc(Math.abs(delta)/2)&31;
 const resize=value=>{
  value=delta<0?value>>absoluteHalf:value<<half;
  if(delta&1){const product=Math.imul(value,181);value=(product+((product>>31)&(delta<0?255:127)))|0;value>>=delta<0?8:7;}
  return value;
 };
 for(let i=0;i<4;i++){
  const target=output+i*4,packed=ptr(memory,target);if(!packed)return;
  const start=(packed>>>8)&4095,end=packed>>>20,mid=(start+end)>>>1,maximum=get(memory,ptr(memory,segments+(packed&255)*4)+12);
  let lower=(mid-start)|0,upper=(end-mid)|0;
  if(end<((maximum-1)>>>0))upper=resize(upper);if(start>1)lower=resize(lower);
  let low=(mid-lower-1)|0,high=(mid+1+upper)|0;
  if(low>=maximum)low=maximum;if(high>=maximum)high=maximum;if(low<0)low=0;if(high<0)high=0;
  put(memory,target,(((low&4095)|(high<<12))<<8)|(packed&255));
 }
}

//437aa0. Mark dirty terrain ranges and alter packed vertex brightness. The
//packed XY subtraction intentionally carries the X borrow into Y.
export function alterRawTerrainBrightness(position,count,{memory,scratchBase}){
 const x=get(memory,position),y=get(memory,position+4),z=get(memory,position+8),xy=((x>>>16)&65535)|(y&0xffff0000),originZ=(z>>>16)&65535;
 put(memory,0x5ed2b4,1);const shift=Math.max(6,Math.min(10,count>>>0)),found=lookupRawSpatialBucket(x,y,z,{memory}),output=scratchBase-24;
 expandRawTerrainRanges(found.bucket,output,shift,{memory});
 for(let index=0;index<4;index++){
  const packed=ptr(memory,output+index*4);if(!packed)break;
  const segment=ptr(memory,ptr(memory,0x909240)+(packed&255)*4),width=(get(memory,segment+8)+1)|0,start=(packed>>>8)&4095;
  let end=(packed>>>20)+1;if(end>get(memory,segment+12)+1)end--;
  const range=((start&2047)|((end&2047)<<11)),dirtyCount=ptr(memory,0x80f210),dirty=(((range|0x800000)<<7)|(packed&127))|0;
  if(dirtyCount<64&&(dirtyCount===0||get(memory,0x80f41c+dirtyCount*4)!==dirty)){put(memory,0x80f420+dirtyCount*4,dirty);put(memory,0x80f210,dirtyCount+1);}
  const base=ptr(memory,segment+32),begin=(base+Math.imul(Math.imul(width,start),8))>>>0,finish=(base+Math.imul(Math.imul(width,end),8))>>>0;
  if(begin>=finish)continue;
  for(let p=begin;p<finish;p+=8){
   const difference=(get(memory,p)-xy)|0,dx=short(difference),dy=difference>>16,dz=short(memory.readInt16LE(p+4)-originZ);
   word(memory,0x91d408,dx);word(memory,0x91d40c,dy);word(memory,0x91d410,dz);
   const xx=Math.imul(dx,dx),yy=Math.imul(dy,dy),zz=Math.imul(dz,dz);put(memory,0x91d448,xx);put(memory,0x91d44c,yy);put(memory,0x91d450,zz);
   let distance=((xx+yy+zz)|0)>>shift;
   if(distance<=1023){
    const value=ptr(memory,p+4),color=ptr(memory,ptr(memory,0x90b980)+((value>>>22)&1023)*4),brightness=((color>>>16)&255)+((color>>>8)&255)+(color&255);distance>>=6;
    if(brightness>=(distance<<5))put(memory,p+4,((distance-16)<<22)|(value&0x3fffff));
   }
  }
 }
}

//436490. Alternate36-byte position effect, with unsigned count-derived words.
export function appendRawBodyFlash(position,count,{memory}){
 const length=ptr(memory,0x810920);if(length>=16)return;
 const row=0x8106e0+length*36;copy(memory,position,row);put(memory,row+12,position);word(memory,row+16,((count>>>2)+5));word(memory,row+18,3);put(memory,row+20,(Math.imul(count,8)+0x2d0)&65535);put(memory,0x810920,length+1);
}

//436510. Find one of ten inactive7724-byte trail/effect records.
export function activateRawBodyTrail(position,mode,{memory}){
 const base=ptr(memory,0x919008);
 for(let index=0;index<10;index++){
  const row=base+index*0x1e2c;if(get(memory,row+12)!==0)continue;
  put(memory,row,get(memory,position));put(memory,row+4,get(memory,position+4)-0x140000);put(memory,row+8,get(memory,position+8));
  put(memory,row+16,0);put(memory,row+32,16);put(memory,row+36,30);put(memory,row+12,30);put(memory,row+40,mode===1?21:16);put(memory,row+24,134);put(memory,row+28,9);put(memory,row+20,0xb0b0b0);return index;
 }
 return -1;
}

//437670. Claim one of three3860-byte records, preserving the rest of each row.
export function activateRawBodyPulse(position,{memory}){
 const base=ptr(memory,0x9153c0);
 for(let index=0;index<3;index++){
  const row=base+index*0xf14;if(get(memory,row+12)!==0)continue;
  copy(memory,position,row);put(memory,row+12,24);put(memory,row+16,0);return index;
 }
 return -1;
}
