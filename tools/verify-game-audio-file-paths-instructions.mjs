import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {findGameAudioPathText,findGameAudioDirectorySeparator,normalizeGameAudioPath,getGameAudioDirectory,resolveGameAudioPath,gameAudioPathExists,openGameAudioFile,closeGameAudioFile,lookupGameAudioPath,convertGameAudioAnsiPath,assignGameAudioWidePath,resolveGameAudioSamplePath} from '../src/game-audio-file-paths.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export function createGameAudioFilePathServices(memory,{fixture=0}={}){
  const trace=[],wide=p=>{let end=p;while(memory.readUInt16LE(end))end+=2;return memory.toString('utf16le',p,end);};let opens=0,next=0x300000;
  return {trace,libraryCall(name,args){trace.push([name,...args]);const[a,b,c,d]=args;
    if(name==='memset'){memory.fill(b&255,a,a+c);return a;}
    if(name==='memmove'){Buffer.from(memory.subarray(b,b+c)).copy(memory,a);return a;}
    if(name==='wcsstr'){const i=wide(a).indexOf(wide(b));return i<0?0:a+2*i;}
    if(name==='wcsncmp'){const x=wide(a).slice(0,c),y=wide(b).slice(0,c);return x===y?0:x<y?-1:1;}
    if(name==='wcsncpy_s'||name==='wcscpy_s'){const text=wide(c).slice(0,name==='wcsncpy_s'?d:undefined);assert(text.length<b);memory.write(text+'\0',a,'utf16le');return 0;}
    if(name==='wcscat_s'){const text=wide(a)+wide(c);assert(text.length<b);memory.write(text+'\0',a,'utf16le');return 0;}
    if(name==='_wcslwr_s'){const text=wide(a).toLowerCase();assert(text.length<b);memory.write(text+'\0',a,'utf16le');return 0;}
    if(name==='vswprintf_s'){let i=0;const text=wide(c).replace(/%s/g,()=>wide(ptr(memory,d+i++*4)));assert(text.length<b);memory.write(text+'\0',a,'utf16le');return text.length;}
    if(name==='operatorNewArray'||name==='operatorNew'){const p=next;next=next+a+31&~15;assert(next<0x500000);memory.fill(0xcd,p,next);return p;}
    if(['registerExit','operatorDelete','operatorDeleteArray'].includes(name))return 0;
    throw Error('Unexpected audio path CRT '+name);
  },platformCall(name,args){trace.push([name,...args]);if(name==='FindFirstFileW'){put(memory,args[1],fixture%3===1?16:0);return fixture%3===2?-1:101;}
    if(name==='CreateFileW'){opens++;return fixture%7===0&&opens===1?-1:fixture%7===1?-1:102;}
    if(name==='GetLastError')return fixture%7===0?0x21:fixture%7===1?5:0x3e4;
    if(name==='GetFileSizeEx'){if(fixture&1)return 0;put(memory,args[1],0x123400+fixture);put(memory,args[1]+4,1);return 1;}
    if(name==='SetFilePointerEx'){put(memory,args[3],args[1]);put(memory,args[3]+4,args[2]);return 1;}
    if(name==='GetOverlappedResult'){if(fixture&1)return 0;put(memory,args[2],0x321);return 1;}
    if(name==='SHGetSpecialFolderLocation'){put(memory,args[2],0x180000+args[1]);return 0;}
    if(name==='SHGetPathFromIDListA'){memory.write((fixture%9===0?'':args[0]===0x180005?'C:\\Users\\Player\\Documents':'C:\\Users\\Player\\AppData')+'\0',args[1],'latin1');return 1;}
    if(name==='MultiByteToWideChar'){const bytes=memory.subarray(args[2],args[2]+args[3]);memory.write(bytes.toString('latin1'),args[4],'utf16le');return bytes.length;}
    if(name==='InitializeCriticalSectionAndSpinCount'){memory.fill(0x51,args[0],args[0]+24);return 1;}
    if(name==='GetCurrentThreadId')return 77;
    if(name==='EnterCriticalSection'||name==='LeaveCriticalSection')return 0;
    if(['FindClose','Sleep','CancelIo','CloseHandle'].includes(name))return 1;
    throw Error('Unexpected audio path platform '+name);
  }};
}

