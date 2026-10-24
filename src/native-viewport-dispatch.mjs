import {nativeCodeAddress,assertNativeMemorySpan} from './native-memory-spans.mjs';
import {assignViewportString,getOrCreateViewportRecord} from './weather-viewport.mjs';

const uint=v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff;
const nonvolatile=['ebx','ebp','esi','edi'];
function setup(runtime,below,after=12){
  const {memory:m,scratchBase:S,moduleBaseAddress:base,nativeTls:tls}=runtime??{};
  if(!Buffer.isBuffer(m)||!uint(S)||S<below||(S&3)||S+after>0x100000000||!uint(base)||!base)throw Error('Native viewport wrapper requires actual memory/module and bounded entry ESP.');
  if(!tls||!uint(tls.sehWord))throw Error('Native viewport wrapper requires explicit raw FS:[0].');
  const r={};for(const name of ['ECX','EBX','EBP','ESI','EDI']){if(!uint(runtime.entryRegisters?.[name]))throw Error(`Native viewport wrapper requires incoming ${name}.`);r[name.toLowerCase()]=runtime.entryRegisters[name];}
  for(const name of ['EAX','EDX'])if(runtime.entryRegisters?.[name]!==undefined){if(!uint(runtime.entryRegisters[name]))throw Error(`Native viewport wrapper requires raw ${name}.`);r[name.toLowerCase()]=runtime.entryRegisters[name];}
  assertNativeMemorySpan(m,S-below,below+after);
  return {m,S,tls,r,actual:p=>nativeCodeAddress(p,runtime),put:(p,v)=>m.writeUInt32LE(v>>>0,p)};
}
function resultWord(value,label){if(!uint(value))throw Error(`Native viewport ${label} requires actual uint32 EAX.`);return value;}
function synchronous(result){if(result&&typeof result.then==='function')throw Error('Native viewport callbacks must complete synchronously.');return result;}
function childRuntime(runtime,r,entry,target,returned,args,kind){return {...runtime,scratchBase:entry,entryRegisters:Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toUpperCase(),v])),nativeViewportWrapperCall:Object.freeze({kind,targetAddress:target,returnAddress:returned,args:Object.freeze([...args])})};}
function refine(r,result,{required=false,label='child'}={}){
  synchronous(result);
  delete r.eax;delete r.ecx;delete r.edx;
  if(result?.registers)for(const[name,value]of Object.entries(result.registers)){const key=name.toLowerCase();if([...nonvolatile,'eax','ecx','edx'].includes(key))r[key]=resultWord(value,`${label} ${name}`);}
  const eax=typeof result==='number'?result:result?.eax;if(eax!==undefined)r.eax=resultWord(eax,label);
  if(required&&r.eax===undefined)throw Error(`Native viewport ${label} has no genuine EAX.`);
}
function callSemantic(runtime,r,{target,returned,entry,args,ecx,defaultCall,required=false,seh}){
  const m=runtime.memory;if(ecx!==undefined)r.ecx=ecx;m.writeUInt32LE(returned,entry);
  const child=childRuntime(runtime,r,entry,target,returned,args,'semantic-game-child');
  const request=Object.freeze({runtime:child,ecx:r.ecx,edx:r.edx,entryRegisters:Object.freeze({...child.entryRegisters}),args:child.nativeViewportWrapperCall.args,targetAddress:target,returnAddress:returned});
  const id='call'+(target-runtime.moduleBaseAddress+0x400000).toString(16),override=runtime.calls?.[id];
  if(override!==undefined&&typeof override!=='function')throw Error(`Native viewport ${id} must be a function.`);
  const result=override?override(request):defaultCall(child);refine(r,result,{required,label:id});
  if(m.readUInt32LE(entry)!==returned||runtime.nativeTls.sehWord!==seh)throw Error('Native viewport semantic child did not preserve its live CALL/SEH boundary.');
}

