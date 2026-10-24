import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {queryRawPlacedModelSphere} from '../src/raw-model-sphere-query.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
const program=await loadRetainedNativeProgram();

function fixture(){
 const f=createSimulationRuntimeFixture(program,0,{models:true}),{memory,views,addresses:a}=f,body=f.bodies[0],record=a.records,output=0x74000,object=0x250000,instance=f.models.instances.get(0),pointers=f.candidateMapping.modelPointersFor({shape:instance.collision.shapes[0],settings:instance.settings});
 memory.writeUInt32LE(a.arena,body.address+0x158);memory.writeUInt16LE(1,body.address+0x15e);memory.writeUInt32LE(object,a.arena+8);memory.writeUInt32LE(pointers.shape,a.arena+12);
 [0,32768,16384].forEach((v,i)=>memory.writeInt32LE(v,object+0x34+i*4));memory[object+0x199]=0;
 [0,-40*256,0].forEach((v,i)=>memory.writeInt32LE(v,record+8+i*4));[0,80*256,0].forEach((v,i)=>memory.writeInt32LE(v,record+20+i*4));memory.writeInt32LE(2*256,record+64);memory.writeUInt16LE(0,record+70);
 return {...f,body,record,output,object,runtime:{memory,views,scratchBase:0x9000,roundingMode:'nearest-even'}};
}

test('raw sphere queries read fractional placement positions and restore the actual probe cache',()=>{
 const f=fixture(),before=Buffer.from(f.memory.subarray(f.record+8,f.record+32));
 const fraction=queryRawPlacedModelSphere(f.body.address,f.record,f.output,65536,f.runtime),output=f.views.outputAt(f.output);
 assert.equal(fraction,18432);assert.equal(output.flags,1);assert.deepEqual(output.point.slice(),[0,-4480,0]);assert.deepEqual(output.normal.slice(),[0,-65536,0]);assert.equal(output.contactTime,-4);
 assert.deepEqual(f.memory.subarray(f.record+8,f.record+32),before);assert.equal(f.memory.readInt32LE(f.record+56),-100);
 //Parsed authored coordinates intentionally differ from their relocated raw
 //position. The raw adapter must use full Q16 state without synchronizing it.
 assert.deepEqual(f.models.instances.get(0).settings.position,[-12,0,-9]);
});

test('raw configuration writes immediately filter later calls without updating parsed settings',()=>{
 const f=fixture(),config=f.memory.readUInt32LE(f.object+0x194),settings=f.models.instances.get(0).settings;
 settings.configurations[0]={type:0,flags:0};const parsed=settings.configurations[0];
 assert.equal(queryRawPlacedModelSphere(f.body.address,f.record,f.output,65536,f.runtime),18432);
 f.memory.writeUInt32LE(0x5000000,config);
 assert.equal(queryRawPlacedModelSphere(f.body.address,f.record,f.output,65536,f.runtime),65536);assert.equal(f.views.outputAt(f.output).flags,0);
 assert.equal(parsed.type,0);
});

test('common camera bodies never read the vehicle-only controller field, while vehicle NULL stays invalid',()=>{
 const BODY=0x100000,RECORD=0x74000,OUT=0x76000;
 for(const flags of [4,0x1004,7,0x1807]){
  const bytes=Buffer.alloc(0xa00000);bytes.writeUInt32LE(flags,BODY);bytes.writeInt32LE(0x76543210,OUT+28);
  //Explicit sparse input excludes both NULL and the entire vehicle-only
  //controller DWORD. No replacement bytes are installed for either hole.
  const {memory}=createCapturedMemory([{address:1,bytes:bytes.subarray(1,BODY+0x6bc)},{address:BODY+0x6c0,bytes:bytes.subarray(BODY+0x6c0)}]);
  const views=createPhysicsRuntimeViews({memory,bodyLists:[]});
  assert.equal(queryRawPlacedModelSphere(BODY,RECORD,OUT,32768,{memory,views,scratchBase:0x9000}),32768);
  assert.equal(memory.readInt32LE(OUT+28),0);
  memory.writeUInt32LE(3,BODY);
  assert.throws(()=>queryRawPlacedModelSphere(BODY,RECORD,OUT,0,{memory,views,scratchBase:0x9000}),/Uncaptured native memory at 0x1006bc/);
 }
 const bytes=Buffer.alloc(0xa00000);bytes.writeUInt32LE(3,BODY);
 const {memory}=createCapturedMemory([{address:1,bytes:bytes.subarray(1)}]),views=createPhysicsRuntimeViews({memory,bodyLists:[]});
 assert.throws(()=>queryRawPlacedModelSphere(BODY,RECORD,OUT,0,{memory,views,scratchBase:0x9000}),/Uncaptured native memory at 0x0 \(1 bytes\)/);
});

test('controller gate agrees with exact retained423ab0 branches and complete non-stack memory',()=>{
 const at=address=>program.instructions.find(row=>row.address===address);
 assert.deepEqual(at(0x423ade),{address:0x423ade,op:'CMP',args:['EAX','0x3']});
 assert.deepEqual(at(0x423ae1),{address:0x423ae1,op:'JNZ',args:['0x00423afc']});
 assert.deepEqual(at(0x423ae3),{address:0x423ae3,op:'MOV',args:['EAX','dword ptr [EDX + 0x6bc]']});
 assert.deepEqual(at(0x423aee),{address:0x423aee,op:'CMP',args:['byte ptr [EAX]','CL']});
 const machine=new BoundedX86(program.instructions,{entry:0x423ab0}),BODY=0x100000,RECORD=0x74000,OUT=0x76000;
 for(const flags of [4,0x1004,7,0x1807,3,0x1803])for(const controller of [0xffffffff,0x78000])for(const active of [0,1]){
  const memory=program.initializeMemory(Buffer.alloc(0xa00000));memory.writeUInt32LE(flags,BODY);memory.writeUInt32LE(controller,BODY+0x6bc);memory[0x78000]=active;memory.fill(0xa5,OUT,OUT+36);
  machine.reset();memory.copy(machine.bytes);machine.r.ECX=BODY;machine.r.EDX=RECORD;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);machine.bytes.writeUInt32LE(OUT,0x9004);machine.bytes.writeInt32LE(32768,0x9008);
  const visited=new Set();machine.onInstruction=p=>visited.add(p);machine.run(1000);
  const views=createPhysicsRuntimeViews({memory,bodyLists:[]}),result=queryRawPlacedModelSphere(BODY,RECORD,OUT,32768,{memory,views,scratchBase:0x9000});
  assert.equal(result,machine.r.EAX);assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000));
  assert.equal(visited.has(0x423ae3),(flags&511)===3);assert.equal(visited.has(0x423aee),(flags&511)===3&&controller!==0xffffffff);
 }
});
