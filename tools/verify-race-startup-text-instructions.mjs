import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {enqueueRaceText,initializeNetworkStartupText} from '../src/race-startup-text.mjs';
import {getOrCreateViewportRecord} from '../src/weather-viewport.mjs';

export async function verifyRaceStartupText({fixtures=1800,output='analysis/race-startup-text-instruction-check.json'}={}) {
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),S=0x9000,APP=0x100000,HEAD=0x110000,NAME=0x120000,FONT=0x160000,TEXT=0x200000;
  const put=(m,p,v)=>m.writeInt32LE(v|0,p); let steps=0,queries=0,enqueues=0,parents=0,cookies=0;const reached=new Set();
  machine.onInstruction=p=>{reached.add(p);if(p===0x40ab70)queries++;if(p===0x48b7d0)enqueues++;if(p===0x477000)parents++;};
  machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890));cookies++;});
  machine.externalCalls.set(0x56932a,m=>{m.r.EAX=APP;});
  for(const [address,name]of[[0x568a48,'memcpy'],[0x568a50,'memset']])machine.externalCalls.set(address,m=>{const a=m.bytes.readUInt32LE(m.r.ESP),b=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);if(name==='memcpy')Buffer.from(m.bytes.subarray(b,b+n)).copy(m.bytes,a);else m.bytes.fill(b&255,a,a+n);m.r.EAX=a;});
  for(let fixture=0;fixture<fixtures;fixture++) {
    memory.fill(0);program.initializeMemory(memory);memory.fill(0x36,0x2000,S+128);put(memory,0x5e8890,0x12345678^fixture);
    put(memory,0x6efb38,APP);put(memory,APP+0x7c,HEAD);for(const o of[0,4,8])put(memory,HEAD+o,HEAD);memory[HEAD+12]=memory[HEAD+13]=1;
    memory.write('0 Player\0',NAME);put(memory,NAME+16,8);put(memory,NAME+20,15);
    const view=getOrCreateViewportRecord(APP+0x7c,NAME,{memory,handlers:{allocate:()=>0x140000}});for(const[o,v]of[[8,7],[12,-9],[16,fixture%7===0?-641:640+fixture%5],[20,fixture%11===0?-481:480]])put(memory,view+o,v);
    put(memory,0x5ecb1c,0x60000);memory[0x6054d]=fixture%9;put(memory,0x82dfa0,FONT);memory.writeInt16LE([256,128,-257,32767][fixture%4],FONT+4);put(memory,FONT+16,fixture%5-2);put(memory,FONT+20,fixture%7-3);
    for(let c=0;c<256;c++)memory[FONT+0x101c+c]=c%17===0?255:c%10;
    for(let g=0;g<10;g++)memory.writeUInt16LE((g*17+fixture*97)&65535,FONT+(g+2)*16);
    put(memory,0x91d338,[256,128,-257,0x7fffffff][fixture%4]);put(memory,0x9020ac,fixture%3?-640:1280);put(memory,0x9020b0,-960);
    const text=fixture%13===0?'':fixture%13===1?'A'.repeat(90):fixture%13===2?'   A  B':'A B!'+String.fromCharCode(255,17,65);memory.write(text+'\0\0',TEXT);for(const p of[0x70ea9c,0x70eaa4,0x70eaa8])put(memory,p,TEXT);
    const queue=Math.floor(fixture/12)%3===0?1:Math.floor(fixture/12)%3===1?0:2,full=fixture%19===0,occupied=full?28:fixture%7;for(const base of[0x82dfa4,0x9028e4])for(let i=0;i<28;i++)memory[base+i*80+8]=i<occupied?3:0;
    const message=fixture%23===0?((queue===1?0x9028e4:0x82dfa4)+occupied*80+15):TEXT;if(message!==TEXT)memory.write('AAAA\0',message);
    const parent=fixture%5===0,mode=fixture%10===0?1:0,flags=[0,2,16,4,7,0x40,0x46,8,10,0x1a,0x348,0x35e][fixture%12],timer=fixture*31-500,x=fixture*1301-90000,y=fixture*997-32000;
    const regs={EBX:0x313100+fixture,EBP:0x323200+fixture,ESI:0x333300+fixture,EDI:0x343400+fixture};
    machine.reset();machine.fs0=0;memory.copy(machine.bytes);const runtime={memory,scratchBase:S,entryRegisters:regs,handlers:{dynamicCast:()=>APP}};
    let result;if(parent)initializeNetworkStartupText(mode,runtime);else result=enqueueRaceText(message,0x12340000+fixture,x,y,flags,timer,queue,runtime);
    machine.entry=parent?0x477000:0x48b7d0;machine.r.ESP=S;Object.assign(machine.r,regs);machine.r.ECX=parent?mode:message;machine.r.EDX=0x12340000+fixture;machine.bytes.writeInt32LE(-1,S);
    if(!parent)for(const[i,v]of[x,y,flags,timer,queue].entries())put(machine.bytes,S+4+i*4,v);
    steps+=machine.run(2000000);if(!parent)assert.equal(result,machine.r.EAX|0,'native queue result');
    const frame=S-(parent?0x134:0x138),name=frame+(parent?0x20:0x28);assert.deepEqual(memory.subarray(name,name+260),machine.bytes.subarray(name,name+260),'parent viewport name buffer');assert.equal(memory.readUInt32LE(S-(parent?8:4)),machine.bytes.readUInt32LE(S-(parent?8:4)),'parent cookie');
    const a=memory.subarray(0x10000),b=machine.bytes.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail('fixture'+fixture+' parent'+parent+' flags'+flags.toString(16)+' diff0x'+(o+0x10000).toString(16)+' native'+b[o]+' source'+a[o]);}
  }
  const report={matched:true,fixtures,parents,enqueues,viewportQueries:queries,cookieChecks:cookies,instructionSteps:steps,reachedInstructions:reached.size,domain:'Actual477000 and48b7d0 with actual40ab70 application/string/map viewport lookup. All mapped bytes>=10000h; live queue/font/scale fields, full queues, signed arithmetic, empty/64byte text, both queues and alignment combinations. Caller supplies native font and localization state. No original process execution.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceStartupText()));
