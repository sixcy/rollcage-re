import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture,scriptFixtureAddresses as a} from './lib/raw-scripted-motion-fixtures.mjs';
import {stepRawScriptedMotion,emitScriptedReleaseDebris,releaseRawScriptedBody} from '../src/raw-scripted-motion.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
export async function loadRawScriptedProgram(){
  const program=await loadRetainedNativeProgram(),exe=await readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');assert.equal(createHash('sha256').update(exe).digest('hex'),program.sha256);
  const pe=exe.readUInt32LE(60),optional=pe+24,base=exe.readUInt32LE(optional+28),sections=optional+exe.readUInt16LE(pe+20),tables=[];
  for(const[address,length]of[[0x476dcc,36],[0x574ab0,1028]]){let found=false;for(let i=0;i<exe.readUInt16LE(pe+6);i++){const p=sections+i*40,rva=exe.readUInt32LE(p+12),size=exe.readUInt32LE(p+16);if(address-base>=rva&&address-base+length<=rva+size){const start=exe.readUInt32LE(p+20)+address-base-rva;tables.push([address,exe.subarray(start,start+length)]);found=true;break;}}assert.ok(found);}
  return {...program,initializeMemory(memory){program.initializeMemory(memory);for(const[address,bytes]of tables)bytes.copy(memory,address);return memory;}};
}
export async function verifyRawScriptedMotion({fixtures=4400,output='analysis/raw-scripted-motion-connected-instruction-check.json'}={}){
  const program=await loadRawScriptedProgram(),machine=new BoundedX86(program.instructions),memory=Buffer.alloc(0xa00000),reached=new Set(),calls={},histogram={};let seed=0x476550af,steps=0,released=0;
  const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n;},signed=()=>random(0x100000000)|0;
  machine.onInstruction=address=>{reached.add(address);if([0x474850,0x474600,0x46e600,0x46e4e0,0x435ba0,0x435f20,0x474670].includes(address))calls[address.toString(16)]=(calls[address.toString(16)]??0)+1;};
  const ranges=[[a.body,0x800],[a.script,0x3000],[a.rows,0x1000],[a.bucket,32],[a.free,0x200],[a.debris,32*128],[a.particles,16*256],[0x5ec954,8],[0x902b7c,20],[0x6e65b4,24],[0x91d45c,8],[0x8106e0,0x244],[0x9153c4,0x28],[0x919000,0x144],[0x91cd60,0x38]];
  for(let fixture=0;fixture<fixtures;fixture++){
    memory.fill(0);machine.reset();program.initializeMemory(memory);const runtime=createRawScriptFixture({memory,freeCount:fixture%33});runtime.roundingMode=['nearest-even','toward-zero','down','up'][fixture%4];
    for(const p of[0x34,0x38,0x3c,0x40,0x44,0x48,0x68,0x6c,0x70,0x108,0x180])put(memory,a.body+p,signed());put(memory,a.body+0xa8,[0,65536,32768,-65536,2147483647,-2147483648,-1][fixture%7]);word(memory,a.body+0x184,random(65536));
    word(memory,a.body+0x13a,[0,1,2,4096,65535,32768][random(6)]);word(memory,a.body+0x13c,[0,1,2,65535][random(4)]);memory[a.body+0x13f]=random(4);
    const opcode=[0,1,2,3,4,5,6,7,8,9,-1][fixture%11];histogram[opcode]=(histogram[opcode]??0)+1;word(memory,a.script,opcode);
    if(opcode===0){for(const o of[2,4,6])word(memory,a.script+o,random(65536));}
    if(opcode===1){for(const o of[2,4,6,8,10])word(memory,a.script+o,random(65536));}
    if(opcode===2){for(const o of[4,8,12])put(memory,a.script+o,signed());word(memory,a.script+16,6);word(memory,a.script+18,2);word(memory,a.script+24,5);}
    if(opcode===4){word(memory,a.body+0x138,200);word(memory,a.script+200,4);word(memory,a.script,0);for(const o of[2,4,6])word(memory,a.script+o,random(65536));}
    if(opcode===6){word(memory,a.script+2,[1,2,99,100,-1][random(5)]);word(memory,a.script+4,random(65536));word(memory,a.script+8,5);}
    if(opcode===3||opcode===7){const count=3;word(memory,a.script+2,count);memory[a.body+0x13e]=random(3);word(memory,a.body+0x13a,[0,1,16,4096,65535,2048][random(6)]);for(let i=0;i<count+3;i++){word(memory,a.script+4+i*16,[0,16,128,1024,4096][random(5)]);word(memory,a.script+6+i*16,[0,1,0x31,2,3,15][random(6)]);[i*65536,(i*i+1)*12000,(i*3+2)*17000].forEach((v,j)=>put(memory,a.script+8+i*16+j*4,v));}word(memory,a.script+100,5);if(fixture%2)put(memory,a.body,0x2000|26);}
    let entry=0x476550,ecx=a.body,edx=0,args=[],result;
    if(fixture%37===0){entry=0x46e600;edx=[-1,0,1,7,16,35][fixture%6];}
    else if(fixture%41===0){entry=0x46e4e0;args=[a.body,0,0];put(memory,a.body,fixture%2?0x2000|26:26);}
    memory.copy(machine.bytes);if(entry===0x46e600)emitScriptedReleaseDebris(a.body,edx,runtime);else if(entry===0x46e4e0)releaseRawScriptedBody(a.body,runtime);else{result=stepRawScriptedMotion(a.body,runtime);released+=result.released?1:0;}
    machine.entry=entry;machine.fpuRounding=runtime.roundingMode;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=a.stack;put(machine.bytes,a.stack,-1);args.forEach((v,i)=>put(machine.bytes,a.stack+4+i*4,v));
    try{steps+=machine.run(3000000);for(const[p,n]of ranges){const native=machine.bytes.subarray(p,p+n),port=memory.subarray(p,p+n);if(!native.equals(port)){const o=native.findIndex((v,i)=>v!==port[i]);throw Error(`raw script fixture${fixture} opcode${opcode} entry${entry.toString(16)} difference0x${(p+o).toString(16)} native${native[o]} JS${port[o]}`);}}}catch(error){console.error({fixture,opcode,entry:entry.toString(16),calls});throw error;}
  }
  const aliasFixtures=1200,aliasKinds={};
  for(let fixture=0;fixture<aliasFixtures;fixture++){
    memory.fill(0);machine.reset();program.initializeMemory(memory);const runtime=createRawScriptFixture({memory}),kind=fixture%4;aliasKinds[kind]=(aliasKinds[kind]??0)+1;
    if(kind===0){const script=a.body+0x66;put(memory,a.body+0x134,script);word(memory,script,0);for(const o of[2,4,6])word(memory,script+o,random(65536));}
    else if(kind===1){const script=a.body+0x2c;put(memory,a.body+0x134,script);put(memory,a.body,0x8000|26);word(memory,script,2);put(memory,script+4,5);put(memory,script+8,signed());put(memory,script+12,signed());}
    else if(kind===2){put(memory,a.pack+0xa8,a.body+0x32);for(const o of[0x32,0x34,0x36])word(memory,a.body+o,random(65536));word(memory,a.script,5);word(memory,a.script+200,4);word(memory,a.body+0x138,200);}
    else{const script=a.script+256;put(memory,a.body+0x134,script);put(memory,a.body+12,a.body+0x12c);word(memory,script,2);for(const o of[4,8,12])put(memory,script+o,signed());word(memory,script+16,5);word(memory,a.script+16,6);word(memory,a.script+18,2);word(memory,a.script+24,5);}
    memory.copy(machine.bytes);stepRawScriptedMotion(a.body,runtime);machine.entry=0x476550;machine.r.ECX=a.body;machine.r.ESP=a.stack;put(machine.bytes,a.stack,-1);steps+=machine.run(3000000);
    for(const[p,n]of ranges){const native=machine.bytes.subarray(p,p+n),port=memory.subarray(p,p+n);if(!native.equals(port)){const o=native.findIndex((v,i)=>v!==port[i]);throw Error(`alias fixture${fixture} kind${kind} difference0x${(p+o).toString(16)} native${native[o]} JS${port[o]}`);}}
  }
  const report={method:'Actual476550 VM,476df0 curve,46e4e0 release,46e600 debris emission and actual474850/474600/4286e0/4746f0 spatial operations, all reached numeric helpers. Unscripted release runs actual435ba0 and reached particle/debris/color children; the sound bank is explicitly empty, so actual484bb0/40ea40 return without platform services. Raw body,bytecode,spawn,pool,spatial,RNG,root scratch and effect-global ranges compared. Additional live-memory cases cover velocity-word capture,forward teleport aliases,spawn/body aliases and actual spatial removal mutating script+134 before the next opcode reload. Synthetic authored scripts/runtime storage; no original process execution.',fixtures,released,histogram,aliasFixtures,aliasKinds,calls,reachedInstructions:reached.size,instructionSteps:steps,reachedExternalCalls:[...machine.externalCalls.keys()],matched:true};
    if(output){try{await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const retained=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(retained,report,'Existing report differs; choose a new output filename.');}}console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyRawScriptedMotion();
