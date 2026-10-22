import {assignGameWideString,assignGameWideStringSlice} from './game-wide-string-buffer.mjs';
import {appendRendererMaterialAttribute} from './renderer-material-values.mjs';
import {registerRendererManagerShaderName} from './renderer-shader-names.mjs';
import constants from './renderer-material-construction-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),length=(m,p)=>{let n=0;while(m.readUInt16LE(p+n*2))n++;return n;};
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer material construction requires CRT ${name}.`);return r.services.libraryCall(name,args,r);};
export function initializeRendererMaterialConstructionConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
//50da10, all original kinds/names. This registers a shader-name ID; the later
//5252d0/525f70 shader program compilation stage is a separate algorithm.
export function constructRendererMaterial(material,enabled,kind,name,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-56;[enabled,kind,name].forEach((v,i)=>put(m,s+4+i*4,v));const originalName=ptr(m,s+12),string=material+8;
  put(m,material,0);m.writeUInt16LE(0,material+4);m[material+6]=0;m[material+7]=m[s+4];put(m,string+20,7);put(m,string+16,0);m.writeUInt16LE(0,string);
  const input=originalName||0x56feb0;assignGameWideString(string,input,length(m,input),{...runtime,scratchBase:f-12});put(m,string+24,0);
  for(let i=0;i<8;i++){const row=material+0x24+i*8;put(m,row,-1);m.writeUInt16LE(m.readUInt16LE(0x6e1e50),row+4);m.writeUInt16LE(0x30f,row+6);}for(const offset of[0x64,0x68,0x6c])put(m,material+offset,0);
  let shaderName=originalName;const liveKind=ptr(m,s+8);
  if(liveKind<=3){
    if(liveKind===1||liveKind===3){shaderName=originalName||0x5dae24;const count=m.readInt8(material+4),index=get(m,0x6e1e50);if(count<8){m[material+4]=(count+1)&255;const row=material+count*8;put(m,row+0x24,0);m.writeUInt16LE(index&65535,row+0x28);m.writeUInt16LE(0,row+0x2a);}}
    else{shaderName=originalName||(liveKind===0?0x5dae04:0x5dae64);appendRendererMaterialAttribute(material,0,get(m,0x6e1e50),0,0,{...runtime,scratchBase:f-20});}
  }
  if(shaderName){const temporary=f+16;put(m,temporary+20,7);put(m,temporary+16,0);m.writeUInt16LE(0,temporary);assignGameWideString(temporary,shaderName,length(m,shaderName),{...runtime,scratchBase:f-12});put(m,temporary+24,0);
    if(string!==temporary){assignGameWideStringSlice(string,temporary,0,0xffffffff,{...runtime,scratchBase:f-16});put(m,string+24,0);}
    const owner=ptr(m,temporary+24);if(owner){library({...runtime,scratchBase:f-8},'operatorDeleteArray',[owner]);put(m,temporary+24,0);}if(ptr(m,temporary+20)>=8)library({...runtime,scratchBase:f-8},'operatorDelete',[ptr(m,temporary)]);
    const manager=ptr(m,0x714ae8);put(m,temporary+20,7);put(m,temporary+16,0);m.writeUInt16LE(0,temporary);const target=ptr(m,ptr(m,manager)+0xa8);if(target!==0x50f3b0)throw Error(`Unclosed shader-name manager target${target.toString(16)}.`);const id=registerRendererManagerShaderName(manager,shaderName,0,0,{...runtime,scratchBase:f-16});m.writeUInt16LE(id&65535,material);m[material+5]=1;
  }
  return material;
}
