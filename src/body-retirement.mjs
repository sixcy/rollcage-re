import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {emitRawEffectParticles,emitRawBodyDebris,alterRawTerrainBrightness,appendRawBodyFlash,activateRawBodyTrail,activateRawBodyPulse} from './body-retirement-effects.mjs';
const get=(memory,address)=>memory.readInt32LE(address);
const pointer=(memory,address)=>memory.readUInt32LE(address);
const put=(memory,address,value)=>memory.writeInt32LE(value|0,address);
const word=(memory,address,value)=>memory.writeUInt16LE(value&65535,address);
const call=(handlers,name,request)=>{if(typeof handlers[name]!=='function')throw Error(`Body retirement requires reached handler ${name}.`);return handlers[name](request);};
const copyVector=(memory,source,target)=>{for(const offset of[0,4,8])put(memory,target+offset,get(memory,source+offset));};

//4284d0. CollisionCount10c is a signed inclusive last index: zero releases
//one entry. Free/active cursors are held locally until the whole loop finishes.
export function unregisterPhysicalBody(body,{memory}){
  let last=memory.readInt8(body+0x10c);
  if(last>=0){
    let activeLast=get(memory,0x91e784),reverse=pointer(memory,0x91e790);
    put(memory,0x91e798,get(memory,0x91e798)-last-1);
    let freeLast=get(memory,0x91e794);
    do{
      const id=memory[body+0x140+last];freeLast++;
      const active=pointer(memory,0x91e78c),position=memory[reverse+id],replacement=memory[active+activeLast];activeLast--;last--;
      memory[pointer(memory,0x91e78c)+position]=replacement;
      reverse=pointer(memory,0x91e790);memory[reverse+replacement]=position;
      memory[pointer(memory,0x91e780)+freeLast]=id;
    }while(last>=0);
    put(memory,0x91e794,freeLast);put(memory,0x91e784,activeLast);
  }
  memory[body+0x10c]=0;
  let array=pointer(memory,0x902bc0),end=array+memory.readUInt16LE(0x902bc4)*4,found=array;
  while(pointer(memory,found)!==(body>>>0))found+=4;
  put(memory,found,get(memory,end-4));put(memory,end-4,0);word(memory,0x902bc4,memory.readUInt16LE(0x902bc4)-1);
  const group=pointer(memory,body+0x130);
  if(group){
    array=pointer(memory,group);end=array+memory.readUInt16LE(group+4)*4;found=array;
    while(pointer(memory,found)!==(body>>>0))found+=4;
    put(memory,found,get(memory,end-4));put(memory,end-4,0);word(memory,group+4,memory.readUInt16LE(group+4)-1);
  }
  put(memory,body,get(memory,body)|0x8000);
}

//474850. This raw variant follows packed128-byte pool IDs and tagged bucket
//pointers, independently of the structured BodySpatialRegistry adapter.
export function removeBodySpatial(body,{memory}){
  const previous=memory.readUInt16LE(body+6);
  if(previous===0){
    const bucket=pointer(memory,body+12)&0xfffffffe;word(memory,bucket+8,memory.readUInt16LE(body+4));
    const next=memory.readUInt16LE(body+4);
    if(next){const address=(pointer(memory,0x902eec)-128+next*128)>>>0;if(address){word(memory,address+6,0);put(memory,body+4,0);return;}}
  }else{
    const next=memory.readUInt16LE(body+4),base=pointer(memory,0x902eec);
    if(next){const address=(base-128+next*128)>>>0;if(address)word(memory,address+6,previous);}
    word(memory,(base-124+previous*128)>>>0,memory.readUInt16LE(body+4));
  }
  put(memory,body+4,0);
}

//436410. Append a bounded36-byte position effect; source pointer remains live.
export function appendBodyPositionEffect(position,count,{memory}){
  const length=pointer(memory,0x810920),radius=Math.max(5,(count+3)&65535);
  if(length>=16)return;
  const row=0x8106e0+length*36;copyVector(memory,position,row);put(memory,row+12,position);word(memory,row+16,radius);word(memory,row+18,2);put(memory,row+20,0x26);put(memory,0x810920,length+1);
}

