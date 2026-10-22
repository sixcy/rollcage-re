const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const library=(r,name,args)=>{if(typeof r.services?.libraryCall!=='function')throw Error(`Renderer material values require CRT ${name}.`);return r.services.libraryCall(name,args,r);};
//402590. Type selects an element count, not a byte depth. Unknown types
//request zero elements; capacity comparison is signed and does not shrink.
export function setRendererMaterialValue(property,input,type,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=s-12;put(m,s+4,input);put(m,s+8,type);const elements=[1,2,4,16,1][type>>>0]??0;
  if(get(m,property+0x24)<elements){const old=ptr(m,property+0x20);if(old){library({...runtime,scratchBase:f-8},'operatorDeleteArray',[old]);put(m,property+0x20,0);}put(m,property+0x24,elements);put(m,property+0x20,library({...runtime,scratchBase:f-8},'operatorNewArray',[elements*4])>>>0);}
  put(m,property+0x1c,type);library({...runtime,scratchBase:f-16},'memcpy',[ptr(m,property+0x20),ptr(m,s+4),elements*4]);
}
function destroyValue(property,frame,runtime){const m=runtime.memory;for(const offset of[0x20,0x18]){const p=ptr(m,property+offset);if(p){library({...runtime,scratchBase:frame-8},'operatorDeleteArray',[p]);put(m,property+offset,0);}}if(ptr(m,property+20)>=16)library({...runtime,scratchBase:frame-8},'operatorDelete',[ptr(m,property)]);put(m,property+20,15);put(m,property+16,0);m[property]=0;}
//402460 and the actual inlined range form4060d0. Callbacks can replace later
//owned pointers/capacity, so each field is loaded at its original point.
export function destroyRendererMaterialValue(property,runtime){destroyValue(property,runtime.scratchBase-4,runtime);}
export function destroyRendererMaterialValues(first,last,runtime){for(let p=first;p!==last;p+=40)destroyValue(p,runtime.scratchBase-16,runtime);}
//50dd70. The four-argument ABI retains an unread fourth word. Signed byte
//counts below zero select rows before the ordinary material-slot array.
export function appendRendererMaterialAttribute(material,type,index,mode,unused,runtime){
  const m=runtime.memory,s=runtime.scratchBase;[type,index,mode,unused].forEach((v,i)=>put(m,s+4+i*4,v));const count=m.readInt8(material+4);if(count>=8)return 0;m[material+4]=(count+1)&255;const row=material+count*8; m.writeUInt16LE(ptr(m,s+8)&65535,row+0x28);m[row+0x2a]=m[s+12];put(m,row+0x24,get(m,s+4));m[row+0x2b]=0;return 1;
}
//50dce0. Nonnegative counts are not clamped to eight; each shift uses the
//original x86 low-five-bit count and only typeFFFFFFFF is skipped.
export function rendererMaterialAttributeMask(material,{memory:m}){
  const count=m.readInt8(material+4);let mask=0;for(let i=0;i<count;i++){const type=get(m,material+0x24+i*8);if(type!==-1)mask|=1<<(type&31);}return mask|0;
}
