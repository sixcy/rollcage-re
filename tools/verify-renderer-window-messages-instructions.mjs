import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {recordRendererWindowKey,receiveRendererApplicationMessage,dispatchRendererWindowMessage} from '../src/renderer-window-messages.mjs';
import {configureRendererWindows} from '../src/renderer-window-construction.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),cstring=(m,p)=>m.toString('latin1',p,m.indexOf(0,p));
export async function verifyRendererWindowMessages({fixtures=900,output='analysis/renderer-window-messages-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,APP=0x100000,SETTINGS=0x110000,SESSION=0x120000,GRAPHICS=0x130000,HISTORY=0x6fbaf0;
  machine.onInstruction=p=>{reached.add(p);if([0x50d640,0x403570,0x4416a0,0x484bb0,0x40ea40,0x50d9a0,0x50d840,0x402aa0,0x405010].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const patterns=[0x5d0734,0x5d0744,0x5d0754,0x5d076c,0x5d0774,0x5d0784,0x5d0794,0x5d07a4,0x5d07b4,0x5d07c4,0x5d07d4,0x5d07e0,0x5d07ec,0x5d07f8,0x5d0804,0x5d0814,0x5d0820,0x5d0838];
  const platforms=[['PostQuitMessage',0x56e5a4,1],['ShowWindow',0x56e590,2],['DefWindowProcW',0x56e56c,4],['GetStockObject',0x56e040,1],['GetClassInfoExW',0x56e568,3],['CreateWindowExW',0x56e558,12],['GetSystemMetrics',0x56e54c,1]];
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<4;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);put(m,APP,0x570308);put(m,APP+0x14,123);m[APP+0x1c]=1;put(m,0x6efb38,APP);put(m,0x715060,1);put(m,0x5ecefc,SETTINGS);put(m,0x5ecb1c,SESSION);m.fill(0xa7,SETTINGS,SETTINGS+0x100);m.fill(0x96,SESSION,SESSION+0x800);m[SETTINGS+0x82]=Math.floor(fixture/18)%3===0?1:0;put(m,0x5eb518,Math.floor(fixture/18)%2);put(m,0x5ec138,fixture%5);
    put(m,0x6e63d0,3);put(m,0x6e64a4,GRAPHICS);put(m,GRAPHICS+0x2c,640);put(m,GRAPHICS+0x30,480);m[GRAPHICS+0x3c]=fixture%3;
    const bank=0x140000;put(m,0x6f2414,bank);put(m,0x6f2418,bank+[0,35,36][fixture%3]*4);
    m.fill(0x7a,HISTORY,HISTORY+33);let key=0x58;if(fixture%19!==18){const pattern=cstring(m,patterns[fixture%18]);m.write(pattern.slice(1)+'\0',HISTORY,'ascii');key=pattern.charCodeAt(0);if(fixture%2)key-=32;}
    put(m,0x56e244,0xf1000000);put(m,0x56e248,0xf1000004);for(const[,address]of platforms)put(m,address,0xf2000000+address);
    const services=(memory,log)=>{let windows=0;return{libraryCall(name,args,context){log.push([name,args.map(v=>v>>>0),context.scratchBase]);if(name==='_strlwr'){const text=cstring(memory,args[0]);memory.write(text.toLowerCase(),args[0],'latin1');return args[0];}if(name==='strstr'){const i=cstring(memory,args[0]).indexOf(cstring(memory,args[1]));return i<0?0:args[0]+i;}},platformCall(name,args,context){log.push([name,args.map(v=>v>>>0),context.scratchBase]);if(name==='DefWindowProcW')return (0x87654321+fixture)|0;if(name==='CreateWindowExW')return 0x400000+(++windows)*16;if(name==='GetSystemMetrics')return args[0]?600:800;return 1;}};};runtime.services=services(m,trace);runtime.handlers={dynamicCast:(a,b,c,d,e,r)=>{trace.push(['dynamicCast',[a,b,c,d,e]]);if(fixture%31===1)put(m,S+12,0xf170);return a;}};
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,target,n]of[['_strlwr',0xf1000000,1],['strstr',0xf1000004,2]])machine.externalCalls.set(target,x=>{x.r.EAX=native.libraryCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});});
    for(const[name,address,n]of platforms)machine.externalCalls.set(0xf2000000+address,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});x.r.ESP+=n*4;});
    machine.externalCalls.set(0x56932a,x=>{const args=Array.from({length:5},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));nativeTrace.push(['dynamicCast',args]);if(fixture%31===1)put(x.bytes,S+12,0xf170);x.r.EAX=args[0];});
    const run=(entry,args,ecx=APP)=>{machine.entry=entry;machine.r.ESP=S;machine.r.ECX=ecx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;return machine.r.EAX>>>0;};
    const compare=()=>{assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}};
    try{const messages=[2,16,256,0x112,0x218,0x113,0xffffffff],commands=[0xf000,0xf010,0xf020,0xf030,0xf100,0xf130,0xf140,0xf170,0xf101,0xffffffff],message=messages[fixture%messages.length],args=[0x400010,message,message===256?key:commands[Math.floor(fixture/7)%commands.length],fixture*7919];
      if(selector===0){recordRendererWindowKey(key,runtime);run(0x4416a0,[],key);compare();}
      else if(selector===1){assert.equal(receiveRendererApplicationMessage(APP,...args,runtime)>>>0,run(0x403570,args));compare();}
      else if(selector===2){assert.equal(dispatchRendererWindowMessage(...args,runtime)>>>0,run(0x50d640,args));compare();}
      else{assert.equal(configureRendererWindows(APP,2,0,runtime),run(0x50d9a0,[2,0])&255);compare();for(const messageArgs of[[ptr(m,APP+4),256,key,0],[ptr(m,APP+4),0x112,0xf130,0],[ptr(m,APP+4),2,0,0]]){assert.equal(dispatchRendererWindowMessage(...messageArgs,runtime)>>>0,run(0x50d640,messageArgs));compare();}}
    }catch(error){console.error({fixture,selector,key,trace:trace.slice(-24),nativeTrace:nativeTrace.slice(-24)});throw error;}
  }
  const report={method:'Actual50d640 registered callback→403570 Application message receiver→4416a0 reverse history/original cheat toggles→484bb0→40ea40 unavailable sound-bank paths;actual402aa0/405010 getters/RTTI. Persistent actual50d9a0 window producer→three callback messages,all18 patterns/gates/byte-word-DWORDwrites,casefolding,shifted retained history,fullscreen exact command filters,quit/power/fallback. All mapped>=10000h,defined returns,ordered genuine CRT/Win32 requests with childESP and FS restoration. No game mocks/original process/window/message execution. Populated audio feedback remains an explicit separate game-dispatch graph,not classified as OS/library closure.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererWindowMessages({fixtures:Number(process.argv[2]??900)})));