//435ba0. Every effect-mask branch executes an actual numeric/state default.
export function emitBodyEffectBurst(position,velocity,count,mask,code,{memory,scratchBase,handlers={},soundRuntime}){
  count|=0;mask|=0;code&=255;
  const request=(extra={})=>({position,velocity,count,memory,scratchBase,...extra});
  if(count!==0&&code!==0){
    const index=get(memory,0x9153dc),next=(index+1)|0,target=(0x919020+Math.imul(index,12))>>>0;
    put(memory,0x9153dc,(next>>>0)<24?next:0);copyVector(memory,position,target);
    const args=[0,0x400,12000,6,next,0,0];
    if(handlers.emit484bb0)call(handlers,'emit484bb0',request({code,registerEdx:target,args}));
    else emitNativeEffect(code,target,args,{dispatch40ea40:value=>handlers.dispatch40ea40?call(handlers,'dispatch40ea40',{...value,memory}):dispatchNativeSound(value,soundRuntime??{memory,handlers})});
  }
  const particles=(color,kind)=>handlers.emitParticles435f20?call(handlers,'emitParticles435f20',request({color,kind,scratchBase:scratchBase-32})):emitRawEffectParticles(position,velocity,count,color,kind,{memory});
  if(mask&4)particles(get(memory,0x9153d8),4);
  if(mask&8)particles(get(memory,0x9153e0),8);
  if(mask&0x200)appendBodyPositionEffect(position,count,{memory});
  if(mask&0x400){if(handlers.emit436490)call(handlers,'emit436490',request({scratchBase:scratchBase-20}));else appendRawBodyFlash(position,count,{memory});}
  if(mask&0x10)particles(get(memory,0x9153e4),0x10);
  if(mask&1)particles(get(memory,0x919000),1);
  if(mask&0x800){copyVector(memory,position,0x91cd80);put(memory,0x91cd90,1);put(memory,0x91cd8c,Math.imul(count,4)+4);}
  if(mask&0x20){if(handlers.emitDebris475a10)call(handlers,'emitDebris475a10',request({scratchBase:scratchBase-24}));else emitRawBodyDebris(position,velocity,count,{memory});}
  if(mask&0x80){if(handlers.emit436510)call(handlers,'emit436510',request({mode:1,scratchBase:scratchBase-20}));else activateRawBodyTrail(position,1,{memory});}
  if(mask&0x80000){if(handlers.emit436510)call(handlers,'emit436510',request({mode:2,scratchBase:scratchBase-20}));else activateRawBodyTrail(position,2,{memory});}
  if((mask&0x10000)&&get(memory,0x811180)===0){
    put(memory,0x91cd6c,get(memory,position));put(memory,0x91cd70,get(memory,position+4));const z=get(memory,position+8);
    put(memory,0x91cd60,1);put(memory,0x91cd64,31);put(memory,0x91cd68,count);put(memory,0x91cd74,z);
  }
  if(mask&0x40000){if(handlers.alterTerrain437aa0)call(handlers,'alterTerrain437aa0',request({scratchBase:scratchBase-20}));else alterRawTerrainBrightness(position,count,{memory,scratchBase:scratchBase-20});}
  if(mask&0x100){if(handlers.emit437670)call(handlers,'emit437670',request({scratchBase:scratchBase-20}));else activateRawBodyPulse(position,{memory});}
  if(mask&0x40){word(memory,0x6fb954,memory.readUInt16LE(position+2));word(memory,0x6fb956,memory.readUInt16LE(position+6));const z=memory.readUInt16LE(position+10);put(memory,0x6fb9a4,1);word(memory,0x6fb958,z);}
  if(mask&0x20000){copyVector(memory,position,0x9153f0);put(memory,0x9153d0,1);put(memory,0x9153cc,Math.imul(count,4)+4);}
  if(mask&0x1000)particles(get(memory,0x9153c8),0x4000);
}

//46a2d0. Controller identity/state are captured before both removals. Effects
//may change the clock/handle; those values are deliberately reread afterward.
export function retireType33Body(body,{memory,scratchBase,handlers={},soundRuntime}){
  const controller=pointer(memory,body+0x164),state=get(memory,controller+4);
  put(memory,controller+4,0);removeBodySpatial(body,{memory});unregisterPhysicalBody(body,{memory});
  if(state>9){
    const position=scratchBase-12,velocity=scratchBase-24;
    const y=(get(memory,body+0x38)+0x280000)|0,x=get(memory,body+0x34),z=get(memory,body+0x3c);
    put(memory,position,x);put(memory,position+4,y);put(memory,position+8,z);put(memory,velocity,0);put(memory,velocity+4,-0x400000);put(memory,velocity+8,0);
    const request={position,velocity,count:8,mask:0x5126b,code:11,memory,scratchBase:scratchBase-52,handlers,soundRuntime};
    if(handlers.emitBurst435ba0)call(handlers,'emitBurst435ba0',request);else emitBodyEffectBurst(position,velocity,8,0x5126b,11,request);
    put(memory,0x903520,get(memory,0x90a548));
  }
  const handle=pointer(memory,controller+8);
  if(handle===127)return;
  if(handle>256){
    const object=pointer(memory,handle);
    if(object){const vtable=pointer(memory,object);call(handlers,'stopAudioVirtual34',{handle,object,vtable,method:pointer(memory,vtable+0x34),memory});}
  }
  put(memory,controller+8,127);
}
