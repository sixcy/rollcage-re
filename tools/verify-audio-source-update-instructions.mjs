import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {updateAudioSourcePlaybackState,startAudioSourcePlayback} from '../src/audio-source-update.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyAudioSourceUpdate({fixtures=2400,output='analysis/audio-source-update-instruction-check.json'}={}){
 const p=await loadRetainedNativeProgram(), machine=new BoundedX86(p.instructions),memory=Buffer.alloc(0xa00000),S=0x9000,reached=new Set(),map=new Map(p.instructions.map(i=>[i.address,i])),sorted=[...map.keys()].sort((a,b)=>a-b),next=new Map(sorted.slice(0,-1).map((a,i)=>[a,sorted[i+1]]));let steps=0,updates=0,starts=0,submissions=0,failures=0;
 machine.onInstruction=a=>{reached.add(a);const i=map.get(a);if(i?.op==='CALL'){const target=machine.get(i.args[0])>>>0;if(machine.externalCalls.has(target))put(machine.bytes,machine.r.ESP-4,next.get(a));}};
 for(let fixture=0;fixture<fixtures;fixture++){
  memory.fill(0);p.initializeMemory(memory);memory.fill(0x36,S-4096,S+128);const object=0x120000,decoder=0x130000,waveform=0x150000,voice=0x140000,other=0x141000,table=0x160000;
  put(memory,object,0x5d3f60);put(memory,object+0x97c,voice);put(memory,object+0x948,fixture%4);put(memory,object+0x94c,Math.floor(fixture/4)%5);memory[object+0x45c]=Math.floor(fixture/20)%3;memory[object+0x99c]=fixture%2;memory[object+0x99d]=Math.floor(fixture/3)%2;
  put(memory,object+0x968,fixture%3?decoder:0);memory[decoder+0x6b]=Math.floor(fixture/7)%3;
  put(memory,object+0x964,fixture%4?waveform:0);memory.writeUInt16LE([1,2,4,6][fixture%4],waveform+0x14);for(let i=0;i<36;i++)memory[waveform+0x41c+i]=(fixture+i*7)&255;
  put(memory,0x715b08,3);put(memory,0x714afc,0x715b30);
  for(const v of[voice,other])put(memory,v,table);
  const methods=[[0x64,2],[0x50,3],[0x58,1],[0x54,3],[0x4c,3]];methods.forEach(([slot],i)=>put(memory,table+slot,0x780000+i*16));
  put(memory,S,-1);put(memory,S+4,Math.floor(fixture/40)%3);put(memory,S+8,Math.floor(fixture/120)%3);
  machine.reset();machine.fs0=0x12345678;memory.copy(machine.bytes);
  const create=m=>{const trace=[];return{trace,xAudio2Call(owner,slot,args,r){trace.push([owner,slot,args,r.scratchBase,ptr(m,r.scratchBase)]);if(slot===0x64){for(let i=0;i<4;i++)put(m,args[1]+i*4,i===0?fixture%2:i===2?Math.floor(fixture/2)%2:Math.floor(fixture/9)%2);if(fixture%11===4)put(m,object+0x97c,other);}if(slot===0x54)trace.push(['buffer',m.subarray(args[1],args[1]+36).toString('hex')]);return slot===0x4c&&fixture%7===3?-5:0;}};};
  const source=create(memory),native=create(machine.bytes);methods.forEach(([slot,count],i)=>machine.externalCalls.set(0x780000+i*16,cpu=>{const args=Array.from({length:count},(_,i)=>ptr(cpu.bytes,cpu.r.ESP+i*4));cpu.r.EAX=native.xAudio2Call(args[0],slot,args,{scratchBase:cpu.r.ESP-4});cpu.r.ESP+=count*4;}));
  const regs={EBX:0x111111+fixture,EBP:0x121212+fixture,ESI:0x131313+fixture,EDI:0x141414+fixture},runtime={memory,scratchBase:S,entryRegisters:regs,sehWord:0x12345678,services:source};
  Object.assign(machine.r,regs,{ESP:S,ECX:object});
  if(fixture%3!==1){updateAudioSourcePlaybackState(object,runtime);machine.entry=0x4adc40;steps+=machine.run();updates++;}
  if(fixture%3!==0){startAudioSourcePlayback(object,runtime);machine.entry=0x4adf20;Object.assign(machine.r,regs,{ESP:S,ECX:object});steps+=machine.run();starts++;if(fixture%7===3)failures++;}
  submissions+=source.trace.filter(x=>x[0]==='buffer').length;
  assert.deepEqual(source.trace,native.trace,'orderedCOM fixture'+fixture);assert.equal(machine.fs0,0x12345678);assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000),'mapped fixture'+fixture);
  const a=memory.subarray(S-4096,S+128),b=machine.bytes.subarray(S-4096,S+128);if(!a.equals(b)){const i=b.findIndex((v,i)=>v!==a[i]);assert.fail('fixture'+fixture+' stack0x'+(S-4096+i).toString(16)+' native'+b[i]+' source'+a[i]);}
 }
 const report={fixtures,updates,starts,submissions,failures,instructionSteps:steps,reachedInstructions:reached.size,matched:true,domain:'Actual4adc40+4adf20, original sample getters/guarded debugger, full10MiB+4KiBprivate/caller stack and ordered genuine XAudio2COM arguments/entryESP/returnstores/bufferbytes. State/deferred-state/mode byte matrix, live voice mutation, waveform loop and failed Start paths. Decoder constructor and waveform metadata are explicit fixture inputs, no original process/audio device.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyAudioSourceUpdate()));
