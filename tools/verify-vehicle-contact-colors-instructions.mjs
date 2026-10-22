import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {updateVehicleContactColors} from '../src/vehicle-contact-colors.mjs';

export async function verifyVehicleContactColors({fixtures=4000,frames=32,output='analysis/vehicle-contact-colors-instruction-check.json'}={}) {
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),executed=new Set();let steps=0,calls=0,seed=0x482990ab;
  machine.onInstruction=p=>executed.add(p);
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
  const fixtureFor=i=>{
    const memory=program.initializeMemory(Buffer.alloc(0xa00000)),put=(p,v)=>memory.writeInt32LE(v|0,p),record=0x20000,body=0x21000,owner=0x26000,topology=0x30000,model=0x31000;
    const count=[0,1,2,3,7,16,32,48][i%8];put(record,body);put(body+0x6bc,owner);put(0x713184,model);memory.writeUInt16LE(count,model+4);put(0x7130d8,topology);put(0x5ec958,random());
    for(let p=owner;p<owner+0x200;p++)memory[p]=random()&255;
    memory[owner+1]=[-128,-1,0,1,4,5,127][i%7]&255;memory[owner+8]=[-128,-1,0,1,2,127][i%6]&255;memory[owner]=1;
    for(let j=0;j<count;j++){memory[topology+j*8]=j%8;for(let k=0;k<7;k++)memory[topology+j*8+1+k]=(random()>>>0)%Math.max(1,count);}
    const destinations=[0x40000,owner+9,owner+0x39,owner+0x78,0x713100,0x5ec958];put(owner+0x78,destinations[i%destinations.length]);return{memory,record};
  };
  const step=(memory,record,label)=>{
    const before=Buffer.from(memory);updateVehicleContactColors(record,{memory});machine.reset();before.copy(machine.bytes);machine.entry=0x482990;machine.r.ECX=record;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(500000);calls++;
    const native=machine.bytes.subarray(0x10000),js=memory.subarray(0x10000);if(!native.equals(js)){const p=native.findIndex((v,j)=>v!==js[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${native[p]} JS${js[p]}`);}
  };
  for(let i=0;i<fixtures;i++){const{memory,record}=fixtureFor(i);step(memory,record,`fixture${i}`);}
  for(let i=0;i<8;i++){const{memory,record}=fixtureFor(i+1);memory.writeUInt32LE(0x40000,0x26078);for(let tick=0;tick<frames;tick++)step(memory,record,`persistent${i}/${tick}`);}
  const report={method:'Actual482990 plus actual407190 color scale; no game or platform mocks. Signed byte topology/velocity fields,0..48nodes,active timer and signed levels,output aliases into wave/velocity/output pointer/WORDscratch/RNG storage and persistent waves. ALLmappedmemory>=10000h compared after eachcall. Synthetic model/topology/controller inputs; no original-process execution.',targetSha256:program.sha256,fixtures,persistentFrames:frames*8,calls,executedInstructions:executed.size,instructionSteps:steps,matched:true,evidence:program.references.map(r=>r.evidence)};
  if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyVehicleContactColors({fixtures:Number(process.argv[2]??4000),frames:Number(process.argv[3]??32)});
