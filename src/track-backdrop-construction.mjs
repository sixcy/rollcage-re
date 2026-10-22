import {loadGameBitmap} from './game-bitmap-images.mjs';
import {constructGameTexture} from './game-texture-construction.mjs';
import tables from './track-backdrop-tables.json' with {type:'json'};
const ptr=(m,p)=>m.readUInt32LE(p),get=(m,p)=>m.readInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export function initializeTrackBackdropTables(memory){for(const t of tables)Buffer.from(t.bytesHex,'hex').copy(memory,Number(t.address));return memory;}
function save(runtime,F,regs){for(const[n,o]of regs)if(runtime.entryRegisters?.[n]!==undefined)put(runtime.memory,F+o,runtime.entryRegisters[n]);}
function library(runtime,F,name,args,ret){const{memory:m}=runtime;for(let i=0;i<args.length;i++)put(m,F-args.length*4+i*4,args[i]);const entry=F-(args.length+1)*4;put(m,entry,ret);if(!runtime.services?.libraryCall)throw Error('Track backdrop requires CRT '+name);return runtime.services.libraryCall(name,args,{...runtime,scratchBase:entry});}
//412fd0. Original four allocations use two120-byte primitive arrays and two
//32-byte vertex arrays. The first two counts remain captured across services.
export function allocateTrackBackdropPools(firstCount,secondCount,runtime){const{memory:m,scratchBase:S}=runtime,F=S-20;put(m,S-4,firstCount);save(runtime,F,[['EBX',12],['EBP',8],['ESI',4],['EDI',0]]);put(m,0x920b20,secondCount);put(m,0x920b24,firstCount);
 const alloc=(size,a,b)=>{const p=library(runtime,F,'allocate',[size>>>0],a)>>>0;if(p)library(runtime,F,'memset',[p,0,size>>>0],b);return p;};
 const first=alloc(Math.imul(firstCount,120),0x412ffb,0x41300d);put(m,0x6f96f4,first);const second=alloc(Math.imul(secondCount,120),0x413023,0x413035);put(m,0x6f96f0,second);
 const vertexBytes=(get(m,F+16)<<5)>>>0,firstVertices=library(runtime,F,'allocate',[vertexBytes],0x41304c)>>>0;put(m,F+16,firstVertices);if(firstVertices)library(runtime,F,'memset',[firstVertices,0,vertexBytes],0x413060);put(m,0x920b2c,get(m,F+16));const last=alloc(secondCount<<5,0x413076,0x413088);put(m,0x6f96fc,second);put(m,0x920b28,last);put(m,0x6f9710,first);put(m,0x6f96ec,0);put(m,0x6f96e8,0);
}
function copyQuad(m,source,output){for(const o of[0,2,4,8,10,12,16,18,20,24,26,28])word(m,output+o,m.readUInt16LE(source+o));}
function material(m,output,input){put(m,output-28,-1);put(m,output,get(m,input));put(m,output+28,get(m,input+4));word(m,output+56,m.readUInt16LE(input+8));word(m,output+84,m.readUInt16LE(input+10));}
//4130c0. Clouds remain actual bitmap/image calls; only their documented
//Win32/GDI+/CRT/renderer interfaces are supplied by the caller.
export function constructTrackBackdrop(header,runtime){const{memory:m,scratchBase:S}=runtime,F=S-100,probe=S-84;put(m,S-4,ptr(m,0x5e8890)^probe);save(runtime,F,[['EBX',12],['EBP',8],['ESI',4],['EDI',0]]);let input=header+get(m,header+28),remaining=ptr(m,0x920b24),vertices=ptr(m,0x920b2c),minimum=65535,loaded=0;
 if(remaining){for(let i=0;i<remaining;i++)minimum=Math.min(minimum,m.readUInt16LE(input+i*34+32));remaining=ptr(m,0x920b24);if(remaining){const mat=ptr(m,0x90b988)+minimum*16;let output=ptr(m,0x6f96f4)+32;do{copyQuad(m,input,vertices);input+=34;vertices+=32;material(m,output,mat);m[output-29]=12;m[output-25]=0x98;output+=120;}while(--remaining);}}
 let count=ptr(m,0x920b20),quad=ptr(m,0x920b28);put(m,F+28,quad);const setting=m[ptr(m,0x5ecefc)+0x33];if(!setting){count=0;put(m,0x920b20,0);}else{if(setting===1){count>>>=1;put(m,0x920b20,count);}put(m,F+32,0);if(count){let output=ptr(m,0x6f96f0)+88;input+=4;put(m,F+24,input);do{copyQuad(m,input-4,quad);put(m,F+20,-1);let texture=-1,found=false;
  if(loaded){const id=m.readUInt16LE(input+28);for(let i=0;i<loaded;i++)if(ptr(m,F+80+i*8)===id){texture=get(m,F+84+i*8);put(m,F+20,texture);found=true;break;}}
  if(!found&&loaded<2){put(m,F+80+loaded*8,m.readUInt16LE(input+28));put(m,F-4,1);put(m,F-8,0x4132d4);texture=63;const name=loaded?0x5d03b8:0x5d03ac;
   if(loadGameBitmap(name,F+44,1,{...runtime,scratchBase:F-8,entryRegisters:{...runtime.entryRegisters,EBX:count,EBP:63,ESI:output,EDI:loaded}})){texture=get(m,0x91ce98)+1|0;if(texture===63)texture=64;const args=[m.readInt16LE(F+50),m[F+54],ptr(m,F+64),0,0];for(let i=0;i<5;i++)put(m,F-20+i*4,args[i]);put(m,F-24,0x41330d);constructGameTexture(texture,m.readInt16LE(F+46),args[0],args[1],args[2],0,0,{...runtime,scratchBase:F-24,entryRegisters:{...runtime.entryRegisters,EBX:count,EBP:texture,ESI:output,EDI:loaded}});}
   count=ptr(m,0x920b20);quad=ptr(m,F+28);put(m,F+84+loaded*8,texture);loaded++;put(m,F+20,texture);
  }
  input=ptr(m,F+24);const mat=ptr(m,0x90b988)+m.readUInt16LE(input+28)*16;material(m,output-56,mat);
  if(texture!==-1){let policy=-1;const mode=m[ptr(m,0x5ecb1c)+0x579];if(mode<=19){const target=ptr(m,0x413588+m[0x41359c+mode]*4);policy=target===0x41337d?0:target===0x413381?1:target===0x413388?2:target===0x41338f?3:-1;}
   let packed=get(m,F+20)<<2;packed=(packed&~0xff00)|((packed>>>8<<2)&255)<<8;packed>>>=2;word(m,output,0xff00);word(m,output-26,packed|0x800);word(m,output-56,0);word(m,output+28,65535);word(m,output-28,255);if(policy===0)put(m,output-84,0x1f78ff);else if(policy===2)put(m,output-84,0x755e2d);else if(policy===3)put(m,output-84,0x1112ba);put(m,output-84,(ptr(m,output-84)>>>2&0x3f3f3f)|0xff000000);count=ptr(m,0x920b20);
  }
  const first=m.readInt16LE(quad),right=m.readInt16LE(quad+8);put(m,F+40,first);let dx=right-get(m,F+40)|0;put(m,F+20,(right+first)>>1);let dz=m.readInt16LE(quad+20)-m.readInt16LE(quad+4);put(m,F+36,(m.readInt16LE(quad+20)+m.readInt16LE(quad+4))>>1);
  if(dx<2000||dz<2000){const seed=Math.imul(get(m,0x5ec958),0x41a7)&0x7fffffff;put(m,0x5ec958,seed);dx=(seed>>>16&1023)+2000;dz=dx;}
  const midX=get(m,F+20),midZ=get(m,F+36);word(m,quad,midX-dx*2);word(m,quad+8,midX+dx*2);word(m,quad+16,midX-dx*2);word(m,quad+24,midX+dx*2);word(m,quad+4,midZ-dz*2);word(m,quad+12,midZ-dz*2);word(m,quad+20,midZ+dz*2);word(m,quad+28,midZ+dz*2);
  input=ptr(m,F+24)+34;quad+=32;m[output-85]=12;m[output-81]=0x9a;output+=120;put(m,F+32,get(m,F+32)+1);put(m,F+28,quad);put(m,F+24,input);
 }while(ptr(m,F+32)<count);quad=ptr(m,0x920b28);}}
 let lowest=0;for(let i=0;i<count;i++)for(const o of[2,10,18,26])lowest=Math.min(lowest,m.readInt16LE(quad+i*32+o));const shifted=lowest-512|0;let returnAddress;
 if(shifted<=-1290){const input=shifted<<8,high=Number(BigInt.asIntN(64,BigInt(input)*BigInt(-0x659b3007))>>32n)|0,reduced=high>>9,quotient=reduced+(reduced>>>31)|0,value=(Math.imul(quotient,-1290)>>8)<<16>>16;m.writeFloatLE(value,0x6f9708);returnAddress=0x413564;}else{put(m,0x6f9708,0xc4a14000);returnAddress=0x413581;}
 const cookie=(ptr(m,S-4)^probe)>>>0;put(m,probe-4,returnAddress);if(runtime.services?.securityCookie)runtime.services.securityCookie(cookie,{...runtime,scratchBase:probe-4});else if(cookie!==ptr(m,0x5e8890))throw Error('Native track-backdrop security cookie mismatch.');
}
