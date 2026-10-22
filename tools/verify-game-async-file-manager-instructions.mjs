import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {getGameAsyncFileManager,queueGameAsyncFilePath,trimGameAsyncFilePaths,flushGameAsyncFilePaths,destroyGameAsyncFileManager,destroyGameAsyncFileGuard} from '../src/game-async-file-manager.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);

export async function verifyGameAsyncFileManager({scenarios=24,queues=300,output='analysis/game-async-file-manager-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),instructions=new Map(program.instructions.map(i=>[i.address,i]));
  const listings=[['analysis/async-file-atexit-listing.json','analysis/native-simulation/results/11584-async-file-atexit-bytes.json'],['analysis/async-file-object-exit-listing.json','analysis/native-simulation/results/11585-async-file-object-exit-bytes.json'],['analysis/async-file-lock-exit-listing.json','analysis/native-simulation/results/11587-async-file-lock-exit-complete-bytes.json']];
  for(const [manifest,bytes]of listings)for(const i of(await loadRetainedListing(manifest,bytes)).instructions){const old=instructions.get(i.address);if(old)assert.deepEqual(old,i);else instructions.set(i.address,i);}
  const machine=new BoundedX86([...instructions.values()]),reached=new Set(),visits={};let calls=0,steps=0,mutatedInputs=0,retiredPaths=0;
  machine.onInstruction=p=>{reached.add(p);if([0x4a08f0,0x4a0880,0x4a0b80,0x4a0d20,0x4a0db0,0x56d910,0x56d970,0x40ecc0,0x40eee0,0x40ed50].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let scenario=0;scenario<scenarios;scenario++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),S=[0x9000,0x9200,0x9400][scenario%3],sourceCalls=[],nativeCalls=[],sourceExits=[],nativeExits=[],entryRegisters={EBX:0x13572468,EBP:0x172345,ESI:0x24681357,EDI:0x123456};let activeQueue=-1,reenter=false;
    m.fill(0x36,S-0x1000,S+128);m.fill(0xa7,0x715a20,0x715a90);put(m,0x715a20,scenario&1?0x80:0);put(m,0x714af4,0);m[0x714af8]=0;
    for(let i=0;i<queues*2+32;i++){const p=0x180000+i*32;m.fill(0,p,p+32);m.write(`p${i}`,p,'utf16le');}
    const services=(memory,trace,exits,source)=>{let next=0x300000;return{
      libraryCall(name,args){trace.push([name,...args]);if(name==='operatorNew'){const address=next;next=next+args[0]+31&~15;assert(next<0x580000);memory.fill(0xcd,address,next);if(activeQueue>=0&&scenario%3===1){put(memory,S+4,0x180000+(queues+activeQueue)*32);if(source)mutatedInputs++;}return address;}
        if(name==='operatorDelete'||name==='operatorDeleteArray'){if(name==='operatorDeleteArray'){memory.fill(0xee,args[0],args[0]+32);if(source)retiredPaths++;}return 0;}if(name==='registerExit'){exits.push(args[0]);return 0;}throw Error(`Unknown file-cache CRT${name}`);},
      platformCall(name,args){trace.push([name,...args]);if(name==='InitializeCriticalSectionAndSpinCount'){memory.fill(0x51,args[0],args[0]+24);return 1;}if(name==='GetCurrentThreadId')return 77+scenario;if(name==='EnterCriticalSection'&&reenter&&args[0]===0x715a24)put(memory,0x714af4,0x715a50);if(name==='DeleteCriticalSection')memory.fill(0xdd,args[0],args[0]+24);return 0;}
    };};
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeCalls,nativeExits,false),source=services(m,sourceCalls,sourceExits,true),runtime={memory:m,scratchBase:S,sehWord:0,entryRegisters,services:source};
    const imports=[[0x56e08c,'InitializeCriticalSectionAndSpinCount',2],[0x56e094,'EnterCriticalSection',1],[0x56e09c,'GetCurrentThreadId',0],[0x56e090,'LeaveCriticalSection',1],[0x56e098,'DeleteCriticalSection',1]];
    for(const[i,[slot,name,count]]of imports.entries()){const target=0x591000+i*16;put(m,slot,target);put(machine.bytes,slot,target);machine.externalCalls.set(target,cpu=>{cpu.r.EAX=native.platformCall(name,Array.from({length:count},(_,n)=>ptr(cpu.bytes,cpu.r.ESP+n*4)));cpu.r.ESP+=count*4;});}
    for(const[i,[slot,name]]of [[0x56e220,'operatorNew'],[0x56e210,'operatorDelete'],[0x56e470,'operatorDeleteArray']].entries()){const target=0x592000+i*16;put(m,slot,target);put(machine.bytes,slot,target);machine.externalCalls.set(target,cpu=>{cpu.r.EAX=native.libraryCall(name,[ptr(cpu.bytes,cpu.r.ESP)]);});}
    machine.externalCalls.set(0x56832a,cpu=>{cpu.r.EAX=native.libraryCall('registerExit',[ptr(cpu.bytes,cpu.r.ESP)]);});
    put(m,0x56e478,0x593000);put(machine.bytes,0x56e478,0x593000);machine.externalCalls.set(0x593000,cpu=>{const out=ptr(cpu.bytes,cpu.r.ESP),input=ptr(cpu.bytes,cpu.r.ESP+4),bytes=ptr(cpu.bytes,cpu.r.ESP+8);Buffer.from(cpu.bytes.subarray(input,input+bytes)).copy(cpu.bytes,out);cpu.r.EAX=out;});
    const check=(address,ecx,args,action,mask=0)=>{
      put(m,S,-1);const actual=action();machine.entry=address;machine.r.ESP=S;machine.r.ECX=ecx;machine.r.EAX=machine.r.EDX=0;Object.assign(machine.r,entryRegisters);put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));
      try{steps+=machine.run(8_000_000);}catch(error){throw Error(`scenario${scenario} call${address.toString(16)} native:${error.message}`,{cause:error});}calls++;assert.equal(machine.fs0,0);if(mask)assert.equal(machine.r.EAX&mask,actual&mask);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){let p=0x10000;while(m[p]===machine.bytes[p])p++;throw Error(`scenario${scenario} call${address.toString(16)} diff0x${p.toString(16)} JS=${m.subarray(p,p+24).toString('hex')} native=${machine.bytes.subarray(p,p+24).toString('hex')}`);}assert.deepEqual(sourceCalls,nativeCalls);assert.deepEqual(sourceExits,nativeExits);
    };
    check(0x4a08f0,0,[],()=>getGameAsyncFileManager(runtime),-1);check(0x4a08f0,0,[],()=>getGameAsyncFileManager(runtime),-1);
    put(m,0x714af4,0);put(machine.bytes,0x714af4,0);reenter=scenario%3===0;check(0x4a08f0,0,[],()=>getGameAsyncFileManager(runtime),-1);reenter=false;
    assert.equal(m.readUInt16LE(0x715a72),0xa7a7,'constructor retains upper flag bytes');
    for(let i=0;i<queues;i++){activeQueue=i;const path=0x180000+i*32;check(0x4a0880,0x715a50,[path],()=>queueGameAsyncFilePath(0x715a50,path,runtime));activeQueue=-1;assert(get(m,0x715a84)<=251);assert.equal(get(m,0x715a68),0);assert.equal(get(m,0x715a6c),0);}
    const maximum=[0,1,64,250,0xffffffff][scenario%5];check(0x4a0d20,0x715a50,[maximum],()=>trimGameAsyncFilePaths(0x715a50,maximum,runtime));
    for(const callback of [...sourceExits].reverse()){const action=callback===0x4a0db0?flushGameAsyncFilePaths:callback===0x56d910?destroyGameAsyncFileManager:callback===0x56d970?destroyGameAsyncFileGuard:null;assert(action);check(callback,0,[],()=>action(runtime));}
    assert.equal(get(m,0x715a84),0);assert.equal(get(m,0x715a74),0);assert.equal(m.readUInt16LE(0x715a70),0x100);
  }
  const report={method:'Actual4a08f0 singleton/4a0b80 constructor/4a0880 wide-pointer FIFO/4a0d20 trim, real40ecc0 deque growth and complete original exit callbacks. Caller-declared allocated path inputs, explicit CRT and Win32 critical-section/thread services, allocator mutation of live caller path word and inner-lock singleton publication. All mapped bytes>=10000h, return, FS0 and exact ordered services; no background I/O/original process/thread execution claim.',targetSHA256:program.sha256,scenarios,queuesPerScenario:queues,calls,retiredPaths,mutatedInputs,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output){try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);}}return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyGameAsyncFileManager()));
