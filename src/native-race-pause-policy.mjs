import {nativeCodeAddress} from './native-memory-spans.mjs';
import {announceNetworkCountdown,endDisconnectedNetworkSession,removeNetworkPeer} from './network-session-retirement.mjs';
import {refreshRaceAudioState} from './race-phase-audio.mjs';
import {sendGameNotificationPacket} from './game-network-protocol.mjs';

const uint=v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff;
function frame(runtime){
  const {memory:m,scratchBase:S,moduleBaseAddress:base}=runtime??{};
  if(!Buffer.isBuffer(m)||!uint(S)||S<512||S>0xfffffff8||(S&3)||!uint(base)||!base)throw Error('Native race pause requires actual memory/module and aligned entry ESP.');
  const r={};for(const name of['EBX','EBP','ESI','EDI']){if(!uint(runtime.entryRegisters?.[name]))throw Error(`Native race pause requires incoming ${name}.`);r[name]=runtime.entryRegisters[name];}
  for(const name of['EAX','ECX','EDX'])if(runtime.entryRegisters?.[name]!==undefined){if(!uint(runtime.entryRegisters[name]))throw Error(`Native race pause requires uint32 ${name}.`);r[name]=runtime.entryRegisters[name];}
  const actual=p=>nativeCodeAddress(p,runtime),put=(p,v)=>m.writeUInt32LE(v>>>0,p),read=p=>m.readUInt32LE(actual(p));
  const required=name=>{if(!uint(r[name]))throw Error(`Native race pause reached unknown live ${name}; genuine child register publication is required.`);return r[name];};
  const boundary=(target,entryEsp,reason)=>{const e=Error(`Native race pause reached unbound game child0x${target.toString(16)}: ${reason}.`);e.nativeRacePauseBoundary={targetAddress:actual(target),preferredTarget:target,entryEsp,reason,entryRegisters:{...r}};throw e;};
  const finish=()=>({...uint(r.EAX)?{eax:r.EAX}:{},registers:Object.freeze(Object.fromEntries([...Object.entries(r).map(([k,v])=>[k.toLowerCase(),v]),['esp',S+4],['eip',m.readUInt32LE(S)]]))});
  const context=entryEsp=>({...runtime,scratchBase:entryEsp,entryRegisters:{...r}});
  function call(target,returnAddress,entryEsp,args=[],fallback){
    put(entryEsp,actual(returnAddress));const child=context(entryEsp),request=Object.freeze({runtime:child,args:Object.freeze([...args]),entryRegisters:Object.freeze({...r}),ecx:r.ECX,edx:r.EDX,targetAddress:actual(target),returnAddress:actual(returnAddress)});
    runtime.observeNativePause?.(Object.freeze({stage:'call',...request}));const override=runtime.calls?.[`call${target.toString(16)}`];
    if(override!==undefined&&typeof override!=='function')throw Error('Native race pause isolated call seam must be a function.');
    const result=override?override(request):fallback?fallback(child):boundary(target,entryEsp,'source child not implemented');
    for(const n of['EAX','ECX','EDX'])delete r[n];
    if(result?.registers)for(const[name,v]of Object.entries(result.registers)){const n=name.toUpperCase();if(['EAX','EBX','ECX','EDX','EBP','ESI','EDI'].includes(n)){if(!uint(v))throw Error('Native race pause child register width.');r[n]=v;}}
    const eax=typeof result==='number'?result:result?.eax;if(eax!==undefined){if(!Number.isInteger(eax)||eax< -0x80000000||eax>0xffffffff)throw Error('Native race pause child EAX width.');r.EAX=eax>>>0;}
    if(m.readUInt32LE(entryEsp)!==actual(returnAddress))throw Error('Native race pause child changed its live CALL return.');return result;
  }
  //Legacy ports still address their own fixed globals canonically. Never run
  //them against an alias-free relocated image and mistake real pointers for
  //preferred operands. Their default is genuine source in the supported role.
  const legacy=(target,entryEsp,fn)=>{if(base!==0x400000)boundary(target,entryEsp,'legacy child needs explicit fixed-global address roles under ASLR');return fn();};
  return {m,S,r,actual,put,read,required,boundary,finish,context,call,legacy};
}

