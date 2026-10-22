import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {updateAudioMixerRamp,updateAudioMixerHierarchy} from '../src/audio-mixer-update.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyAudioMixerUpdate({fixtures=2400,output='analysis/audio-mixer-update-instruction-check.json'}={}) {
  const program=await loadRetainedNativeProgram(), machine=new BoundedX86(program.instructions), memory=Buffer.alloc(0xa00000), S=0x9000, object=0x120000, reached=new Set();
  machine.onInstruction=a=>reached.add(a); let steps=0, ramps=0,hierarchies=0,stackAliases=0;
  for(let fixture=0;fixture<fixtures;fixture++) {
    memory.fill(0);program.initializeMemory(memory);memory.fill(0x46,S-256,S+128);
    const levels=[-0.5,-0,0,0.25,0.9,1,1.5],rates=[-3,-0,0.25,2],depth=fixture%5;
    const regs={ESI:0x151500+fixture,EDI:0x161600+fixture};
    const nodes=[object,...Array.from({length:depth},(_,i)=>0x121000+i*0x100)];
    if(depth&&fixture%11===3){nodes[depth]=S-48;stackAliases++;}
    nodes.forEach((p,i)=>{put(memory,p,fixture%2?0x5d3ba8:0x5d4130);put(memory,p+4,nodes[i+1]??0);memory.writeFloatLE(levels[(fixture+i)%levels.length],p+0x28);memory.writeFloatLE(levels[(fixture*3+i)%levels.length],p+0x2c);memory.writeFloatLE(rates[(fixture+i)%rates.length],p+0x30);memory.writeFloatLE(rates[(fixture+i*3)%rates.length],p+0x34);});
    put(memory,S,-1);memory.writeFloatLE(rates[(fixture+2)%rates.length],S+4);
    machine.reset();memory.copy(machine.bytes);Object.assign(machine.r,regs,{ESP:S,ECX:object});
    const runtime={memory,scratchBase:S,entryRegisters:regs};
    if(fixture%3!==1){machine.entry=0x4a9380;updateAudioMixerRamp(object,runtime);steps+=machine.run();ramps++;}
    if(fixture%3!==0){machine.entry=0x4a90f0;machine.r.ESP=S;machine.r.ECX=object;Object.assign(machine.r,regs);updateAudioMixerHierarchy(object,runtime);steps+=machine.run();hierarchies++;}
    assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000),'mapped fixture '+fixture);
    const a=memory.subarray(S-128,S+128),b=machine.bytes.subarray(S-128,S+128);if(!a.equals(b)){const i=b.findIndex((v,i)=>v!==a[i]);assert.fail('fixture '+fixture+' scratch '+(S-128+i).toString(16)+' source '+a[i]+' native '+b[i]);}
    assert.equal(machine.x87.length,0);
  }
  const report={fixtures,ramps,hierarchies,stackAliases,instructionSteps:steps,reachedInstructions:reached.size,matched:true,domain:'Actual4a9380 ramp then4a90f0 hierarchy with original4a9300/9320/9360 getter targets; both native vtables, zero to four ancestors, finite signed gains/rates, parent fields aliasing caller scratch, all10MiB mapped bytes plus256private/caller bytes. No services or game callbacks; JS numeric model does not claim x87 precision-control exceptions/NaN payloads or cyclic parent topology.'};
  if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyAudioMixerUpdate()));
