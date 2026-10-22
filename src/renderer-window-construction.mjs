import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import constants from './renderer-window-construction-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const platform=(r,name,args)=>{if(typeof r.services?.platformCall!=='function')throw Error(`Renderer windows require Win32 ${name}.`);return r.services.platformCall(name,args,r)|0;};
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer windows require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
export function initializeRendererWindowConstructionConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
function constantVirtual(application,slot,target,value,runtime){const m=runtime.memory,actual=ptr(m,ptr(m,application)+slot);if(actual!==target)throw Error(`Unclosed WindowsApplication virtual${slot.toString(16)} target${actual.toString(16)}.`);return value;}
//50d750, actual402e70 icon and402940 menu getters. WNDCLASSEXW padding and
//the untouched class-info success path retain their original storage.
export function registerRendererWindowClass(application,brush,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-56;put(m,s+4,brush);
  if(platform({...runtime,scratchBase:f-16},'GetClassInfoExW',[ptr(m,application+0x14),0x5dadd0,f+8]))return 1;
  let background=ptr(m,s+4);if(background<=24)background=(background+1)>>>0;
  library({...runtime,scratchBase:f-16},'memset',[f+8,0,48]);put(m,f+0x1c,get(m,application+0x14));put(m,f+8,48);put(m,f+12,11);put(m,f+16,0x50d640);put(m,f+20,0);put(m,f+24,0);
  const icon=constantVirtual(application,0x48,0x402e70,101,runtime)&65535;put(m,f+32,platform({...runtime,scratchBase:f-12},'LoadIconW',[ptr(m,application+0x14),icon]));
  put(m,f+36,platform({...runtime,scratchBase:f-12},'LoadCursorW',[0,0x7f00]));put(m,f+40,background);
  const settings=getGameGraphicsSettings({...runtime,scratchBase:f-4});put(m,f+44,m[settings+0x3c]?0:constantVirtual(application,0x4c,0x402940,0,runtime)&65535);
  put(m,f+48,0x5dadd0);put(m,f+52,0);return(platform({...runtime,scratchBase:f-8},'RegisterClassExW',[f+8])&65535)!==0?1:0;
}
//50d840. Eight raw arguments: the first is unread; x,y,width,height,
//fullscreen,count,windowed follow. Fullscreen children keep the first window
//as their parent, and final application+4 is reloaded from application+8.
export function createRendererWindows(application,unused,x,y,width,height,fullscreen,count,windowed,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-36;[unused,x,y,width,height,fullscreen,count,windowed].forEach((v,i)=>put(m,s+4+i*4,v));
  let w=get(m,s+16),h=get(m,s+20);if(!w)w=platform({...runtime,scratchBase:f-8},'GetSystemMetrics',[0]);if(!h)h=platform({...runtime,scratchBase:f-8},'GetSystemMetrics',[1]);
  const create=(extended,style,px,py,pw,ph,parent)=>{const instance=ptr(m,application+0x14),title=constantVirtual(application,8,0x402e60,0x56fee0,runtime);return platform({...runtime,scratchBase:f-52},'CreateWindowExW',[extended,0x5dadd0,title,style>>>0,px|0,py|0,pw|0,ph|0,parent>>>0,0,instance,0]);};
  if(m[s+24]){let remaining=get(m,s+28),parent=0,index=0;while(remaining>0){const screenHeight=platform({...runtime,scratchBase:f-24},'GetSystemMetrics',[1]),screenWidth=platform({...runtime,scratchBase:f-28},'GetSystemMetrics',[0]),handle=create(8,0x90000000,0,0,screenWidth,screenHeight,parent);put(m,application+4,handle);put(m,application+8+index*4,handle);parent=ptr(m,application+8);remaining--;index++;}put(m,application+4,parent);}
  else{put(m,f+16,0);put(m,f+20,0);put(m,f+24,w);put(m,f+28,h);let extended=0,style=0x90000000;
    if(m[s+32]){platform({...runtime,scratchBase:f-20},'AdjustWindowRectEx',[f+16,0xcf0000,0,0x300]);h=(get(m,f+28)-get(m,f+20))|0;w=(get(m,f+24)-get(m,f+16))|0;extended=0x300;style=0xcf0000;}
    const handle=create(extended,style,get(m,s+8),get(m,s+12),w,h,0);put(m,application+4,handle);put(m,application+8,handle);
  }
  const handle=ptr(m,application+4);if(!handle)return 0;platform({...runtime,scratchBase:f-12},'ShowWindow',[handle,1]);return 1;
}
//50d9a0. Only the low byte of the fullscreen temporary is written before
//forwarding its full DWORD, preserving the caller's retained upper bytes.
export function configureRendererWindows(application,count,windowed,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;put(m,s+4,count);put(m,s+8,windowed);if(m[application+0x1c]!==1)return 1;
  const brush=platform({...runtime,scratchBase:f-8},'GetStockObject',[4]);if(!registerRendererWindowClass(application,brush,{...runtime,scratchBase:f-8}))return 0;
  const settings=getGameGraphicsSettings({...runtime,scratchBase:f-4}),last=ptr(m,s+8),number=ptr(m,s+4);m[f+8]=m[settings+0x3c];
  return createRendererWindows(application,0,get(m,settings+0x24),get(m,settings+0x28),get(m,settings+0x2c),get(m,settings+0x30),get(m,f+8),number,last,{...runtime,scratchBase:f-36});
}
