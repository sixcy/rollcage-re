import {getRendererWindowApplication} from './renderer-presentation.mjs';
import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {initializeRendererWindowConstructionConstants} from './renderer-window-construction.mjs';
import constants from './renderer-window-messages-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Window key history requires CRT ${name}.`);return r.services.libraryCall(name,args,r)>>>0;};
const platform=(r,name,args)=>{if(typeof r.services?.platformCall!=='function')throw Error(`Window messages require Win32 ${name}.`);return r.services.platformCall(name,args,r)|0;};
export function initializeRendererWindowMessagesConstants(memory){initializeRendererWindowConstructionConstants(memory);for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
//4416a0. Reverse key history, original CRT matching and raw cheat-state
//producers. Feedback defaults to the existing484bb0/40ea40 algorithms; their
//populated-bank libaudio descendants remain declared game boundaries.
export function recordRendererWindowKey(key,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12,H=0x6fbaf0;for(let i=32;i>0;i--)m[H+i]=m[H+i-1];m[H]=key&255;m[H+32]=0;
  library({...runtime,scratchBase:f-8},'_strlwr',[H]);
  const match=(literal,first=false)=>library({...runtime,scratchBase:f-(first?16:12)},'strstr',[H,literal])===H;
  let gravity=true,other=true;
  if(match(0x5d0734,true)){const settings=ptr(m,0x5ecefc);m[settings+0x97]=2;put(m,0x5eb5e0,m[settings+0x82]?65536:20000);}
  else if(match(0x5d0744)){const settings=ptr(m,0x5ecefc);m[settings+0x97]=1;put(m,0x5eb5e0,m[settings+0x82]?65536:45000);}
  else if(match(0x5d0754)){put(m,0x5eb5e0,65536);m[ptr(m,0x5ecefc)+0x97]=0;}
  else gravity=false;
  if(match(0x5d076c))m[ptr(m,0x5ecefc)+0x96]^=1;
  else if(match(0x5d0774)&&get(m,0x5eb518)){const settings=ptr(m,0x5ecefc),mode=get(m,0x5ec138);m[settings+7]=m[settings+7]===0?1:0;if(mode===4)put(m,0x6e6764,1);}
  else if(match(0x5d0784))m[ptr(m,0x5ecefc)+0x95]^=1;
  else if(match(0x5d0794)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x721]^=0x40;
  else if(match(0x5d07a4)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=0x80;
  else if(match(0x5d07b4)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=2;
  else if(match(0x5d07c4)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=4;
  else if(match(0x5d07d4)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=0x10;
  else if(match(0x5d07e0)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=0x20;
  else if(match(0x5d07ec)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x720]^=8;
  else if(match(0x5d07f8))m[ptr(m,0x5ecb1c)+0x721]^=0x80;
  else if(match(0x5d0804)){const p=ptr(m,0x5ecb1c)+0x61c;m.writeUInt16LE(m.readUInt16LE(p)^1,p);}
  else if(match(0x5d0814)&&get(m,0x5eb518))m[ptr(m,0x5ecb1c)+0x587]^=1;
  else if(match(0x5d0820))m[ptr(m,0x5ecefc)+0x29]^=1;
  else if(match(0x5d0838)){const p=ptr(m,0x5ecb1c)+0x724;put(m,p,get(m,p)^1);}
  else other=false;
  if(gravity||other){const args=[0,0x800,15000,5,0,0,0];emitNativeEffect(35,0,args,{dispatch40ea40:request=>dispatchNativeSound(request,{...runtime,scratchBase:s-44})});}
}
//403570. The actual Application receiver suppresses close and key messages
//before50d640's generic fallback, rather than setting a quit flag on WM_CLOSE.
export function receiveRendererApplicationMessage(application,window,message,wParam,lParam,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[window,message,wParam,lParam].forEach((v,i)=>put(m,s+4+i*4,v));const liveMessage=ptr(m,s+8);if(liveMessage===16)return 0;if(liveMessage===256){recordRendererWindowKey(m[s+12],{...runtime,scratchBase:s-4});return 0;}return 1;
}
function virtualTarget(application,slot,target,runtime){const m=runtime.memory,actual=ptr(m,ptr(m,application)+slot);if(actual!==target)throw Error(`Unclosed window-message virtual${slot.toString(16)} target${actual.toString(16)}.`);}
//50d640. Actual original WindowsApplication vtable callbacks and numeric
//message/command policy. Unknown class overrides remain explicit game gaps.
export function dispatchRendererWindowMessage(window,message,wParam,lParam,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;[window,message,wParam,lParam].forEach((v,i)=>put(m,s+4+i*4,v));let application=getRendererWindowApplication({...runtime,scratchBase:f-4});
  const param=ptr(m,s+16),word=ptr(m,s+12),msg=ptr(m,s+8),hwnd=ptr(m,s+4);virtualTarget(application,0x44,0x403570,runtime);
  if(!receiveRendererApplicationMessage(application,hwnd,msg,word,param,{...runtime,scratchBase:f-20}))return 0;
  if(msg===2){application=getRendererWindowApplication({...runtime,scratchBase:f-4});virtualTarget(application,0x10,0x402940,runtime);platform({...runtime,scratchBase:f-8},'PostQuitMessage',[0]);return 0;}
  if(msg===0x112){const settings=getGameGraphicsSettings({...runtime,scratchBase:f-4});if(m[settings+0x3c]===1){if([0xf000,0xf010,0xf030,0xf100,0xf170].includes(word))return 1;if(word===0xf140)return 0;if(word===0xf130){platform({...runtime,scratchBase:f-12},'ShowWindow',[hwnd,6]);return 0;}}}
  if(msg===0x218)return 0x424d5144;
  return platform({...runtime,scratchBase:f-20},'DefWindowProcW',[hwnd,msg,word,ptr(m,s+16)]);
}
