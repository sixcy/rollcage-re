const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
function save(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
// Inlined original comparator: signed priority, then COMISS/SETA float gain.
export function audioSourcePrecedes(first,second,{memory:m}){const a=m.readInt32LE(first+0x954),b=m.readInt32LE(second+0x954);return a===b?m.readFloatLE(first+0x958)>m.readFloatLE(second+0x958):a>b;}
function move(r,dest,source,size,top,returned){const m=r.memory;put(m,top-4,size);put(m,top-8,source);put(m,top-12,dest);put(m,top-16,returned);if(typeof r.services?.libraryCall!=='function')throw Error('Audio sorting requires CRT memmove.');return r.services.libraryCall('memmove',[dest,source,size],{...r,scratchBase:top-16});}
//4a8de0 insertion-sort leaf. Every shift is performed in the native order.
export function insertionSortAudioSources(begin,end,runtime){
 const{memory:m,scratchBase:S}=runtime;let base=begin;put(m,S-4,end);put(m,S-12,begin);if(begin===end)return;
 save(runtime,S,[['EBX',-16]]);let iterator=begin+4;if(iterator===end)return;
 save(runtime,S,[['EBP',-20],['ESI',-24],['EDI',-28]]);const F=S-28;let bytes=4;put(m,F+20,bytes);
 do{let previous=ptr(m,base),hole=iterator;const value=ptr(m,iterator);
  if(previous&& !audioSourcePrecedes(value,previous,runtime)){
   let input=iterator;
   for(;;){previous=ptr(m,input-4);input-=4;if(previous&&!audioSourcePrecedes(value,previous,runtime))break;put(m,hole,previous);hole=input;}
   bytes=ptr(m,F+20);base=ptr(m,F+16);put(m,hole,value);
  }else{const size=(bytes>>2)*4;move(runtime,iterator-size+4,ptr(m,F+16),size,F,0x4a8eb0);base=ptr(m,F+16);put(m,base,value);}
  iterator+=4;bytes+=4;put(m,F+20,bytes);
 }while(iterator!==ptr(m,F+24));
}
//4a8760: complete <=32-element branch. The larger introsort/heap branches
//remain explicit reached errors until their original partitions are ported.
export function sortAudioSourceCandidates(begin,end,runtime){const{memory:m,scratchBase:S}=runtime,F=S-28,count=(end-begin)>>2;
 save(runtime,S,[['EBX',-16],['EBP',-20],['ESI',-24],['EDI',-28]]);
 if(count>32)throw Error('Unported audio introsort partition/heap branch for more than32sources.');
 if(count>1){put(m,F-4,begin);put(m,F-8,ptr(m,S+8));put(m,F-12,0x4a8806);insertionSortAudioSources(begin,end,{...runtime,scratchBase:F-12,entryRegisters:{...runtime.entryRegisters,EBX:begin,ESI:count,EDI:end}});}
}
