import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createModelContactEffectFixture} from './lib/model-contact-effect-fixtures.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {updateBodyDerived} from '../src/body-physics.mjs';
import {prepareBodyShapeCache} from '../src/body-shape-cache.mjs';
import {queryRawPlacedModelSphere} from '../src/raw-model-sphere-query.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),STACK=0x9000,fixtures=180,modes=process.argv[2]?[process.argv[2]]:['query','frame'];
if(modes.some(mode=>!['query','frame'].includes(mode)))throw Error('Choose query or frame, or omit the mode for both.');
machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
let instructionSteps=0,calls=0,events=0,modelHits=0;const visits={},entries=[0x48ec50,0x4142a0,0x44ef90,0x48e900,0x421da0,0x480900,0x435f20,0x475a10,0x474850];
machine.onInstruction=address=>{if(entries.includes(address))visits[address]=(visits[address]??0)+1;};
for(let fixture=0;fixture<fixtures;fixture++)for(const mode of modes){
 const f=createModelContactEffectFixture(program,fixture),{memory,views,addresses:a}=f,body=f.bodies[0];
 for(let i=0;i<3;i++)memory[0x250000+i*0x1000+0x19a]=[1,2,4][(fixture+i)%3];
 if(mode==='query'){
  updateBodyDerived(body);prepareBodyShapeCache(body,0,views.records);buildFrameCandidates(f.bodies,{count:1,records:views.records,grid:f.context.environment.grid,models:f.models,arena:views.candidateArena,spatialStateFor:f.context.spatialStateFor});
 }
 machine.reset();memory.copy(machine.bytes);machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);
 if(mode==='query'){
  const record=a.records+body.collisionIds[0]*72,out=f.extraAddresses.output;
  const returned=queryRawPlacedModelSphere(body.address,record,out,65536,{memory,views,scratchBase:STACK,roundingMode:'nearest-even'});
  machine.entry=0x423ab0;machine.r.ECX=body.address;machine.r.EDX=record;machine.bytes.writeUInt32LE(out,STACK+4);machine.bytes.writeInt32LE(65536,STACK+8);instructionSteps+=machine.run(3_000_000);assert.equal(machine.r.EAX,returned);modelHits+=memory.readInt32LE(out+28)!==0;
 }else{
  const result=stepSimulationFrame(views.physicalGroup,[],f.context);machine.entry=0x4749e0;instructionSteps+=machine.run(3_000_000);assert.equal(machine.r.EAX,result.nativeReturn);events+=result.processedEvents;modelHits+=result.modelHits;
 }
 calls++;
 //Entry stack/saved registers remain private ABI scratch. Every byte of the
 //declared native data/address space above it is compared, including globals
 //that were not anticipated by a selected range list.
 const native=machine.bytes.subarray(0x10000),source=memory.subarray(0x10000);
 if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${mode} fixture${fixture} diff0x${(0x10000+offset).toString(16)} native${native[offset]} source${source[offset]}`);}
}
const report={method:'Selected actual423ab0 query/full4749e0 ordinary-body modes with class1/2/4 model contacts, realfragment/damage/particles/debris/attachment-release/spatial/lifecycle/defaults. All native data memory10000h..9fffffh compared after each call; only private entry stack below10000h excluded. Only compiler cookie admitted; actualabsent soundbank. Constructed runtime/geometry, no originalprocess or fullvehicle/script/world-effect parentclaim.',targetSha256:program.sha256,modes,fixtures,calls,instructionSteps,events,modelHits,visits:Object.fromEntries(Object.entries(visits).map(([p,n])=>[`0x${Number(p).toString(16)}`,n])),matched:true};
await writeFile('analysis/model-contact-connected-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
