//476550: live raw body/script storage, including46e4e0 release and46e600 debris.
import {abs32,multiplyQ16,divideQ16,dotQ16,crossQ16,sqrtQ16} from './fixed-integer.mjs';
import {multiplyQ8,normalizeCollisionVector} from './sphere-collision.mjs';
import {scriptedCurveVelocity} from './scripted-motion.mjs';
import {removeBodySpatial,emitBodyEffectBurst} from './body-retirement.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
import {registerRawEffectSpatial} from './body-retirement-effects.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));
const store=(m,p,v)=>v.forEach((x,i)=>put(m,p+i*4,x));
const nextSeed=s=>Math.imul(s,0x41a7)&0x7fffffff;
const add=(a,b)=>a.map((v,i)=>(v+b[i])|0),delta8=(a,b)=>a.map((v,i)=>(v-b[i])>>8),scale=(a,s)=>a.map(v=>multiplyQ16(v,s));
function root(memory,value){put(memory,0x91d45c,abs32(value));put(memory,0x91d460,Math.clz32(abs32(value)));return sqrtQ16(value);}
function length(memory,v){let s=v.map(x=>multiplyQ16(x,x));const reduced=(s.reduce((a,b)=>a|b,0)&0xe0000000)!==0;if(reduced)s=s.map(x=>x>>>2);return root(memory,s.reduce((a,b)=>(a+b)|0,0))<<(reduced?1:0);}
const invoke=(runtime,name,request,fallback)=>runtime.handlers?.[name]?runtime.handlers[name]({...runtime,...request}):fallback();

//46e600. The free cursor is committed only after every requested RNG pair.
//A widened ushort ID can never equal the native -1 comparison sentinel.
export function emitScriptedReleaseDebris(body,count,runtime){
  const {memory}=runtime,x=get(memory,body+0x34),vx=get(memory,body+0x68)>>1,vy=get(memory,body+0x6c)>>1,z=get(memory,body+0x3c),y=(get(memory,body+0x38)-0x1e0000)|0,vz=get(memory,body+0x70)>>1;
  if((count|0)<=0)return;
  let seed=ptr(memory,0x5ec958),free=get(memory,0x902b8c);
  do{
    const first=nextSeed(seed);seed=nextSeed(first);put(memory,0x5ec958,seed);
    const dx=((((first>>>16)&63)-32)<<15)+vx|0,dz=((((seed>>>16)&63)-32)<<15)+vz|0;
    if(free>=0){
      const id=memory.readUInt16LE(ptr(memory,0x902b7c)+free*2);free--;
      const active=get(memory,0x902b88);word(memory,ptr(memory,0x902b80)+active*2,id);put(memory,0x902b88,active+1);
      const particle=(ptr(memory,0x902b84)+(id<<7))>>>0;
      put(memory,particle+0x54,z);put(memory,particle+0x4c,x);put(memory,particle+0x50,y);
      registerRawEffectSpatial(particle,x,y,z,{memory});
      word(memory,particle+8,15);put(memory,particle+0x58,dx);word(memory,particle+0x6a,1);
      for(const[o,t]of[[0x4e,0x64],[0x52,0x66],[0x56,0x68]])word(memory,particle+t,memory.readUInt16LE(particle+o));
      put(memory,particle+0x5c,vy);seed=ptr(memory,0x5ec958);put(memory,particle+0x60,dz);
      put(memory,particle+0x30,0x9fff9f);put(memory,particle+0x14,0xae1f3f1f);memory[particle+0x6c]=1;
    }
  }while(--count!==0);
  put(memory,0x902b8c,free);
}

