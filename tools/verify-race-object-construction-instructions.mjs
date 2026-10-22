import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {appendAuthoredRaceObject,initializeAuthoredObjectQuaternion} from '../src/race-object-construction.mjs';
import {initializeRaceObjectList,initializeRaceObjectStartupTables} from '../src/race-object-startup.mjs';
import {stepRawScriptedMotion} from '../src/raw-scripted-motion.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export async function verifyRaceObjectConstruction({fixtures=1200,output='analysis/race-object-construction-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),S=0x9000,MODEL=0x300000,PACK=0x310000,MODELS=0x311000,AUTH=0x320000,LIST=0x330000,ROUTES=0x340000;
 const reached=new Set(),visits={};let steps=0,operations=0;machine.onInstruction=p=>{reached.add(p);if([0x429c90,0x40feb0,0x46e810,0x429e00,0x44ac20,0x4741c0,0x4798d0,0x492ae0,0x429d60,0x428270,0x476550].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(let fixture=0;fixture<fixtures;fixture++){
  memory.fill(0);program.initializeMemory(memory);initializeRaceObjectStartupTables(memory);memory.fill(0x36,0x4000,S+128);put(memory,0x5e8890,0x12345678);put(memory,0x902eec,0x100000);put(memory,0x70dcf4,fixture%4*128);put(memory,0x6e6b44,fixture%3===0?511:0);
  put(memory,0x90b990,PACK);put(memory,PACK+24,MODELS);put(memory,MODELS,MODEL);word(memory,MODEL+4,4);word(memory,MODEL+6,40);put(memory,MODEL+16,0x300);put(memory,MODEL+20,0x300+40*40);put(memory,MODEL+12,0x360000);put(memory,MODEL+0x40,0x350000);for(let i=0;i<0x700;i++)memory[MODEL+0x300+i]=(i*37+fixture*17)&255;
  put(memory,0x91e77c,LIST);put(memory,0x91e778,0);put(memory,0x9092b4,ROUTES);for(let i=0;i<256;i++){word(memory,ROUTES+i*2,0x300+i*32);const script=ROUTES+0x300+i*32;word(memory,script,0);for(let axis=0;axis<3;axis++)word(memory,script+2+axis*2,(fixture*17+i*23+axis*41)%1000-500);}
  const kind=[3,5,8,9,10,11,0,4,12][fixture%9];memory[AUTH+3]=0;memory[AUTH+31]=kind;for(const o of[8,10,12])word(memory,AUTH+o,(fixture*(o+3))%511-255);for(const[o,v]of[[14,fixture%4===0?0:fixture*73-32768],[16,fixture%3===0?0:fixture*157-32768],[18,fixture%5===0?0:fixture*291-32768]])word(memory,AUTH+o,v);memory[AUTH+0x26]=fixture%7+1;memory[AUTH+0x27]=fixture%256;
  put(memory,0x909254,0x20000);put(memory,0x909278,0x25000);for(let i=0;i<256;i++){word(memory,0x20000+i*16,0xff00);word(memory,0x20002+i*16,255);put(memory,0x2000c+i*16,0x23000);}
  put(memory,0x91e79c,0x180000);put(memory,0x91e780,0x190000);put(memory,0x91e78c,0x190100);put(memory,0x91e790,0x190200);put(memory,0x91e794,255);put(memory,0x91e784,-1);put(memory,0x91e798,0);for(let i=0;i<256;i++)memory[0x190000+i]=i;
  put(memory,0x902bc0,0x170000);word(memory,0x902bc4,0);put(memory,0x82e900,0);
  const regs={EBX:0x123400+fixture,EBP:0x234500+fixture,ESI:0x345600+fixture,EDI:0x456700+fixture},runtime={memory,scratchBase:S,entryRegisters:regs};machine.reset();machine.fs0=0;memory.copy(machine.bytes);
  const run=(entry,invoke,ecx,edx=0,args=[])=>{const result=invoke();machine.entry=entry;machine.r.ESP=S;Object.assign(machine.r,regs);machine.r.ECX=ecx??0;machine.r.EDX=edx;put(machine.bytes,S,-1);args.forEach((v,i)=>put(machine.bytes,S+4+i*4,v));steps+=machine.run(3000000);operations++;const a=memory.subarray(0x10000),b=machine.bytes.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail('fixture'+fixture+' kind'+kind+' entry'+entry.toString(16)+' diff0x'+(o+0x10000).toString(16)+' native'+b[o]+' source'+a[o]);}return result;};
  const body=run(0x429c90,()=>appendAuthoredRaceObject(AUTH,runtime),AUTH);assert.equal(body,memory.readUInt32LE(LIST));assert.equal(body,machine.r.EAX>>>0);
  run(0x429d60,()=>initializeRaceObjectList(runtime));
  if(kind!==10){run(0x476550,()=>stepRawScriptedMotion(body,runtime),body);assert.equal(memory.readUInt16LE(body+0x138),8,'actualscriptconsumer advances authored route');}
 }
 const report={matched:true,targetSha256:program.sha256,fixtures,operations,actualGameCalls:visits,instructionSteps:steps,reachedInstructions:reached.size,domain:'Persistent actual429c90?all4 object constructors?4741c0/4798d0/authored492ae0/492720/spatial remove-register?429d60 activation?476550 opcode0 consumer. Original body templates/dispatch/descriptors and synthetic authored model/header/script data are explicit. All mapped bytes>=10000h after every operation; no game callbacks,only native cookie service. Native constructor-derived stale fields and renderer polygon allocations retained. No original process execution.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceObjectConstruction()));
