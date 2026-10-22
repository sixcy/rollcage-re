import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRendererVertexBuffer,ensureRendererVertexPool,lockRendererVertexPool,lockRendererVertexBuffer,unlockRendererVertexBuffer} from '../src/renderer-vertex-buffers.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererVertexBuffers({fixtures=600,output='analysis/renderer-vertex-buffers-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,MANAGER=0x100000,POOL=0x110000,VERTEX=0x120000,SECOND=0x120100,DEVICE=0x130000,VTABLE=0x131000,HEAD=0x140000,LIST=0x150000,POOLS=0x151000,CPU=0x160000,GPUTABLE=0x170000;
  const interested=[0x52b6c0,0x52c860,0x52c3e0,0x52ce40,0x52ce70,0x52c9c0,0x52cc70,0x52d380,0x52c7c0,0x52ca80,0x52cb20,0x4a2290,0x4a1fe0,0x40ebc0];
  machine.onInstruction=p=>{reached.add(p);if(interested.includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<7;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,CPU,CPU+0x10000);m.fill(0x97,0x600000,0x650000);
    put(m,0x714ae8,MANAGER);put(m,MANAGER+0x36c,DEVICE);put(m,DEVICE,VTABLE);for(const method of[0x68,0x158])put(m,VTABLE+method,0xf2000000+method);for(const method of[0x2c,0x30])put(m,GPUTABLE+method,0xf2000000+method);
    put(m,MANAGER+0xa8c,HEAD);for(let i=0;i<3;i++)put(m,HEAD+i*4,HEAD);m.writeUInt16LE(0x101,HEAD+12);
    put(m,MANAGER+0x584,LIST);put(m,MANAGER+0x588,LIST+8);put(m,MANAGER+0x58c,LIST+(fixture%2?8:64));put(m,LIST,VERTEX);put(m,LIST+4,SECOND);
    put(m,MANAGER+0x590,POOLS);put(m,MANAGER+0x594,POOLS+4);put(m,MANAGER+0x598,POOLS+(fixture%2?4:64));put(m,POOLS,POOL);
    const flags=[1,0x21,0x37,0x1f,0x3f,0,0xb][fixture%7],texCount=fixture%3,physical=(flags&1?12:0)+(flags&0x20?16:0)+(flags&2?12:0)+(flags&4?4:0)+(flags&0x10?24:0)+(flags&8?texCount*8:0),logical=physical-(flags&0x20?16:0),gpu=0x400000;
    put(m,POOL,2);put(m,POOL+4,selector===0||selector!==3&&selector!==5&&fixture%3===0?0:gpu);put(m,POOL+8,0x456700);put(m,POOL+12,physical);put(m,POOL+0x10,fixture%3);put(m,POOL+0x14,flags);put(m,POOL+0x18,texCount);put(m,POOL+0x1c,2);put(m,POOL+0x20,fixture%4);put(m,POOL+0x24,0x4000);put(m,POOL+0x28,0x3000);put(m,POOL+0x2c,CPU);put(m,gpu,GPUTABLE);
    for(const v of[VERTEX,SECOND]){m.fill(0x93,v,v+0x5c);put(m,v,0x5dc21c);m.writeUInt16LE(fixture%4,v+10);m.writeUInt16LE(32,v+0x1e);m.writeUInt16LE(0,v+0x20);put(m,v+0x14,logical);put(m,v+0x24,CPU);put(m,v+0x2c,v===SECOND&&fixture%2?POOL+0x100:POOL);put(m,v+0x30,0);put(m,v+0x34,2);put(m,v+0x38,fixture%12);put(m,v+0x3c,fixture%4);put(m,v+0x40,1+fixture%5);m[v+0x44]=fixture%2;put(m,v+0x48,selector===5?fixture%4:0);}
    if(selector===1||selector===6)put(m,POOL+0x20,0);
    if(selector===5&&fixture%5===0)put(m,VERTEX+0x30,CPU+0x100);
    put(m,0x715af0,3);put(m,0x715af4,1);put(m,0x715af8,123);const lazyDebugger=selector===5&&fixture%16===9;put(m,0x715b08,lazyDebugger?0:3);put(m,0x714afc,lazyDebugger?0:0x715b30);
    const ALT_MANAGER=MANAGER+0x1000;put(m,ALT_MANAGER+0x36c,DEVICE);put(m,ALT_MANAGER+0xa8c,HEAD+0x100);for(let i=0;i<3;i++)put(m,HEAD+0x100+i*4,HEAD+0x100);m.writeUInt16LE(0x101,HEAD+0x10c);put(m,ALT_MANAGER+0x584,LIST);put(m,ALT_MANAGER+0x588,LIST+8);
    const definitions=[['operatorNew',0x56e220,0xf1000000],['operatorDelete',0x56e210,0xf1000004],['allocate',0x56e258,0xf1000008],['free',0x56e23c,0xf100000c]];for(const[,p,v]of definitions)put(m,p,v);put(m,0x56e478,0xf1000010);
    const services=(memory,log)=>{let cursor=0x200000,created=0,locks=0;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'||name==='allocate'){const p=cursor;cursor+=Math.max(args[0],1)+15&~15;if(cursor>=0x390000)throw Error('Vertex fixture heap bound');memory.fill(0x93,p,cursor);if(name==='operatorNew'&&args[0]===0x5c&&fixture%11===0)put(memory,S+4,flags^0x20);if(name==='operatorNew'&&(args[0]===12||args[0]===0x30)&&fixture%23===1)put(memory,S-16,SECOND);return p;}if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);return args[0];}if(name==='memcpy'||name==='memmove'){Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);if(selector===5&&name==='memcpy'&&fixture%19===3)put(memory,VERTEX+0x40,1);return args[0];}},platformCall(name,args){log.push([name,args]);return name==='GetCurrentThreadId'?37:1;},direct3DCall(object,method,args){log.push([object,method,args.map(v=>v>>>0)]);if(method===0x68){if(fixture%13===0)return 1;const resource=0x400000+(++created)*0x100;put(memory,resource,GPUTABLE);put(memory,args[5],resource);if(fixture%29===1)put(memory,0x714ae8,ALT_MANAGER);return 0;}if(method===0x158){put(memory,args[2],fixture%11?0x480000:0);return fixture%5?-1:0;}if(method===0x2c){locks++;if(fixture%17===0||fixture%7===0&&locks%2===1){put(memory,args[3],0x600100);if(fixture%7===0)put(memory,POOL+12,ptr(memory,POOL+12)+4);return -1;}put(memory,args[3],0x600000+((object-0x400000)>>>8)*0x4000+args[1]);return 0;}return 0;}};};runtime.services=services(m,trace);
    const platforms=[['InitializeCriticalSectionAndSpinCount',0x56e08c,2],['EnterCriticalSection',0x56e094,1],['GetCurrentThreadId',0x56e09c,0],['LeaveCriticalSection',0x56e090,1]];for(const[,address,n]of platforms)put(m,address,0xf3000000+address);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target]of definitions)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,[ptr(x.bytes,x.r.ESP)]);if(result!==undefined)x.r.EAX=result;});
    for(const[name,target]of[['memcpy',0x568a48],['memmove',0xf1000010],['memset',0x568a50]])machine.externalCalls.set(target,x=>{x.r.EAX=native.libraryCall(name,Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});
    machine.externalCalls.set(0x56832a,x=>{const value=native.libraryCall('registerExit',[ptr(x.bytes,x.r.ESP)]);if(value!==undefined)x.r.EAX=value;});
    for(const[name,address,n]of platforms)machine.externalCalls.set(0xf3000000+address,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));x.r.ESP+=n*4;});
    for(const[method,n]of[[0x68,7],[0x158,3],[0x2c,5],[0x30,1]])machine.externalCalls.set(0xf2000000+method,x=>{const args=Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(args[0],method,args);x.r.ESP+=n*4;});
    const run=(entry,object,args)=>{machine.entry=entry;machine.r.ESP=S;machine.r.ECX=object;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;return machine.r.EAX>>>0;};
    const compare=()=>{assert.equal(machine.fs0,0);const filter=rows=>rows.filter(([name])=>name!=='memmove');assert.deepEqual(filter(nativeTrace),filter(trace));if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}};
    try{
      if(selector===0){assert.equal(ensureRendererVertexPool(POOL,runtime),run(0x52c860,POOL,[])&255);compare();}
      else if(selector===1||selector===2){const args=[flags,fixture%5+1,texCount,selector===1?0:fixture%3+1];assert.equal(createRendererVertexBuffer(MANAGER,...args,runtime),run(0x52b6c0,MANAGER,args));compare();}
      else if(selector===3){const args=[fixture%5,fixture%7,fixture%3===0?257:fixture%3,fixture%2];assert.equal(lockRendererVertexPool(POOL,...args,runtime),run(0x52c7c0,POOL,args));compare();}
      else if(selector===4){const args=[fixture%5,fixture%4===0?0:fixture%7+1,fixture%3,fixture%2];assert.equal(lockRendererVertexBuffer(VERTEX,...args,runtime),run(0x52ca80,VERTEX,args)&255);compare();}
      else if(selector===5){const args=[fixture%3===0?257:fixture%3];unlockRendererVertexBuffer(VERTEX,...args,runtime);run(0x52cb20,VERTEX,args);compare();}
      else{const args=[flags,16,texCount,fixture%2];const vertex=createRendererVertexBuffer(MANAGER,...args,runtime);assert.equal(vertex,run(0x52b6c0,MANAGER,args));compare();for(let tick=0;tick<4;tick++){m[vertex+0x44]=tick%2;machine.bytes[vertex+0x44]=tick%2;const lockArgs=[tick,4,tick%2,1];const locked=lockRendererVertexBuffer(vertex,...lockArgs,runtime);assert.equal(locked,run(0x52ca80,vertex,lockArgs)&255);compare();if(locked){for(const memory of[m,machine.bytes]){const p=ptr(memory,vertex+0x24)+Math.imul(ptr(memory,vertex+0x14),tick);memory.fill((fixture+tick)&255,p,p+Math.imul(ptr(memory,vertex+0x14),4));}}unlockRendererVertexBuffer(vertex,1,runtime);run(0x52cb20,vertex,[1]);compare();}}
    }catch(error){console.error({fixture,selector,flags,texCount,trace:trace.slice(-16),nativeTrace:nativeTrace.slice(-16)});throw error;}
  }
  const report={method:'Actual52b6c0 ownership constructor,52c860 hardware/declaration propagation,52c7c0 retry locks,52ca80/52cb20 view lock/unlock and actual52d380/52c9c0/52cc70/declaration/map/vector/math descendants. Persistent constructor→four lock/caller-write/unlock frames,shared pool reuse,physical/logical stride mismatch,COM errors/positive HRESULT,borrowed storage and exact low-byte flags. All mapped>=10000h,defined returns,ordered genuine CRT/COM requests and FS restoration;no game mocks/original process/device execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererVertexBuffers({fixtures:Number(process.argv[2]??600)})));



