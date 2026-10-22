import {assignGameWideString} from './game-wide-string-buffer.mjs';
import {resizeRendererShaderInputs,assignRendererShaderInputs} from './renderer-shader-inputs.mjs';
import {getApplicationDebugger,registerApplicationDebuggerName} from './application-bootstrap.mjs';
import constants from './renderer-shader-program-constants.json' with {type:'json'};
export function initializeRendererShaderProgramConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),rows=(m,end,begin)=>Math.trunc(((get(m,end)-get(m,begin))|0)/44),length=(m,p)=>{let n=0;while(m.readUInt16LE(p+n*2))n++;return n;};
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer shader programs require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const debuggerRuntime=r=>({...r,nativeDebuggerRecords:true,handlers:{...r.handlers,allocate:size=>library(r,'operatorNew',[size]),free:p=>library(r,'operatorDelete',[p]),registerExit:p=>library(r,'registerExit',[p])}});
//50f130 has printf-looking arguments which are unused: it lazily registers
//the PC Renderer debugger category and returns that category's integer ID.
export function getRendererShaderDebugCategory(runtime){const m=runtime.memory,s=runtime.scratchBase,f=s-12;if(!(get(m,0x714b50)&1)){put(m,0x714b50,get(m,0x714b50)|1);const child=debuggerRuntime({...runtime,scratchBase:f-8}),debuggerObject=getApplicationDebugger(child);put(m,0x714b4c,registerApplicationDebuggerName(debuggerObject,0x5daea0,false,child));}return get(m,0x714b4c);}
function callEffect(object,method,args,frame,runtime){if(typeof runtime.services?.direct3DCall!=='function')throw Error('Renderer shader programs require D3DX effect COM services.');return runtime.services.direct3DCall(object,method,[object,...args],{...runtime,scratchBase:frame-4*(args.length+2)})|0;}
const debuggerObject=(runtime,s)=>getApplicationDebugger(debuggerRuntime({...runtime,scratchBase:s}));
//5258b0. COM FindNextValidTechnique/ValidateTechnique/GetParameter and
//IsParameterUsed remain real platform/library methods, never game callbacks.
export function initializeRendererShaderEffect(program,effect,runtime){const m=runtime.memory,s=runtime.scratchBase,f=s-40;put(m,s+4,effect);put(m,program,effect);put(m,program+8,0);library({...runtime,scratchBase:f-16},'memset',[program+12,0,96]);if(!ptr(m,program))return;
  callEffect(ptr(m,program),0x11c,[ptr(m,ptr(m,0x714ae8)+0x364)],f,runtime);let result=callEffect(ptr(m,program),0xf4,[0,f+44],f,runtime);
  while(result===0&&ptr(m,f+44)){callEffect(effect,0x14,[ptr(m,f+44),f+16],f,runtime);if(callEffect(effect,0xf0,[ptr(m,f+44)],f,runtime)===0){const logger=debuggerObject(runtime,f-4);getRendererShaderDebugCategory({...runtime,scratchBase:f-20});void m.readUInt8(logger+0x24);put(m,program+8,get(m,f+44));break;}
    const logger=debuggerObject(runtime,f-4);if(!(get(m,0x714b50)&1)){put(m,0x714b50,get(m,0x714b50)|1);const child=debuggerRuntime({...runtime,scratchBase:f-8}),loggerObject=getApplicationDebugger(child);put(m,0x714b4c,registerApplicationDebuggerName(loggerObject,0x5daea0,false,child));}void m.readUInt8(logger+0x24);result=callEffect(ptr(m,program),0xf4,[ptr(m,f+44),f+44],f,runtime);
  }
  callEffect(ptr(m,program),0xe8,[ptr(m,program+8)],f,runtime);
  for(let name=0x5dbf30,output=program+12;name<0x5dbf90;name+=4,output+=4){const handle=callEffect(ptr(m,program),0x24,[0,ptr(m,name)],f,runtime);put(m,output,handle);if(callEffect(ptr(m,program),0xf8,[handle,ptr(m,program+8)],f,runtime)===0)put(m,output,0);}
  m[program+4]=0;for(let i=0;i<8;i++)if(ptr(m,program+0x4c+i*4)){m[program+4]=1;break;}
  if(rows(m,program+0x70,program+0x6c))for(let index=0,offset=0;;index++,offset+=44){const root=ptr(m,program+0x6c),name=root+offset+4,data=ptr(m,name+20)>=16?ptr(m,name):name,handle=callEffect(ptr(m,program),0x24,[0,data],f,runtime);put(m,root+offset+32,handle);if(((index+1)>>>0)>=(rows(m,program+0x70,program+0x6c)>>>0))break;}
}
//525720. Produces actual owned input records before metadata resolves their
//effect handles, retaining the caller's effect/name/vector lifetimes.
export function constructRendererShaderProgram(program,effect,inputs,name,runtime){const m=runtime.memory,s=runtime.scratchBase,f=s-32;[effect,inputs,name].forEach((v,i)=>put(m,s+4+i*4,v));put(m,program,effect);put(m,program+8,0);for(const offset of[0x6c,0x70,0x74])put(m,program+offset,0);const capturedName=ptr(m,s+12)||0x56feb0;put(m,program+0x8c,7);put(m,program+0x88,0);m.writeUInt16LE(0,program+0x78);assignGameWideString(program+0x78,capturedName,length(m,capturedName),{...runtime,scratchBase:f-12});put(m,program+0x90,0);const liveInputs=ptr(m,s+8);put(m,program+0x94,0);put(m,program+0x98,0);
  if(ptr(m,liveInputs)!==ptr(m,liveInputs+4)){resizeRendererShaderInputs(program+0x6c,rows(m,liveInputs+4,liveInputs),{...runtime,scratchBase:f-8});assignRendererShaderInputs(ptr(m,liveInputs),ptr(m,liveInputs+4),ptr(m,program+0x6c),{...runtime,scratchBase:f-12});}
  initializeRendererShaderEffect(program,effect,{...runtime,scratchBase:f-8});return program;
}