export async function verifyGameAudioFilePaths({fixtures=2400,compareStack=true,output='analysis/game-audio-file-paths-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0;
  const entries=[0x4a0790,0x4a4820,0x4a4870,0x4a43f0,0x4a4460,0x4a3ac0,0x4a3b40,0x4a2af0,0x4030c0,0x4a0810,0x405e00,0x4a7fc0];
  //CPU CALL return stores are real even when the CRT/Win32 body is opaque.
  const callsByAddress=new Map(program.instructions.filter(i=>i.op==='CALL').map(i=>[i.address,i]));
  machine.onInstruction=p=>{reached.add(p);if(entries.includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;const i=callsByAddress.get(p);if(i){const n=program.instructions.find(x=>x.address>p);if(n)put(machine.bytes,machine.r.ESP-4,n.address);}};
  const cases=['','x','a/b/../c.wav','\\\\server\\\\folder\\file.aif','C:/one/./two//three/','https://a//b/../c','http://a//b','a/../b','..\\a\\..\\b','aaaab','prefix.wav/part','~\\sounds\\a.wav','$DATA_ROOT::\\x','$DATA_EFFECTS::sound','$RESOURCE_CACHE::/cache','$MY_DOCUMENTS::\\save','$MY_APP_DOCUMENTS::\\x'];
  for(let fixture=0;fixture<fixtures;fixture++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000)),S=[0x9000,0x9200,0x9400][fixture%3],input=0x100000,outputAddress=fixture%11===0?input:0x110000,record=0x120000,registers={EBX:0x121212,EBP:0x232323,ESI:0x343434,EDI:0x454545};m.fill(0x36,S-0x6000,S+128);m.write(cases[fixture%cases.length]+'\0',input,'utf16le');m.fill(0x7b,0x110000,0x110400);put(m,record,909);put(m,record+8,fixture%3?123:0);put(m,record+12,fixture%3===1?123:4);put(m,S,-1);if(fixture&1)put(m,0x5ed314,0x4030c0);
    if(fixture%entries.length===8)m.write(['$DATA_ROOT::','$DATA_EFFECTS::','$MY_DOCUMENTS::','$MY_APP_DOCUMENTS::','$RESOURCE_CACHE::','unrecognized'][Math.floor(fixture/entries.length)%6]+'\0',input,'utf16le');if(fixture%entries.length===9)m.write('audio/example.wav\0',input,'latin1');
    if(fixture%entries.length===11){put(m,0x714b08,0x130000);m.write('C:\\Assets\\Sound\0',0x130412,'utf16le');m.copy(m,S+8,input,input+1024);}
    if(Math.floor(fixture/entries.length)&1)put(m,0x5ed314,0x4030c0);else put(m,0x5ed314,0x4a0780);
    const serviceFixture=fixture+Math.floor(fixture/entries.length),source=createGameAudioFilePathServices(m,{fixture:serviceFixture});machine.reset();machine.fs0=0;m.copy(machine.bytes);const native=createGameAudioFilePathServices(machine.bytes,{fixture:serviceFixture}),runtime={memory:m,scratchBase:S,services:source,sehWord:0,nativeDequeCopies:true,entryRegisters:registers};
    const imports=[[0x56e47c,'wcsncpy_s',4,'libraryCall'],[0x56e218,'wcscat_s',3,'libraryCall'],[0x56e2b8,'wcscpy_s',3,'libraryCall'],[0x56e2b4,'wcsstr',2,'libraryCall'],[0x56e2c4,'wcsncmp',3,'libraryCall'],[0x56e084,'FindFirstFileW',2,'platformCall'],[0x56e110,'FindClose',1,'platformCall'],[0x56e07c,'CreateFileW',7,'platformCall'],[0x56e0e4,'GetLastError',0,'platformCall'],[0x56e0cc,'Sleep',1,'platformCall'],[0x56e078,'GetFileSizeEx',2,'platformCall'],[0x56e198,'SetFilePointerEx',5,'platformCall'],[0x56e1ac,'GetOverlappedResult',4,'platformCall'],[0x56e1b0,'CancelIo',1,'platformCall'],[0x56e0bc,'CloseHandle',1,'platformCall']];
    imports.push([0x56e4fc,'SHGetSpecialFolderLocation',3,'platformCall'],[0x56e500,'SHGetPathFromIDListA',2,'platformCall'],[0x56e0c0,'MultiByteToWideChar',6,'platformCall'],[0x56e08c,'InitializeCriticalSectionAndSpinCount',2,'platformCall'],[0x56e094,'EnterCriticalSection',1,'platformCall'],[0x56e09c,'GetCurrentThreadId',0,'platformCall'],[0x56e090,'LeaveCriticalSection',1,'platformCall'],[0x56e474,'operatorNewArray',1,'libraryCall'],[0x56e220,'operatorNew',1,'libraryCall'],[0x56e2bc,'_wcslwr_s',2,'libraryCall'],[0x56e2b0,'vswprintf_s',4,'libraryCall']);
    for(const[i,[slot,name,count,kind]]of imports.entries()){const target=0x760000+i*16;put(m,slot,target);put(machine.bytes,slot,target);machine.externalCalls.set(target,cpu=>{cpu.r.EAX=native[kind](name,Array.from({length:count},(_,i)=>ptr(cpu.bytes,cpu.r.ESP+4*i)));if(kind==='platformCall')cpu.r.ESP+=count*4;});}
    machine.externalCalls.set(0x568a50,cpu=>{cpu.r.EAX=native.libraryCall('memset',Array.from({length:3},(_,i)=>ptr(cpu.bytes,cpu.r.ESP+4*i)));});
    machine.externalCalls.set(0x56832a,cpu=>{cpu.r.EAX=native.libraryCall('registerExit',[ptr(cpu.bytes,cpu.r.ESP)]);});machine.externalCalls.set(0x568162,()=>{});
    put(m,0x56e478,0x761000);put(machine.bytes,0x56e478,0x761000);machine.externalCalls.set(0x761000,cpu=>{cpu.r.EAX=native.libraryCall('memmove',[ptr(cpu.bytes,cpu.r.ESP),ptr(cpu.bytes,cpu.r.ESP+4),ptr(cpu.bytes,cpu.r.ESP+8)]);});
    machine.externalCalls.set(0x568980,cpu=>{put(cpu.bytes,cpu.r.ESP-4,0x4a4470);cpu.r.ESP-=cpu.r.EAX;});
    const index=fixture%entries.length,address=entries[index];let args=[],ecx=input,edx=0,actual;
    if(index===0){edx=0x5d3a2c;actual=()=>findGameAudioPathText(input,edx,runtime);}if(index===1){args=[0];actual=()=>findGameAudioDirectorySeparator(input,runtime);}if(index===2)actual=()=>normalizeGameAudioPath(input,runtime);
    if(index===3||index===4){args=[outputAddress,0];actual=()=>index===3?getGameAudioDirectory(input,outputAddress,runtime):resolveGameAudioPath(input,outputAddress,runtime);}if(index===5)actual=()=>gameAudioPathExists(input,runtime);
    if(index===6){edx=Math.floor(fixture/8)%7;args=[record,fixture&255];actual=()=>openGameAudioFile(input,edx,record,fixture&255,runtime);}if(index===7){ecx=record;actual=()=>closeGameAudioFile(record,runtime);}
    if(index===8){args=[input];actual=()=>lookupGameAudioPath(input,runtime);}if(index===9){edx=Math.floor(fixture/entries.length)&1;actual=()=>convertGameAudioAnsiPath(input,edx,runtime);}if(index===10){ecx=outputAddress;args=[input];actual=()=>assignGameAudioWidePath(outputAddress,input,runtime);}
    if(index===11){args=[outputAddress];actual=()=>resolveGameAudioSamplePath(outputAddress,runtime);}
    for(let i=0;i<args.length;i++){put(m,S+4+4*i,args[i]);put(machine.bytes,S+4+4*i,args[i]);}
    const result=actual();machine.entry=address;machine.r.ESP=S;machine.r.ECX=ecx;machine.r.EDX=edx;Object.assign(machine.r,registers);try{steps+=machine.run(3000000);}catch(error){throw Error(`fixture${fixture} entry${address.toString(16)}: ${error.message}`,{cause:error});}calls++;
    if(index!==2&&index!==7)assert.equal(index===5||index===6?machine.r.EAX&255:machine.r.EAX|0,result|0,`fixture${fixture} return`);assert.deepEqual(source.trace,native.trace,`fixture${fixture} services`);
    for(const[from,to]of[[0x10000,m.length],...(compareStack?[[S-0x6000,S+0x408]]:[])])if(!m.subarray(from,to).equals(machine.bytes.subarray(from,to))){let p=from;while(m[p]===machine.bytes[p])p++;throw Error(`fixture${fixture} ${address.toString(16)} diff${p.toString(16)} JS${m.subarray(p,p+24).toString('hex')} native${machine.bytes.subarray(p,p+24).toString('hex')}`);}
  }
  const report={fixtures,calls,instructionSteps:steps,reachedInstructions:reached.size,actualGameCalls:visits,matched:true,comparePrivateStack:compareStack,domain:'Actual path normalization/prefix resolution/dirname/existence/open/retry/seek/overlapped-close and4a7fc0 samplepath, both shipped4a0780 and installed4030c0 callbacks with real lazy shell-folder caches/ANSI conversion/FIFO. All mapped memory, complete declared24KiB private stack, defined return and ordered CRT/Win32 requests; original CPU CALL return slots explicit, compiler stackprobe/cookie services only. Includes aliases, file/directory/missing probes, lock-violation retry, size success/failure, overlapped cancel, root/effects/document/cache prefixes, URL exception and path reducer quirks. No host I/O/original process.'};if(output)try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);}return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyGameAudioFilePaths()));
