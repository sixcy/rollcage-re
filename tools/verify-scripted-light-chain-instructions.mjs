import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRawScriptedProgram} from './verify-raw-scripted-motion-instructions.mjs';
import {createRawScriptFixture,scriptFixtureAddresses as a} from './lib/raw-scripted-motion-fixtures.mjs';
import {createDynamicLightFixture,lightAddresses as l} from './verify-dynamic-light-state-instructions.mjs';
import {initializeAuthoredDynamicLights,updateDynamicLights} from '../src/dynamic-light-state.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export async function verifyScriptedLightChain({scenarios=160,frames=12,output='analysis/scripted-light-chain-instruction-check.json'}={}){
  const program=await loadRawScriptedProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),template=createDynamicLightFixture(0).memory;
  const ranges=[[a.body,0x800],[a.script,0x4000],[a.debris,32*128],[a.particles,16*256],[a.bucket,32],[a.free,0x200],[l.bands,0x3000],[0x80f140,0x17f0],[0x8106e0,0x244],[0x5ec954,8],[0x70dcf4,4],[0x70e200,0x100],[0x6e6b44,4],[0x6e65b4,24],[0x902b7c,20],[0x91d45c,8],[0x919000,0x144],[0x9153c4,0x28],[0x91cd60,0x38]];
  const visits={},watched=new Set([0x44e220,0x44d960,0x476550,0x46e4e0,0x46e600,0x435ba0,0x474670]);let steps=0,cookies=0;
  machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX|0,m.bytes.readInt32LE(0x5e8890));cookies++;});
  machine.onInstruction=address=>{if(watched.has(address))visits[address.toString(16)]=(visits[address.toString(16)]??0)+1;};
  for(let scenario=0;scenario<scenarios;scenario++){
    memory.fill(0);machine.reset();program.initializeMemory(memory);const runtime=createRawScriptFixture({memory,freeCount:scenario%33});
    for(const[p,n]of[[l.rows,0x1000],[l.indices,0x200],[l.buckets,32],[l.segments,0x500],[l.bounds,0x100],[l.ranges,0x100],[l.bands,0x3000],[0x80f140,0x17f0],[0x8106e0,0x244],[0x909240,4],[0x90924c,4],[0x9092c0,4],[0x5e8890,4]])template.copy(memory,p,p,p+n);
    put(memory,0x909268,1);put(memory,0x90926c,0x36000);put(memory,0x9092ac,0x37000);put(memory,0x9092b4,a.script);put(memory,0x70dcf4,0);put(memory,0x6e6b44,0);
    memory[0x36000]=scenario;memory[0x36001]=scenario*3&255;memory[0x36002]=scenario*7&255;memory[0x3600c]=10;memory[0x3600d]=1;memory[0x3600e]=1;memory[0x3600f]=scenario%4;
    put(memory,0x36010,(32<<20)|(16<<8)|1);word(memory,0x37002,64);word(memory,0x37004,72);for(let i=0;i<4;i++)word(memory,0x37040+i*2,scenario*701+i*997);
    word(memory,a.script+2,256);const script=a.script+256,kind=scenario%4;
    if(kind===0){word(memory,script,0);word(memory,script+2,256+scenario);word(memory,script+4,-3);word(memory,script+6,5);word(memory,script+8,5);}
    else if(kind===1){word(memory,script,1);word(memory,script+2,3);word(memory,script+6,16);word(memory,script+8,-32);word(memory,script+10,64);word(memory,script+12,5);}
    else if(kind===2){word(memory,script,2);[0x2000000+scenario*65536,-0x1800000,0x1000000].forEach((v,i)=>put(memory,script+4+i*4,v));word(memory,script+16,0);word(memory,script+18,17);word(memory,script+20,29);word(memory,script+22,-41);word(memory,script+24,5);}
    else{word(memory,script,7);word(memory,script+2,1);word(memory,script+4,4096);for(let i=0;i<4;i++)[i*65536,(i+scenario%3)*12000,(i*3+2)*17000].forEach((v,j)=>put(memory,script+8+i*16+j*4,v));word(memory,script+68,3);word(memory,script+70,1);word(memory,script+90,2);}
    memory.copy(machine.bytes);
    const call=(entry,ecx=0)=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.ESP=a.stack;put(machine.bytes,a.stack,-1);steps+=machine.run(3000000);};
    const compare=stage=>{for(const[p,n]of ranges){const native=machine.bytes.subarray(p,p+n),port=memory.subarray(p,p+n);if(!native.equals(port)){const o=native.findIndex((v,i)=>v!==port[i]);throw Error(`script/light scenario${scenario}/${stage} difference0x${(p+o).toString(16)} native${native[o]} JS${port[o]}`);}}};
    initializeAuthoredDynamicLights(runtime);call(0x44e220);compare('authored');assert.equal(memory.readInt32LE(a.body+0xa8),-1);
    for(let frame=0;frame<frames;frame++){updateDynamicLights(frame&1,runtime);call(0x44d960,frame&1);compare(`frame${frame}`);}
  }
  const report={method:'Actual authored44e220 light/384-byte mini-body producer followed by44d960 light updates and default476550 raw VM, all reached release/effect/spatial/numeric callees. No game callbacks or handler mocks; compiler cookie check is an explicit validated service. Original authored script/palette/spawn/runtime mapping input is explicit synthetic storage; constructorFF mass/orientation gaps are preserved. Four scripts: velocity/stop,timed velocity,teleport/velocity and orienting path→scripted release→unscripted effect policy. Actual constructor and persistent body/light/band/debris/particle/RNG/registration/effect bytes compared after construction and each frame. Empty native sound bank avoids platform calls. No original-process observation.',scenarios,frames,calls:scenarios*(frames+1),actualGameCalls:visits,instructionSteps:steps,cookieChecks:cookies,externalCalls:[...machine.externalCalls.keys()],matched:true};
  if(output){try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(JSON.parse(await readFile(output,'utf8')),report,'Existing report differs; choose new output filename.');}}console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyScriptedLightChain();