//402d10 initialized singleton path only. The wrapper owns every prologue,
//SEH, RTTI argument and CALL store. The external service supplies EAX only.
//Cold403430/bootstrap and CRT private ABI are separate reached dependencies.
export function runNativeViewportLookup(runtime){
  const {m,S,tls,r,actual,put}=setup(runtime,44),F=S-20,Q=S-40;
  put(S-4,0xffffffff);put(S-8,actual(0x56981e));put(S-12,tls.sehWord);
  const cookie=m.readUInt32LE(actual(0x5e8890));put(S-16,r.ecx);put(F,cookie^(S-16));tls.sehWord=S-12;
  const application=m.readUInt32LE(actual(0x6efb38));
  r.eax=application;
  if(!application){const error=Error('Native402d10 reached unclosed cold bootstrap ABI at402d3a.');error.nativeViewportBoundary={kind:'cold-bootstrap',entry:actual(0x402d3a),entryEsp:S,frame:F,sehHead:tls.sehWord};throw error;}
  const args=[application,0,actual(0x6e213c),actual(0x6e20a4),0];for(let i=4;i>=0;i--)put(Q+i*4,args[i]);put(Q-4,actual(0x402d8b));
  if(typeof runtime.services?.libraryCall!=='function')throw Error('Native402d10 requires typed external __RTDynamicCast.');
  const owned=Buffer.from(m.subarray(Q-4,S+12)),root=m.readUInt32LE(actual(0x6efb38)),incomingCookie=m.readUInt32LE(actual(0x5e8890));
  const child=childRuntime(runtime,r,Q-4,actual(0x56932a),actual(0x402d8b),args,'external-CRT-dynamic-cast');
  const eax=resultWord(runtime.services.libraryCall('__RTDynamicCast',args,child),'__RTDynamicCast');
  if(tls.sehWord!==S-12||!m.subarray(Q-4,S+12).equals(owned)||m.readUInt32LE(actual(0x6efb38))!==root||m.readUInt32LE(actual(0x5e8890))!==incomingCookie)throw Error('Native RTTI EAX-only service changed protected game/wrapper state.');
  const savedSeh=m.readUInt32LE(F+8);tls.sehWord=savedSeh;
  const registers={eax,ecx:m.readUInt32LE(F),...Object.fromEntries(nonvolatile.map(k=>[k,r[k]])),esp:S+4,eip:m.readUInt32LE(S)};
  return {eax,registers,entryEsp:S,frame:F,crtCallEsp:Q-4,application,transitivePrivateAbiComplete:false,scope:'initialized402d10-owned-wrapper'};
}

