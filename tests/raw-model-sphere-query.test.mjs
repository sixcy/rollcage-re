import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {queryRawPlacedModelSphere} from '../src/raw-model-sphere-query.mjs';
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
