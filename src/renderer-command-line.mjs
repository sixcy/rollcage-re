import {assignRendererWideString,assignRendererWideStringSlice} from './renderer-startup-strings.mjs';
import constants from './renderer-command-line-constants.json' with {type: 'json'};
export function initializeRendererCommandLineConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const data=(m,p)=>ptr(m,p+20)>=8?ptr(m,p):p;
const length=(m,p)=>{let n=0;while(m.readUInt16LE(p+n*2))n++;return n;};
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer command line requires CRT ${name}.`);return r.services.libraryCall(name,args,r);};
const copy=(m,out,input,n)=>Buffer.from(m.subarray(input,input+n)).copy(m,out);
const initialize=(m,p,owner=true)=>{put(m,p+20,7);put(m,p+16,0);m.writeUInt16LE(0,p);if(owner)put(m,p+24,0);};
function cleanup(object,runtime,reset=false){const m=runtime.memory,owner=ptr(m,object+24);if(owner){library(runtime,'operatorDeleteArray',[owner]);put(m,object+24,0);}if(ptr(m,object+20)>=8)library(runtime,'operatorDelete',[ptr(m,object)]);if(reset)initialize(m,object,false);}

//4a0790. ASCII case folding with native restart semantics: a mismatching
//code unit is consumed, even when it could begin a new overlapping match.
export function findRendererCommandFlag(input,needle,runtime){
  const m=runtime.memory;if(!input||!needle||!m.readUInt16LE(input)||!m.readUInt16LE(needle))return 0;
  let cursor=input,word=needle,start=0;
  const upper=v=>v>=0x61&&v<=0x7a?v-0x20:v;
  do {if(upper(m.readUInt16LE(cursor))===upper(m.readUInt16LE(word))){if(!start)start=cursor;word+=2;if(!m.readUInt16LE(word))return start;}else{word=needle;start=0;}cursor+=2;}while(m.readUInt16LE(cursor));return 0;
}
//401fb0.
export function destroyRendererWideString(object,runtime){cleanup(object,runtime,true);}
//4a1270. This constructor copies the actual platform command line.
export function constructRendererCommandLine(object,runtime){
  const m=runtime.memory;if(typeof runtime.services?.platformCall!=='function')throw Error('Renderer command line requires GetCommandLineW.');
  const input=runtime.services.platformCall('GetCommandLineW',[],runtime)>>>0,source=input||0x56feb0;initialize(m,object,false);
  assignRendererWideString(object,source,length(m,source),{...runtime,scratchBase:runtime.scratchBase-20});put(m,object+24,0);return object;
}
//4a3000. Its extra-owner word is deliberately not initialized.
export function constructRendererWideSlice(source,output,offset,count,runtime){
  initialize(runtime.memory,output,false);assignRendererWideStringSlice(output,source,offset,count,{...runtime,scratchBase:runtime.scratchBase-24});return output;
}
//4a3040. Heap ownership moves; inline storage copies length+1 code units.
export function moveRendererWideString(output,input,runtime){
  const m=runtime.memory;if(ptr(m,input+20)<8){const units=ptr(m,input+16)+1>>>0;if(units)copy(m,output,input,units*2);}else{if(output)put(m,output,ptr(m,input));put(m,input,0);}
  put(m,output+16,get(m,input+16));put(m,output+20,get(m,input+20));initialize(m,input,false);
}
//4a2cc0 and4a2d80 construct independent suffix/range objects through the
//actual temporary/move sequence, preserving heap ownership and empty output.
function constructRange(source,output,offset,count,suffix,runtime){
  const m=runtime.memory,f=runtime.scratchBase-(suffix?52:56),temporary=f+0x10;initialize(m,output);
  const old=ptr(m,source+16);offset>>>=0;
  if(offset<old){if(suffix)count=0xffffffff;else if((offset+(count>>>0)>>>0)>old)count=old-offset;
    const result=constructRendererWideSlice(source,temporary,offset,count,{...runtime,scratchBase:f-16});
    if(output!==result){if(ptr(m,output+20)>=8)library(runtime,'operatorDelete',[ptr(m,output)]);initialize(m,output,false);moveRendererWideString(output,result,{...runtime,scratchBase:f-8});}
    if(ptr(m,temporary+20)>=8)library(runtime,'operatorDelete',[ptr(m,temporary)]);
  }
  return output;
}
export function constructRendererWideSuffix(source,output,offset,runtime){return constructRange(source,output,offset,0xffffffff,true,runtime);}
export function constructRendererWideRange(source,output,offset,count,runtime){return constructRange(source,output,offset,count,false,runtime);}
//4a2e50 takes the last min(requested,length) units.
export function constructRendererWideTail(source,output,count,runtime){const m=runtime.memory,n=Math.min(ptr(m,source+16),count>>>0);return constructRendererWideRange(source,output,ptr(m,source+16)-n,n,{...runtime,scratchBase:runtime.scratchBase-20});}
//4a2e80. Only space and tab are stripped; two opaque stack arguments unused.
export function trimRendererWideLeadingSpace(object,runtime){
  const m=runtime.memory,f=runtime.scratchBase-52,old=get(m,object+16);let offset=0;
  while(offset<old){const word=m.readUInt16LE(data(m,object)+offset*2);if(word!==32&&word!==9)break;offset++;}
  if(offset){const temporary=f+12,result=constructRendererWideTail(object,temporary,old-offset,{...runtime,scratchBase:f-12});if(object!==result){assignRendererWideStringSlice(object,result,0,0xffffffff,{...runtime,scratchBase:f-16});put(m,object+24,0);}destroyRendererWideString(temporary,{...runtime,scratchBase:f-4});}
  return object;
}
//4a2a70 returns only AX;4a2f30 and4a2f70 consume that low word.
export function getRendererWideCodeUnit(object,index,runtime){return runtime.memory.readUInt16LE(data(runtime.memory,object)+Math.imul(index,2));}
export function findRendererWideCharacter(object,character,runtime){const m=runtime.memory,n=get(m,object+16),capacity=ptr(m,object+20);for(let i=0;i<n;i++){const p=capacity>=8?ptr(m,object):object;if(m.readUInt16LE(p+i*2)===(character&65535))return i;}return -1;}
export function findRendererCommandSeparator(object,runtime){const m=runtime.memory,n=get(m,object+16);for(let i=0;i<n;i++)for(let p=0x5d3774;p<0x5d377a;p+=2)if(getRendererWideCodeUnit(object,i,runtime)===m.readUInt16LE(p))return i;return -1;}

//4a12e0. Case-sensitive CRT key search, one native separator, leading-space
//trim, then quoted or space-delimited value extraction. All intermediate
//wide objects retain the original native locations and destruction order.
export function getRendererCommandValue(output,key,runtime){
  const m=runtime.memory,f=runtime.scratchBase-92,command=f+0x18,temporary=f+0x34;initialize(m,output);
  constructRendererCommandLine(command,{...runtime,scratchBase:f-4});
  const start=data(m,command),match=library(runtime,'wcsstr',[start,key])>>>0,offset=(match-start|0)>>1;
  if(match&&offset>=0){
    const keyLength=length(m,key),result=constructRendererWideSuffix(command,temporary,keyLength+offset,{...runtime,scratchBase:f-12});
    if(command!==result){assignRendererWideStringSlice(command,result,0,0xffffffff,{...runtime,scratchBase:f-16});put(m,command+24,0);}cleanup(temporary,runtime);
    if(findRendererCommandSeparator(command,runtime)===0){
      const trimmed=constructRendererWideSuffix(command,temporary,1,{...runtime,scratchBase:f-12});trimRendererWideLeadingSpace(trimmed,{...runtime,scratchBase:f-12});
      if(output!==trimmed){assignRendererWideStringSlice(output,trimmed,0,0xffffffff,{...runtime,scratchBase:f-16});put(m,output+24,0);}destroyRendererWideString(temporary,{...runtime,scratchBase:f-4});
      let count,begin;
      if(m.readUInt16LE(data(m,output))===34){
        const quoted=constructRendererWideSuffix(output,temporary,1,{...runtime,scratchBase:f-12});trimRendererWideLeadingSpace(quoted,{...runtime,scratchBase:f-20});
        count=findRendererWideCharacter(quoted,34,{...runtime,scratchBase:f-8});destroyRendererWideString(temporary,{...runtime,scratchBase:f-4});begin=1;
      }else{count=findRendererWideCharacter(output,32,{...runtime,scratchBase:f-8});begin=0;}
      if(count>=0){const range=constructRendererWideRange(output,temporary,begin,count,{...runtime,scratchBase:f-16});if(output!==range){assignRendererWideStringSlice(output,range,0,0xffffffff,{...runtime,scratchBase:f-16});put(m,output+24,0);}destroyRendererWideString(temporary,{...runtime,scratchBase:f-4});}
    }
  }
  cleanup(command,runtime);return output;
}
//4a1530. Integer syntax/overflow belongs to the original CRT _wtoi service.
export function getRendererCommandInteger(key,runtime){
  const m=runtime.memory,f=runtime.scratchBase-36,object=f+8;getRendererCommandValue(object,key,{...runtime,scratchBase:f-4});
  const result=ptr(m,object+16)?library(runtime,'_wtoi',[data(m,object)])|0:0;cleanup(object,runtime);return result;
}
