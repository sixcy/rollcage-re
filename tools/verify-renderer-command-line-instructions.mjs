import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import * as source from '../src/renderer-command-line.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),wide=(m,p)=>{let e=p;while(m.readUInt16LE(e))e+=2;return m.toString('utf16le',p,e);};
export async function verifyRendererCommandLine({fixtures=700,output='analysis/renderer-command-line-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;
  const S=0x9000,OBJECT=0x100000,OTHER=0x101000,HEAP=0x110000,KEY=0x130000,COMMAND=0x140000;
  const entries=[0x4a0790,0x401fb0,0x4a1270,0x4a3000,0x4a3040,0x4a2cc0,0x4a2d80,0x4a2e50,0x4a2e80,0x4a2a70,0x4a2f30,0x4a2f70,0x4a12e0,0x4a1530];
  machine.onInstruction=p=>{reached.add(p);if([0x4a12e0,0x4a1530,0x4a2cc0,0x4a2e80].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  const commands=['redux -Width=1920 -Height:480','redux -Width:   -42 later','redux -Width  	"  1280" tail','redux -Width="12345678901234567890" tail','redux -Width=abc\tdef rest','redux -width=123','redux -WidthX=99','redux -Width=','redux -Width="unterminated value','redux -Width:0','redux -Width=\t\t42','redux -Width = 7'];
  const values=['','A',' abc def','\t  spaced value','NoSpaceLongValue','==value','" 123" tail',' \t\t','aaab','abABcd','tab\tinside','Unicode\u0410\u0411'];
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<entries.length;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),trace=[],nativeTrace=[],runtime={memory:m,scratchBase:S};m.fill(0x69,0x6000,0x9500);m.fill(0x97,OBJECT,OTHER+32);
    const init=(object,text,heap)=>{const n=text.length,cap=n<8?7:n|7,p=cap>=8?heap:object;if(p!==object)put(m,object,p);m.write(text+'\0',p,'utf16le');put(m,object+16,n);put(m,object+20,cap);put(m,object+24,0);return p;};
    init(OBJECT,values[fixture%values.length],HEAP);init(OTHER,values[(fixture+4)%values.length],HEAP+0x1000);m.write('-Width\0',KEY,'utf16le');m.write(commands[fixture%commands.length]+'\0',COMMAND,'utf16le');
    const imports=[['operatorNew',0x56e220,0xf1000000,1],['operatorDelete',0x56e210,0xf1000004,1],['operatorDeleteArray',0x56e470,0xf1000008,1],['wcsstr',0x56e2b4,0xf100000c,2],['_wtoi',0x56e2a4,0xf1000010,1]];for(const[,p,v]of imports)put(m,p,v);put(m,0x56e1b4,0xf1000014);put(m,0x56e478,0xf1000018);
    const services=(memory,log)=>{let cursor=0x200000;return{libraryCall(name,args){log.push([name,args.map(v=>v>>>0)]);if(name==='operatorNew'){const p=cursor;cursor+=args[0]+15&~15;memory.fill(0x93,p,cursor);return p;}if(name==='wcsstr'){const index=wide(memory,args[0]).indexOf(wide(memory,args[1]));return index<0?0:args[0]+index*2;}if(name==='_wtoi'){const text=wide(memory,args[0]),match=/^\s*[+-]?\d+/.exec(text);return match?Number(BigInt(match[0].trim()))|0:0;}},platformCall(name,args){assert.equal(name,'GetCommandLineW');log.push([name,args]);return fixture%17===0?0:COMMAND;}};};runtime.services=services(m,trace);
    let ecx=OBJECT,edx=0,args=[],action,mask=-1;
    if(selector===0){ecx=fixture%4===0?0:COMMAND;edx=KEY;action=()=>source.findRendererCommandFlag(ecx,edx,runtime);}
    else if(selector===1){action=()=>source.destroyRendererWideString(OBJECT,runtime);mask=0;}
    else if(selector===2)action=()=>source.constructRendererCommandLine(OBJECT,runtime);
    else if(selector===3){args=[OTHER,fixture%(ptr(m,OBJECT+16)+1),fixture%3?fixture%20:-1];action=()=>source.constructRendererWideSlice(OBJECT,...args,runtime);}
    else if(selector===4){args=[OTHER];action=()=>source.moveRendererWideString(OBJECT,OTHER,runtime);mask=0;}
    else if(selector===5){args=[fixture%9===0?OBJECT:OTHER,fixture%24];action=()=>source.constructRendererWideSuffix(OBJECT,...args,runtime);}
    else if(selector===6){args=[fixture%9===0?OBJECT:OTHER,fixture%24,fixture%3?fixture%20:-1];action=()=>source.constructRendererWideRange(OBJECT,...args,runtime);}
    else if(selector===7){args=[OTHER,fixture%24];action=()=>source.constructRendererWideTail(OBJECT,...args,runtime);}
    else if(selector===8){args=[0x12345678,0x87654321];action=()=>source.trimRendererWideLeadingSpace(OBJECT,runtime);}
    else if(selector===9){args=[fixture%(ptr(m,OBJECT+16)+1)];action=()=>source.getRendererWideCodeUnit(OBJECT,...args,runtime);mask=65535;}
    else if(selector===10){args=[[32,9,34,0x410][fixture%4]];action=()=>source.findRendererWideCharacter(OBJECT,...args,runtime);}
    else if(selector===11){args=[0x12345678];action=()=>source.findRendererCommandSeparator(OBJECT,runtime);}
    else if(selector===12){edx=KEY;action=()=>source.getRendererCommandValue(OBJECT,KEY,runtime);}
    else{ecx=KEY;action=()=>source.getRendererCommandInteger(KEY,runtime);}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=services(machine.bytes,nativeTrace);
    for(const[name,,target,n]of imports)machine.externalCalls.set(target,x=>{const result=native.libraryCall(name,Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)));if(result!==undefined)x.r.EAX=result;});
    machine.externalCalls.set(0xf1000014,x=>{x.r.EAX=native.platformCall('GetCommandLineW',[]);});
    const move=x=>{const p=ptr(x.bytes,x.r.ESP),input=ptr(x.bytes,x.r.ESP+4),n=ptr(x.bytes,x.r.ESP+8);Buffer.from(x.bytes.subarray(input,input+n)).copy(x.bytes,p);x.r.EAX=p;};machine.externalCalls.set(0x568a48,move);machine.externalCalls.set(0xf1000018,move);
    try{const result=action();machine.entry=entries[selector];machine.r.ESP=S;machine.r.ECX=ecx;machine.r.EDX=edx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(1000000);calls++;if(mask)assert.equal(machine.r.EAX&mask,result&mask);assert.deepEqual(nativeTrace,trace);assert.equal(machine.fs0,0);
      if(!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))){const p=m.subarray(0x10000).findIndex((v,i)=>v!==machine.bytes[0x10000+i])+0x10000;assert.fail(`difference${p.toString(16)} JS=${m.subarray(p,p+20).toString('hex')} native=${machine.bytes.subarray(p,p+20).toString('hex')}`);}
    }catch(error){console.error({fixture,selector,args,trace,nativeTrace});throw error;}
  }
  const report={method:'Actual4a1530/4a12e0 command integer/value graph,4a1270 platform command-line copy,4a0790 ASCII flag scan,wide substring/tail/move/trim/search/destruction game descendants. Original space/equal/colon separator table, quoted and unterminated values, tabs, empty/missing/case-mismatched keys, inline/heap and aliases. All mapped bytes>=10000h,defined return widths,exact ordered genuine CRT/platform requests and FS restoration; no game mocks/original command line/process execution.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererCommandLine({fixtures:Number(process.argv[2]??700)})));
