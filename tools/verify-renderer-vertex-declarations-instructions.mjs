import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRendererVertexDeclarationNode,insertRendererVertexDeclarationNode,getRendererVertexDeclaration} from '../src/renderer-vertex-declarations.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererVertexDeclarations({fixtures=600,output='analysis/renderer-vertex-declarations-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,MANAGER=0x100000,MAP=MANAGER+0xa8c,HEAD=0x110000,ALT=HEAD+0x100,DEVICE=0x120000,VTABLE=0x121000,PAIR=0x130000,OUT=PAIR+32;
  machine.onInstruction=p=>{reached.add(p);if([0x52c3e0,0x52ce40,0x40c640,0x52ce70,0x40c9a0,0x4061e0,0x405d40].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<3;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,HEAD,HEAD+0x200);m.fill(0x97,PAIR,PAIR+64);
    const sentinel=(memory,p)=>{for(let i=0;i<3;i++)put(memory,p+i*4,p);memory.writeUInt16LE(0x101,p+12);};sentinel(m,HEAD);sentinel(m,ALT);put(m,MAP,HEAD);put(m,MAP+4,0);put(m,MANAGER+0x36c,DEVICE);put(m,DEVICE,VTABLE);put(m,VTABLE+0x158,0xf2000158);
    const definitions=[['operatorNew',0x56e220,0xf1000000],['operatorDelete',0x56e210,0xf1000004],['throwBadAlloc',0x56e200,0xf1000008],['throwLengthError',0x56e1f8,0xf100000c]];for(const[,p,v]of definitions)put(m,p,v);
    const services=(memory,log)=>{let cursor=0x200000,allocations=0,decls=0;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'){const p=cursor;cursor+=32;memory.fill(0x93,p,cursor);if(selector===0&&fixture%3===0){put(memory,MAP,ALT);put(memory,PAIR,fixture^0x12345678);put(memory,PAIR+4,0x76543210);}if(selector===2&&allocations===0){if(fixture%17===0)put(memory,MAP,ALT);if(fixture%19===0){const head=ptr(memory,MAP),old=0x380000,f=((S-4)&~7)-32;put(memory,old,head);put(memory,old+4,head);put(memory,old+8,head);memory.writeUInt16LE(1,old+12);put(memory,old+16,ptr(memory,f+0x18));put(memory,old+20,0x345678);for(let i=0;i<3;i++)put(memory,head+i*4,old);put(memory,MAP+4,1);}}allocations++;return p;}if(name.startsWith('throw'))throw Error(name);},direct3DCall(object,method,args){log.push([object,method,args.map(v=>v>>>0)]);put(memory,args[2],fixture%11===0?0:0x300000+decls++*16);return fixture%5===0?-1:0;}};};runtime.services=services(m,trace);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target]of definitions)machine.externalCalls.set(target,x=>{const value=native.libraryCall(name,name==='throwBadAlloc'?[]:[ptr(x.bytes,x.r.ESP)]);if(value!==undefined)x.r.EAX=value;});
    machine.externalCalls.set(0xf2000158,x=>{const args=Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(args[0],0x158,args);x.r.ESP+=12;});
    const run=(entry,object,args)=>{machine.entry=entry;machine.r.ESP=S;machine.r.ECX=object;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;return machine.r.EAX>>>0;};
    const compare=()=>{assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}};
    try{
      if(selector===0){put(m,PAIR,fixture*7919);put(m,PAIR+4,fixture*3559);m.copy(machine.bytes);assert.equal(createRendererVertexDeclarationNode(MAP,PAIR,runtime),run(0x52ce40,MAP,[PAIR]));compare();}
      else if(selector===1){
        const keys=[0x80000000,0,0xffffffff,0x40000000,0xc0000000,3,2,1,2,0x80000000,0x12345678,0xfffffffe];
        for(let i=0;i<keys.length;i++){const key=(keys[(i+fixture)%keys.length]^(fixture&7))>>>0;put(m,PAIR,key);put(m,PAIR+4,fixture+i);put(machine.bytes,PAIR,key);put(machine.bytes,PAIR+4,fixture+i);const node=createRendererVertexDeclarationNode(MAP,PAIR,runtime),nativeNode=run(0x52ce40,MAP,[PAIR]);assert.equal(node,nativeNode);assert.equal(insertRendererVertexDeclarationNode(MAP,OUT,0x87654321,node+16,node,runtime),run(0x52ce70,MAP,[OUT,0x87654321,node+16,node]));compare();}
      }else{
        const masks=[0x37,0,1,2,4,0x10,0x20,3,0x80000001,0x40000037,0x37,0];
        const inputs=[];for(let i=0;i<masks.length;i++){const args=i>=10?inputs[i-10]:[masks[(i+fixture)%masks.length],fixture%31===0&&i===0?260:(i+fixture)%4];inputs.push(args);assert.equal(getRendererVertexDeclaration(MANAGER,...args,runtime),run(0x52c3e0,MANAGER,args));compare();}
      }
    }catch(error){console.error({fixture,selector,trace:trace.slice(-8),nativeTrace:nativeTrace.slice(-8)});throw error;}
  }
  const report={method:'Actual52c3e0 global D3DVERTEXELEMENT9 builder/cache and52ce40/40c640 node ownership,52ce70 unsigned-key duplicate policy,40c9a0 RB insertion with actual4061e0 predecessor/405d40 rotations. Persistent mixed keys including unsigned boundaries,duplicate deletion,cached-null declarations,HRESULT ignored,texture byte wrap260,allocator-side live root/pair mutations. All mapped>=10000h,ordered genuine CRT/COM requests,returns and FS restoration;no game mocks/original process/device execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererVertexDeclarations({fixtures:Number(process.argv[2]??600)})));
