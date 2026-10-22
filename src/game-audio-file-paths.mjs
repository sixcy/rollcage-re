import {findRendererCommandFlag} from './renderer-command-line.mjs';
import {getGameAsyncFileManager,queueGameAsyncFilePath} from './game-async-file-manager.mjs';
import {getAudioDatabasePath} from './audio-database-paths.mjs';
import constants from './game-audio-file-path-constants.json' with {type:'json'};
//Literal/image bytes only: preserve the live5ed314 callback and cache guards.
export function initializeGameAudioFilePathConstants(memory){for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
const get=(m,p)=>m.readInt32LE(p), ptr=(m,p)=>m.readUInt32LE(p), put=(m,p,v)=>m.writeInt32LE(v|0,p), word=(m,p)=>m.readUInt16LE(p);
const entry=r=>{if(!Number.isInteger(r.scratchBase))throw Error('Audio file paths require native entry ESP.');return r.scratchBase;};
const save=(r,pairs)=>{for(const[reg,offset]of pairs)if(r.entryRegisters?.[reg]!==undefined)put(r.memory,r.scratchBase+offset,r.entryRegisters[reg]);};
function call(r,kind,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-4*args.length-4;put(m,S,returned);const f=r.services?.[kind];if(typeof f!=='function')throw Error(`Audio file paths require ${kind} ${name}.`);return f(name,args.map((_,i)=>ptr(m,S+4+4*i)),{...r,scratchBase:S});}
const crt=(r,name,args,top,returned)=>call(r,'libraryCall',name,args,top,returned);
const os=(r,name,args,top,returned)=>call(r,'platformCall',name,args,top,returned);
function forward(m,out,input,count){for(let i=0;i<count;i+=4)put(m,out+i,get(m,input+i));}
function length(m,p){let n=0;while(word(m,p+n*2))n++;return n;}

//4a0790 is the original one-pass ASCII-insensitive substring matcher. A
//mismatch resets the needle without reconsidering the current input character.
export function findGameAudioPathText(input,needle,runtime){
  const m=runtime.memory,S=entry(runtime);save(runtime,[['EBP',-4],['ESI',-8]]);
  if(!input||!needle||!word(m,input)||!word(m,needle))return 0;
  save(runtime,[['EDI',-12],['EBX',-16]]);return findRendererCommandFlag(input,needle,runtime);
}

//4a4820. The native adapter consumes one otherwise unused caller DWORD (RET4).
export function findGameAudioDirectorySeparator(input,runtime){const m=runtime.memory;entry(runtime);save(runtime,[['ESI',-4]]);for(let n=length(m,input)-1;n>=0;n--)for(let p=0x5d3a0c;p<0x5d3a10;p+=2)if(word(m,input+n*2)===word(m,p))return n;return -1;}

//4a4870. Keep the original in-place writes, permissive '..' matching, UNC
//prefix preservation and URL exception; this is not host path.normalize().
export function normalizeGameAudioPath(input,runtime){
  const m=runtime.memory,S=entry(runtime),frame=S-16;save(runtime,[['EBX',-4],['EBP',-8],['ESI',-12],['EDI',-16]]);
  put(m,frame-4,0x4a4886);let url=findGameAudioPathText(input,0x5d3a2c,{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,EBX:input,EBP:0,ESI:input,EDI:input}});
  if(!url){put(m,frame-4,0x4a4896);url=findGameAudioPathText(input,0x5d3a38,{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,EBX:input,EBP:0,ESI:input,EDI:input}});}
  let out=input,runs=0;for(let p=input;word(m,p);p+=2){let c=word(m,p);if(!url&&c===47){c=92;m.writeUInt16LE(c,p);}if(c===92){if(runs<1||p<=input+2){m.writeUInt16LE(c,out);out+=2;}runs++;}else{m.writeUInt16LE(c,out);out+=2;runs=0;}}m.writeUInt16LE(0,out);
  let p=crt(runtime,'wcsstr',[input,0x5d3a44],frame,0x4a4905)>>>0;
  while(p){const suffix=p+6;let q=p-2;if(q<input)break;while(q>=input&&word(m,q)!==92)q-=2;if(q>=input)crt(runtime,'wcscpy_s',[q,512-((q-input)>>1),suffix],frame,0x4a4941);if(q<=input)break;p=crt(runtime,'wcsstr',[input,0x5d3a44],frame,0x4a4950)>>>0;}
  p=crt(runtime,'wcsstr',[input,0x5d3a4c],frame,0x4a4961)>>>0;
  while(p){const suffix=p+4;if(word(m,suffix)!==46)crt(runtime,'wcscpy_s',[p,512-((p-input)>>1),suffix],frame,0x4a498c);p=crt(runtime,'wcsstr',[suffix,0x5d3a4c],frame,0x4a4997)>>>0;}
  for(let q=input+length(m,input)*2-2;q>=input&&word(m,q)===92;q-=2)m.writeUInt16LE(0,q);
}

