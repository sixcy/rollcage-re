//482730, optional original-stack implementation. State/pointer/argument reads
//remain live across the actual484bb0 child; no copied owner allocation exists.
import {multiplyQ8} from './sphere-collision.mjs';
import {emitNativeEffectOnStack} from './native-effect-emitter.mjs';
import {assertNativeMemorySpan,nativeCodeAddress} from './native-memory-spans.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export function requireEffectEntryRegisters(runtime){
 const incoming=runtime.nativeStack?.entryRegisters;
 for(const name of ['ebx','ebp','esi','edi'])if(!Number.isInteger(incoming?.[name])||incoming[name]<-2147483648||incoming[name]>0xffffffff)throw Error(`Native effect requires explicit32-bit incoming ${name}.`);
 return incoming;
}
export function applyNativeActiveVehicleEffect(body,direction,code,runtime){
 const{memory:m,scratchBase:A}=runtime,incoming=requireEffectEntryRegisters(runtime),T=A-56;
 assertNativeMemorySpan(m,T,64);
 if(get(m,A+4)!==(code|0))throw Error('Native active effect code differs from its actual caller argument.');
 for(const[name,offset]of[['ebx',12],['ebp',8],['esi',4],['edi',0]])put(m,T+offset,incoming[name]);
 put(m,T+0x10,direction);put(m,T+0x18,body);
 const state=ptr(m,body+0x6bc);put(m,T+0x28,state);
 if(!m[state+8]){
  const status=Math.max(0,m.readInt8(state+1)-(get(m,A+4)>>5));
  const args=[0,0x600,0x3fff,6,body,0,m[body+0x6b4]===1?1:0],E=A-88;
  for(let index=6;index>=0;index--)put(m,E+4+index*4,args[index]);
  put(m,E,nativeCodeAddress(0x482791,runtime));
  const child={...runtime,scratchBase:E,nativeStack:{entryRegisters:{ebx:status,ebp:state,esi:incoming.esi,edi:body}}};
  if(typeof runtime.handlers?.call484bb0==='function')runtime.handlers.call484bb0({...child,code:24,registerEdx:body+0x34,args});
  else emitNativeEffectOnStack(24,body+0x34,args,child);
  m[state+1]=status&255;m[state+8]=10;
 }
 let pointer=ptr(m,T+0x10),target=body;
 const firstAxis=-m.readInt16LE(target+0xc4);let x=get(m,pointer);put(m,T+0x2c,firstAxis);
 put(m,T+0x14,x);put(m,T+0x30,-m.readInt16LE(target+0xca));put(m,T+0x34,-m.readInt16LE(target+0xd0));
 put(m,T+0x24,multiplyQ8(get(m,T+0x2c),get(m,T+0x14)));
 const y=get(m,pointer+4);put(m,T+0x14,y);put(m,T+0x20,multiplyQ8(get(m,T+0x30),get(m,T+0x14)));
 const z=get(m,pointer+8);put(m,T+0x14,z);put(m,T+0x1c,multiplyQ8(get(m,T+0x34),get(m,T+0x14)));
 put(m,T+0x2c,-m.readInt16LE(target+0xc6));put(m,T+0x14,x);put(m,T+0x30,-m.readInt16LE(target+0xcc));put(m,T+0x34,-m.readInt16LE(target+0xd2));
 const yx=multiplyQ8(get(m,T+0x2c),get(m,T+0x14));put(m,T+0x14,y);
 const yy=multiplyQ8(get(m,T+0x30),get(m,T+0x14));put(m,T+0x14,z);
 const yz=multiplyQ8(get(m,T+0x34),get(m,T+0x14));target=ptr(m,T+0x18);put(m,T+0x14,(yz+yy+yx)|0);
 put(m,T+0x2c,-m.readInt16LE(target+0xc8));put(m,T+0x30,-m.readInt16LE(target+0xce));put(m,T+0x34,-m.readInt16LE(target+0xd4));
 pointer=ptr(m,T+0x10);put(m,T+0x18,get(m,pointer));
 const zx=multiplyQ8(get(m,T+0x2c),get(m,T+0x18));put(m,T+0x18,y);
 const zy=multiplyQ8(get(m,T+0x30),get(m,T+0x18));put(m,T+0x18,z);
 const zz=multiplyQ8(get(m,T+0x34),get(m,T+0x18));
 const clamp=value=>Math.max(0,Math.min(0x1fff,value|0));
 const cx=clamp((get(m,T+0x24)+0x1000+((get(m,T+0x1c)+get(m,T+0x20))|0))|0),cy=clamp(get(m,T+0x14)+0x1000),cz=clamp(((zz+zy+zx)|0)+0x1000);
 const index=((cz>>7)&0x30)|(((cy>>11)&3)<<2)|((cx>>11)&3),owner=ptr(m,T+0x28),offset=m[ptr(m,0x713180)+index],lateCode=get(m,A+4);
 m[owner+9+offset]=lateCode&255;
}
