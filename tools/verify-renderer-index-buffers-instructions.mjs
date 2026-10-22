import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRendererIndexBuffer,ensureRendererIndexBuffer,lockRendererIndexBuffer,unlockRendererIndexBuffer} from '../src/renderer-index-buffers.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererIndexBuffers({fixtures=900,output='analysis/renderer-index-buffers-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,BUFFER=0x100000,MANAGER=0x110000,DEVICE=0x120000,VTABLE=0x130000,CPU=0x140000,GPU=0x150000,GPUTABLE=0x151000,DATA=0x160000;
  machine.onInstruction=p=>{reached.add(p);if([0x52c650,0x52cde0,0x52ccd0,0x52cd40,0x4a1fe0,0x40ebc0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<5;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,CPU,CPU+256);m.fill(0x97,DATA,DATA+256);
    put(m,BUFFER,0x5dc1ec);put(m,BUFFER+4,CPU);put(m,BUFFER+8,CPU+fixture%17*2);put(m,BUFFER+12,32);put(m,BUFFER+0x14,selector===3&&fixture%4===0?GPU:fixture%3?GPU:0);put(m,BUFFER+0x18,selector===3&&fixture%4===0?CPU:0);put(m,BUFFER+0x1c,fixture%8);put(m,BUFFER+0x20,fixture%12);put(m,BUFFER+0x24,fixture%4);m[BUFFER+0x28]=fixture%2;
    put(m,0x714ae8,MANAGER);put(m,MANAGER+0x36c,DEVICE);put(m,DEVICE,VTABLE);put(m,VTABLE+0x6c,0xf200006c);put(m,GPU,GPUTABLE);put(m,GPUTABLE+0x2c,0xf200002c);put(m,GPUTABLE+0x30,0xf2000030);put(m,0x715af0,3);put(m,0x715af4,1);put(m,0x715af8,123);
    const definitions=[['operatorNew',0x56e220,0xf1000000],['operatorDelete',0x56e210,0xf1000004],['allocate',0x56e258,0xf1000008]];for(const[,p,v]of definitions)put(m,p,v);put(m,0x56e478,0xf100000c);
    const services=(memory,log)=>{let cursor=0x200000;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='allocate'&&selector===1&&fixture%11===0)return 0;if(name==='operatorNew'||name==='allocate'){const p=cursor;cursor+=Math.max(args[0],1)+15&~15;memory.fill(0x93,p,cursor);if(name==='allocate'&&fixture%13===0)put(memory,S+4,0x12345678);return p;}if(name==='memcpy'||name==='memmove'){Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);return args[0];}},direct3DCall(object,method,args){log.push([object,method,args.map(v=>v>>>0)]);if(method===0x6c){if(fixture%5===0)return -1;put(memory,args[5],GPU);return 0;}if(method===0x2c){if(fixture%7===0)return -1;put(memory,args[3],DATA+args[1]);}return 0;}};};runtime.services=services(m,trace);
    let entry,ecx=BUFFER,args=[],action,mask=0,constructed;
    const offset=fixture%8,count=fixture%4===0?0:1+fixture%9;
    const write=(memory,buffer)=>{const p=ptr(memory,buffer+4)+offset*2;for(let i=0;i<8;i++)memory.writeUInt16LE((fixture*31+i)&65535,p+i*2);};
    if(selector===0){entry=0x52cde0;action=()=>ensureRendererIndexBuffer(BUFFER,runtime);mask=255;}
    else if(selector===1){entry=0x52c650;ecx=MANAGER;args=[fixture%4,16+fixture%17];action=()=>createRendererIndexBuffer(MANAGER,...args,runtime);mask=-1;}
    else if(selector===2){entry=0x52ccd0;args=[offset,count,0x12345678,0x87654321];action=()=>lockRendererIndexBuffer(BUFFER,...args,runtime);mask=255;}
    else if(selector===3){entry=0x52cd40;args=[fixture%3===0?257:fixture%3,0x12345678];action=()=>unlockRendererIndexBuffer(BUFFER,...args,runtime);}
    else{entry=0x52c650;ecx=MANAGER;args=[fixture%4,32];action=()=>{constructed=createRendererIndexBuffer(MANAGER,...args,runtime);lockRendererIndexBuffer(constructed,offset,8,0,0,runtime);write(m,constructed);unlockRendererIndexBuffer(constructed,1,0,runtime);};}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target]of definitions)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,[ptr(x.bytes,x.r.ESP)]);if(result!==undefined)x.r.EAX=result;});
    machine.externalCalls.set(0x568a48,x=>{x.r.EAX=native.libraryCall('memcpy',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});machine.externalCalls.set(0xf100000c,x=>{x.r.EAX=native.libraryCall('memmove',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});
    for(const[method,n]of[[0x6c,7],[0x2c,5],[0x30,1]])machine.externalCalls.set(0xf2000000+method,x=>{const args=Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(args[0],method,args);x.r.ESP+=n*4;});
    const run=(address,object,args)=>{machine.entry=address;machine.r.ESP=S;machine.r.ECX=object;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;};
    try{const value=action();run(entry,ecx,args);if(mask)assert.equal(machine.r.EAX&mask,value&mask);if(selector===4){const buffer=machine.r.EAX>>>0;assert.equal(buffer,constructed);run(0x52ccd0,buffer,[offset,8,0,0]);write(machine.bytes,buffer);run(0x52cd40,buffer,[1,0]);}
      assert.equal(machine.fs0,0);const filtered=rows=>rows.filter(([name])=>name!=='memmove');assert.deepEqual(filtered(nativeTrace),filtered(trace));
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace:trace.slice(-12),nativeTrace:nativeTrace.slice(-12)});throw error;}
  }
  const report={method:'Actual52c650 index-buffer CPU/storage-list producer,52cde0 Direct3D ownership,52ccd0 lock and52cd40 unlock/copy. Persistent constructor→lock→declared caller index writes→unlock cases;usage/pool flags,live constructor flags mutation,hardware failure,borrowed storage,failed locks,raw offsets and low-byte update flag,actual busy-gate allocation assertion. All mapped>=10000h,defined returns,ordered genuine CRT/COM requests and FS restoration;no game mocks/original process/device execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererIndexBuffers({fixtures:Number(process.argv[2]??900)})));