export function getGameAudioDirectory(input,output,runtime){
  const m=runtime.memory,S=entry(runtime),frame=S-8;save(runtime,[['ESI',-4],['EDI',-8]]);m.writeUInt16LE(0,output+1022);crt(runtime,'wcsncpy_s',[output,512,input,511],frame,0x4a4413);
  //ADD ESP,12 leaves the old count word as4a4820's unused RET4 argument.
  put(m,frame-8,0x4a441d);const index=findGameAudioDirectorySeparator(input,{...runtime,scratchBase:frame-8,entryRegisters:{...runtime.entryRegisters,ESI:input,EDI:output}});if(index>=0&&index<length(m,output)&&index<512)m.writeUInt16LE(0,output+2*index);return output;
}

//4a4460 starts with the installed game callback5ed314. The shipped default
//4a0780 returns the original empty UTF16 string; alternate game callbacks must
//be recovered/bound explicitly rather than treated as host environment lookup.
function lookup(runtime,key,top,returned){
  const m=runtime.memory,target=ptr(m,0x5ed314);put(m,top-4,key);put(m,top-8,returned);
  if(target===0x4a0780)return 0x56feb0;
  if(target===0x4030c0)return lookupGameAudioPath(key,{...runtime,scratchBase:top-8});
  const callback=runtime.pathLookup;if(typeof callback!=='function')throw Error(`Unported game audio path callback0x${target.toString(16)}.`);return callback(target,key,{...runtime,scratchBase:top-8})>>>0;
}

//4a0810. The conversion result is a separately allocated wide array. Retention
//passes that exact allocation to the real singleton/FIFO; no background I/O.
export function convertGameAudioAnsiPath(input,retain,runtime){
  const m=runtime.memory,S=entry(runtime),frame=S-16;put(m,S-4,input);save(runtime,[['EBX',-8],['ESI',-12],['EDI',-16]]);m[S-1]=retain&255;if(!input)return 0;
  let n=0;while(m[input+n])n++;n++;const size=n*2<=0xffffffff?n*2:0xffffffff,result=crt(runtime,'operatorNewArray',[size],frame,0x4a0848)>>>0;m.writeUInt16LE(0,result);os(runtime,'MultiByteToWideChar',[0,0,input,n,result,n],frame,0x4a085e);
  if(m[frame+15]){put(m,frame-4,result);put(m,frame-8,0x4a086b);const child={...runtime,scratchBase:frame-8,entryRegisters:{...runtime.entryRegisters,EBX:input,ESI:n,EDI:result}},manager=getGameAsyncFileManager(child);put(m,frame-8,0x4a0872);queueGameAsyncFilePath(manager,result,child);}return result;
}
//405e00 preserves the unused bytes of the caller's fixed512-unit record.
export function assignGameAudioWidePath(output,input,runtime){const m=runtime.memory,S=entry(runtime),frame=S-4;save(runtime,[['ESI',-4]]);if(input){m.writeUInt16LE(0,output+1022);crt(runtime,'wcsncpy_s',[output,512,input,511],frame,0x405e26);}return output;}

