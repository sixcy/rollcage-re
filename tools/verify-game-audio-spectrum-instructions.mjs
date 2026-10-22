import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {constructGameAudioSpectrumState} from '../src/game-audio-spectrum-state.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyGameAudioSpectrum({fixtures=120,output='analysis/game-audio-spectrum-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),calls=new Map(program.instructions.filter(i=>i.op==='CALL').map(i=>[i.address,i])),next=new Map(program.instructions.slice(0,-1).map((i,n)=>[i.address,program.instructions[n+1].address]));let steps=0;
 machine.onInstruction=p=>{reached.add(p);if(calls.has(p))put(machine.bytes,machine.r.ESP-4,next.get(p));};
 for(let fixture=0;fixture<fixtures;fixture++){
  const m=program.initializeMemory(Buffer.alloc(0xa00000)),S=[0x9000,0x9200,0x9400][fixture%3],object=0x100000,registers={EBX:0x121212,ESI:0x343434,EDI:0x454545};m.fill(0x36,S-128,S+16);m.fill(0xa7,object,object+64);put(m,S,-1);
  const services=memory=>{let allocation=0,heap=0x300000;const trace=[];return{trace,libraryCall(name,args,runtime){trace.push([name,...args]);if(name==='operatorNewArray'){const out=heap;heap=heap+args[0]+31&~15;memory.fill(0xcd,out,heap);allocation++;if(allocation===1&&fixture%4){const bits=5+fixture%4;put(memory,object,bits);put(memory,object+4,1<<bits);put(memory,object+8,1<<(bits-1));}return out;}if(name==='memset'){memory.fill(args[1]&255,args[0],args[0]+args[2]);return args[0];}if(name==='sinf'){if(fixture%5===1)memory.writeFloatLE(Math.fround(args[0]*0.5),S-4);return Math.fround(Math.sin(args[0]));}if(name==='cosf')return Math.fround(Math.cos(args[0]));throw Error('Unexpected FFT CRT '+name);}};};
  const source=services(m);machine.reset();m.copy(machine.bytes);const native=services(machine.bytes),runtime={memory:m,scratchBase:S,entryRegisters:registers,services:source};put(m,0x56e474,0x760000);put(machine.bytes,0x56e474,0x760000);machine.externalCalls.set(0x760000,cpu=>{cpu.r.EAX=native.libraryCall('operatorNewArray',[ptr(cpu.bytes,cpu.r.ESP)]);});machine.externalCalls.set(0x568a50,cpu=>{cpu.r.EAX=native.libraryCall('memset',Array.from({length:3},(_,i)=>ptr(cpu.bytes,cpu.r.ESP+i*4)));});
  for(const[address,name]of[[0x56934e,'sinf'],[0x56933c,'cosf']])machine.externalCalls.set(address,cpu=>{cpu.scalars.XMM0=native.libraryCall(name,[cpu.scalars.XMM0]);cpu.doubleScalars.delete('XMM0');cpu.integerVectors.delete('XMM0');cpu.qwords.delete('XMM0');cpu.zeroVectors.delete('XMM0');cpu.scalarBits?.delete('XMM0');});
  const result=constructGameAudioSpectrumState(object,runtime);machine.entry=0x4b2ee0;machine.r.ESP=S;machine.r.ECX=object;Object.assign(machine.r,registers);steps+=machine.run(1000000);assert.equal(machine.r.EAX>>>0,result);assert.deepEqual(source.trace,native.trace);
  for(const[from,to]of[[0x10000,m.length],[S-128,S+4]])if(!m.subarray(from,to).equals(machine.bytes.subarray(from,to))){let p=from;while(m[p]===machine.bytes[p])p++;throw Error(`fixture${fixture} diff${p.toString(16)} JS${m.subarray(p,p+24).toString('hex')} native${machine.bytes.subarray(p,p+24).toString('hex')}`);}
 }
 const report={fixtures,reachedInstructions:reached.size,instructionSteps:steps,matched:true,domain:'Actual4b2ee0 FFT state constructor, seven owned allocation arrays, zeroing, live bit-reversal and f32 sine/cosine table production. OriginalCRT/libm services, explicit allocator mutations of constructor sizes, sine-service mutation of saved angle before cosine; all mappedmemory/privateframe/orderedservices. No host audio/original process.'};if(output)try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report);}return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyGameAudioSpectrum()));
