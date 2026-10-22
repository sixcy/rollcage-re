import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeVehicleContactColorTopology,initializeVehicleContactColorController,activateVehicleContactColors,updateVehicleContactColors} from '../src/vehicle-contact-colors.mjs';
import {applyRawActiveVehicleEffect} from '../src/vehicle-collision-filter.mjs';

export async function verifyVehicleContactColorConstruction({fixtures=120,activations=1200,chains=24,output='analysis/vehicle-contact-color-construction-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),executed=new Set();let steps=0,seed=0x4820f0ab,nativeAllocate;
  machine.onInstruction=p=>executed.add(p);machine.externalCalls.set(0xf0000000,m=>m.r.EAX=nativeAllocate(m.bytes.readUInt32LE(m.r.ESP)));
  machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),v=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(v&255,p,p+n);m.r.EAX=p;});
  machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;},modes=['nearest-even','toward-zero','down','up'];
  let calls=0;
  const compare=(memory,label)=>{const native=machine.bytes.subarray(0x10000),js=memory.subarray(0x10000);if(!native.equals(js)){const p=native.findIndex((v,j)=>v!==js[j]);assert.fail(`${label} diff${(p+0x10000).toString(16)} native${native[p]} JS${js[p]}`);}};
  const execute=(entry,ecx=0,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);args.forEach((v,j)=>machine.bytes.writeInt32LE(v|0,0x9004+j*4));steps+=machine.run(3000000);calls++;return machine.r.EAX;};
  for(let i=0;i<fixtures;i++){
    const memory=program.initializeMemory(Buffer.alloc(0xa00000)),put=(p,v)=>memory.writeInt32LE(v|0,p),model=0x10000,faces=0x11000,normals=0x12000,count=[0,1,3,4,8,16,32,48][i%8],faceCount=count<3?0:count*2;
    put(0x713184,model);memory.writeUInt16LE(count,model+4);memory.writeUInt16LE(faceCount,model+6);put(model+12,faces);put(model+0x40,normals);put(0x56e258,0xf0000000);
    for(let j=0;j<faceCount;j++){const a=j%count,b=(j+1)%count,c=(j+2)%count;memory[faces+j*8]=a+1;memory[faces+j*8+1]=(i%3===0?a:b)+1;memory[faces+j*8+2]=c+1;}
    for(let j=0;j<count;j++)for(const o of[0,2,4])memory.writeInt16LE(random()<<16>>16,normals+j*8+o);
    if(count&&i%4===0)memory.fill(0,normals,normals+6);
    const allocatorFor=m=>{let n=0;return size=>{const address=n++===0?0x20000:0x30000;if(i%5===1&&n===1){m.copy(m,0x14000,model,model+0x60);m.writeUInt16LE(0,0x14006);m.writeUInt32LE(0x14000,0x713184);}if(i%5===2&&n===2)m.writeInt32LE(Math.max(0,count-1),0x7130f8);m.fill(0xa5,address,address+size);return address;};};
    const before=Buffer.from(memory),roundingMode=modes[i%4];initializeVehicleContactColorTopology({memory,roundingMode,handlers:{allocate:allocatorFor(memory)}});
    machine.reset();before.copy(machine.bytes);nativeAllocate=allocatorFor(machine.bytes);machine.fpuRounding=roundingMode;execute(0x4820f0);compare(memory,`fixture${i}`);
  }
  for(let i=0;i<chains;i++){
    const memory=program.initializeMemory(Buffer.alloc(0xa00000)),put=(p,v)=>memory.writeInt32LE(v|0,p),record=0x40000,body=0x41000,model=0x10000,owner=0x8495e0,faces=0x11000,normals=0x12000,count=8;
    put(0x713184,model);memory.writeUInt16LE(count,model+4);memory.writeUInt16LE(12,model+6);put(model+12,faces);put(model+0x40,normals);put(0x56e258,0xf0000000);put(0x90b990,0x13000);put(0x90b988,0x14000);
    for(let j=0;j<12;j++)for(let k=0;k<3;k++)memory[faces+j*8+k]=(j+k)%count+1;
    for(let j=0;j<count;j++)for(let k=0;k<3;k++)memory.writeInt16LE(j&(1<<k)?256:-256,normals+j*8+k*2);
    put(record,body);put(body+0x6bc,-1);memory[body+0x6b4]=i%3;put(0x6eafe0,0x81);put(0x5ec958,i+1);put(0x6f2414,0);put(0x6f2418,0);
    for(let j=0;j<9;j++)memory.writeInt16LE(j%4?0:4096,body+0xc4+j*2);
    put(0x50000,256);put(0x50004,-128);put(0x50008,512);
    const allocateFor=m=>{let p=0x20000;return size=>{const result=p;p+=(size+15)&~15;m.fill(0xa5,result,result+size);return result;};},runtime={memory,scratchBase:0x9000,roundingMode:modes[i%4],handlers:{allocate:allocateFor(memory)}};
    machine.reset();memory.copy(machine.bytes);nativeAllocate=allocateFor(machine.bytes);machine.fpuRounding=runtime.roundingMode;
    initializeVehicleContactColorTopology(runtime);execute(0x4820f0);compare(memory,`topology${i}`);
    initializeVehicleContactColorController(owner,runtime);execute(0x482590,owner);compare(memory,`controller${i}`);
    assert.equal(activateVehicleContactColors(record,runtime),execute(0x482680,record));compare(memory,`activation${i}`);
    applyRawActiveVehicleEffect(body,0x50000,0x70,runtime);execute(0x482730,body,0x50000,[0x70]);compare(memory,`hit${i}`);
    for(let tick=0;tick<32;tick++){updateVehicleContactColors(record,runtime);execute(0x482990,record);compare(memory,`wave${i}/${tick}`);}
  }
  for(let i=0;i<activations;i++){
    const memory=program.initializeMemory(Buffer.alloc(0xa00000)),record=0x40000,body=0x41000;memory.writeUInt32LE(body,record);memory.writeInt32LE(i%3?0x8495e0+(i%6)*0x8c:-1,body+0x6bc);memory.writeInt32LE(0x81,0x6eafe0);memory.writeInt32LE(0,0x6f2414);memory.writeInt32LE(0,0x6f2418);memory[body+0x6b4]=i&255;
    for(let j=0;j<6;j++){memory[0x8495e0+j*0x8c]=j<i%7?1:0;memory[0x8495e1+j*0x8c]=i&255;memory[0x8495e8+j*0x8c]=i&255;}
    machine.reset();memory.copy(machine.bytes);const result=activateVehicleContactColors(record,{memory});assert.equal(result,execute(0x482680,record));compare(memory,`activationBoundary${i}`);
  }
  const report={method:'Actual4820f0 full adjacency/directional lookup constructor; actual482590controller→482680activation→482730hit→32persistent482990ticks. Mixed existing/free/exhausted controller activation. Only CRTmalloc/memset/compiler-cookie services, including allocator-side live root/count mutations.0..48vertices,duplicate/degenerate faces,zero normals,four x87 rounding modes. Actual484bb0→40ea40 uses an explicit empty sound bank. ALLmappedmemory>=10000h compared; synthetic authored model/texture/session inputs, no original-process execution.',targetSha256:program.sha256,fixtures,activations,chains,calls,executedInstructions:executed.size,instructionSteps:steps,matched:true,evidence:program.references.map(r=>r.evidence)};
  if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyVehicleContactColorConstruction({fixtures:Number(process.argv[2]??120),chains:Number(process.argv[3]??24)});