//4030c0 is installed by404d70 before the game startup graph. Only shell/CRT
//services are external: the five prefix decisions, lazy caches, fallback and
//owned conversion allocations execute the original game algorithms here.
export function lookupGameAudioPath(key,runtime){
  const m=runtime.memory,S=entry(runtime),aligned=(S-4)&~7,base=aligned-0x60c,frame=base-12;save(runtime,[['EBP',-4]]);put(m,base+0x608,ptr(m,0x5e8890)^base);for(const[reg,offset]of [['EBX',-4],['ESI',-8],['EDI',-12]])if(runtime.entryRegisters?.[reg]!==undefined)put(m,base+offset,runtime.entryRegisters[reg]);
  let guard=ptr(m,0x7158f8);for(const[bit,address,returned]of [[1,0x714c60,0x403102],[2,0x7154f8,0x403124],[4,0x715068,0x403146]])if(!(guard&bit)){guard|=bit;put(m,0x7158f8,guard);crt(runtime,'memset',[address,0,1024],frame,returned);}
  const equal=p=>{let a=key,b=p;while(word(m,a)===word(m,b)){if(!word(m,a))return true;a+=2;b+=2;}return false;};
  let comparedSI=(runtime.entryRegisters?.ESI??0)&0xffff0000;for(const literal of [0x56ff20,0x56ff54,0x56ff88,0x56ffe4]){let a=key,b=literal;while(true){const c=word(m,a);comparedSI=(comparedSI&0xffff0000)|c;if(c!==word(m,b)||!c)break;a+=2;b+=2;}if(equal(literal))break;}
  let result=0x56feb0,returned=0x403421;
  if(equal(0x56ff20)){result=0x56ff3c;returned=0x403198;}
  else if(equal(0x56ff54)){result=0x56ff74;returned=0x4031e8;}
  else if(equal(0x56ff88)||equal(0x56ffe4)){
    const app=equal(0x56ffe4);
    if(app&&!word(m,0x7154f8)){put(m,frame-4,0x56ff88);put(m,frame-8,0x403332);lookupGameAudioPath(0x56ff88,{...runtime,scratchBase:frame-8,entryRegisters:{...runtime.entryRegisters,EBP:S-4,EBX:guard,ESI:comparedSI}});}
    else if(!app&&!word(m,0x714c60)){
      os(runtime,'SHGetSpecialFolderLocation',[0,5,frame+12],frame,0x403241);os(runtime,'SHGetPathFromIDListA',[ptr(m,frame+12),frame+0x410],frame,0x403253);
      const childRegisters={...runtime.entryRegisters,EBP:S-4,EBX:guard,ESI:comparedSI};put(m,frame-4,0x403261);const wide=convertGameAudioAnsiPath(frame+0x410,1,{...runtime,scratchBase:frame-4,entryRegisters:childRegisters});put(m,frame-4,wide);put(m,frame-8,0x40326b);assignGameAudioWidePath(frame+16,wide,{...runtime,scratchBase:frame-8,entryRegisters:childRegisters});const empty=!word(m,frame+16);forward(m,0x714c60,frame+16,1024);
      if(empty){put(m,frame-4,0x56ffa8);put(m,frame-8,0x403291);assignGameAudioWidePath(frame+16,0x56ffa8,{...runtime,scratchBase:frame-8,entryRegisters:{...childRegisters,ESI:frame+0x410}});forward(m,0x714c60,frame+16,1024);}forward(m,0x7154f8,0x714c60,1024);crt(runtime,'wcscat_s',[0x7154f8,512,0x56ffc4],frame,0x4032c7);
    }result=app?0x7154f8:0x714c60;returned=app?0x40334b:0x4032e0;
  }
  else if(equal(0x57000c)){
    if(!word(m,0x715068)){os(runtime,'SHGetSpecialFolderLocation',[0,26,frame+12],frame,0x40339f);os(runtime,'SHGetPathFromIDListA',[ptr(m,frame+12),frame+0x410],frame,0x4033b1);const childRegisters={...runtime.entryRegisters,EBP:S-4,EBX:guard,ESI:comparedSI};put(m,frame-4,0x4033bf);const wide=convertGameAudioAnsiPath(frame+0x410,1,{...runtime,scratchBase:frame-4,entryRegisters:childRegisters});put(m,frame-4,wide);put(m,frame-8,0x4033c9);assignGameAudioWidePath(frame+16,wide,{...runtime,scratchBase:frame-8,entryRegisters:childRegisters});forward(m,0x715068,frame+16,1024);crt(runtime,'wcscat_s',[0x715068,512,0x570030],frame,0x4033ee);}result=0x715068;returned=0x403407;
  }
  //Original compiler cookie verifier runs after restoring three callee registers.
  put(m,base-4,returned);if(typeof runtime.services?.securityCookie==='function')runtime.services.securityCookie(ptr(m,base+0x608)^base,{...runtime,scratchBase:base-4});return result;
}
export function resolveGameAudioPath(input,output,runtime){
  const m=runtime.memory,S=entry(runtime),aligned=(S-4)&~7,frame=aligned-0x2428;save(runtime,[['EBP',-4]]);put(m,aligned-4,0x4a4470);for(const[reg,offset]of [['EBX',0],['ESI',-4],['EDI',-8]])if(runtime.entryRegisters?.[reg]!==undefined)put(m,aligned-0x2420+offset,runtime.entryRegisters[reg]);
  const a=frame+0x28,b=frame+0x428,temp=frame+0x828,suffix=frame+0xc28;
  m.writeUInt16LE(0,a+1022);crt(runtime,'wcsncpy_s',[a,512,0x5d3a14,511],frame,0x4a449b);crt(runtime,'wcscat_s',[a,512,input],frame-16,0x4a44ac);
  put(m,frame-4,0x4a44b8);normalizeGameAudioPath(a,{...runtime,scratchBase:frame-4,entryRegisters:{EBX:input,ESI:ptr(m,0x56e47c),EDI:runtime.entryRegisters?.EDI,EBP:S-4}});
  let result=lookup({...runtime,entryRegisters:{...runtime.entryRegisters,EBX:input,ESI:ptr(m,0x56e47c),EBP:S-4}},a,frame,0x4a44c3);if(result){m.writeUInt16LE(0,temp+1022);crt(runtime,'wcsncpy_s',[temp,512,result,511],frame,0x4a44e9);}const redirected=word(m,temp)!==0;forward(m,a,temp,1024);
  let final=a,finalECX=0;
  if(!redirected){
    if(input){m.writeUInt16LE(0,b+1022);crt(runtime,'wcsncpy_s',[b,512,input,511],frame,0x4a4547);}
    if(word(m,input)===126){m.writeUInt16LE(0,temp+1022);crt(runtime,'wcsncpy_s',[temp,512,0x56ff20,511],frame,0x4a4573);forward(m,b,temp,1024);crt(runtime,'wcscat_s',[b,512,input+2],frame-16,0x4a459f);}
    put(m,frame-4,0x4a45ae);normalizeGameAudioPath(b,{...runtime,scratchBase:frame-4,entryRegisters:{EBX:input,ESI:ptr(m,0x56e47c),EDI:a+1024,EBP:S-4}});
    m.copy(m,frame+0x14,0x5dcba0,0x5dcbb0);put(m,frame+0x24,0);
    const literals=[0x56ff20,0x56ff54,0x57000c,0x56ff88,0x56ffe4],returns=[0x4a45ed,0x4a4610,0x4a4633,0x4a4656,0x4a467c];
    for(let i=0;i<5;i++){const p=frame+0x1028+i*1024;m.writeUInt16LE(0,p+1022);crt(runtime,'wcsncpy_s',[p,512,literals[i],511],frame-(i<4?i*16:0),returns[i]);}
    put(m,frame+0xc,frame+0x1028);put(m,frame+0x10,0);
    for(let i=0;i<5;i++){
      const prefix=ptr(m,frame+0xc),n=length(m,prefix);finalECX=prefix+2;const comparison=crt(runtime,'wcsncmp',[b,prefix,n],frame,0x4a46b4);
      if(!comparison){crt(runtime,'memset',[a,0,1024],frame,0x4a46cf);if(ptr(m,0x5ed314)){result=(lookup({...runtime,entryRegisters:{EBX:n,ESI:prefix,EDI:i,EBP:S-4}},prefix,frame,0x4a46de)+get(m,frame+0x14+i*4)*2)>>>0;if(result){m.writeUInt16LE(0,temp+1022);crt(runtime,'wcsncpy_s',[temp,512,result,511],frame,0x4a470f);}forward(m,a,temp,1024);}
        if(word(m,b+n*2)!==92)crt(runtime,'wcscat_s',[a,512,0x5d39fc],frame,0x4a474c);crt(runtime,'memset',[suffix,0,1024],frame,0x4a4763);if((n>>>0)<(length(m,b)>>>0))crt(runtime,'wcscpy_s',[suffix,512,b+n*2],frame,0x4a4797);crt(runtime,'wcscat_s',[a,512,suffix],frame,0x4a47ae);forward(m,b,a,1024);finalECX=0;
      }
      put(m,frame+0x10,i+1);put(m,frame+0xc,prefix+1024);
    }final=b;
  }
  output=ptr(m,S+4)||output;m.writeUInt16LE(0,output+1022);crt(runtime,'wcsncpy_s',[output,512,final,511],frame,0x4a4808);if(runtime.outputRegisters)runtime.outputRegisters.ECX=finalECX;return output;
}