//406b80. Own frame/prologue/epilogue is reconstructed;405310/404fa0 execute
//their real semantic defaults. Their transitive private CPU/stack ABI remains
//unclosed. Explicit calls overrides are isolated composition/test seams.
export function runNativeViewportEnable(runtime){
  const {m,S,tls,r,actual,put}=setup(runtime,72),F=S-60,A=S-44,key=F+16;
  put(S-4,0xffffffff);put(S-8,actual(0x569c88));put(S-12,tls.sehWord);
  put(S-16,m.readUInt32LE(actual(0x5e8890))^A);
  put(S-48,r.ebx);put(S-52,r.esi);put(S-56,r.edi);put(F,m.readUInt32LE(actual(0x5e8890))^(S-56));tls.sehWord=F+48;
  r.edi=r.ecx;const name=m.readUInt32LE(S+4);r.eax=name;r.edx=actual(0x56fe6b);
  put(F+36,15);put(F+32,0);if(name)r.edx=name;m[key]=0;
  let length=0;if(m.readUInt8(r.edx)!==0){r.ecx=r.edx;r.esi=(r.ecx+1)>>>0;do{const byte=m.readUInt8(r.ecx);r.eax=((r.eax&0xffffff00)|byte)>>>0;r.ecx=(r.ecx+1)>>>0;if(!byte)break;}while(true);length=(r.ecx-r.esi)>>>0;r.ecx=length;}else r.ecx=0;
  put(F-4,length);put(F-8,r.edx);
  const source=r.edx;
  callSemantic(runtime,r,{target:actual(0x405310),returned:actual(0x406bf8),entry:F-12,args:[source,length],ecx:key,seh:F+48,defaultCall:child=>assignViewportString(key,source,length,child)});
  put(F+40,0);
  //CMP occurs after assignment and before the map call. BL preserves EBX's
  //upper24 bits; later changes to the argument do not redo that comparison.
  const enabled=m.readUInt32LE(S+8)===1;r.eax=key;put(F-4,key);r.ecx=(r.edi+0x7c)>>>0;put(F+56,0);r.ebx=((r.ebx&0xffffff00)|(enabled?1:0))>>>0;
  const map=r.ecx;
  callSemantic(runtime,r,{target:actual(0x404fa0),returned:actual(0x406c1d),entry:F-8,args:[key],ecx:map,seh:F+48,required:true,defaultCall:child=>getOrCreateViewportRecord(map,key,child)});
  const record=r.eax;m[record+0x34]=r.ebx&255;r.eax=m.readUInt32LE(F+40);
  if(r.eax){const owner=r.eax;put(F-4,owner);put(F-8,actual(0x406c2f));const target=m.readUInt32LE(actual(0x56e470));if(!target||typeof runtime.services?.libraryCall!=='function')throw Error('Native406b80 requires reached external operatorDeleteArray.');
    const child=childRuntime(runtime,r,F-8,target,actual(0x406c2f),[owner],'external-CRT-delete-array');const result=synchronous(runtime.services.libraryCall('operatorDeleteArray',[owner],child));refine(r,result?.registers?result:undefined);if(tls.sehWord!==F+48||m.readUInt32LE(F-8)!==actual(0x406c2f))throw Error('Native delete-array changed its owned wrapper boundary.');put(F+40,0);
  }
  if(m.readUInt32LE(F+36)>=16){const data=m.readUInt32LE(key);put(F-4,data);put(F-8,actual(0x406c4b));const target=m.readUInt32LE(actual(0x56e210));if(!target||typeof runtime.handlers?.free!=='function')throw Error('Native406b80 requires reached CRT string free.');
    const child=childRuntime(runtime,r,F-8,target,actual(0x406c4b),[data],'external-CRT-string-free');const result=synchronous(runtime.handlers.free(data,child));refine(r,result?.registers?result:undefined);if(tls.sehWord!==F+48||m.readUInt32LE(F-8)!==actual(0x406c4b))throw Error('Native string free changed its owned wrapper boundary.');
  }
  tls.sehWord=m.readUInt32LE(F+48);r.ecx=m.readUInt32LE(F);r.edi=m.readUInt32LE(F+4);r.esi=m.readUInt32LE(F+8);r.ebx=m.readUInt32LE(F+12);
  r.ecx=(m.readUInt32LE(A+28)^A)>>>0;put(A-4,actual(0x406c68));
  //Original568162: CMP ECX,[5e8890];JNZ failure;REP RET. Successful check
  //preserves the derived ECX and EAX; it does not restore incoming ECX.
  if(r.ecx!==m.readUInt32LE(actual(0x5e8890))){const error=Error('Native406b80 reached security-cookie failure at568162.');error.nativeViewportBoundary={kind:'security-cookie',entry:actual(0x568162),entryEsp:A-4,ecx:r.ecx};throw error;}
  const registers={...(r.eax!==undefined?{eax:r.eax}:{}),ecx:r.ecx,...Object.fromEntries(nonvolatile.map(k=>[k,r[k]])),esp:S+12,eip:m.readUInt32LE(S)};
  return {...(r.eax!==undefined?{eax:r.eax}:{}),registers,entryEsp:S,frame:F,key,record,enabled,transitivePrivateAbiComplete:false,scope:'406b80-owned-wrapper-with-semantic-string-map-children'};
}
