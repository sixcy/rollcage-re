import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {configureRendererStartupSettings} from '../src/renderer-startup-settings.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),wide=(m,p)=>{let e=p;while(m.readUInt16LE(e))e+=2;return m.toString('utf16le',p,e);};
export async function verifyRendererStartupSettings({fixtures=1200,output='analysis/renderer-startup-settings-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,OBJECT=0x100000,OTHER=0x101000,HEAP=0x110000,KEY=0x130000,COMMAND=0x140000;
  const entries=[0x5125d0];
  machine.onInstruction=p=>{reached.add(p);if([0x5125d0,0x405010,0x402fa0,0x4068d0,0x4a12e0,0x4a1530,0x4a2cc0,0x4a2e80].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const commands=['redux','redux /width=1920 /height:1080 /bpp=32 /novsync /antialias:4 /windowed','redux /width=0 /height=0','redux /WIDTH=640 /HEIGHT=480 /BPP=16','redux /width  \t"  1280" /height=720','redux /width=-1 /height=1 /antialias=8','redux /width=1234567890 /height=-2 /bpp=8','redux /novsyncX /windowedX','redux /width=abc /height:480'];
  const values=['','A',' abc def','\t  spaced value','NoSpaceLongValue','==value','" 123" tail',' \t\t','aaab','abABcd','tab\tinside','Unicode\u0410\u0411'];
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<entries.length;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x97,OBJECT,OTHER+32);
    const init=(object,text,heap)=>{const n=text.length,cap=n<8?7:n|7,p=cap>=8?heap:object;if(p!==object)put(m,object,p);m.write(text+'\0',p,'utf16le');put(m,object+16,n);put(m,object+20,cap);put(m,object+24,0);return p;};
    init(OBJECT,values[fixture%values.length],HEAP);init(OTHER,values[(fixture+4)%values.length],HEAP+0x1000);m.write('-Width\0',KEY,'utf16le');m.write(commands[fixture%commands.length]+'\0',COMMAND,'utf16le');
    const imports=[['operatorNew',0x56e220,0xf1000000,1],['operatorDelete',0x56e210,0xf1000004,1],['operatorDeleteArray',0x56e470,0xf1000008,1],['wcsstr',0x56e2b4,0xf100000c,2],['_wtoi',0x56e2a4,0xf1000010,1]];for(const[,p,v]of imports)put(m,p,v);put(m,0x56e1b4,0xf1000014);put(m,0x56e478,0xf1000018);
    const services=(memory,log)=>{let cursor=0x200000;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'){const p=cursor;cursor+=args[0]+15&~15;memory.fill(0x93,p,cursor);return p;}if(name==='wcsstr'){const index=wide(memory,args[0]).indexOf(wide(memory,args[1]));return index<0?0:args[0]+index*2;}if(name==='_wtoi'){const text=wide(memory,args[0]),match=/^\s*[+-]?\d+/.exec(text);return match?Number(BigInt(match[0].trim()))|0:0;}},platformCall(name,args){log.push([name,args]);return name==='GetCurrentThreadId'?77:name==='GetCommandLineW'?fixture%17===0?0:COMMAND:1;}};};runtime.services=services(m,trace);
    const MANAGER=0x150000,CAPS=0x160000,SETTINGS=0x170000;
    put(m,MANAGER+0x488,fixture%7===0?0:CAPS);put(m,MANAGER+0x500,fixture%3);put(m,CAPS+0x420,fixture%2?0x10000:0);
    put(m,0x6e63d0,fixture%5===0?0:3);put(m,0x6e64a4,fixture%5===0?0:SETTINGS);
    const definitions=[[0x56e08c,'InitializeCriticalSectionAndSpinCount',2],[0x56e094,'EnterCriticalSection',1],[0x56e090,'LeaveCriticalSection',1],[0x56e09c,'GetCurrentThreadId',0]];
    for(const[slot,,]of definitions)put(m,slot,0xf2000000+slot);
    let ecx=MANAGER,edx=0,args=[],mask=0,action=()=>configureRendererStartupSettings(MANAGER,runtime);
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target,n]of imports)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));if(result!==undefined)x.r.EAX=result;});
    for(const[slot,name,n]of definitions)machine.externalCalls.set(0xf2000000+slot,x=>{x.r.EAX=native.platformCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));x.r.ESP+=n*4;});
    machine.externalCalls.set(0x56832a,x=>{x.r.EAX=native.libraryCall('registerExit',[ptr(x.bytes,x.r.ESP)])??0;});
    machine.externalCalls.set(0xf1000014,x=>{x.r.EAX=native.platformCall('GetCommandLineW',[]);});
    const move=x=>{const p=ptr(x.bytes,x.r.ESP),input=ptr(x.bytes,x.r.ESP+4),n=ptr(x.bytes,x.r.ESP+8);Buffer.from(x.bytes.subarray(input,input+n)).copy(x.bytes,p);x.r.EAX=p;};machine.externalCalls.set(0x568a48,move);machine.externalCalls.set(0xf1000018,move);
    try{const result=action();machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=ecx;machine.r.EDX=edx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;if(mask)assert.equal(machine.r.EAX&mask,result&mask);assert.deepEqual(nativeTrace,trace);assert.equal(machine.fs0,0);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual5125d0 startup settings with actual4a0790/4a1530/4a12e0 parser graph,405010/402fa0 singleton constructors and4068d0 scalar SSE writer. Original native option keys,defaults,low-byte flags,zero/negative dimensions,case-sensitive values despite flag scan,quality caps and lazy settings. All mapped>=10000h,ordered CRT/platform requests and restored FS; no game mocks/original process/command-line query',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererStartupSettings({fixtures:Number(process.argv[2]??1200)})));
