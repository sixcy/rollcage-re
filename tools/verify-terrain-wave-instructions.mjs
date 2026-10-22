import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createTerrainWaveFixture} from './lib/terrain-wave-fixtures.mjs';
import * as source from '../src/terrain-wave.mjs';
export async function verifyTerrainWave({fixtures=2400,lifecycles=24,output='analysis/terrain-wave-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0;const watched=new Set([0x446d90,0x447050,0x447740,0x447850,0x447920,0x41f670,0x41f410,0x41f490,0x436630,0x435df0,0x484bb0,0x40ea40,0x4710f0]);machine.onInstruction=p=>{reached.add(p);if(watched.has(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 const execute=(entry,ecx=0,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,0x9004+i*4));steps+=machine.run(3000000);calls++;return machine.r.EAX;};
 const compare=(m,label)=>{const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,i)=>v!==b[i]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
 for(let i=0;i<fixtures;i++){
  const f=createTerrainWaveFixture(program,i*17+Math.floor(i/3)*2),m=f.memory,entry=[0x446d90,0x447050,0x41f670][i%3],localMode=i&1;machine.reset();m.copy(machine.bytes);let expected;
  if(entry===0x446d90)expected=source.activateTerrainWave(f.record,localMode,0,0x70000,0,f);else if(entry===0x447050)source.updateTerrainWave(f);else source.updateTerrainWaveContactScores(f.record,i&1?1:-1,f);
  const actual=execute(entry,f.record,entry===0x41f670?(i&1?1:-1):entry===0x446d90?localMode:0,entry===0x446d90?[0,0x70000,0]:[]);if(expected!==undefined)assert.equal(actual,expected);compare(m,`fixture${i}/${entry.toString(16)}`);
 }
 for(let i=0;i<lifecycles;i++){
  const f=createTerrainWaveFixture(program,i),m=f.memory;m.writeInt32LE(0,0x6eafe0);m.writeInt32LE(0,0x90cb80);machine.reset();m.copy(machine.bytes);assert.equal(source.activateTerrainWave(f.record,0,0,0x70000,0,f),execute(0x446d90,f.record,0,[0,0x70000,0]));compare(m,`activation${i}`);
  for(let tick=0;tick<240;tick++){m.writeInt32LE(tick,0x90a548);machine.bytes.writeInt32LE(tick,0x90a548);source.updateTerrainWave(f);execute(0x447050);compare(m,`lifecycle${i}/${tick}`);}assert.equal(m.readInt32LE(0x90cb80),0);assert.equal(m.readInt32LE(0x90d970),0);
 }
 const report={method:'Actual446d90 receive/local activation→447050 full240tick lifecycle with447740/447850 terrain cache/palette,447920 endpoint adjacency,41f670 wrapped-progress contact scores+actualscorechildren,actual436630 particle/audio game children. Only compiler cookie service; empty sound bank and local4710f0 executes its disabled-network guard. ALLmappedmemory>=10000h compared after eachcall,no differingbytesexcluded. Synthetic terrain/palette/session/spatial/particle inputs,no original process execution.',targetSha256:program.sha256,fixtures,lifecycles,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyTerrainWave({fixtures:Number(process.argv[2]??2400),lifecycles:Number(process.argv[3]??24)});
