import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {stepScriptedMotion,scriptedCurveVelocity} from '../src/scripted-motion.mjs';
const own=await readInstructionEvidence(['051-scripted-motion-assembly.json','057-scripted-curve-assembly.json','027-contact-normal-combine-assembly.json'],{directory:'analysis/native-simulation/results'}),math=await readInstructionEvidence(['244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json','256-wheel-cross-assembly.json','378-contact-normalize-assembly.json','379-contact-vector-scale8-assembly.json']);
const instructions=[...own.instructions,...math.instructions],evidence=[...own.evidence,...math.evidence],table=JSON.parse(await readFile('src/scripted-curve-table.json','utf8')),exe=await readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');
assert.equal(createHash('sha256').update(exe).digest('hex'),table.executableSHA256);assert.equal(exe.subarray(table.fileOffset,table.fileOffset+table.length).toString('hex'),table.hex);
const reply=JSON.parse(await readFile('analysis/native-simulation/results/065-scripted-curve-table.json','utf8')),tableEvidence=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text);assert.equal(tableEvidence.normalized_result.bytes_hex,table.hex);
const pe=exe.readUInt32LE(60),optional=pe+24,base=exe.readUInt32LE(optional+28),sections=optional+exe.readUInt16LE(pe+20);
function readVirtual(address,length){for(let i=0;i<exe.readUInt16LE(pe+6);i++){const p=sections+i*40,rva=exe.readUInt32LE(p+12),size=exe.readUInt32LE(p+16);if(address-base>=rva&&address-base+length<=rva+size)return exe.subarray(exe.readUInt32LE(p+20)+address-base-rva,exe.readUInt32LE(p+20)+address-base-rva+length);}throw Error('Unbacked virtual read.');}
let activeBody,nativeLog,portLog,seed=0x476550ce,steps=0,checks=0,destroyed=0,orientationUpdates=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,root=0x10000,scriptBase=0x30000;
const put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4)),get=(bytes,p)=>[0,4,8].map(offset=>bytes.readInt32LE(p+offset));
const vectors=[['position',0x34],['momentum',0x40],['linearVelocity',0x68]],words=[['scriptOffset138',0x138],['scriptTimer13a',0x13a],['scriptActionTimer13c',0x13c],['scriptField184',0x184]];
function encode(bytes,p,body){bytes.writeInt32LE(body.flags,p);for(const[name,offset]of vectors)put(bytes,p+offset,body[name]);bytes.writeInt32LE(body.mass,p+0xa8);bytes.writeInt32LE(body.integrationFlags,p+0x108);bytes.writeUInt32LE(scriptBase,p+0x134);for(const[name,offset]of words)bytes.writeUInt16LE(body[name]&65535,p+offset);bytes[p+0x13e]=body.scriptSegment13e;bytes[p+0x13f]=body.scriptSpawnIndex13f;bytes.writeInt32LE(body.scriptField180,p+0x180);body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,p+0xc4+index*2));}
const boundaryChange=(body,name)=>{if(name==='removeSpatial'&&(body.scriptField184&1))body.flags|=0x8000;if(name==='triggerEffect')body.scriptField184=0xcafe;};
const machine=new BoundedX86(instructions,{entry:0x476550,externalCalls:new Map([
 [0x474850,m=>{nativeLog.push(['removeSpatial',get(m.bytes,root+0x34)]);if(m.bytes.readUInt16LE(root+0x184)&1)m.bytes.writeInt32LE(m.bytes.readInt32LE(root)|0x8000,root);}],
 [0x474600,m=>nativeLog.push(['insertSpatial',get(m.bytes,root+0x34)])],
 [0x46e600,m=>{nativeLog.push(['triggerEffect',m.r.EDX]);m.bytes.writeUInt16LE(0xcafe,root+0x184);}],
 [0x46e4e0,m=>nativeLog.push(['destroyBody',m.bytes.readUInt32LE(m.r.ESP+4),m.bytes.readUInt32LE(m.r.ESP+8)])]
])});
Buffer.from(table.hex,'hex').copy(machine.bytes,0x574ab0);readVirtual(0x476dcc,36).copy(machine.bytes,0x476dcc);machine.bytes.writeFloatLE(1,0x5dc774);machine.bytes.writeFloatLE(4096,0x5dca88);
const modes=['nearest-even','toward-zero','down','up'],histogram={},fixtures=5000;
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();machine.fpuRounding=modes[fixture%4];nativeLog=[];portLog=[];const bytes=machine.bytes,script=Buffer.alloc(512,0),body={flags:[3,26,0x8000|26][random(3)],position:[signed(),signed(),signed()],momentum:[signed(),signed(),signed()],linearVelocity:[signed(),signed(),signed()],mass:[65536,32768,98304,0,-65536,2147483647,-2147483648][random(7)],rotation:Array.from({length:9},()=>random(65536)-32768),integrationFlags:signed(),scriptOffset138:0,scriptTimer13a:[0,1,2,4096,65535,32768][random(6)],scriptActionTimer13c:[0,1,2,65535][random(4)],scriptSegment13e:0,scriptSpawnIndex13f:random(4),scriptField180:signed(),scriptField184:random(65536)};
 const opcode=[0,1,2,3,4,5,6,7,8,9,-1][fixture%11];let at=0;
 if(opcode===4){body.scriptOffset138=200;script.writeInt16LE(4,200);script.writeInt16LE(0,0);at=0;}else script.writeInt16LE(opcode,0);
 if(opcode===0||opcode===4){[2,4,6].forEach(p=>script.writeInt16LE(random(65536)-32768,at+p));}
 else if(opcode===1){[2,4,6,8,10].forEach(p=>script.writeInt16LE(random(65536)-32768,p));if(fixture%5===0)script.writeUInt16LE(0,2);}
 else if(opcode===2){put(script,4,[signed(),signed(),signed()]);script.writeInt16LE(6,16);script.writeInt16LE(random(110)-5,18);script.writeUInt16LE(random(65536),20);script.writeInt16LE(5,24);}
 else if(opcode===6){script.writeInt16LE([2,1,99,100,-1][random(5)],2);script.writeUInt16LE(random(65536),4);script.writeInt16LE(5,8);}
 else if(opcode===3||opcode===7){
  const count=3;script.writeInt16LE(count,2);body.scriptSegment13e=random(count);body.scriptTimer13a=[0,1,16,4096,65535,2048][random(6)];
  for(let i=0;i<count+3;i++){script.writeUInt16LE([0,16,128,1024,4096][random(5)],4+i*16);script.writeUInt16LE([0,1,0x31,2,3,15][random(6)],6+i*16);const point=fixture%5===0?[i*65536,0,0]:[i*65536,(i*i+1)*12000,(i*3+2)*17000];put(script,8+i*16,point);}
  script.writeInt16LE(5,52+count*16);
 }
 const spawns=Buffer.alloc(32);for(let index=0;index<16;index++)spawns.writeInt16LE(random(65536)-32768,index*2);
 bytes.fill(0xa5,root,root+0x400);encode(bytes,root,body);script.copy(bytes,scriptBase);spawns.copy(bytes,0x50000);bytes.writeUInt32LE(0x40000,0x90b990);bytes.writeUInt32LE(0x50000,0x400a8);
 const expected=Buffer.from(bytes.subarray(root,root+0x400)),beforeRotation=body.rotation.slice(),handlers=Object.fromEntries(['removeSpatial','insertSpatial','triggerEffect','destroyBody'].map(name=>[name,(target,...args)=>{portLog.push(name==='removeSpatial'||name==='insertSpatial'?[name,target.position.slice()]:[name,...args]);boundaryChange(target,name);} ]));
 const result=stepScriptedMotion(body,{bytecode:script,spawnPositions:spawns,handlers,roundingMode:machine.fpuRounding});encode(expected,0,body);machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 const actual=bytes.subarray(root,root+0x400);if(!actual.equals(expected)){const differences=[];for(let p=0;p<1024;p++)if(actual[p]!==expected[p])differences.push(['0x'+p.toString(16),actual[p],expected[p]]);throw Error(`Scripted-motion body mismatch ${JSON.stringify({fixture,opcode,body,differences,nativeLog,portLog})}`);}
 assert.deepEqual(nativeLog,portLog,`callbacks ${fixture}`);assert.ok(bytes.subarray(scriptBase,scriptBase+script.length).equals(script),`bytecode ${fixture}`);destroyed+=result.destroyed;orientationUpdates+=JSON.stringify(body.rotation)!==JSON.stringify(beforeRotation);histogram[opcode]=(histogram[opcode]??0)+1;checks++;
}
for(let fixture=0;fixture<1000;fixture++) {
 machine.reset();const bytes=machine.bytes,points=Array.from({length:4},()=>[signed(),signed(),signed()]),phase=random(257),step=random(257);points.forEach((point,index)=>put(bytes,0x5000+index*16,point));bytes.fill(0xa5,0x6000,0x6020);const before=Buffer.from(bytes.subarray(0x5000,0x5040));machine.entry=0x476df0;machine.r.ECX=0x6000;machine.r.EDX=0x5000;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);[0x5010,0x5020,0x5030,phase,step].forEach((value,index)=>bytes.writeUInt32LE(value,0x9004+index*4));steps+=machine.run();assert.deepEqual(get(bytes,0x6000),scriptedCurveVelocity(points,phase,step));assert.ok(bytes.subarray(0x5000,0x5040).equals(before));checks++;
}
const report={method:'Full476550 interpreter and476df0 curve instructions, all integer/float normalization, length, division, scaling and cross callees; no arithmetic stubs or original process execution. Only spatial remove/insert, effect46e600 and destruction46e4e0 are explicit boundaries with callback order and observable state mutations compared. Complete1024-byte body and bytecode compared, all opcodes0..8/default, restart chains, signed timers/action modes, segment completion, four declared x87 rounding modes and native curve table matched to PE/provider bytes.1000 independent full-signed-domain curve fixtures. Singular divide-by-zero curve directions remain outside valid fixtures.',evidence:evidence.map(value=>value.evidence_id),tableEvidence:tableEvidence.evidence_id,instructions:instructions.length,fixtures,independentCurveFixtures:1000,checks,destroyed,orientationUpdates,histogram,roundingModes:modes,instructionSteps:steps,matched:true};await writeFile('analysis/scripted-motion-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
