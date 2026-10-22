import {scaleWormholeColor} from './wormhole-visuals.mjs';
import {multiplyQ8} from './sphere-collision.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

function roundedInteger(value, mode) {
  let result;
  if(mode==='nearest-even'){const floor=Math.floor(value),part=value-floor;result=part<0.5?floor:part>0.5?floor+1:floor%2===0?floor:floor+1;}
  else if(mode==='toward-zero')result=Math.trunc(value);
  else if(mode==='down')result=Math.floor(value);
  else if(mode==='up')result=Math.ceil(value);
  else throw Error('Contact-color construction requires a declared x87 rounding mode.');
  return Number.isFinite(result)&&result>=-2147483648&&result<=2147483647?result:-2147483648;
}

//4820f0. Model triangle bytes are one-based. Adjacency has eight-byte rows
//even though malloc reserves32 bytes per vertex; no invented capacity clamp.
export function initializeVehicleContactColorTopology(runtime) {
  const {memory:m,handlers={},roundingMode='nearest-even'}=runtime,allocate=handlers.allocate;
  if(typeof allocate!=='function')throw Error('Contact-color topology requires mapped CRT allocation.');
  const count=m.readUInt16LE(ptr(m,0x713184)+4);put(m,0x7130f8,count);
  const allocated=allocate(count*32,runtime),topology=(typeof allocated==='number'?allocated:allocated.eax)>>>0;
  if(topology)m.fill(0,topology,topology+count*32);
  put(m,0x7130d8,topology);
  const second=allocate(256,runtime),directions=(typeof second==='number'?second:second.eax)>>>0;
  if(directions)m.fill(0,directions,directions+256);
  let model=ptr(m,0x713184);const faces=ptr(m,model+12);put(m,0x713180,directions);
  for(let i=0;i<count;i++){put(m,topology+i*8,0);put(m,topology+i*8+4,0);}
  for(let i=0;i<m.readUInt16LE(model+6);i++){
    const a=(m[faces+i*8]-1)&255,b=(m[faces+i*8+1]-1)&255,c=(m[faces+i*8+2]-1)&255;
    for(const[node,first,second]of[[a,b,c],[b,a,c],[c,a,b]]){
      const row=topology+node*8;let neighbors=m[row];
      for(const adjacent of[first,second]){
        let j=0;while(j<neighbors&&m[row+1+j]!==adjacent)j++;
        if(j===neighbors){m[row]=(m[row]+1)&255;m[row+1+j]=adjacent;neighbors++;}
      }
    }
    model=ptr(m,0x713184);
  }
  const normals=ptr(m,model+0x40),one=m.readFloatLE(0x5dc774),scale=m.readFloatLE(0x5dca88);
  m.fill(0,directions,directions+64);
  const normalized=input=>{
    const lanes=input.map(v=>Math.fround(v<<8)),squares=lanes.map(v=>Math.fround(v*v));
    const length=Math.fround(Math.sqrt(Math.fround(Math.fround(squares[1]+squares[0])+squares[2]))),inverse=Math.fround(one/length);
    return lanes.map(v=>roundedInteger(Math.fround(Math.fround(v*scale)*inverse),roundingMode)>>4);
  };
  for(let i=0;i<64;i++){
    const direction=normalized([((i&3)<<7)-192,(((i>>2)&3)<<7)-192,(((i>>4)&3)<<7)-192]);
    let best=-1,selected=-1;
    for(let j=0;j<get(m,0x7130f8);j++){
      const normal=normalized([0,2,4].map(o=>m.readInt16LE(normals+j*8+o)));
      const score=direction.reduce((sum,value,k)=>(sum+multiplyQ8(value,normal[k]))|0,0);
      if(score>best){best=score;selected=j;}
    }
    m[directions+i]=selected&255;
  }
}

//482590. Two100-byte renderer records per face precede the per-vertex DWORD
//colors inside the faceCount*204 allocation. Fields not written stay stale.
export function initializeVehicleContactColorController(owner,runtime) {
  const {memory:m,handlers={}}=runtime,model=ptr(m,0x713184),count=m.readUInt16LE(model+4),faces=m.readUInt16LE(model+6);
  if(typeof handlers.allocate!=='function')throw Error('Contact-color controller requires mapped CRT allocation.');
  const result=handlers.allocate(faces*204,runtime),buffer=(typeof result==='number'?result:result.eax)>>>0;
  if(buffer)m.fill(0,buffer,buffer+faces*204);
  put(m,owner+0x70,buffer);put(m,owner+0x74,buffer+faces*100);put(m,owner+0x78,buffer+faces*200);
  const auxiliary=ptr(m,0x90b990),texture=ptr(m,0x90b988)+((m.readUInt16LE(auxiliary+0x2e)+0x4e)<<4);
  for(let i=0;i<faces*2;i++){
    const row=buffer+i*100;m[row+3]=9;m[row+7]=0x9e;put(m,row+32,get(m,texture));put(m,row+64,get(m,texture+4));m.writeUInt16LE(m.readUInt16LE(texture+8),row+96);
  }
  let colors=ptr(m,owner+0x78);for(let i=0;i<count;i++,colors+=4)put(m,colors,0);
  for(let i=0;i<count;i++){m[owner+9+i]=0;m[owner+0x39+i]=0;}
  put(m,owner+0x6c,-1);m[owner]=0;for(const offset of[0x7c,0x80,0x84,0x88])put(m,owner+offset,-1);
}

