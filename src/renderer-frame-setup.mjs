import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import constants from './renderer-frame-setup-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const com=(r,object,method,args)=>{if(typeof r.services?.direct3DCall!=='function')throw Error('Renderer frame setup requires Direct3D COM services.');return r.services.direct3DCall(object,method,args,r)|0;};
export function initializeRendererFrameSetupConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
//528fe0. Its AL is discarded by529030, but all live settings singleton calls
//and their possible state mutations remain part of the original algorithm.
export function hasRendererConfiguredTargets(manager,runtime){
  const m=runtime.memory,f=((runtime.scratchBase-4)&~7)-8,settings=getGameGraphicsSettings({...runtime,scratchBase:f-4});if(m[settings+0x63]!==1||get(m,manager+0x51c)<=0)return 0;
  for(let offset=0;offset<0x60;offset+=24){const live=getGameGraphicsSettings({...runtime,scratchBase:f-4});if(m[live+offset+0x64]&&get(m,live+offset+0x68))return 1;}return 0;
}
//511380. Capture the SIMD rectangle, write the cache, then separately reload
//the caller's words for D3DVIEWPORT9. Those steps differ for overlapping input.
export function setRendererViewport(manager,rectangle,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-32;put(m,s+4,rectangle);m.fill(0,f+8,f+32);put(m,f+24,0);put(m,f+28,0x3f800000);
  Buffer.from(m.subarray(rectangle,rectangle+16)).copy(m,manager+0x4ec);for(let i=0;i<4;i++)put(m,f+8+i*4,get(m,rectangle+i*4));const object=ptr(m,manager+0x36c);com({...runtime,scratchBase:f-12},object,0xbc,[object,f+8]);
  for(let i=0;i<4;i++)m.writeFloatLE(Math.fround(ptr(m,f+8+i*4)),manager+0x284+i*4);
  if(typeof runtime.services?.libraryCall!=='function')throw Error('Renderer viewport requires CRT memset.');runtime.services.libraryCall('memset',[manager+0x234,0,64],{...runtime,scratchBase:f-16});
  const f32=Math.fround;m.writeFloatLE(f32(m.readFloatLE(manager+0x28c)*m.readFloatLE(0x5dc6ec)),manager+0x234);m.writeFloatLE(f32(m.readFloatLE(manager+0x290)*m.readFloatLE(0x5dcaf0)),manager+0x248);put(m,manager+0x25c,0x3f800000);put(m,manager+0x270,0x3f800000);
  m.writeFloatLE(f32(m.readFloatLE(manager+0x234)+m.readFloatLE(manager+0x284)),manager+0x264);m.writeFloatLE(f32(m.readFloatLE(manager+0x288)-m.readFloatLE(manager+0x248)),manager+0x268);
}
//529030. TestCooperativeLevel/Clear HRESULTs do not determine AL's success.
//Only the low byte of skipViewport is captured before the first callbacks.
export function clearRendererFrame(manager,flags,color,skipViewport,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;[flags,color,skipViewport].forEach((v,i)=>put(m,s+4+i*4,v));const skip=skipViewport&255;if(!skip)hasRendererConfiguredTargets(manager,{...runtime,scratchBase:f-4});
  let object=ptr(m,manager+0x36c);if(com({...runtime,scratchBase:f-8},object,0xc,[object]))return 1;
  const bits=m[s+4];let clear=bits&3;if((bits&4)&&m[manager+0x52e]===1)clear|=4;if(!clear)return 1;
  if(!skip){const target=ptr(m,ptr(m,manager)+0x44);if(target!==0x511380)throw Error(`Unclosed renderer viewport virtual target${target.toString(16)}.`);setRendererViewport(manager,manager+0x4dc,{...runtime,scratchBase:f-8});}
  object=ptr(m,manager+0x36c);com({...runtime,scratchBase:f-32},object,0xac,[object,0,0,clear,ptr(m,s+8),0x3f800000,0]);return 1;
}
