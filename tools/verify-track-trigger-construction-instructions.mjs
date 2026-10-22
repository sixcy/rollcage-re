import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeTrackTriggerSegments} from '../src/track-trigger-construction.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyTrackTriggerConstruction({fixtures=2400,output='analysis/track-trigger-construction-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),S=0x9000;let steps=0,cookies=0;const reached=new Set();machine.onInstruction=p=>{reached.add(p);if(p===0x41b820)put(machine.bytes,machine.r.ESP-4,0x41b825);};machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890));cookies++;});
 for(let fixture=0;fixture<fixtures;fixture++){memory.fill(0);program.initializeMemory(memory);memory.fill(0x36,0x5000,S+512);put(memory,0x5e8890,0x12345678);put(memory,0x5ecb1c,0x100000);memory[0x100579]=fixture%32;const count=[0,1,2,39,40,42][Math.floor(fixture/32)%6];put(memory,0x6e6550,count);
  for(let i=0;i<count;i++){const r=0x91f6c0+i*56;put(memory,r,i%3===0?0:1);const first=[0,4,8].map((_,a)=>fixture%7===0?0:Math.imul(fixture*(a+1)+i*17,0x310001));const last=first.map((v,a)=>fixture%7===0?v:(v+(a+1)*fixture*7919)|0);for(let a=0;a<3;a++){put(memory,r+4+a*4,first[a]);put(memory,r+16+a*4,last[a]);}}
  const regs={EBX:0x303030+fixture,EBP:0x313131+fixture,ESI:0x323232+fixture,EDI:0x333333+fixture};machine.reset();memory.copy(machine.bytes);initializeTrackTriggerSegments({memory,scratchBase:S,entryRegisters:regs});machine.entry=0x41aab0;machine.r.ESP=S;Object.assign(machine.r,regs);put(machine.bytes,S,-1);steps+=machine.run(1000000);const a=memory.subarray(0x10000),b=machine.bytes.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail('fixture'+fixture+' count'+count+' diff0x'+(o+0x10000).toString(16)+' native'+b[o]+' source'+a[o]);}assert.deepEqual(memory.subarray(S-0x474,S),machine.bytes.subarray(S-0x474,S),'complete original trigger parent frame');
 }
 const report={matched:true,targetSha256:program.sha256,fixtures,cookieChecks:cookies,instructionSteps:steps,reachedInstructions:reached.size,domain:'Actual41aab0 literal per-track trigger construction,40entrycap,live selector/count and actual417610/41c9c0/41c990 numeric children. All mapped bytes>=10000h and entire1140byte parent frame. Synthetic preexisting segment/input session state; original literal stack data preserved. Native compiler guard only external; no original process execution.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyTrackTriggerConstruction()));