//482680: activate an existing vehicle controller or claim the first free one.
//The network-mode allocation guard is the only native no-slot early return.
export function activateVehicleContactColors(record,runtime) {
  const {memory:m}=runtime,body=ptr(m,record);let owner=ptr(m,body+0x6bc);
  if(owner===0xffffffff){
    owner=0xffffffff;
    for(let i=0;i<6;i++)if(!m[0x8495e0+i*0x8c]){owner=0x8495e0+i*0x8c;put(m,owner+0x6c,body);put(m,ptr(m,record)+0x6bc,owner);break;}
  }
  if((get(m,0x6eafe0)&0x81)===0x81&&owner===0xffffffff)return 0;
  m[owner+1]=10;m[owner+8]=0;if(m[owner]!==1)m[owner]=1;
  const live=ptr(m,record),ecx=((record&0xffffff00)|m[live+0x6b4])|0;
  const result=emitNativeEffect(23,live+0x34,[0,0x800,0x3fff,7,ecx,0,m[live+0x6b4]===1?1:0],{dispatch40ea40:request=>dispatchNativeSound(request,runtime.soundRuntime??runtime)});
  put(m,owner+4,result);return 1;
}

//482990: the signed byte wave uses shared topology and a WORD intermediate
//array. Keep the two passes and live byte loads: storage can overlap outputs.
export function updateVehicleContactColors(record, runtime) {
  const {memory: m} = runtime, owner = ptr(m, ptr(m, record) + 0x6bc);
  const count = m.readUInt16LE(ptr(m, 0x713184) + 4), level = m.readInt8(owner + 1);
  if (m.readInt8(owner + 8) > 0) m[owner + 8]--;
  else if (!m[owner + 1]) {m[owner] = 0; return;}
  let topology = ptr(m, 0x7130d8);
  for (let i = 0; i < count; i++, topology += 8) {
    const value = m.readInt8(owner + 9 + i), neighbors = m[topology]; let sum = 0;
    for (let j = 0; j < neighbors; j++) sum = (sum + m.readInt8(owner + 9 + m[topology + j + 1]) - value) | 0;
    const velocity = ((sum >> 3) + m.readInt8(owner + 0x39 + i)) | 0;
    const next = Math.max(0, (value + velocity) | 0), scaled = Math.imul(velocity, 15);
    m[owner + 0x39 + i] = Math.trunc(scaled / 16) & 255;
    m.writeUInt16LE(next & 65535, 0x713100 + i * 2);
  }
  const bias = level < 5 ? (255 - (level << 6)) | 0 : 0;
  let output = ptr(m, owner + 0x78);
  for (let i = 0; i < count; i++, output += 4) {
    let value = m.readInt16LE(0x713100 + i * 2); m[owner + 9 + i] = value & 255;
    value = Math.min(Math.abs(value) << 3, 255);
    let color = value | value << 8 | value << 16;
    const velocity = Math.abs(m.readInt8(owner + 0x39 + i)) << 3;
    if (color > 255) color = 255;
    color |= ((velocity & ~1) << 7) | velocity;
    const seed = Math.imul(get(m, 0x5ec958), 0x41a7) & 0x7fffffff; put(m, 0x5ec958, seed);
    const random = seed >>> 16;
    if (!(random & 1)) {
      let red = random & 255; const blue = (random >> 8) & 127;
      if (bias > 0) red = Math.max(0, red - bias);
      color |= red << 17 | blue;
    }
    const blue = color & 255, green = color >>> 8 & 255, red = color >>> 16 & 255;
    const amount = Math.min(255, Math.max(blue, green, red)), offset = 255 - amount;
    const packed = ((offset << 16) + (color & 0xff0000)) | ((offset << 8) + (color & 0xff00)) | (offset + blue);
    scaleWormholeColor(packed, amount, output, output + 3, runtime);
  }
}
