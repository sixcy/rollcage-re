import {appendRendererFreeIndex} from './renderer-resource-pools.mjs';
import {constructGameAudioSpectrumState} from './game-audio-spectrum-state.mjs';
import {allocateZeroedGameBuffer} from './game-buffer-allocation.mjs';
import {reportGameAssertion} from './game-assertion.mjs';
import {assignGameCString} from './game-string-buffer.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
import {getAudioDebuggerCategory} from './xaudio-manager-construction.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const entry=r=>{if(!Number.isInteger(r.scratchBase))throw Error('Audio streams require native entry ESP.');return r.scratchBase;};
const save=(r,pairs)=>{for(const[reg,offset]of pairs)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,r.scratchBase+offset,r.entryRegisters[reg]);};
function call(r,kind,name,args,top,returned){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);if(typeof r.services?.[kind]!=='function')throw Error(`Audio streams require ${kind} ${name}.`);return r.services[kind](name,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
const crt=(r,name,args,top,returned)=>call(r,'libraryCall',name,args,top,returned),os=(r,name,args,top,returned)=>call(r,'platformCall',name,args,top,returned);
const adapted=r=>({...r,handlers:{...r.handlers,allocate:r.handlers?.allocate??((n)=>r.services.libraryCall('operatorNew',[n],r)),free:r.handlers?.free??((p)=>r.services.libraryCall('operatorDelete',[p],r)),registerExit:r.handlers?.registerExit??((p)=>r.services.libraryCall('registerExit',[p],r))}});

//4a2b40. Exact raw formatter frame, original varargs and actual405310 child.
export function formatGameAudioStreamMessage(output,format,values,runtime){const m=runtime.memory,S=entry(runtime),buffer=S-0x1000;[output,format,...values].forEach((value,i)=>put(m,S+4+i*4,value));put(m,S-4,0x4a2b4a);crt(runtime,'vsprintf_s',[buffer,4096,ptr(m,S+8),S+12],buffer,0x4a2b69);let length=0;while(m[buffer+length])length++;put(m,buffer-4,length);put(m,buffer-8,buffer);put(m,buffer-12,0x4a2b9b);assignGameCString(ptr(m,S+4),buffer,length,{...runtime,scratchBase:buffer-12});return ptr(m,S+4);}

//4b3e70→4b3e90. Actual byte capacity divided by the live format alignment.
export function getGameStreamingFrameCount(object,runtime){const m=runtime.memory,S=entry(runtime);save(runtime,[['ESI',-4]]);put(m,S-8,0x4b3e78);const target=ptr(m,ptr(m,object)+0x24);if(target!==0x4b3e90)throw Error(`Unported streaming byte-capacity target0x${target.toString(16)}.`);const bytes=Math.imul(get(m,object+0x34),get(m,object+0x30))>>>0,align=m.readUInt16LE(object+0x14);if(!align)throw Error('Native streaming frame-count divide by zero.');return Math.floor(bytes/align)>>>0;}

//4b37f0. Real sixteen-block streaming buffer and deque ownership. Its four
//stack arguments are [owner,format,unused,unused], consumed by RET10h.
export function constructGameStreamingBuffer(object,owner,format,runtime){
 const m=runtime.memory,S=entry(runtime),frame=S-36;put(m,S-4,-1);put(m,S-8,0x56aaec);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);save(runtime,[['EBX',-24],['EBP',-28],['ESI',-32],['EDI',-36]]);put(m,frame+20,object);put(m,object,0x5d424c);put(m,object+4,owner);Buffer.from(m.subarray(format,format+16)).copy(m,object+8);m.writeUInt16LE(m.readUInt16LE(format+16),object+24);put(m,frame+32,0);
 for(const[offset,value]of[[0,0x5d4218],[0x1c,0x5d41f8],[0x20,0],[0x28,0],[0x2c,0],[0x30,16],[0x34,0],[0x38,0],[0x40,0],[0x44,0],[0x48,0],[0x4c,0],[0x68,0],[0x6c,0]])put(m,object+offset,value);m[object+0x24]=0;os(runtime,'InitializeCriticalSectionAndSpinCount',[object+0x50,4096],frame,0x4b38b1);m[frame+32]=1;
 const deque=object+0x70;for(let i=0;i<20;i+=4)put(m,deque+i,0);const sentinel=crt(runtime,'operatorNew',[8],frame,0x4b38e3)>>>0;if(!sentinel)throw Error('Native streaming deque bad_alloc.');put(m,deque,sentinel);put(m,sentinel,0);put(m,sentinel+4,0);put(m,ptr(m,deque),deque);for(let i=0x84;i<=0x8c;i+=4)put(m,object+i,0);m[frame+32]=3;
 let blockBytes=ptr(m,format+8)>>>4;put(m,object+0x34,blockBytes);const align=m.readUInt16LE(format+12);if(!align)throw Error('Native streaming buffer divide by zero.');blockBytes=(blockBytes-blockBytes%align)>>>0;const total=Math.imul(get(m,object+0x30),blockBytes)>>>0;put(m,object+0x34,blockBytes);const allocation=crt(runtime,'allocate',[total],frame,0x4b394b)>>>0;
 if(!allocation){const values=[0x5d399c,26,0x5d3938,total>>>10];for(let i=values.length-1;i>=0;i--)put(m,frame-4*(values.length-i),values[i]);put(m,frame-20,0x4b3969);if(reportGameAssertion(values[0],values[1],values[2],[values[3]],{...runtime,scratchBase:frame-20,entryRegisters:{...runtime.entryRegisters,EBX:deque,EBP:total>>>10,ESI:allocation,EDI:object}})){const error=Error('Native streaming allocation breakpoint.');error.name='NativeGameBreakpoint';error.address=0x4b3970;throw error;}}
 else crt(runtime,'memset',[allocation,0,total],frame,0x4b397c);put(m,object+0x20,allocation);
 for(let index=0;index<16;index++){put(m,frame+40,Math.imul(get(m,object+0x34),index)+ptr(m,object+0x20));put(m,frame-4,frame+40);put(m,frame-8,0x4b399d);appendRendererFreeIndex(deque,0,{...runtime,scratchBase:frame-8,valueAddress:frame+40,...(runtime.nativeDequeCopies?{nativeDequeEntryEsp:frame-8,entryRegisters:{EBX:deque,EBP:total,ESI:index,EDI:object}}:{})});}return object;
}

