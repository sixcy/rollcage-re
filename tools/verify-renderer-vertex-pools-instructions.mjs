import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {configureRendererVertexPool,attachRendererVertexPool} from '../src/renderer-vertex-pools.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererVertexPools({fixtures=1200,output='analysis/renderer-vertex-pools-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,VERTEX=0x100000,OLD=0x140000,ALT=0x150000,POOL=0x160000,SECOND=VERTEX+0x100;
  machine.onInstruction=p=>{reached.add(p);if([0x52c9c0,0x52cc70,0x52d380,0x52d370,0x4a32d0,0x4a1fe0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<3;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,VERTEX,VERTEX+0x140);put(m,SECOND,0x5dc364);m.writeUInt16LE(0,SECOND+0x20);put(m,SECOND+0x24,0);put(m,POOL,fixture*7919);put(m,POOL+12,40);put(m,POOL+0x1c,2);put(m,POOL+0x28,0x10000);put(m,POOL+0x2c,fixture%5?ALT:0);put(m,VERTEX,fixture%2?0x5dc364:0x5dc21c);m.writeUInt16LE(fixture%2,VERTEX+0x20);put(m,VERTEX+0x24,fixture%3?OLD:0);put(m,0x715af0,3);put(m,0x715af4,1);put(m,0x715af8,123);
    const counts=[0,1,7,65536,-1,65537],textures=[-1,0,1,2,65536,0x10000001],count=counts[fixture%6],texCount=textures[Math.floor(fixture/6)%6],flags=fixture*7919|0,storage=fixture%3===0||texCount>16?ALT:0;
    const definitions=[['allocate',0x56e258,0xf1000000],['free',0x56e23c,0xf1000004]];for(const[,p,v]of definitions)put(m,p,v);
    const services=(memory,log)=>{let cursor=0x200000;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='allocate'){if(fixture%17===0||args[0]>0x300000)return 0;const p=cursor;cursor+=Math.max(args[0],1)+15&~15;if(cursor>=0x980000)throw Error('Vertex fixture heap bound');memory.fill(0x97,p,cursor);return p;}if(name==='free'){if(fixture%11===0)put(memory,S+20,ALT);if(fixture%13===0)put(memory,VERTEX+0x14,36);}if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);return args[0];}}};};runtime.services=services(m,trace);
    const viewCount=fixture%7+1,viewTex=fixture%3;
    let entry,ecx,args,action;
    if(selector===0){entry=0x52c9c0;ecx=POOL;args=[flags,count,texCount,fixture%3];action=()=>configureRendererVertexPool(POOL,...args,runtime);}
    else if(selector===1){entry=0x52cc70;ecx=VERTEX;args=[flags,viewCount,viewTex,fixture%4,POOL];action=()=>attachRendererVertexPool(VERTEX,...args,runtime);}
    else{entry=0x52c9c0;ecx=POOL;args=[flags,20,viewTex,fixture%3];action=()=>{configureRendererVertexPool(POOL,...args,runtime);attachRendererVertexPool(VERTEX,flags,viewCount,viewTex,0,POOL,runtime);attachRendererVertexPool(SECOND,flags,2,viewTex,1,POOL,runtime);};}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target]of definitions)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,[ptr(x.bytes,x.r.ESP)]);if(result!==undefined)x.r.EAX=result;});machine.externalCalls.set(0x568a50,x=>{x.r.EAX=native.libraryCall('memset',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));});
    const run=(entry,object,args)=>{machine.entry=entry;machine.r.ESP=S;machine.r.ECX=object;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;};
    try{const result=action();run(entry,ecx,args);if(selector!==2)assert.equal(machine.r.EAX&255,result&255);if(selector===2){run(0x52cc70,VERTEX,[flags,viewCount,viewTex,0,POOL]);run(0x52cc70,SECOND,[flags,2,viewTex,1,POOL]);}assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual52c9c0 physical vertex-pool malloc/stride/capacity producer and52cc70 shared-view ownership,actual52d380 logical descriptor/storage and4a32d0 allocator/assertion descendants. Original mask20h physical/logical stride difference,minimum256KiB mode,signed wrapped sizes,retained malloc bytes,refcount/used/free-byte updates and persistent producer followed by two shared views. All mapped>=10000h,defined returns,ordered genuine CRT requests and FS restoration;no game mocks/original process/device execution. Hardware declaration/cache graph remains separate',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererVertexPools({fixtures:Number(process.argv[2]??1200)})));
