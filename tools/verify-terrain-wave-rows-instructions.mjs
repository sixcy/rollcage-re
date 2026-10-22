import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import * as source from '../src/terrain-wave.mjs';
export async function verifyTerrainWaveRows({fixtures=3000,output='analysis/terrain-wave-rows-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,calls=0,seed=0x447740ab;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
 machine.onInstruction=p=>{reached.add(p);if([0x447740,0x447850,0x447920,0x4286e0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
 for(let fixture=0;fixture<fixtures;fixture++){
  const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),pack=0x60000,table=0x61000,first=0x62000,second=0x63000,vertices=0x64000,palette=0x66000,map=0x68000,regions=0x69000,progress=0x6a000,width=[0,1,2,7,31,63][Math.floor(fixture/3)%6],height=2;
  put(0x90b98c,pack);put(pack+0x30,palette);word(pack+0x5c,fixture%11===0?1023:64);put(0x90cb60,map);word(0x90d974,975);m.fill(255,map,map+2048);put(0x909240,table);put(0x9092c0,regions);put(0x90cb98,progress);m[progress+1]=0;word(f.addresses.bucket+6,0);put(0x90d970,0);
  for(let j=0;j<1024;j++)put(palette+j*4,random());
  for(const[index,p]of[first,second].entries()){
   put(table+index*4,p);put(p+8,width);put(p+12,height);put(p+0x20,vertices+index*0x1000);
   for(let row=0;row<=height;row++)for(let col=0;col<=width;col++){const v=vertices+index*0x1000+(row*(width+1)+col)*8;word(v,col*40);word(v+2,index&&fixture%5===0?101:0);word(v+4,row===0?0:row===height?200:100);word(v+6,((col+row)%17)*64+(col&63));}
  }
  // Neighbor's opposite endpoint is made geometrically adjacent.
  for(let col=0;col<=width;col++){word(vertices+0x1000+(height*(width+1)+col)*8+4,0);word(vertices+0x1000+col*8+4,200);}
  word(regions,0);word(regions+2,512);word(regions+4,0);word(regions+6,0);word(regions+8,1);word(regions+10,(Math.min(15,width+1)<<12)|(height<<8));
  word(0x6b000,fixture%3);m[0x6b002]=fixture%2;m[0x6b003]=1;
  machine.reset();m.copy(machine.bytes);const entry=[0x447850,0x447740,0x447920][fixture%3],ecx=entry===0x447850?vertices:entry===0x447740?0x6b000:0,edx=entry===0x447850?((fixture%1024)<<6)|(fixture&63):fixture%2?-1:1;
  const execute=()=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(1000000);calls++;return machine.r.EAX;};
  const compare=label=>{const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
  if(entry===0x447850)source.brightenTerrainWaveVertex(ecx,edx,f);else if(entry===0x447740)source.toggleTerrainWaveRow(ecx,f);else assert.equal(source.findTerrainWaveNeighbor(ecx,edx,f),execute());if(entry!==0x447920)execute();compare(`fixture${fixture}`);
  if(entry===0x447740){source.toggleTerrainWaveRow(ecx,f);execute();compare(`restore${fixture}`);assert.equal(m.readInt32LE(0x90d970),0);}
 }
 const report={method:'Actual447740 row cache toggle/restore plus447850 descending palette remap and447920 endpoint-neighbor search with actual4286e0 lookup. No game/platform callbacks. Width0..63, repeated palette IDs,capacityguard,shortflags,duplicate/current-region rejection,100/101 coordinate cutoff and add→restore sequences. ALLmappedmemory>=10000h compared after everycall. Synthetic terrain/palette/regions/spatial state,no original process execution.',targetSha256:program.sha256,fixtures,calls,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyTerrainWaveRows({fixtures:Number(process.argv[2]??3000)});