export function gameAudioPathExists(input,runtime){
  const m=runtime.memory,S=entry(runtime),frame=((S-4)&~7)-0xa50;save(runtime,[['EBP',-4]]);if(!word(m,input))return 0;
  m.writeUInt16LE(0,frame+0x64e);crt(runtime,'wcsncpy_s',[frame+0x250,512,input,511],frame,0x4a3afb);
  put(m,frame-8,frame+0x650);put(m,frame-12,0x4a3b12);resolveGameAudioPath(frame+0x250,frame+0x650,{...runtime,scratchBase:frame-12,entryRegisters:{...runtime.entryRegisters,EBP:S-4}});
  const handle=os(runtime,'FindFirstFileW',[frame+0x650,frame],frame,0x4a3b24);if((handle|0)===-1)return 0;os(runtime,'FindClose',[handle],frame,0x4a3b30);return ~(ptr(m,frame)>>>4)&1;
}

export function closeGameAudioFile(record,runtime){const m=runtime.memory,S=entry(runtime),frame=S-4;save(runtime,[['ESI',-4]]);if(ptr(m,record+8)&&ptr(m,record+12)!==ptr(m,record+8)){const done=os(runtime,'GetOverlappedResult',[ptr(m,record),record+16,record+12,0],frame,0x4a2b11);if(!done&&os(runtime,'GetLastError',[],frame,0x4a2b1b)===0x3e4)os(runtime,'CancelIo',[ptr(m,record)],frame,0x4a2b2a);}os(runtime,'CloseHandle',[ptr(m,record)],frame,0x4a2b32);put(m,record,-1);}

