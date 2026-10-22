import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import {findRendererCommandFlag,getRendererCommandInteger,initializeRendererCommandLineConstants} from './renderer-command-line.mjs';
import {configureRendererGraphicsMode,initializeRendererPresentationConstants} from './renderer-presentation.mjs';
import constants from './renderer-startup-settings-constants.json' with {type:'json'};
export function initializeRendererStartupSettingsConstants(memory){initializeRendererCommandLineConstants(memory);initializeRendererPresentationConstants(memory);for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
//5125d0. Every flag probe requests the live platform command line anew;
//integer extraction independently requests it again through actual4a1530.
export function configureRendererStartupSettings(manager,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=((s-4)&~7)-40,r={...runtime,scratchBase:f-4};
  let width=1024,height=768;put(m,f+0x18,32);put(m,f+0x1c,0);m[f+0x17]=1;
  const flag=key=>{if(typeof runtime.services?.platformCall!=='function')throw Error('Renderer settings require GetCommandLineW.');const input=runtime.services.platformCall('GetCommandLineW',[],r)>>>0;return findRendererCommandFlag(input,key,r);};
  if(flag(0x5db144))width=getRendererCommandInteger(0x5db144,r);
  if(flag(0x5db160))height=getRendererCommandInteger(0x5db160,r);
  if(flag(0x5db170))put(m,f+0x18,getRendererCommandInteger(0x5db170,r));
  put(m,f+0x24,flag(0x5db180)?0:m[f+0x17]);
  if(flag(0x5db1a0))put(m,f+0x1c,getRendererCommandInteger(0x5db1a0,r));
  const fullscreen=flag(0x5db1c0)?0:1;m[f+0x20]=fullscreen;
  const scale=Math.fround(Math.fround(width)/Math.fround(height));
  [width,height,get(m,f+0x18),60,get(m,f+0x20)].forEach((v,i)=>put(m,f-24+i*4,v));m.writeFloatLE(scale,f-4);
  const settings=getGameGraphicsSettings({...runtime,scratchBase:f-28});
  configureRendererGraphicsMode(settings,...Array.from({length:5},(_,i)=>get(m,f-24+i*4)),m.readFloatLE(f-4),{...runtime,scratchBase:f-28});
  put(m,getGameGraphicsSettings(r)+0x54,get(m,f+0x1c));m[getGameGraphicsSettings(r)+0x58]=get(m,f+0x24)&255;m[getGameGraphicsSettings(r)+0x60]=1;
  const caps=ptr(m,manager+0x488);if(caps){const quality=(get(m,caps+0x420)&0x10000)&&get(m,manager+0x500)!==0?4:3;put(m,getGameGraphicsSettings(r)+0x50,quality);}
}