//46e4e0. This releases scripted control; it does not unregister the body.
export function releaseRawScriptedBody(body,runtime){
  const {memory,scratchBase}=runtime,frame=scratchBase-32,flags=get(memory,body);
  if(flags&0x2000){
    put(memory,body+0x108,get(memory,body+0x108)&~1);put(memory,body,(flags&0xffffddff)|0x1000);
    let direction=[0xc8,0xce,0xd4].map(o=>memory.readInt16LE(body+o));store(memory,frame+8,direction);
    if(direction.some(v=>abs32(v)>0x230000))direction=direction.map(v=>v>>3);
    direction=scale(direction,divideQ16(65536,length(memory,direction)));store(memory,frame+8,direction);
    let sine=root(memory,Math.max(0,Math.trunc(((65536-direction[2])|0)/2)));if(direction[0]<0)sine=-sine|0;
    const cosine=root(memory,Math.trunc(((Math.max(direction[2],-65536)+65536)|0)/2));
    store(memory,body+0x58,[cosine,0,sine]);put(memory,body+0x64,0);
    const seed=nextSeed(get(memory,0x5ec954));put(memory,0x5ec954,seed);const roll=Math.imul(seed>>>15,0x7fff)>>>16;
    put(memory,body+0x80,((roll&15)-8)<<20);put(memory,body+0x88,(((roll>>>8)&15)-8)<<20);put(memory,body+0x84,(((roll>>>4)&15)-8)<<20);
    invoke(runtime,'call46e600',{ecx:body,edx:16,scratchBase:frame-4},()=>emitScriptedReleaseDebris(body,16,{...runtime,scratchBase:frame-4}));return 0;
  }
  const y=(get(memory,body+0x38)+0x8c0000)|0,x=get(memory,body+0x34);put(memory,frame+0x14,x);const z=get(memory,body+0x3c);put(memory,frame+0x18,y);put(memory,frame+0x1c,z);store(memory,frame+8,[0,-0x400000,0]);
  invoke(runtime,'call435ba0',{ecx:frame+0x14,edx:frame+8,args:[1,0x11229,11],scratchBase:frame-16},()=>emitBodyEffectBurst(frame+0x14,frame+8,1,0x11229,11,{...runtime,scratchBase:frame-16}));
  put(memory,body+0x148,0x46e470);return 1;
}

function face(memory,body,direction,roundingMode){
  const forward=normalizeCollisionVector(direction.slice(),roundingMode,{normalizeReduction:(bits,zeros)=>{put(memory,0x91d45c,bits);put(memory,0x91d460,zeros);}}).vector.map(x=>x<<4),right=[forward[2],0,-forward[0]|0];
  if(length(memory,right)<0x400)return;
  const reduced=right.some(v=>abs32(v)>0x230000)?right.map(v=>v>>3):right,normal=scale(reduced,divideQ16(65536,length(memory,reduced))),up=crossQ16(forward,normal);
  if(length(memory,normal)<0xff78)return;
  for(const[v,offsets]of[[normal,[0xc4,0xca,0xd0]],[up,[0xc6,0xcc,0xd2]],[forward,[0xc8,0xce,0xd4]]])offsets.forEach((o,i)=>word(memory,body+o,v[i]>>4));
  put(memory,body+0x108,get(memory,body+0x108)|1);
}