export function openGameAudioFile(path,mode,record,overlapped,runtime){
  const m=runtime.memory,S=entry(runtime),aligned=(S-4)&~7,frame=aligned-0x820;save(runtime,[['EBP',-4]]);for(const[reg,offset]of [['EBX',-0x818],['ESI',-0x81c],['EDI',-0x820]])if(runtime.entryRegisters?.[reg]!==undefined)put(m,aligned+offset,runtime.entryRegisters[reg]);
  put(m,S+4,record);put(m,S+8,overlapped);put(m,frame+24,mode);let flags=0x80|((overlapped&255)?0x40000000:0),share=0,access=0,disposition=0;
  if(mode===1){flags|=0x8000000;share=1;access=0x80000000;disposition=3;}else if(mode===2){access=0x40000000;disposition=2;}else if(mode===3){access=0xc0000000;disposition=4;}else if(mode===4){access=0x40000000;disposition=4;}put(m,frame+12,share);put(m,frame+16,flags);
  if(path){m.writeUInt16LE(0,frame+0x41e);crt(runtime,'wcsncpy_s',[frame+0x20,512,path,511],frame,0x4a3bde);}
  put(m,frame-8,frame+0x420);put(m,frame-12,0x4a3bf3);resolveGameAudioPath(frame+0x20,frame+0x420,{...runtime,scratchBase:frame-12,entryRegisters:{EBP:S-4,EBX:flags,ESI:access,EDI:disposition}});
  let handle=os(runtime,'CreateFileW',[frame+0x420,access,ptr(m,frame+12),0,disposition,flags,0],frame,0x4a3c0c);record=ptr(m,S+4);put(m,record,handle);
  while((handle|0)===-1){if(os(runtime,'GetLastError',[],frame,0x4a3c1c)!==0x21){if(get(m,record)===-1)return 0;break;}os(runtime,'Sleep',[100],frame,0x4a3c29);handle=os(runtime,'CreateFileW',[frame+0x420,access,ptr(m,frame+12),0,disposition,ptr(m,frame+16),0],frame,0x4a3c45);put(m,record,handle);}
  if(m[frame+24]&4){const success=os(runtime,'GetFileSizeEx',[ptr(m,record),frame+24],frame,0x4a3c60);let lo,hi;if(success){lo=ptr(m,frame+24);hi=ptr(m,frame+28);}else{m.fill(0,frame+16,frame+24);lo=ptr(m,frame+16);hi=ptr(m,frame+20);}os(runtime,'SetFilePointerEx',[ptr(m,record),lo,hi,frame+16,0],frame,0x4a3c9e);}return 1;
}