//4ae670, common actual stream/decoder state constructor. No parser format or
//codec is selected here; those remain separate concrete decoder operations.
export function constructGameAudioStream(object,owner,runtime){
 const m=runtime.memory,S=entry(runtime),frame=S-52;put(m,S-4,-1);put(m,S-8,0x56a77a);if(runtime.sehWord!==undefined)put(m,S-12,runtime.sehWord);save(runtime,[['ESI',-48],['EDI',-52]]);put(m,frame+36,object);put(m,object,0x5d4054);put(m,object+8,owner);for(const offset of[12,16,20,24])put(m,object+offset,0);
 put(m,frame-4,0x4ae6c1);constructGameAudioSpectrumState(object+0x1c,{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,ESI:object}});put(m,frame+48,0);put(m,object+0x5c,0);put(m,object+0x60,0);os(runtime,'InitializeCriticalSectionAndSpinCount',[object+0x44,4096],frame,0x4ae6e6);m[frame+48]=1;
 const flag=m[S+20];put(m,object+0x64,-1);for(const offset of[0x68,0x70,0x74,0x78,0x7c,0x94,0x98,0x9c,0xa0])put(m,object+offset,0);m[object+0x92]=flag;const blocks=crt(runtime,'operatorNew',[12],frame,0x4ae74f)>>>0;if(blocks)for(let i=0;i<12;i+=4)put(m,blocks+i,0);put(m,object+0xa4,blocks);m.fill(0,object+0x80,object+0x92);m.writeUInt16LE(2,object+0x82);m.writeUInt16LE(1,object+0x80);put(m,object+0x84,44100);put(m,object+0x8c,0x100004);put(m,object+0x88,176400);m.writeUInt16LE(18,object+0x90);
 if(m[S+20]===1&&ptr(m,S+4)){
  const text=frame+8;put(m,frame+28,15);put(m,frame+24,0);m[text]=0;put(m,frame+32,0);put(m,frame-4,44100);put(m,frame-8,0x5d3fe8);put(m,frame-12,text);m[frame+48]=2;put(m,frame-16,0x4ae811);formatGameAudioStreamMessage(text,0x5d3fe8,[44100],{...runtime,scratchBase:frame-16,sehWord:frame+40,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:object+0x80}});put(m,frame-4,0x4ae819);getApplicationDebugger(adapted({...runtime,scratchBase:frame-4}));put(m,frame-4,0x4ae81e);getAudioDebuggerCategory(adapted({...runtime,scratchBase:frame-4}));
  const buffer=crt(runtime,'operatorNew',[144],frame,0x4ae829)>>>0;put(m,frame+72,buffer);m[frame+48]=3;let stream=0;if(buffer){put(m,frame-12,object+0x80);put(m,frame-16,ptr(m,object+8));put(m,frame-20,0x4ae847);stream=constructGameStreamingBuffer(buffer,ptr(m,object+8),object+0x80,{...runtime,scratchBase:frame-20,sehWord:frame+40,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:object+0x80}});}m[frame+48]=2;put(m,object+12,stream);
  put(m,frame-4,0x4ae85c);const count=getGameStreamingFrameCount(stream,{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:object+0x80}});put(m,object+16,count);put(m,frame-4,0x4ae86b);put(m,object+24,allocateZeroedGameBuffer(Math.imul(count,4),{...runtime,scratchBase:frame-4,entryRegisters:{...runtime.entryRegisters,ESI:object,EDI:object+0x80}}));
  const ownerWord=ptr(m,frame+32);if(ownerWord){crt(runtime,'operatorDeleteArray',[ownerWord],frame,0x4ae87d);put(m,frame+32,0);}if(ptr(m,frame+28)>=16)crt(runtime,'operatorDelete',[ptr(m,text)],frame,0x4ae899);
 }return object;
}
