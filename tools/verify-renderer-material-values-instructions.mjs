import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {setRendererMaterialValue,destroyRendererMaterialValue,destroyRendererMaterialValues,appendRendererMaterialAttribute,rendererMaterialAttributeMask} from '../src/renderer-material-values.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererMaterialValues({fixtures=1200,output='analysis/renderer-material-values-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,PROPERTY=0x100000,INPUT=0x110000,DATA=0x120000,NAME=0x130000,MATERIAL=0x150400,ALT=0x160000;
  const entries=[0x402590,0x402460,0x4060d0,0x50dd70,0x50dce0];machine.onInstruction=p=>{reached.add(p);if(entries.includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<5;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x93,PROPERTY,PROPERTY+120);m.fill(0x97,MATERIAL-1024,MATERIAL+1200);m.fill(0x76,INPUT,INPUT+128);m.fill(0x85,DATA,DATA+128);m.fill(0x99,ALT,ALT+128);
    for(let i=0;i<3;i++){const p=PROPERTY+i*40;put(m,p,NAME+i*128);put(m,p+20,fixture%3?31:15);put(m,p+16,7);put(m,p+24,fixture%2?DATA+i*128:0);put(m,p+28,fixture%7);put(m,p+32,fixture%4?DATA+i*128:0);put(m,p+36,[0,2,16,-1][fixture%4]);}
    const count=[-128,-1,0,1,7,8,9,31,127][fixture%9];m[MATERIAL+4]=count&255;for(let i=0;i<127;i++)put(m,MATERIAL+0x24+i*8,[0,1,31,32,-1,-2,0x80000000,0x7fffffff][(fixture+i)%8]);
    const defs=[['operatorNewArray',0x56e474,0xf1000000],['operatorDeleteArray',0x56e470,0xf1000004],['operatorDelete',0x56e210,0xf1000008]];for(const[,p,v]of defs)put(m,p,v);
    const services=(memory,log)=>({libraryCall(name,args,context){log.push([name,args.map(v=>v>>>0),context.scratchBase]);if(name==='operatorNewArray'){memory.fill(0x93,0x200000,0x200080);if(fixture%13===1)put(memory,S+4,ALT);return 0x200000;}if(name==='operatorDeleteArray'){if(fixture%11===1)put(memory,PROPERTY+24,ALT);if(fixture%17===3)put(memory,PROPERTY+20,15);}if(name==='memcpy'){Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);return args[0];}}});runtime.services=services(m,trace);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);for(const[name,,target]of defs)machine.externalCalls.set(target,x=>{const value=native.libraryCall(name,[ptr(x.bytes,x.r.ESP)],{scratchBase:x.r.ESP-4});if(value!==undefined)x.r.EAX=value;});machine.externalCalls.set(0x568a48,x=>{x.r.EAX=native.libraryCall('memcpy',Array.from({length:3},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{scratchBase:x.r.ESP-4});});
    let ecx=selector>=3?MATERIAL:PROPERTY,args=[],result;
    if(selector===0)args=[fixture%19===0?DATA+4:INPUT,[0,1,2,3,4,5,-1][fixture%7]];else if(selector===3)args=[fixture*7919,fixture*3559,fixture*103,0x12345678];
    machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=ecx;machine.r.EDX=PROPERTY+(fixture%4)*40;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));
    try{if(selector===0)setRendererMaterialValue(PROPERTY,...args,runtime);else if(selector===1)destroyRendererMaterialValue(PROPERTY,runtime);else if(selector===2)destroyRendererMaterialValues(PROPERTY,PROPERTY+(fixture%4)*40,runtime);else if(selector===3)result=appendRendererMaterialAttribute(MATERIAL,...args,runtime);else result=rendererMaterialAttributeMask(MATERIAL,runtime);steps+=machine.run(1000000);calls++;if(selector>=3)assert.equal(selector===3?machine.r.EAX&255:machine.r.EAX|0,result);assert.equal(machine.fs0,0);assert.deepEqual(nativeTrace,trace);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,count,args,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual402590 typed value storage,402460/4060d0 scalar/range destruction,50dd70 signed-byte attribute append and50dce0 type mask. All type widths/unknown zero size,signed capacity,no shrink,live allocation/free-side pointer/header/input changes,byte-negative row addressing and raw low-five-bit shifts. All mapped>=10000h,defined returns,exact ordered genuine CRT requests including childESP;no game mocks/original process. Full material constructor/name/vector/shader compilation graph remains separate.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererMaterialValues({fixtures:Number(process.argv[2]??1200)})));