//4a7fc0. Its1024-byte input is passed BY VALUE at nativeENTRYESP+8 and is
//modified in place; the exported function deliberately reads that real stack
//record instead of creating a host string. RET404h consumes output+the record.
export function resolveGameAudioSamplePath(output,runtime){
  const m=runtime.memory,S=entry(runtime),frame=((S-4)&~7)-0xc08,input=S+8;save(runtime,[['EBP',-4]]);for(const[reg,offset]of [['ESI',0],['EDI',-4]])if(runtime.entryRegisters?.[reg]!==undefined)put(m,frame+4+offset,runtime.entryRegisters[reg]);
  put(m,frame-4,0x4a7fd6);const exists=gameAudioPathExists(input,{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,EBP:S-4}});
  if((exists&255)===1){put(m,frame-8,frame+8);put(m,frame-12,0x4a7fe8);const result=resolveGameAudioPath(input,frame+8,{...runtime,scratchBase:frame-12,entryRegisters:{...runtime.entryRegisters,EBP:S-4}});forward(m,input,result,1024);}
  else {
    m.writeUInt16LE(0,frame+0x406);crt(runtime,'wcsncpy_s',[frame+8,512,input,511],frame,0x4a801c);
    put(m,frame-8,frame+0x408);put(m,frame-12,1);put(m,frame-16,frame+0x808);put(m,frame-20,0x4a803f);const filename=getAudioDatabasePath(ptr(m,0x714b08)+4,frame+0x808,1,'source',{...runtime,scratchBase:frame-20,entryRegisters:{...runtime.entryRegisters,EBP:S-4}});
    put(m,frame-12,0x4a8046);const directory=getGameAudioDirectory(filename,frame+0x408,{...runtime,scratchBase:frame-12,entryRegisters:{...runtime.entryRegisters,EBP:S-4}});forward(m,input,directory,1024);crt(runtime,'wcscat_s',[input,512,0x5d39fc],frame,0x4a8068);crt(runtime,'wcscat_s',[input,512,frame+8],frame,0x4a807b);
  }
  crt(runtime,'_wcslwr_s',[input,512],frame,0x4a808d);output=ptr(m,S+4)||output;m.writeUInt16LE(0,output+1022);crt(runtime,'wcsncpy_s',[output,512,input,511],frame,0x4a80b1);return output;
}