//484510. Genuine one-byte pipe command; only WriteFile is an external service.
export function runNativeRaceMusicCommand(runtime){
  const f=frame(runtime),{m,S,r,actual,put,read,required,finish}=f,code=required('ECX')&255;
  const byte=code===3?0x55:code===8?0x53:code===9?0x41:null;
  if(byte!==null){m[S-5]=byte;put(S-12,0);put(S-16,S-4);put(S-20,1);put(S-24,S-5);put(S-28,read(0x6e6b30));put(S-32,actual(0x484550));
    const iatTarget=read(0x56e0d4);if(!iatTarget)throw Error('Native race music requires its observed WriteFile import.');
    if(typeof runtime.services?.platformCall!=='function')throw Error('Native race music requires genuine WriteFile outcome.');
    r.EAX=S-5;const result=runtime.services.platformCall('WriteFile',[m.readUInt32LE(S-28),S-5,1,S-4,0],{...runtime,scratchBase:S-32,entryRegisters:{...r},nativeRaceMusicWrite:{entryEsp:S,frame:S-8,returnAddress:actual(0x484550),iatTarget}});
    if(!Number.isInteger(result)||result< -0x80000000||result>0xffffffff)throw Error('Native race music requires actual WriteFile BOOL.');delete r.ECX;delete r.EDX;
  }
  r.EAX=0;return finish();
}

//4843a0. Full raw ECX survives low-byte command changes and unchanged routes.
export function runNativeRaceMusicState(runtime){
  const f=frame(runtime),{m,S,r,actual,required,call,finish}=f,mode=required('ECX')&255;
  r.EAX=mode===0?0:(mode-1)>>>0;
  if((mode===0&&m.readUInt16LE(actual(0x6e6bd8))===2)||(mode===1&&m.readUInt16LE(actual(0x6e6bd8))===1)){
    r.EAX=m.readUInt32LE(actual(0x5ecefc));
    if(!m[r.EAX+0x410]){r.ECX=((required('ECX')&0xffffff00)|(mode?9:3))>>>0;call(0x484510,mode?0x4843ca:0x4843f5,S-4,[],runNativeRaceMusicCommand);}
    r.EAX=mode?2:1;m.writeUInt16LE(r.EAX,actual(0x6e6bd8));
  }
  return finish();
}

//4772e0. Full index comparison, with -1 host normalized to zero only.
export function compareNativeRaceHostParticipant(runtime){
  const f=frame(runtime),{m,r,read,finish}=f;r.EDX=read(0x6e9f70);if(r.EDX===0xffffffff)r.EDX=0;
  r.EAX=m.readUInt32LE(read(0x9020c0));r.ECX=m.readUInt16LE(r.EAX+0x65e);r.EAX=Number(r.ECX===r.EDX);return finish();
}

//473060. Six peer readiness words and an eight-byte live-stack packet.
export function announceNativeReadyPeers(runtime){
  const f=frame(runtime),{m,S,r,actual,put,read,call,legacy,finish}=f;r.ECX=read(0x6eafe0);
  if(r.ECX&1)r.EAX=(r.ECX>>>7)&1;
  if((r.ECX&0xc1)===0xc1){r.EAX=actual(0x6e7ef8);
    for(;;){if(m.readUInt32LE((r.EAX-0x678)>>>0)&&!m.readUInt32LE(r.EAX))return finish();r.EAX=(r.EAX+0x67c)>>>0;if((r.EAX|0)>=(actual(0x6ea5e0)|0))break;}
    if(!(r.ECX&0x2000)){put(S-12,17);put(S-16,8);r.EDX=S-8;m[S-8]=0xab;r.ECX=2;
      call(0x4a0420,0x4730bb,S-20,[8,17],child=>legacy(0x4a0420,child.scratchBase,()=>sendGameNotificationPacket(2,S-8,8,17,child)));}
  }
  return finish();
}

//4725b0. Scheduler flag transition. The reached host timer has a distinct
//472615 caller and is not supplied a fabricated441c70 counter-call contract.
export function updateNativeNetworkCountdown(runtime){
  const f=frame(runtime),{S,r,actual,put,read,call,boundary,finish}=f,save=S-12;put(save,r.ESI);r.ECX=read(0x6eafe0);
  if(!(r.ECX&0x400))r.EAX=0;
  else {r.EDX=read(0x6e675c);r.ESI=1;
    if((r.ECX&0x81)===0x81||r.EDX>=read(0x6eaab4)){
      put(actual(0x6eaab4),r.EDX);if(r.ECX&0x1000)r.ESI=3;r.ECX=(r.ECX&0xffffebff)>>>0;put(actual(0x6eafe0),r.ECX);
      if((r.ECX&0x81)===0x81){r.ECX=1;const result=call(0x489cd0,0x472615,S-16,[],child=>boundary(0x489cd0,child.scratchBase,'native472615 timer caller ABI not reconstructed'));
        if(!uint(r.EAX)||!uint(r.EDX))throw Error('Native countdown timer requires genuine EDX:EAX source result.');put(actual(0x6e66b0),r.EAX);put(actual(0x6e66b4),r.EDX);put(actual(0x6e66e4),0);put(actual(0x6e66f8),0);void result;}
    }
    r.EAX=r.ESI;
  }
  r.ESI=f.m.readUInt32LE(save);return finish();
}

