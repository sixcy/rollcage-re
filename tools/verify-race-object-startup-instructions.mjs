import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeRaceObjectType20} from '../src/race-object-update.mjs';
import {initializeRaceObjectList,initializeAnimatedRaceObject,initializeFourShapeRaceObject,initializeOptionalRouteRaceObject,initializeRaceObjectStartupTables} from '../src/race-object-startup.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export async function verifyRaceObjectStartup({fixtures=2400,output='analysis/race-object-startup-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),S=0x9000,BODY=0x100000,LIST=0x120000,POLY=0x130000,ROUTE=0x150000,PHYSICAL=0x160000,SHAPES=0x180000,FREE=0x190000,ACTIVE=0x190100,REVERSE=0x190200;
  let steps=0,cookies=0,registrations=0,parents=0;const reached=new Set(),entries={};machine.onInstruction=p=>{if(p===0x42a1e5)put(machine.bytes,machine.r.ESP-4,0x42a1ea);reached.add(p);if(p===0x428270)registrations++;if(p===0x429d60)parents++;};machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890));cookies++;});
  for(let fixture=0;fixture<fixtures;fixture++){
    memory.fill(0);program.initializeMemory(memory);initializeRaceObjectStartupTables(memory);memory.fill(0x36,0x5000,S+128);put(memory,0x5e8890,0x12345678^fixture);
    put(memory,0x91e77c,LIST);const count=fixture%13;put(memory,0x91e778,count);put(memory,0x9092b4,ROUTE);for(let i=0;i<256;i++)word(memory,ROUTE+i*2,0x300+i*14);
    put(memory,0x902bc0,PHYSICAL);word(memory,0x902bc4,fixture%5);for(let i=0;i<fixture%5;i++)put(memory,PHYSICAL+i*4,0x115000+i*512);put(memory,0x82e900,fixture%7);
    put(memory,0x91e79c,SHAPES);put(memory,0x91e780,FREE);put(memory,0x91e78c,ACTIVE);put(memory,0x91e790,REVERSE);put(memory,0x91e794,255);put(memory,0x91e784,-1);put(memory,0x91e798,0);for(let i=0;i<256;i++)memory[FREE+i]=(i*73+fixture)&255;memory.fill(0xa5,SHAPES,SHAPES+256*72);
    const kinds=[20,25,29,31,32,35,0,19,21,34,36,511];for(let i=0;i<13;i++){const body=BODY+i*512;memory.fill(0x93,body,body+512);put(memory,body,kinds[(fixture+i)%kinds.length]|(fixture%2?0x8000:0));put(memory,body+20,POLY+i*0x2000);word(memory,body+0x138,fixture%9===0?0:(i+fixture)%128);word(memory,body+0x13a,i*193-fixture*71);put(memory,LIST+i*4,body);for(let j=0;j<0x1400;j++)memory[POLY+i*0x2000+j]=(j*17+fixture+i*37)&255;}
    //Readable aliases exercise captured list/count and authored-index policy.
    if(fixture%31===0)put(memory,0x902bc0,0x91e778);
    if(fixture%37===0)put(memory,0x902bc0,BODY+0x138-(fixture%5)*4);
    if(fixture%41===0)put(memory,LIST+4,BODY);
    if(fixture%43===0)memory[0x429df0+5]=4; //valid mutable dispatch?default
    const which=fixture%4,entry=[0x429d60,0x40ff90,0x46e8c0,0x429eb0][which],regs={EBX:0x313100+fixture,EBP:0x323200+fixture,ESI:0x333300+fixture,EDI:0x343400+fixture};
    entries[entry.toString(16)]=(entries[entry.toString(16)]??0)+1;machine.reset();machine.fs0=0;memory.copy(machine.bytes);const beforeCookies=cookies;const sourceCookies=[];const runtime={memory,scratchBase:S,entryRegisters:regs,services:{securityCookie:v=>{assert.equal(v,memory.readUInt32LE(0x5e8890));sourceCookies.push(v);}}};
    [initializeRaceObjectList,initializeAnimatedRaceObject,initializeFourShapeRaceObject,initializeOptionalRouteRaceObject][which](...(which?[BODY,runtime]:[runtime]));
    machine.entry=entry;machine.r.ESP=S;machine.r.ECX=BODY;Object.assign(machine.r,regs);put(machine.bytes,S,-1);steps+=machine.run(3000000);assert.equal(sourceCookies.length,cookies-beforeCookies,'ordered actual type20 cookie invocation count');
    const a=memory.subarray(0x10000),b=machine.bytes.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail('fixture'+fixture+' entry'+entry.toString(16)+' diff0x'+(o+0x10000).toString(16)+' native'+b[o]+' source'+a[o]);}
  }
  const privateFrameAliases=120;
  for(let fixture=0;fixture<privateFrameAliases;fixture++){
    memory.fill(0);program.initializeMemory(memory);memory.fill(0x36,0x5000,S+512);put(memory,S,-1);put(memory,0x5e8890,0x12345678);const frame=S-36;
    put(memory,BODY+20,frame+[0,4,8,12][fixture%4]-0x122d);const regs={EBX:fixture*0x10101+0x41424344,ESI:fixture*0x30303+0x51525354,EDI:fixture*0x50505+0x61626364};machine.reset();memory.copy(machine.bytes);
    initializeRaceObjectType20(BODY,{memory,scratchBase:S,entryRegisters:regs,services:{securityCookie:v=>assert.equal(v,0x12345678)}});
    machine.entry=0x42a0e0;machine.r.ESP=S;machine.r.ECX=BODY;Object.assign(machine.r,regs);steps+=machine.run(100000);
    assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000),'actualUVreads of saved-register/local/return bytes');assert.deepEqual(memory.subarray(frame,S),machine.bytes.subarray(frame,S),'complete36byte type20 parent frame');
  }
  const report={matched:true,targetSha256:program.sha256,fixtures,privateFrameAliases,entries,parentCalls:parents,shapeRegistrations:registrations,nativeCookieChecks:cookies,instructionSteps:steps,reachedInstructions:reached.size,domain:'Actual429d60 dispatch and40ff90/46e8c0/429eb0 with existing actual42a0e0 and428270 shape registration/fixed sqrt children. All mapped bytes>=10000h including body/polygon/physical/effect/shape/free-active-reverse/global state; original descriptors/jump table,alltypebranches,zero/nonzero routes,duplicatebody/list/count/index aliases and wrapping fields. Supplied body/list/pool/route producers are explicit; only compiler cookie service external. No original process execution.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceObjectStartup()));
