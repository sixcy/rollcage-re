import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {allocateZeroedGameBuffer} from '../src/game-buffer-allocation.mjs';
import {reportGameAssertion,getGameAssertionCategory,appendIgnoredGameAssertion} from '../src/game-assertion.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),string=(m,p)=>m.toString('latin1',p,m.indexOf(0,p));
export async function verifyGameBufferAllocation({fixtures=1200,output='analysis/game-buffer-allocation-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0,breakpoints=0,observedTrap,observedSteps=0;
  const S=0x9000,FILE=0x100000,FORMAT=0x100100,PAIR=0x100200,ROWS=0x110000;
  machine.onInstruction=p=>{observedSteps++;reached.add(p);if([0x4a32d0,0x4a1fe0,0x4a0e10,0x4a2490,0x4a2860,0x4a0e90].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;if(p===0x4a3301){observedTrap=p;const error=Error('Native fixture breakpoint');error.address=p;error.name='NativeGameBreakpoint';throw error;}};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<4;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.write('fixture-source.cpp\0',FILE);m.write('Assertion value %d\0',FORMAT);
    const line=fixture%37,bytes=fixture%8192,size=fixture%4,capacity=fixture%2?size:size+2;
    put(m,0x715af0,fixture%13===0?0:3);put(m,0x715af4,fixture%11===0?1:0);put(m,0x715af8,0x1234);put(m,0x715afc,capacity?ROWS:0);put(m,0x715b00,capacity?ROWS+size*8:0);put(m,0x715b04,capacity?ROWS+capacity*8:0);
    for(let i=0;i<4;i++){put(m,ROWS+i*8,fixture%5===0&&i===0?FILE:FILE+16);put(m,ROWS+i*8+4,i===0?line:line+1);}put(m,PAIR,FILE);put(m,PAIR+4,line);
    put(m,0x715b08,fixture%17===0?0:3);put(m,0x714afc,fixture%17===0?0:0x715b30);m[0x715b54]=fixture%3===0?0:1;put(m,0x715ae8,fixture%2);put(m,0x715aec,42);
    const imports=[['allocate',0x56e258,0xf1000000,1],['operatorNew',0x56e220,0xf1000004,1],['operatorDelete',0x56e210,0xf1000008,1],['operatorNewArray',0x56e474,0xf100000c,1],['operatorDeleteArray',0x56e470,0xf1000010,1],['_vsnprintf',0x56e228,0xf1000014,4]];
    const platforms=[['GetCurrentThreadId',0x56e09c,0xf2000000,0],['IsDebuggerPresent',0x56e190,0xf2000004,0],['MessageBoxW',0x56e59c,0xf2000008,4],['MultiByteToWideChar',0x56e0c0,0xf200000c,6],['InitializeCriticalSectionAndSpinCount',0x56e08c,0xf2000010,2],['EnterCriticalSection',0x56e094,0xf2000014,1],['LeaveCriticalSection',0x56e090,0xf2000018,1]];
    for(const[,p,v]of[...imports,...platforms])put(m,p,v);
    const services=(memory,log)=>{let cursor=0x200000;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='allocate'&&selector===0&&fixture%3===0)return 0;if(['allocate','operatorNew','operatorNewArray'].includes(name)){const p=cursor;cursor+=Math.max(args[0],1)+15&~15;memory.fill(0x93,p,cursor);return p;}
      if(name==='_vsnprintf'){let index=0;const text=string(memory,args[2]).replace(/%([sdiu%])/g,(all,kind)=>{if(kind==='%')return '%';const v=ptr(memory,args[3]+index++*4);return kind==='s'?string(memory,v):kind==='u'?String(v):String(v|0);});memory.write(text.slice(0,args[1]-1)+'\0',args[0],'latin1');return text.length;}
      if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);return args[0];}
      if(name==='memcpy'||name==='memmove'){Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);return args[0];}
      return 0;
    },platformCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='GetCurrentThreadId')return 77;if(name==='IsDebuggerPresent')return fixture%2;if(name==='MultiByteToWideChar'){for(let i=0;i<Math.min(args[3],args[5]);i++)memory.writeUInt16LE(memory[args[2]+i],args[4]+i*2);return args[3];}
      if(name==='MessageBoxW'){const wide=p=>{let e=p;while(memory.readUInt16LE(e))e+=2;return memory.toString('utf16le',p,e);};log.push(['dialog',wide(args[1]),wide(args[2]),args[3]]);return fixture%2?[3,4,5,6][Math.floor(fixture/2)%4]:[1,2][Math.floor(fixture/2)%2];}return 1;}};};runtime.services=services(m,trace);
    let entry,ecx=0,args,action,mask=255;
    if(selector===0){entry=0x4a32d0;ecx=bytes;args=[];action=()=>allocateZeroedGameBuffer(bytes,runtime);mask=-1;}
    else if(selector===1){entry=0x4a1fe0;args=[FILE,line,FORMAT,fixture*-7919];action=()=>reportGameAssertion(FILE,line,FORMAT,[fixture*-7919],runtime);}
    else if(selector===2){entry=0x4a0e10;args=[0x12345678,0x87654321];action=()=>getGameAssertionCategory(runtime);mask=-1;}
    else{entry=0x4a2490;args=[size&&fixture%2?ROWS+(fixture%size)*8:PAIR];action=()=>appendIgnoredGameAssertion(args[0],runtime);mask=0;}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target,n]of imports)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));if(result!==undefined)x.r.EAX=result;});
    for(const[name,,target,n]of platforms)machine.externalCalls.set(target,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));x.r.ESP+=n*4;});
    machine.externalCalls.set(0x56832a,x=>{x.r.EAX=native.libraryCall('registerExit',[ptr(x.bytes,x.r.ESP)]);});
    for(const[address,name]of[[0x568a48,'memcpy'],[0x568a50,'memset']])machine.externalCalls.set(address,x=>{x.r.EAX=native.libraryCall(name,Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});
    machine.externalCalls.set(0x568980,x=>{x.r.ESP-=x.r.EAX;});machine.externalCalls.set(0x568162,()=>{});
    try{let actual,sourceTrap,nativeTrap;try{actual=action();}catch(error){if(error.name!=='NativeGameBreakpoint')throw error;sourceTrap=error.address;}
      observedTrap=undefined;observedSteps=0;machine.entry=entry;machine.r.ESP=S;machine.r.ECX=ecx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));try{steps+=machine.run(2000000);}catch(error){if(observedTrap===undefined)throw error;nativeTrap=observedTrap;steps+=observedSteps;}
      assert.equal(nativeTrap,sourceTrap);if(nativeTrap)breakpoints++;else if(mask)assert.equal(machine.r.EAX&mask,actual&mask);calls++;assert.equal(machine.fs0,0);
      const filter=log=>log.filter(([name])=>!['memcpy','memmove'].includes(name));assert.deepEqual(filter(nativeTrace),filter(trace));
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,entry:entry.toString(16),args,trace:trace.slice(-16),nativeTrace:nativeTrace.slice(-16)});throw error;}
  }
  const report={method:'Actual4a32d0 CRT malloc/zero-fill/null assertion wrapper and full4a1fe0 serialized assertion/ignore/dialog policy,actual4a0e10 category/debugger construction and4a2490 ignore-vector alias/growth/copy graph. Successful/zero allocation,held compare-exchange gate,existing ignore pairs,new ignore responses,debugger retry breakpoint,nondebugger dialogs and lazy debugger construction. All mapped>=10000h,defined returns or actual INT3 location,ordered genuine CRT/platform/dialog payloads,FS restoration. Serialized fixtures are not original-thread concurrency/process/window execution.',targetSha256:program.sha256,fixtures,calls,breakpoints,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyGameBufferAllocation({fixtures:Number(process.argv[2]??1200)})));
