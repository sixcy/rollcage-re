import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeRendererDrawQueue,createRendererWorkerTreeHead,constructRendererWorkerLock,constructRendererWorkerBlock,constructRendererWorkerState} from '../src/renderer-startup-storage.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererStartupStorage({fixtures=900,output='analysis/renderer-startup-storage-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,OBJECT=0x100000,ALT=0x180000,entries=[0x51de80,0x530da0,0x530380,0x530320,0x530480];
  machine.onInstruction=p=>{reached.add(p);if([...entries,0x5688c0,0x4a1fe0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<5;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0xa7,OBJECT,OBJECT+0x200);m.fill(0x97,ALT,ALT+128);put(m,0x715af0,3);put(m,0x715af4,1);put(m,0x715af8,123);
    const definitions=[['operatorNew',0x56e220,0xf1000000],['operatorNewArray',0x56e474,0xf1000004],['allocate',0x56e258,0xf1000008],['throwBadAlloc',0x56e200,0xf100000c]];for(const[,p,v]of definitions)put(m,p,v);
    const platforms=[['CreateMutexA',0x56e0b4,3],['CreateEventA',0x56e0a8,4]];for(const[,address]of platforms)put(m,address,0xf2000000+address);
    const services=(memory,log)=>{let cursor=0x200000,allocations=0,handles=0,memsets=0;return{libraryCall(name,args,context){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'||name==='operatorNewArray'||name==='allocate'){if(selector===0&&name==='operatorNewArray'&&fixture%7===0)put(memory,OBJECT+0x1c,3);if(name==='allocate'&&++allocations===(fixture%5===0?2:fixture%7===0?1:0))return 0;const p=cursor;cursor+=Math.min(Math.max(args[0],1),0x10000)+15&~15;memory.fill(0x93,p,cursor);return p;}if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);if(++memsets===1&&fixture%11===0)put(memory,OBJECT+0x1c,2);if(memsets===3&&fixture%13===0)put(memory,OBJECT+8,ALT);return args[0];}},platformCall(name,args,context){log.push([name,args.map(v=>v>>>0),context.scratchBase]);const result=fixture%9===0?0:0x400000+(++handles)*16;if(selector===2&&handles===2)put(memory,OBJECT+4,0x12345678);return result;}};};runtime.services=services(m,trace);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target]of definitions)machine.externalCalls.set(target,x=>{const value=native.libraryCall(name,name==='throwBadAlloc'?[]:[ptr(x.bytes,x.r.ESP)],{scratchBase:x.r.ESP-4});if(value!==undefined)x.r.EAX=value;});
    machine.externalCalls.set(0x568a50,x=>{x.r.EAX=native.libraryCall('memset',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});});
    for(const[name,address,n]of platforms)machine.externalCalls.set(0xf2000000+address,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});x.r.ESP+=n*4;});
    const counts=[0,1,7,0x40000000],records=[0,1,7,0xaaaaaab],args=selector===0?[counts[fixture%4],records[Math.floor(fixture/4)%4],fixture*7919,0x12345678]:[];
    machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=OBJECT;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));
    try{let result;if(selector===0)result=initializeRendererDrawQueue(OBJECT,...args,runtime);else if(selector===1)result=createRendererWorkerTreeHead(runtime);else if(selector===2)result=constructRendererWorkerLock(OBJECT,runtime);else if(selector===3)result=constructRendererWorkerBlock(OBJECT,runtime);else result=constructRendererWorkerState(OBJECT,runtime);steps+=machine.run(1000000);calls++;if(selector)assert.equal(machine.r.EAX>>>0,result>>>0);assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual51de80 draw-queue arrays/capacity/three-live-memset producer,530da0 sentinel,530380 Win32 mutex/event producer,530320 block and530480 state constructor through actual compiler5688c0 two-game-constructor loop. Signed-width/wrapped sizes,array multiplication overflow,zero/null handles,second malloc failure with actual busy-gate assertion,callback capacity/last-root changes and preserved uninitialized storage. All mapped>=10000h,defined returns,exact CRT/Win32 requests including platform childESP and FS restoration;no game mocks/original process/device/thread execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererStartupStorage({fixtures:Number(process.argv[2]??900)})));

