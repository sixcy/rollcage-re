import {getApplicationDebugger,registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {formatRendererString,cacheRendererWideString,destroyRendererString} from './renderer-startup-strings.mjs';
import constants from './game-assertion-constants.json' with {type:'json'};
export function initializeGameAssertionConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Game assertion requires CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const platform=(r,name,args)=>{if(typeof r.services?.platformCall!=='function')throw Error(`Game assertion requires platform ${name}.`);return r.services.platformCall(name,args,r);};
const debuggerRuntime=r=>({...r,handlers:{...r.handlers,allocate:size=>library(r,'operatorNew',[size]),free:p=>library(r,'operatorDelete',[p]),registerExit:p=>library(r,'registerExit',[p])}});
//4a0e10. Its printf-looking arguments are unused; this is category lookup.
export function getGameAssertionCategory(runtime){
  const m=runtime.memory,f=((runtime.scratchBase-4)&~7)-16,r=debuggerRuntime({...runtime,scratchBase:f-8});
  if(!(get(m,0x715ae8)&1)){put(m,0x715ae8,get(m,0x715ae8)|1);const logger=getApplicationDebugger(r);put(m,0x715aec,registerApplicationDebuggerName(logger,0x5d3740,false,r));}
  return get(m,0x715aec);
}
//4a2860/4a29b0. Allocation is followed by live-root forward pair copying.
function reserveIgnored(capacity,runtime){
  const m=runtime.memory;let out=0;capacity>>>=0;
  if(capacity){if(capacity>0x1fffffff)throw RangeError('Native ignored-assertion vector bad_alloc.');out=library(runtime,'operatorNew',[capacity*8])>>>0;if(!out)throw Error('Native ignored-assertion vector bad_alloc.');}
  let input=ptr(m,0x715afc),end=ptr(m,0x715b00),destination=out;
  while(input!==end){if(destination){put(m,destination,get(m,input));put(m,destination+4,get(m,input+4));}input+=8;destination+=8;}
  const old=ptr(m,0x715afc),size=(get(m,0x715b00)-get(m,0x715afc)|0)>>3;if(old)library(runtime,'operatorDelete',[old]);
  put(m,0x715b04,out+capacity*8);put(m,0x715afc,out);put(m,0x715b00,out+size*8);
}
//4a2490/4a2620/4a2820. Suppression identity is the raw file pointer+line.
export function appendIgnoredGameAssertion(input,runtime){
  const m=runtime.memory,start=ptr(m,0x715afc),end=ptr(m,0x715b00),aliased=input<end&&start<=input,index=aliased?(input-start)>>3:0;
  if(end===ptr(m,0x715b04)){
    const size=(get(m,0x715b00)-get(m,0x715afc)|0)>>3,capacity=(get(m,0x715b04)-get(m,0x715afc)|0)>>3,half=capacity>>>1;
    if((0x1fffffff-size>>>0)<1)throw RangeError('Native ignored-assertion vector length error.');
    reserveIgnored(Math.max(size+1,(0x1fffffff-half>>>0)<(capacity>>>0)?0:capacity+half),{...runtime,scratchBase:runtime.scratchBase-12});
  }
  const source=aliased?ptr(m,0x715afc)+index*8:input,output=ptr(m,0x715b00);
  if(output){put(m,output,get(m,source));put(m,output+4,get(m,source+4));}put(m,0x715b00,get(m,0x715b00)+8);
}
const initializeString=(m,p)=>{put(m,p+20,15);put(m,p+16,0);m[p]=0;put(m,p+24,0);};
//4a1fe0. Serialized raw-memory reference to the native compare/exchange gate;
//this API does not simulate concurrent original-process threads.
export function reportGameAssertion(file,line,format,args,runtime){
  const m=runtime.memory,s=runtime.scratchBase,bp=s-4,f=(bp&~7)-0x868;
  [file,line,format,...args].forEach((v,i)=>put(m,s+4+i*4,v));
  if(!(get(m,0x715af0)&1)){put(m,0x715af0,get(m,0x715af0)|1);put(m,0x715af8,0);put(m,0x715af4,0);}
  if(get(m,0x715af4)!==0)return 0;put(m,0x715af4,1);put(m,0x715af8,platform(runtime,'GetCurrentThreadId',[]));
  if(!(get(m,0x715af0)&2)){put(m,0x715af0,get(m,0x715af0)|2);put(m,0x715afc,0);put(m,0x715b00,0);put(m,0x715b04,0);library(runtime,'registerExit',[0x56d980]);}
  const capturedFile=get(m,s+4),capturedLine=get(m,s+8),end=ptr(m,0x715b00);let row=ptr(m,0x715afc),ignored=false;
  while(row!==end){if(get(m,row)===capturedFile&&get(m,row+4)===capturedLine){ignored=true;break;}row+=8;}
  const unlock=()=>{put(m,0x715af8,0);put(m,0x715af4,0);};
  if(ignored){unlock();return 0;}
  library(runtime,'_vsnprintf',[f+0x58,0x800,ptr(m,s+12),s+16]);
  const debug=debuggerRuntime({...runtime,scratchBase:f-4});const firstLogger=getApplicationDebugger(debug);getGameAssertionCategory({...debug,scratchBase:f-20});void m.readUInt8(firstLogger+0x24); //Actual4a18d0 getter; extra printf-like arguments unused.
  const secondLogger=getApplicationDebugger(debug);getGameAssertionCategory({...debug,scratchBase:f-20});void m.readUInt8(secondLogger+0x24);
  const attached=platform(runtime,'IsDebuggerPresent',[])!==0,object=f+(attached?0x20:0x3c);initializeString(m,object);
  formatRendererString(object,attached?0x5d37e0:0x5d3860,[f+0x58,capturedFile,capturedLine],{...runtime,scratchBase:f-24});
  const wide=cacheRendererWideString(object,{...runtime,scratchBase:f-12});
  const reply=platform(runtime,'MessageBoxW',[0,wide,0x5d383c,attached?0x40032:0x40031]);
  if(attached&&reply===4){unlock();destroyRendererString(object,{...runtime,scratchBase:f-4});return 1;}
  if(attached?reply===5:reply===2){const pair=f+(attached?0x10:0x18);put(m,pair,capturedFile);put(m,pair+4,capturedLine);appendIgnoredGameAssertion(pair,{...runtime,scratchBase:f-8});}
  destroyRendererString(object,{...runtime,scratchBase:f-4});unlock();return 0;
}
