const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
function library(runtime,name,args,top,returned){const m=runtime.memory;for(let i=args.length-1;i>=0;i--)put(m,top-4*(args.length-i),args[i]);const S=top-args.length*4-4;put(m,S,returned);if(typeof runtime.services?.libraryCall!=='function')throw Error(`Audio spectrum state requires CRT ${name}.`);return runtime.services.libraryCall(name,args.map((_,i)=>ptr(m,S+4+i*4)),{...runtime,scratchBase:S});}
//4b2ee0. Original512-point FFT workspace owner, nine-bit permutation and
//float32 twiddle-table producers. Seven separately allocated arrays retain
//their exact sizes/order; only four work arrays are cleared by the constructor.
export function constructGameAudioSpectrumState(object,runtime){
 const m=runtime.memory,S=runtime.scratchBase;if(!Number.isInteger(S))throw Error('Audio spectrum state requires native entry ESP.');put(m,S-4,object);for(const[reg,offset]of[['EBX',-8],['ESI',-12],['EDI',-16]])if(Number.isInteger(runtime.entryRegisters?.[reg]))put(m,S+offset,runtime.entryRegisters[reg]);const frame=S-16;
 put(m,object,9);put(m,object+4,512);put(m,object+8,256);
 const fields=[16,20,24,12,32,36,28],returns=[0x4b2f18,0x4b2f2c,0x4b2f40,0x4b2f54,0x4b2f68,0x4b2f7c,0x4b2f90];
 for(let i=0;i<7;i++){const count=i===0?512:ptr(m,object+(i===4||i===5?8:4)),bytes=count*4;put(m,object+fields[i],library(runtime,'operatorNewArray',[bytes<=0xffffffff?bytes:0xffffffff],frame-i*4,returns[i]));}
 for(let i=0;i<4;i++){const top=i<3?frame-28-i*12:frame;library(runtime,'memset',[ptr(m,object+[16,20,24,28][i]),0,ptr(m,object+4)*4>>>0],top,[0x4b2fa4,0x4b2fb5,0x4b2fc6,0x4b2fda][i]);}
 for(let index=0;index<ptr(m,object+4);index++){let input=index,result=0;for(let bit=ptr(m,object);bit;bit--){result=((input&1)+result*2)|0;input>>>=1;}put(m,ptr(m,object+12)+index*4,result);}
 for(let index=0;index<ptr(m,object+8);index++){
  const angle=Math.fround(Math.fround(Math.fround(index>>>0)*m.readFloatLE(0x5dc994))/Math.fround(ptr(m,object+4)));m.writeFloatLE(angle,frame+12);
  if(typeof runtime.services?.libraryCall!=='function')throw Error('Audio spectrum state requires original libm float services.');put(m,frame-4,0x4b305f);const sine=runtime.services.libraryCall('sinf',[angle],{...runtime,scratchBase:frame-4});m.writeFloatLE(Math.fround(sine),ptr(m,object+32)+index*4);
  const live=m.readFloatLE(frame+12);put(m,frame-4,0x4b3072);const cosine=runtime.services.libraryCall('cosf',[live],{...runtime,scratchBase:frame-4});m.writeFloatLE(Math.fround(cosine),ptr(m,object+36)+index*4);
 }return object;
}