//scratchBase is the native entry ESP. The opcode limit is a workflow guard.
//Native callers own body+134 and auxiliary-pack90b990+a8 pointers.
export function stepRawScriptedMotion(body,runtime){
  const {memory,scratchBase,roundingMode,maxOpcodes=100000}=runtime,frame=scratchBase-124;
  let changed=0,direction,executedOpcodes=0;
  for(;;){
    if(executedOpcodes++>=maxOpcodes)throw Error('Raw scripted-motion workflow opcode budget exceeded.');
    const address=(ptr(memory,body+0x134)+memory.readUInt16LE(body+0x138))>>>0,opcode=memory.readInt16LE(address);let advance=0,again=false;
    switch(opcode){
      case 0:{const y=memory.readInt16LE(address+4)<<8,x=memory.readInt16LE(address+2)<<8,z=memory.readInt16LE(address+6)<<8;put(memory,body+0x6c,y);put(memory,body+0x70,z);put(memory,body+0x68,x);changed|=1;advance=8;break;}
      case 1:{changed|=1;let timer=memory.readUInt16LE(body+0x13a);if(!timer){const x=memory.readInt16LE(address+6)<<8,y=memory.readInt16LE(address+8)<<8,t=memory.readUInt16LE(address+2),z=memory.readInt16LE(address+10)<<8;put(memory,body+0x68,x);put(memory,body+0x6c,y);word(memory,body+0x13a,t);put(memory,body+0x70,z);}else{timer=(timer-1)&65535;word(memory,body+0x13a,timer);if(!timer)advance=12;}break;}
      case 2:{if(!(get(memory,body)&0x8000))invoke(runtime,'call474850',{ecx:body,scratchBase:frame-4},()=>removeBodySpatial(body,{memory}));const insert=!(get(memory,body)&0x8000);for(const o of[0,4,8])put(memory,body+0x34+o,get(memory,address+4+o));if(insert)invoke(runtime,'call474600',{ecx:body,scratchBase:frame-4},()=>registerRawBodySpatial(body,{memory}));advance=16;again=true;break;}
      case 3:case 7:{
        const count=memory.readInt16LE(address+2),base=address+4+memory[body+0x13e]*16,action=memory.readUInt16LE(base+18),speed=memory.readUInt16LE(base);
        if((action&15)===1){if(!memory.readUInt16LE(body+0x13c))word(memory,body+0x13c,((action>>>4)&0x7ff)+1);const timer=memory.readInt16LE(body+0x13c);if(timer>0){word(memory,body+0x13c,timer===1?65535:timer-1);store(memory,body+0x68,[0,0,0]);changed|=1;break;}}
        else if((action&15)===2){const release=invoke(runtime,'call46e4e0',{body,ecx:changed,edx:2,args:[body,0,0],scratchBase:frame-16},()=>releaseRawScriptedBody(body,{...runtime,scratchBase:frame-16}));return {released:true,releaseResult:release,executedOpcodes};}
        else if((action&15)===3&&!memory.readUInt16LE(body+0x13c)){invoke(runtime,'call46e600',{ecx:body,edx:7,scratchBase:frame-4},()=>emitScriptedReleaseDebris(body,7,{...runtime,scratchBase:frame-4}));word(memory,body+0x13c,1);}
        let pointsAt=base+4;
        if(!memory.readUInt16LE(body+0x13a))word(memory,body+0x13a,4096);
        else{word(memory,body+0x13a,memory.readUInt16LE(body+0x13a)-speed);if(memory.readInt16LE(body+0x13a)<=0){memory[body+0x13e]=(memory[body+0x13e]+1)&255;const segment=memory[body+0x13e];put(memory,body+0x13a,4096);pointsAt=address+8+segment*16;if(segment===count){put(memory,body+0x13a,0);memory[body+0x13e]=0;advance=count*16+52;again=true;break;}}}
        const points=Array.from({length:4},(_,i)=>vector(memory,pointsAt+i*16)),phase=(4096-memory.readInt16LE(body+0x13a))>>4,step=speed>>4;let linearWeight=0,curveWeight=65536;
        if(opcode===7){const middle=delta8(points[2],points[1]),left=add(delta8(points[1],points[0]),middle),right=add(delta8(points[3],points[2]),middle),leftLength=length(memory,left),rightLength=length(memory,right),alignment=divideQ16(dotQ16(left,right),multiplyQ16(rightLength,leftLength));linearWeight=Math.max(0,Math.min(65536,(alignment*2-65536)|0));curveWeight=65536-linearWeight;direction=add(left.map(v=>multiplyQ8(v,memory.readInt16LE(body+0x13a)>>4)),right.map(v=>multiplyQ8(v,phase)));}
        const linear=linearWeight?scale(delta8(points[2],points[1]).map(v=>Math.imul(v,step)),linearWeight):[0,0,0],curve=curveWeight?scale(scriptedCurveVelocity(points,phase,step),curveWeight):[0,0,0];store(memory,body+0x68,add(linear,curve));changed|=opcode===7?3:1;break;
      }
      case 4:{const index=memory[body+0x13f];word(memory,body+0x138,0);const spawn=ptr(memory,ptr(memory,0x90b990)+0xa8)+index*8;for(const o of[0,2,4])put(memory,body+0x34+o*2,memory.readInt16LE(spawn+o)<<16);store(memory,body+0x68,[0,0,0]);again=true;break;}
      case 6:{advance=8;const kind=memory.readInt16LE(address+2);if((kind>>>0)<100&&(get(memory,body)&0x1ff)===26){if(kind!==2)word(memory,body+0x184,memory.readUInt16LE(address+4));else put(memory,body+0x180,3);}again=true;break;}
      default:break;
    }
    word(memory,body+0x138,memory.readUInt16LE(body+0x138)+advance);
    if(again)continue;
    if(changed&1){const mass=get(memory,body+0xa8);for(const o of[0,4,8]){const v=get(memory,body+0x68+o);put(memory,body+0x40+o,mass===65536?v:multiplyQ16(v,mass));}}
    if(changed&2)face(memory,body,direction,roundingMode);
    return {released:false,executedOpcodes};
  }
}
