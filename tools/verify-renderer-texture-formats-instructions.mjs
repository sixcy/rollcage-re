import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {reserveRendererTextureFormats,appendRendererTextureFormat,describeRendererTextureFormat,chooseRendererTextureFormatIndex,enumerateRendererTextureFormats,rendererComponentReductionShift} from '../src/renderer-texture-formats.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererTextureFormats({fixtures=1200,output='analysis/renderer-texture-formats-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const entries=[0x521180,0x520f90,0x5115f0,0x51f6b0,0x51fa00,0x511500],S=0x9000,MANAGER=0x100000,CAPS=0x110000,OBJECT=0x120000,VTABLE=0x130000,VECTOR=MANAGER+0x4c0,ROWS=0x150000,INPUT=0x160000,OUT=0x170000;
  machine.onInstruction=p=>{reached.add(p);if([...entries,0x521260,0x521300].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const formats=[20,21,22,23,24,25,26,30,0x31545844,0x33545844,0x35545844,0x32545844,0x34545844,113,116];
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<entries.length;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,ROWS,ROWS+36*40);m.fill(0x97,OUT,OUT+40);
    let size=fixture%4,capacity=fixture%2?size:size+3;if(selector===4){size=fixture%3;capacity=fixture%4===0?17:size;}
    put(m,VECTOR,capacity?ROWS:0);put(m,VECTOR+4,capacity?ROWS+size*36:0);put(m,VECTOR+8,capacity?ROWS+capacity*36:0);
    const initialize=(p,format)=>{put(m,p,format);m.fill(0,p+4,p+36);describeRendererTextureFormat(p+4,format,runtime);};
    for(let i=0;i<18;i++)initialize(ROWS+i*36,formats[(fixture+i*7)%formats.length]);initialize(INPUT,formats[(fixture+3)%formats.length]);
    if(selector===3){size=fixture%19;put(m,VECTOR,ROWS);put(m,VECTOR+4,ROWS+size*36);put(m,VECTOR+8,ROWS+18*36);}
    put(m,OUT+8,0xff0000);put(m,OUT+12,0xff00);put(m,OUT+16,255);put(m,OUT+20,fixture%2?0xff000000:0);put(m,OUT+24,fixture%3?32:0);
    put(m,MANAGER+0x488,CAPS);put(m,MANAGER+0x368,OBJECT);put(m,MANAGER+0x430,fixture%2?21:23);put(m,CAPS,fixture%4);put(m,CAPS+0x534,1);put(m,OBJECT,VTABLE);put(m,OBJECT+16,VTABLE);put(m,VTABLE+0x28,0xf2000028);put(m,0x56e220,0xf1000000);put(m,0x56e210,0xf1000004);
    const services=(memory,log)=>{let cursor=0x200000,allocations=0,queries=0;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'){const p=cursor;cursor+=args[0]+15&~15;memory.fill(0x93,p,cursor);allocations++;if(allocations===1&&fixture%7===0&&size)put(memory,VECTOR+4,ptr(memory,VECTOR)+36);return p;}},direct3DCall(object,method,args){log.push([object,method,args.map(v=>v>>>0)]);queries++;if(queries===1&&fixture%11===0){put(memory,CAPS,9);put(memory,MANAGER+0x368,OBJECT+16);put(memory,MANAGER+0x430,20);}return fixture%5===0?-1:(args[6]+fixture)%4===0?-1:0;}};};runtime.services=services(m,trace);
    let ecx=VECTOR,args=[],action,mask=0;
    if(selector===0){args=[size+fixture%17];action=()=>reserveRendererTextureFormats(VECTOR,...args,runtime);}
    else if(selector===1){args=[size&&fixture%2?ROWS+(fixture%size)*36:INPUT];action=()=>appendRendererTextureFormat(VECTOR,...args,runtime);}
    else if(selector===2){ecx=OUT;args=[fixture%8===0?formats[fixture%formats.length]:fixture%130-5];action=()=>describeRendererTextureFormat(OUT,...args,runtime);}
    else if(selector===3){ecx=MANAGER;args=[fixture%32];action=()=>chooseRendererTextureFormatIndex(MANAGER,...args,runtime);mask=-1;}
    else if(selector===4){ecx=MANAGER;action=()=>{enumerateRendererTextureFormats(MANAGER,runtime);enumerateRendererTextureFormats(MANAGER,runtime);};}
    else{ecx=fixture%3===0?0x80000000:fixture%260;action=()=>rendererComponentReductionShift(ecx,runtime);mask=-1;}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);machine.externalCalls.set(0xf1000000,x=>{x.r.EAX=native.libraryCall('operatorNew',[ptr(x.bytes,x.r.ESP)]);});machine.externalCalls.set(0xf1000004,x=>native.libraryCall('operatorDelete',[ptr(x.bytes,x.r.ESP)]));
    machine.externalCalls.set(0xf2000028,x=>{const a=Array.from({length:7},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(a[0],0x28,a);x.r.ESP+=28;});
    try{const result=action();machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=ecx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(2000000);calls++;
      if(selector===4){machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=MANAGER;put(machine.bytes,S,-1);steps+=machine.run(2000000);calls++;}
      if(mask)assert.equal(machine.r.EAX&mask,result&mask);assert.deepEqual(nativeTrace,trace);assert.equal(machine.fs0,0);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace:trace.slice(-8),nativeTrace:nativeTrace.slice(-8)});throw error;}
  }
  const report={method:'Actual51fa00 format enumeration plus5115f0 descriptor/component switch511500,51f6b0 compressed/float/alpha/color selection,520f90 alias-aware record append,521260 growth and521180/521300 allocation/forward copy. Persistent repeated enumeration, populated original-format records, unsupported descriptors, allocation-side vector mutation and live COM-side roots/caps changes. All mapped>=10000h,defined returns,ordered genuine CRT/COM requests and restored FS; no game mocks/original device/process execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererTextureFormats({fixtures:Number(process.argv[2]??1200)})));
