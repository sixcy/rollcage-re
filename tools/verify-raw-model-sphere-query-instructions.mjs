import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {prepareBodyShapeCache} from '../src/body-shape-cache.mjs';
import {updateBodyDerived} from '../src/body-physics.mjs';
import {queryRawPlacedModelSphere} from '../src/raw-model-sphere-query.mjs';

const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions,{entry:0x423ab0}),STACK=0x9000,OUT=0x74000,fixtures=1200;
machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
let instructionSteps=0,hits=0,damageCalls=0,particleEmits=0,debrisEmits=0;const visited=new Set();
machine.onInstruction=address=>{visited.add(address);if(address===0x421da0)damageCalls++;if(address===0x435fc4)particleEmits++;if(address===0x475a71)debrisEmits++;};
for(let fixture=0;fixture<fixtures;fixture++){
 const f=createSimulationRuntimeFixture(program,fixture,{models:true,breakable:true}),{memory,views,addresses:a,extraAddresses:b}=f,body=f.bodies[0],put=(p,v)=>memory.writeInt32LE(v|0,p);
 body.position=[(fixture%23-11)*65536,[-40,-20,-6,0,12,40][fixture%6]*65536,(fixture%19-9)*65536];
 body.momentum=[(fixture%5-2)*65536,[80,40,8,0,-24,-80][fixture%6]*65536,(fixture%7-3)*65536];updateBodyDerived(body);
 prepareBodyShapeCache(body,0,views.records);
 buildFrameCandidates(f.bodies,{count:1,records:views.records,grid:f.context.environment.grid,models:f.models,arena:views.candidateArena,spatialStateFor:f.context.spatialStateFor});
 const record=a.records+body.collisionIds[0]*72;put(record+64,(fixture%13)*256);put(record+56,0x12345678);memory.writeUInt16LE(fixture%17?0:1,record+70);
 for(let i=0;i<3;i++)for(const o of[0x34,0x38,0x3c])put(0x250000+i*0x1000+o,memory.readInt32LE(0x250000+i*0x1000+o)+((fixture*(o+3))&65535));
 const outputAddress=fixture%13===0?record+8:OUT;
 if(outputAddress===OUT)memory.fill(0xa5,OUT,OUT+36);memory.fill(0x36,STACK-0x400,STACK+32);machine.reset();memory.copy(machine.bytes);
 const parameter=[0,32768,65536,131072][fixture%4],mode=['nearest-even','toward-zero','down','up'][fixture%4];
 const result=queryRawPlacedModelSphere(body.address,record,outputAddress,parameter,{memory,views,scratchBase:STACK,roundingMode:mode});
 machine.r.ECX=body.address;machine.r.EDX=record;machine.r.ESP=STACK;machine.fpuRounding=mode;machine.bytes.writeInt32LE(-1,STACK);machine.bytes.writeUInt32LE(outputAddress,STACK+4);machine.bytes.writeInt32LE(parameter,STACK+8);
 instructionSteps+=machine.run(2_000_000);assert.equal(result,machine.r.EAX,`return${fixture}`);if(memory.readInt32LE(outputAddress+28))hits++;
 for(const[address,length]of[[record,72],[outputAddress,36],[STACK-0x2c,32],[a.arena,2048*16],[a.nodes,36],[0x200000,0xf000],[0x250000,0x3000],[b.particles,128*256],[b.debris,64*128],[b.debrisFree,0x1100],[0x5ec958,4],[0x6e65b4,24],[0x902b7c,20],[0x9153cc,0x30],[0x919020,288],[0x91cdc0,48],[0x91d360,0x104],[0x91ff80,0x140],[0x9205a0,0x250]]){
  const native=machine.bytes.subarray(address,address+length),source=memory.subarray(address,address+length);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`fixture${fixture} diff0x${(address+offset).toString(16)} native${native[offset]} source${source[offset]} candidateCount${body.modelCandidateCount15e}`);}
 }
}
const report={method:'Actual423ab0 plus shape/polygon/point/edge/yaw and reached421da0 destruction graph. Shared original query record is rotated/restored in place; complete output,32-byte local output,native candidate/model/object storage,particle/debris pools and globals including complete91d360..463 cross/normalization state compared. Raw placement positions include fractionalQ16 values and93output/probe aliases. Classes0/5 and native configuration/tag gates, four rounding modes and four bounds over constructed runtime. Only compiler cookie admitted; absent sound bank is an actual dispatcher branch. Class1/2/4 extra effects remain explicit outside these fixtures. No original-process execution.',targetSha256:program.sha256,fixtures,aliasFixtures:Math.floor((fixtures-1)/13)+1,instructionSteps,executedInstructions:visited.size,hits,damageCalls,particleEmits,debrisEmits,matched:true};
await writeFile('analysis/raw-model-sphere-query-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
