import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {constructRendererStateCache,lookupRendererTextureAddressMode,setRendererCachedState,setRendererCachedTexture,setRendererCachedTextureStage,setRendererCachedSampler,getRendererSamplerDefaults,resetRendererSamplerDefaults,resetRendererStateCache,createRendererDeviceCaches,constructRendererDrawCache,setRendererDepthPolicy,initializeRendererDeviceState} from '../src/renderer-state-cache.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererStateCache({fixtures=600,output='analysis/renderer-state-cache-instruction-check.json'}={}) {
  const program=await loadRetainedNativeProgram(), machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  machine.onInstruction=p=>{reached.add(p);if([0x518cb0,0x519050,0x518aa0,0x525840,0x523fd0,0x5243e0,0x525b90,0x527bd0,0x5112e0,0x528f80].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const S=0x9000,CACHE=0x100000,MANAGER=0x110000,CAPS=0x120000,DEVICE=0x130000,VTABLE=0x140000,OWNER=0x150000,ROWS=0x160000,OUT=0x170000;
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<14;selector++) {
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,CACHE,CACHE+0xa00);
    put(m,CACHE,0x5dbfac);put(m,CACHE+8,DEVICE);put(m,CACHE+12,fixture%3?OWNER:0);put(m,CACHE+0x64,fixture*7919);for(let i=0;i<16;i++)put(m,CACHE+0x68+i*4,i+1);
    put(m,MANAGER,0x5db278);put(m,MANAGER+0x364,CACHE);put(m,MANAGER+0x36c,DEVICE);put(m,MANAGER+0x388,fixture%3);put(m,0x56e220,0xf1000000);put(m,0x714ae8,MANAGER);put(m,MANAGER+0x488,CAPS);put(m,MANAGER+0x5b4,fixture*31);put(m,MANAGER+0x5b8,fixture%5+1);put(m,MANAGER+0x5bc,fixture%3+1);put(m,MANAGER+0x5c0,fixture%8+1);m[MANAGER+0x5c4]=fixture%3;
    put(m,CAPS+0x444,fixture%4===0?0:fixture%4===1?0x400:fixture%4===2?0x4000000:0x4000400);
    put(m,OWNER+0x6c,ROWS);put(m,OWNER+0x70,ROWS+(fixture%5)*44);for(let i=0;i<4;i++){put(m,ROWS+i*44+0x24,i);put(m,ROWS+i*44+0x28,(fixture+i)%16);}
    put(m,DEVICE,VTABLE);put(m,DEVICE+16,VTABLE);for(const method of [0xe4,0x104,0x10c,0x114])put(m,VTABLE+method,0xf0000000+method);
    const services=(memory,log)=>{let cursor=0x200000;return {libraryCall(name,args){log.push([name,args,ptr(memory,MANAGER+0x364)]);if(name!=='operatorNew')throw Error(name);if((fixture%11===0&&args[0]===0x9f0)||(fixture%11===1&&args[0]===0x1034))return 0;const p=cursor;cursor+=args[0]+15&~15;memory.fill(0x97,p,cursor);if(args[0]===0x9f0&&fixture%7===0)put(memory,MANAGER+0x36c,DEVICE+16);return p;},direct3DCall(object,method,args){log.push([object,method,args.map(v=>v>>>0)]);if(method===0xe4&&args[1]===9&&fixture%7===0)put(memory,CACHE+0x64,0x12345678);return -1;}};};
    runtime.services=services(m,trace);machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    machine.externalCalls.set(0xf1000000,x=>{x.r.EAX=native.libraryCall('operatorNew',[ptr(x.bytes,x.r.ESP)]);});
    machine.externalCalls.set(0x568a50,x=>{const p=ptr(x.bytes,x.r.ESP);x.bytes.fill(x.bytes[x.r.ESP+4],p,p+ptr(x.bytes,x.r.ESP+8));x.r.EAX=p;});
    for(const[method,n]of[[0xe4,3],[0x104,3],[0x10c,4],[0x114,4]])machine.externalCalls.set(0xf0000000+method,x=>{const args=Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(args[0],method,args);x.r.ESP+=n*4;});
    const stage=fixture%8,state=1+fixture%12,value=(fixture*0x12345)|0;let entry,ecx=0,args,action,result=true;
    if(selector===0){entry=0x523fd0;ecx=CACHE;args=[DEVICE];action=()=>constructRendererStateCache(CACHE,DEVICE,runtime);}
    else if(selector===1){entry=0x518b50;args=[CACHE,fixture%196,value];action=()=>setRendererCachedState(...args,runtime);}
    else if(selector===2){entry=0x518b80;args=[CACHE,stage,fixture%6];action=()=>setRendererCachedTexture(...args,runtime);}
    else if(selector===3){entry=0x518be0;args=[CACHE,stage,state,value];action=()=>setRendererCachedTextureStage(...args,runtime);}
    else if(selector===4){entry=0x518c20;args=[CACHE,stage,state,value];action=()=>setRendererCachedSampler(...args,runtime);}
    else if(selector===5){entry=0x518aa0;ecx=MANAGER;args=[OUT,fixture%3?OUT+4:MANAGER+0x5b8,OUT+8,OUT+12];action=()=>getRendererSamplerDefaults(MANAGER,...args,runtime);result=false;}
    else if(selector===6){entry=0x519050;ecx=CACHE;args=[];action=()=>resetRendererSamplerDefaults(CACHE,runtime);result=false;}
    else if(selector===7){entry=0x518cb0;ecx=CACHE;args=[fixture%4===0?0:fixture%4===1?256:1];action=()=>resetRendererStateCache(CACHE,...args,runtime);result=false;}
    else if(selector===8){entry=0x525840;ecx=OWNER;args=[fixture%6];action=()=>lookupRendererTextureAddressMode(OWNER,...args,runtime);}
    else if(selector===9){entry=0x5243e0;ecx=MANAGER;args=[0x12345678];action=()=>createRendererDeviceCaches(MANAGER,...args,runtime);}
    else if(selector===10){entry=0x525b90;ecx=CACHE;args=[0x87654321];action=()=>constructRendererDrawCache(CACHE,runtime);}
    else if(selector===11){entry=0x528f80;ecx=MANAGER;args=[fixture%6-1];action=()=>setRendererDepthPolicy(MANAGER,...args,runtime);result=false;}
    else if(selector===12){entry=0x5112e0;ecx=MANAGER;args=[];action=()=>initializeRendererDeviceState(MANAGER,runtime);result=false;}
    else {entry=0x5243e0;ecx=MANAGER;args=[0x12345678];action=()=>{createRendererDeviceCaches(MANAGER,...args,runtime);if(ptr(m,MANAGER+0x364))initializeRendererDeviceState(MANAGER,runtime);};result=false;}
    try {const value=action();machine.entry=entry;machine.r.ESP=S;machine.r.ECX=ecx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;if(selector===13&&ptr(machine.bytes,MANAGER+0x364)){machine.entry=0x5112e0;machine.r.ESP=S;machine.r.ECX=MANAGER;put(machine.bytes,S,-1);steps+=machine.run(1000000);calls++;}
      if(result)assert.equal(selector===9?machine.r.EAX&255:machine.r.EAX|0,value|0);assert.deepEqual(nativeTrace,trace);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,entry:entry.toString(16),trace:trace.slice(-8),nativeTrace:nativeTrace.slice(-8)});throw error;}
  }
  const report={method:'Actual5243e0 cache ownership/allocation with523fd0+525b90+527bd0,5112e0 manager initialization+528f80 depth policy;actual523fd0 cache construction,518b50/518b80/518be0/518c20 state/texture/stage/sampler methods,actual525840 texture-mode search,518aa0 live defaults,519050 eight samplers and518cb0 invalidation/full native defaults. Populated optional texture-owner tables, repeated cached state writes, live COM-side mutation, output/settings aliases and low-byte256 invalidate-only. Includes persistent actual5243e0 followed by5112e0 producer/consumer chains, independent first/second allocation failure and allocation-side device-root mutation. All mapped memory>=10000h,defined returns,exact ordered CRT/COM requests; no game mocks/original process/device execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererStateCache({fixtures:Number(process.argv[2]??600)})));
