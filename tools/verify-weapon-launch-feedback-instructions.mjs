import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {initializeWeaponLaunchFeedbackTables, publishWeaponLaunchFeedback} from '../src/weapon-launch-feedback.mjs';

export async function verifyWeaponLaunchFeedback({fixtures=6000,output='analysis/weapon-launch-feedback-instruction-check.json'}={}) {
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,formatted=0;
  machine.onInstruction=p=>{reached.add(p);if([0x4728a0,0x46ffa0,0x4579e0,0x439850,0x472700,0x4a0620,0x4a0420].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));machine.externalCalls.set(0x568980,x=>{x.r.ESP-=x.r.EAX;});machine.externalCalls.set(0x5689b0,x=>{x.r.ESP=(x.r.ESP-x.r.EAX)&~15;});
  const string=(m,p)=>m.toString('latin1',p,m.indexOf(0,p));
  for(let i=0;i<fixtures;i++) {
    const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),settings=0x60000,session=0x70000,text=0x80000;
    initializeWeaponLaunchFeedbackTables(m);m.fill(i*17&255,0x7000,0x9100);put(0x5ecb1c,session);put(0x5ecefc,settings);put(0x6e65f4,text);
    const contents='@STRING(PC_MENU_DRIVER_NAMES)\n[\nENGLISH\n[\nAlpha\0~Beta\0~Gamma\0~Delta\0~Epsilon\0~Zeta\0~Eta\0~]\n]\n';m.write(contents,text,'latin1');m[text+contents.length]=0;put(0x6e65e4,contents.length);m.writeUInt16LE(0,0x6e65f0);
    const scenario=Math.floor(i/18),kind=i%18+(scenario%3===0?128:0),flags=[0,1,5,0x41,0x43,0x45,0xc5][Math.floor(scenario/2)%7];put(0x6eafe0,flags);put(0x5ec958,Math.imul(i+1,1734137));m[session+0x54d]=scenario%7;m[session+0x721]=scenario%2?128:0;
    for(let j=0;j<6;j++){const p=0x6e7894+j*0x67c;if(scenario%3)m.write(`Peer${j}\0`,p,'latin1');else m[p]=0;m[session+0x1c+j]=j;m[0x90931d+j*0x30c]=j===scenario%8?1:0;}
    for(let j=0;j<30;j++)m.write('2 used on 1\0',settings+0x104e+j*64,'latin1');put(0x6e9f70,0);put(0x6e7880,0);put(0x6e6d10,0);put(0x56e224,0xa10000);
    const first=[0,1,5,6,-1,0x7fffffff][scenario%6],second=[0,2,5,6,-1,0x80000000][Math.floor(scenario/6)%6],expected=[],actual=[];
    const service=(bytes,trace)=>(name,args)=>{assert.equal(name,'sprintf');const[out,format,...values]=args,pattern=string(bytes,format);let k=0;const rendered=pattern.replace(/%([%s])/g,(_,type)=>type==='%'?'%':string(bytes,values[k++]));assert.equal(k,values.length);trace.push({out,pattern,values:values.map(p=>string(bytes,p))});bytes.write(rendered,out,'latin1');bytes[out+rendered.length]=0;return rendered.length;};
    f.services={crtCall:service(m,expected)};machine.reset();machine.fs0=0;m.copy(machine.bytes);const nativeService=service(machine.bytes,actual);machine.externalCalls.set(0xa10000,x=>{const s=x.r.ESP,out=x.bytes.readUInt32LE(s),format=x.bytes.readUInt32LE(s+4),count=(string(x.bytes,format).match(/%s/g)??[]).length;x.r.EAX=nativeService('sprintf',[out,format,...Array.from({length:count},(_,j)=>x.bytes.readUInt32LE(s+8+j*4))]);});
    publishWeaponLaunchFeedback(first,second,kind,f);machine.entry=0x4728a0;machine.r.ECX=first;machine.r.EDX=second;machine.r.ESP=f.scratchBase;machine.bytes.writeInt32LE(-1,f.scratchBase);machine.bytes.writeInt32LE(kind,f.scratchBase+4);steps+=machine.run(1000000);assert.equal(machine.fs0,0);assert.deepEqual(actual,expected,`CRT${i}`);formatted+=actual.length;
    const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`fixture${i} kind${kind} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report={method:'Actual4728a0 full switch/literal/template feedback→46ffa0 local participant→4579e0/439850 localization→472700 formatting→4a0620 history→guarded4a0420. Allmappedmemory>=10000h and orderedCRTsprintf requests, original switch/stringbytes, forced-byte/network guards, peer/localized/missing IDs and all16 kinds. No game mocks; cookie/CRTformat+stackprobes services, transport interfaceguard, explicit synthetic processedlocalization/session inputs,no original execution.',targetSha256:program.sha256,fixtures,calls:fixtures,formatted,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};
  if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyWeaponLaunchFeedback({fixtures:Number(process.argv[2]??6000)});
