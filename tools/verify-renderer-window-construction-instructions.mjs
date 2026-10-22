import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {registerRendererWindowClass,createRendererWindows,configureRendererWindows} from '../src/renderer-window-construction.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererWindowConstruction({fixtures=900,output='analysis/renderer-window-construction-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,APP=0x100000,SETTINGS=0x110000;
  machine.onInstruction=p=>{reached.add(p);if([0x50d750,0x50d840,0x50d9a0,0x405010,0x402fa0,0x402e60,0x402e70,0x402940].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const definitions=[['GetClassInfoExW',0x56e568,3],['LoadIconW',0x56e564,2],['LoadCursorW',0x56e560,2],['RegisterClassExW',0x56e55c,1],['GetSystemMetrics',0x56e54c,1],['AdjustWindowRectEx',0x56e554,4],['CreateWindowExW',0x56e558,12],['ShowWindow',0x56e590,2],['GetStockObject',0x56e040,1],['InitializeCriticalSectionAndSpinCount',0x56e08c,2],['EnterCriticalSection',0x56e094,1],['LeaveCriticalSection',0x56e090,1],['GetCurrentThreadId',0x56e09c,0]];
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<4;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,APP,APP+0x100);put(m,APP,0x570308);put(m,APP+0x14,0x12345678);m[APP+0x1c]=selector===2&&fixture%17===0?0:1;put(m,0x6e63d0,3);put(m,0x6e64a4,SETTINGS);put(m,SETTINGS+0x24,fixture*-17);put(m,SETTINGS+0x28,fixture*19);put(m,SETTINGS+0x2c,fixture%3?1024:0);put(m,SETTINGS+0x30,fixture%4?768:0);m[SETTINGS+0x3c]=fixture%2;
    if(fixture%23===0){put(m,0x6e63d0,0);put(m,0x6e64a4,0);}
    for(const[,address]of definitions)put(m,address,0xf2000000+address);
    const services=(memory,log)=>{let windows=0;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);return args[0];}},platformCall(name,args,context){const relevant=!name.includes('CriticalSection')&&name!=='GetCurrentThreadId';log.push([name,args.map(v=>v>>>0),...(relevant?[context.scratchBase]:[])]);
      if(name==='GetClassInfoExW'){memory.fill(0x87,args[2],args[2]+48);if(fixture%11===0)put(memory,APP+0x14,0x87654321);return fixture%3===0?1:0;}
      if(name==='LoadIconW')return 0x400001;if(name==='LoadCursorW')return 0x400002;if(name==='RegisterClassExW')return fixture%5===0?0x10000:0x12340065;
      if(name==='GetStockObject')return [0,4,24,25,-1][fixture%5];if(name==='GetSystemMetrics')return args[0]===0?800+fixture:600+fixture;
      if(name==='AdjustWindowRectEx'){put(memory,args[0],-8);put(memory,args[0]+4,-30);put(memory,args[0]+8,ptr(memory,args[0]+8)+8);put(memory,args[0]+12,ptr(memory,args[0]+12)+8);return 1;}
      if(name==='CreateWindowExW')return fixture%13===0?0:0x500000+(++windows)*16;if(name==='GetCurrentThreadId')return 37;return 1;
    }};};runtime.services=services(m,trace);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,address,n]of definitions)machine.externalCalls.set(0xf2000000+address,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});x.r.ESP+=n*4;});
    machine.externalCalls.set(0x568a50,x=>{x.r.EAX=native.libraryCall('memset',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});machine.externalCalls.set(0x56832a,x=>{native.libraryCall('registerExit',[ptr(x.bytes,x.r.ESP)]);});
    const run=(entry,args)=>{machine.entry=entry;machine.r.ESP=S;machine.r.ECX=APP;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;return machine.r.EAX&255;};
    const compare=()=>{assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}};
    try{if(selector===0){const brush=[0,4,24,25,-1][fixture%5];assert.equal(registerRendererWindowClass(APP,brush,runtime),run(0x50d750,[brush]));compare();}
      else if(selector===1){const args=[0x12345678,fixture*-17,fixture*19,fixture%3?1024:0,fixture%4?768:0,fixture%2,fixture%5,fixture%3];assert.equal(createRendererWindows(APP,...args,runtime),run(0x50d840,args));compare();}
      else{const args=[fixture%5,fixture%3];assert.equal(configureRendererWindows(APP,...args,runtime),run(0x50d9a0,args));compare();if(selector===3){const p=ptr(m,0x6e64a4);m[p+0x3c]^=1;machine.bytes[p+0x3c]^=1;assert.equal(configureRendererWindows(APP,2,1,runtime),run(0x50d9a0,[2,1]));compare();}}
    }catch(error){console.error({fixture,selector,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual50d9a0 parent→50d750 class producer→50d840 windows,actual Application402e60 title/402e70 icon/402940 menu getters and405010 settings including lazy constructor. Fullscreen parent/array behavior,count0,border adjustment,missing width/height metrics,registerATOMlowword,class reuse/failure,window failure,retained fullscreen DWORDpadding,liveinstance changes and persistent mode switch. All mapped>=10000h,defined AL,ordered CRT/Win32 calls with window-service native childESP,FS restored;no game mocks/original process/window/device execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererWindowConstruction({fixtures:Number(process.argv[2]??900)})));