//477730. Root canonical recovery20261024; all in-image calls retain source
//algorithms or explicit reached dependency errors. runtime.calls is only an
//isolated composition/control-test seam, never authenticated native answers.
export function runNativeRacePausePolicy(runtime){
  const f=frame(runtime),{m,S,r,actual,put,read,required,boundary,call,legacy,finish}=f,F=S-12;required('ECX');put(F,r.ESI);
  const invoke=(target,ret,fallback)=>call(target,ret,F-4,[],fallback);
  const done=()=>{r.ESI=m.readUInt32LE(F);return finish();};
  if(r.ECX){if(read(0x9020a0))invoke(0x477b00,0x477858);r.EAX=read(0x6e6b4c);return done();}
  if(read(0x6eafe0)&1){
    invoke(0x473060,0x47774e,announceNativeReadyPeers);r.EAX=m.readUInt32LE(read(0x9020c0));r.EAX=m.readUInt16LE(r.EAX+0x65e);
    if(r.EAX>5||!m.readUInt32LE(actual(0x6e7880)+Math.imul(r.EAX,0x67c))){r.EDX=0;r.ECX=1;invoke(0x4723f0,0x47777a,child=>legacy(0x4723f0,child.scratchBase,()=>announceNetworkCountdown(1,0,child)));}
    invoke(0x4725b0,0x47777f,updateNativeNetworkCountdown);
    if(required('EAX')){
      r.ECX=read(0x6eafe0);
      if((r.ECX&0x81)===0x81){r.ECX=1;
        if(r.EAX&2){r.ESI=read(0x9020c0);r.EAX=m.readUInt32LE(r.ESI);
          let check=!m.readUInt16LE(r.EAX+0x65e);if(!check){invoke(0x4772e0,0x4777b1,compareNativeRaceHostParticipant);check=required('EAX')===1;}
          if(check&&!read(0x5eb518)){r.ECX=actual(0x5d343c);invoke(0x46fef0,0x4777c9,child=>legacy(0x46fef0,child.scratchBase,()=>endDisconnectedNetworkSession(child)));r.ESI=read(0x9020c0);}
          invoke(0x4772e0,0x4777d4,compareNativeRaceHostParticipant);
          if(!required('EAX')){r.EAX=m.readUInt32LE(r.ESI);r.ECX=m.readUInt16LE(r.EAX+0x65e);invoke(0x49f4f0,0x4777ef,child=>legacy(0x49f4f0,child.scratchBase,()=>removeNetworkPeer(r.ECX,child)));}
        }
      }else {r.EAX=m.readUInt32LE(read(0x9020c0));r.ECX=m.readUInt16LE(r.EAX+0x65e);invoke(0x49f4f0,0x4777ef,child=>legacy(0x49f4f0,child.scratchBase,()=>removeNetworkPeer(r.ECX,child)));}
      put(actual(0x9020a0),0);
    }else if(read(0x9020a0)){
      invoke(0x484b20,0x477809,child=>legacy(0x484b20,child.scratchBase,()=>refreshRaceAudioState(child)));invoke(0x477f30,0x47780e);
      if(read(0x9020a0)){r.EAX=read(0x6e6b4c);return done();}
    }
  }else if(read(0x9020a0)){
    invoke(0x484b20,0x477809,child=>legacy(0x484b20,child.scratchBase,()=>refreshRaceAudioState(child)));invoke(0x477f30,0x47780e);
    if(read(0x9020a0)){r.EAX=read(0x6e6b4c);return done();}
  }
  r.EAX=read(0x5ecb1c);
  if(m.readInt32LE(r.EAX+0x57c)<7){r.ECX=(required('ECX')&0xffffff00)>>>0;invoke(0x4843a0,0x47782c,runNativeRaceMusicState);}
  r.ECX=read(0x714b08);put(F-4,0);r.EAX=m.readUInt32LE(r.ECX);const target=m.readUInt32LE(r.EAX+12);
  call(0x4a60d0,0x477839,F-8,[0],child=>{
    if(target!==actual(0x4a60d0))return boundary(0x4a60d0,child.scratchBase,`actual manager virtual0c target0x${target.toString(16)} is not the recovered setter`);
    const value=m[child.scratchBase+4];m[r.ECX+0x821]=value;
    return {eax:((r.EAX&0xffffff00)|value)>>>0,registers:{ECX:r.ECX,...uint(r.EDX)?{EDX:r.EDX}:{}}};
  });
  put(actual(0x6e6b4c),0);r.EAX=0;return done();
}
