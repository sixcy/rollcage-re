import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createPlacedModelEffectFixture, placedModelEffectAddresses as a} from './verify-placed-model-effect-update-instructions.mjs';
import {initializeTerrainPointAnimation, updateTerrainPointAnimation} from '../src/terrain-point-animation.mjs';
import {advanceRawEffectParticles, advanceRawBodyDebris} from '../src/particle-lifetime.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

export async function verifyTerrainPointLifecycle({fixtures = 96, frames = 64, withRaceUpdate = false, output = 'analysis/terrain-point-lifecycle-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}, STACK = 0x9000;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
  let steps = 0, calls = 0, constructedVertices = 0, emittedDebris = 0, emittedParticles = 0, freedParticles = 0, freedDebris = 0;
  machine.onInstruction = p => {reached.add(p); if ([0x44a5c0,0x44a7a0,0x438550,0x475e50,0x435ec0,0x4748d0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; if(p===0x44aa42)emittedDebris++;if(p===0x44ab4c)emittedParticles++;if(p===0x435ec0)freedParticles++;if(p===0x475f01)freedDebris++;};
  machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX,m.bytes.readInt32LE(0x5e8890)));
  machine.externalCalls.set(0x7e0100,m=>{assert.equal(m.bytes.readInt32LE(m.r.ESP),0x6000);m.r.EAX=0x6a0000;});
  machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),v=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(v&255,p,p+n);m.r.EAX=p;});
  const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'],{directory:'analysis/native-simulation/results'});
  const contracts = withRaceUpdate ? [...new Set(outer.instructions.filter(i=>i.op==='CALL'&&/^0x/.test(i.args[0])).map(i=>Number(i.args[0])))].filter(p=>![0x44a7a0,0x438550,0x475e50].includes(p)) : [];
  for(const p of contracts){machine.entries.delete(p);machine.externalCalls.set(p,m=>{m.r.EAX=0;});}
  machine.externalCalls.set(0x7e0200,m=>{m.r.ESP+=4;m.r.EAX=0;});
  const execute = entry => {machine.entry=entry;machine.r.ESP=STACK;machine.r.EDX=0;put(machine.bytes,STACK,-1);if(entry===0x450e50)put(machine.bytes,STACK+4,1);steps+=machine.run(3_000_000);calls++;};
  for(let fixture=0;fixture<fixtures;fixture++){
    const f=createPlacedModelEffectFixture(program,fixture),{memory}=f,pack=memory.readUInt32LE(0x90b990),cells=0x6b0000,palette=0x6c0000;
    const count=[0,1,2,12,32,255][fixture%6];memory[pack+0xfc]=count;put(memory,pack+0x100,cells);put(memory,pack+0x118,0x6d0000);memory[pack+0x11c]=2;
    word(memory,0x6d0000,0);word(memory,0x6d0002,3);word(memory,0x6d0008,0);word(memory,0x6d000a,3);
    for(let i=0;i<count;i++){word(memory,cells+i*4,i%4);memory[cells+i*4+2]=0;memory[cells+i*4+3]=i%3;}
    for(let i=0;i<1024;i++)put(memory,palette+i*4,0xa0000000|i*0x010101);put(memory,0x909270,palette);put(memory,0x56e258,0x7e0100);put(memory,0x5ec954,fixture+1);put(memory,0x5ec958,fixture+2);
    put(memory,0x9153c4,f.extraAddresses.particles);put(memory,0x91900c,f.extraAddresses.particles+128*256);put(memory,0x919140,0x0c005678);
    put(memory,0x6f2414,0);put(memory,0x6f2418,0);
    const runtime={memory,scratchBase:STACK,handlers:{allocate:size=>{assert.equal(size,0x6000);return 0x6a0000;}}};
    if(withRaceUpdate){for(const p of contracts)runtime.handlers[`call${p.toString(16)}`]=()=>0;runtime.handlers.audioManagerCall=()=>0;put(memory,0x714b08,0x5a100);put(memory,0x5a100,0x5a200);put(memory,0x5a25c,0x7e0200);}
    machine.reset();memory.copy(machine.bytes);
    const compare=label=>{const native=machine.bytes.subarray(0x10000),source=memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${fixture}/${label} byte${(offset+0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}};
    initializeTerrainPointAnimation(runtime);execute(0x44a5c0);compare('constructor');constructedVertices+=memory.readInt32LE(0x90b998);
    for(let frame=0;frame<frames;frame++){
      if(withRaceUpdate){runRaceUpdate(0,1,runtime);execute(0x450e50);compare(`frame${frame}`);}
      else{advanceRawBodyDebris(runtime);execute(0x475e50);compare(`debris${frame}`);advanceRawEffectParticles(runtime);execute(0x438550);compare(`particles${frame}`);updateTerrainPointAnimation(runtime);execute(0x44a7a0);compare(`points${frame}`);}
    }
  }
  assert(emittedDebris>0&&emittedParticles>0&&freedParticles>0&&freedDebris>0);
  const report={method:'Actual44a5c0 authored-cell corner dedup/base capture/phase RNG/palette constructor ->persistent44a7a0 point/debris/particle update with actual475e50/438550 consumers, allocation/reuse/removal. All mapped bytes>=10000h compare after every call. Other39outer game stages and audio-manager virtual call are contracts in optional450e50 variant. Ordinary CRT allocate/memset and compiler cookie are the only boundaries within this graph. Authored cells, scene and backing effect pools are constructed inputs; no whole resource loader or original process execution.',targetSha256:program.sha256,fixtures,frames,withRaceUpdate,otherOuterContracts:contracts.length,calls,constructedVertices,emittedDebris,emittedParticles,freedParticles,freedDebris,executedInstructions:reached.size,instructionSteps:steps,visits,evidence:program.references.map(r=>r.evidence),matched:true};
  if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyTerrainPointLifecycle({fixtures:Number(process.argv[2]??96)});
