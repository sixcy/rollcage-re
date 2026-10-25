import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {inspectScenery,createSceneryDraft,compileSceneryEdits,instantiateSceneryAssembly,validateSceneryAssemblies,validateSceneryImport,applySceneryTransform} from '../src/scenery-editor.mjs';
import {buildSceneryAssemblyPreview} from '../src/scenery-assembly-preview.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readPlacementCollision,parseModelCollision} from '../src/model-collision.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {constructTrackPlacedObject} from '../src/track-placed-object-construction.mjs';
import {damagePlacedObject} from '../src/placed-object-damage.mjs';
import {releaseBodyAttachments} from '../src/body-attachment-release.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';

function fixture({effects=true}={}) {
  const base=sceneryFixture(),geometry=Buffer.alloc(0x1600);geometry.set(base.geometry);const texture=Buffer.from(base.texture);
  geometry.writeUInt32LE(0x1500,0x80);geometry.writeUInt32LE(0x1530,0x7c);geometry.fill(0xa5,0x1500,0x1530);geometry[0x1517]=1;
  geometry.writeUInt32LE(0x1580,0xd0);geometry.set([77,88,99,16,1,0,0,0],0x1580);
  geometry.writeUInt16LE(0x1540-0x1140,0x1140+0x4c);for(let i=0;i<5;i++){geometry.writeInt16LE(i*3,0x1540+i*8);geometry[0x1547+i*8]=0;}
  geometry.writeUInt32LE(0x4000000,0x1340);geometry.writeUInt32LE(0x4000000,0x1344);
  for(let i=0;i<2;i++){const p=0x500+i*56;texture[p+31]=0;texture.writeUInt16LE(1,p+6);texture[p+22]=i;texture[p+30]=0x71;}
  if(effects)for(let i=0;i<5;i++)texture.writeUInt16LE(0x2018+i,0x500+46+i*2);
  return {geometry,texture};
}
const rows=source=>createSceneryDraft(source.geometry,source.texture,1);
const command=(source,options={})=>instantiateSceneryAssembly(source,0,{id:'copy',level:1,position:[52,0,32],...options});

test('assembly command is atomic while old model row schema and no-edit resources remain unchanged',()=>{
  const source=fixture(),info=inspectScenery(source.geometry,source.texture),instance=command(source),original=rows(source);
  assert.ok(info[0].assemblyDuplicable);assert.deepEqual(info[1].assemblyMemberIndices,[0,1]);assert.equal(info[0].duplicable,false);
  assert.deepEqual(instance.members.map(p=>p.id),['copy-member-0','copy-member-1']);assert.deepEqual(instance.members.map(p=>p.position),[[52,0,32],[62,0,32]]);assert.equal(instance.dependencyPlan.localEffectCount,5);
  assert.deepEqual(Object.keys(original[0]).sort(),['id','position','sourceLevel','templateIndex','yaw']);
  const noedit=compileSceneryEdits(source,original,{level:1});assert.deepEqual(noedit.geometry,source.geometry);assert.deepEqual(noedit.texture,source.texture);
  assert.throws(()=>validateSceneryAssemblies([{...instance.command,members:[]}]),/fields/);
  assert.throws(()=>compileSceneryEdits(source,[...original,instance.members[0]],{level:1}),/unsupported/);
});

test('full chain duplication has independent group/config states, unchanged material and collision geometry, and native cell references',()=>{
  const source=fixture(),before={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)},instance=command(source),out=compileSceneryEdits(source,rows(source),{level:1,assemblies:[instance.command]}),gfxm=parseGFXM(out.geometry),placements=parsePlacements(out.texture,gfxm.models),links=parseStaticModelLinks(out.geometry,parseSpatialIndex(out.geometry),placements);
  assert.equal(placements.count,4);assert.deepEqual(out.assemblies[0].memberIndices,[2,3]);assert.deepEqual(out.assemblies[0].groupMapping,{'1':3});
  const group=out.geometry.readUInt32LE(0x80);assert.deepEqual(out.geometry.subarray(group,group+48),source.geometry.subarray(0x1500,0x1530));assert.deepEqual(out.geometry.subarray(group+48,group+64),source.geometry.subarray(0x1510,0x1520));
  for(let i=0;i<2;i++){const old=placements.records[i],clone=placements.records[i+2];assert.equal(clone.raw.readUInt16LE(6),3);assert.equal(clone.raw[22],i);assert.equal(clone.raw[30],0x71);assert.deepEqual(clone.raw.subarray(24,46),old.raw.subarray(24,46));assert.deepEqual(clone.raw.subarray(46),old.raw.subarray(46));
    const collision=parseModelCollision(out.geometry,gfxm.models[clone.modelIndex]),a=readPlacementCollision(out.geometry,old,collision),b=readPlacementCollision(out.geometry,clone,collision);assert.notEqual(a.configurationBase,b.configurationBase);assert.deepEqual(a.configurations.map(c=>c.raw),b.configurations.map(c=>c.raw));assert.ok(links.nodes.some(n=>n.placementIndices.includes(clone.index)));
  }
  assert.deepEqual(source,before);
});

test('two copies receive disjoint mutable configuration ranges and groups',()=>{
  const source=fixture(),one=command(source),two=command(source,{id:'second',position:[72,0,32]}),out=compileSceneryEdits(source,rows(source),{level:1,assemblies:[one.command,two.command]}),placements=parsePlacements(out.texture,parseGFXM(out.geometry).models);
  assert.equal(placements.count,6);assert.deepEqual(out.assemblies.map(a=>a.groupMapping),[{'1':3},{'1':4}]);assert.equal(new Set(placements.records.map(p=>p.raw.readUInt16LE(20))).size,6);
});

test('shared world emitters add their complete owner chains and clone once per assembly',()=>{
  const source=fixture({effects:false});source.geometry.writeUInt32LE(0x1580,0x108);source.geometry.writeUInt32LE(0x158c,0xd0);source.geometry.writeUInt32LE(0x1580,0x10c);source.geometry.fill(0,0x1580,0x158c);source.geometry.writeInt16LE(32,0x1580);source.geometry.writeInt16LE(32,0x1584);
  for(let i=0;i<2;i++){source.texture[0x500+i*56+22]=0;source.texture.writeUInt16LE(0x3000,0x500+i*56+46);}
  const instance=command(source),out=compileSceneryEdits(source,rows(source),{level:1,assemblies:[instance.command]}),ps=parsePlacements(out.texture,parseGFXM(out.geometry).models),base=out.geometry.readUInt32LE(0x108);
  assert.deepEqual(instance.dependencyPlan.memberIndices,[0,1]);assert.equal(out.geometry.readInt16LE(base+12),52);assert.equal(ps.records[2].raw.readUInt16LE(46),0x3001);assert.equal(ps.records[3].raw.readUInt16LE(46),0x3001);assert.equal(ps.records[2].raw[22],0);assert.equal(ps.records[3].raw[22],0);
  const movedRows=applySceneryTransform(rows(source),{id:'original-0',position:[42,0,32]},inspectScenery(source.geometry,source.texture)),combined=compileSceneryEdits(source,movedRows,{level:1,assemblies:[instance.command]});assert.equal(combined.geometry.readInt16LE(combined.geometry.readUInt32LE(0x108)),42,'Cloning preserves a concurrent original emitter transform');assert.equal(combined.geometry.readInt16LE(combined.geometry.readUInt32LE(0x108)+12),52);
});

test('route blocker counters, static light identity and native coverage are independent dependencies',()=>{
  const source=fixture({effects:false}),geometry=Buffer.alloc(0x1900);geometry.set(source.geometry);source.geometry=geometry;geometry[0x79]=2;geometry.writeUInt32LE(0x15c0,0x8c);geometry[0x15cf]=4;source.texture[0x500+28]=1;source.texture[0x500+56+28]=1;
  geometry.writeUInt32LE(0x1700,0x14);geometry.writeUInt32LE(0x1710,0x1700);geometry.writeUInt32LE(32,0x171c);geometry.writeUInt32LE(0x1780,0x28);geometry.writeUInt16LE(8,0x1780);geometry.writeUInt16LE(0,0x1782);geometry.writeUInt32LE((2<<19)|1|(2<<7)|(2<<1),0x1120);
  geometry.writeUInt32LE(0x1800,0x44);geometry.writeUInt32LE(1,0x48);geometry.writeInt16LE(32,0x1806);geometry.writeInt16LE(32,0x180a);geometry[0x180c]=10;geometry[0x180d]=0x17;geometry.writeUInt32LE(0xdeadbeef,0x1810);source.texture.writeUInt16LE(0x1000,0x500+46);
  const out=compileSceneryEdits(source,rows(source),{level:1,assemblies:[command(source).command]}),ps=parsePlacements(out.texture,parseGFXM(out.geometry).models),base=out.geometry.readUInt32LE(0x44);
  assert.equal(out.geometry[0x15cf],6);assert.equal(geometry[0x15cf],4);assert.equal(out.geometry.readUInt32LE(0x48),2);assert.deepEqual(out.geometry.subarray(base,base+32),geometry.subarray(0x1800,0x1820));assert.equal(out.geometry.readInt16LE(base+32+6),52);assert.equal(out.geometry[base+32+13],0x17);assert.notEqual(out.geometry.readUInt32LE(base+32+16),0xdeadbeef);assert.equal(ps.records[2].raw.readUInt16LE(46),0x1001);
});

test('complete ghost preserves both models and authored tilt, with explicit translation-only assembly capability',()=>{
  const source=fixture(),preview=buildSceneryAssemblyPreview(source,0);assert.equal(preview.instances,2);assert.equal(preview.worldOrientation,false);assert.ok(preview.bounds.flat().every(Number.isFinite));
  source.texture.writeInt16LE(16,0x500+14);source.texture.writeInt16LE(1024,0x500+16);const tilted=buildSceneryAssemblyPreview(source,0);assert.equal(tilted.worldOrientation,true);assert.equal(inspectScenery(source.geometry,source.texture)[0].assemblyYawEditable,false);assert.throws(()=>command(source,{yaw:0}),/translation only/);
});

test('unsupported behavior, inconsistent handles, foreign imports and native capacity overflows reject without touching source',()=>{
  const source=fixture(),before=Buffer.from(source.geometry),instance=command(source);
  assert.throws(()=>compileSceneryEdits(source,rows(source),{level:1,assemblies:[{...instance.command,sourceLevel:2}]}),/same-track/);
  assert.throws(()=>compileSceneryEdits(source,rows(source),{level:1,assemblies:[{...instance.command,id:'original-1'}]}),/identity/);
  assert.throws(()=>command(source,{position:[32767,0,32]}),/signed 16-bit/);assert.deepEqual(source.geometry,before);
  source.texture.writeUInt16LE(0x5000,0x500+46);assert.equal(inspectScenery(source.geometry,source.texture)[0].assemblyDuplicable,false);assert.throws(()=>command(source),/Script-trigger/);
  source.texture.writeUInt16LE(0,0x500+46);source.texture.writeUInt16LE(0x2018,0x500+48);assert.throws(()=>command(source),/noncontiguous/);
});

test('collision, authored light and local-effect capacities reject atomically',()=>{
  const source=fixture(),original=rows(source),instance=command(source),copies=Array.from({length:3},(_,i)=>({...instance.command,id:`copy-${i}`})),before={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)};
  assert.throws(()=>compileSceneryEdits(source,original,{level:1,assemblies:copies}),/7 static models/);assert.deepEqual(source,before);
  assert.throws(()=>validateSceneryImport(source,original,{level:1,assemblies:Array.from({length:102},(_,i)=>({...instance.command,id:`many-${i}`}))}),/512-particle/);assert.deepEqual(source,before);
  const light=fixture({effects:false}),geometry=Buffer.alloc(0x2000);geometry.set(light.geometry);light.geometry=geometry;geometry.writeUInt32LE(0x1600,0x44);geometry.writeUInt32LE(70,0x48);light.texture.writeUInt16LE(0x1000,0x500+46);
  assert.throws(()=>compileSceneryEdits(light,rows(light),{level:1,assemblies:[command(light).command]}),/70 authored lights/);
});

test('reconstructed native constructors allocate independent chains and local effects, and clone damage leaves original states intact',async()=>{
  const source=fixture(),out=compileSceneryEdits(source,rows(source),{level:1,assemblies:[command(source).command]}),program=await loadRetainedNativeProgram(),f=createSimulationRuntimeFixture(program,0,{models:true,breakable:true}),m=f.memory,pack=0x300000,btp=0x310000,F=0x9000,put=(p,n)=>m.writeInt32LE(n|0,p);
  out.geometry.copy(m,pack);out.texture.copy(m,btp);const gfxm=parseGFXM(out.geometry),model=gfxm.models[0];
  // The selected constructor consumes these relocated native roots. Spatial
  // buckets, particle/debris pools and math tables come from the connected
  // reconstructed runtime fixture, rather than fake destruction callbacks.
  put(pack+0x18,pack+out.geometry.readUInt32LE(0x18));put(pack+out.geometry.readUInt32LE(0x18),pack+model.offset);put(pack+model.offset+0x40,pack+model.verticesOffset);put(pack+0x80,pack+out.geometry.readUInt32LE(0x80));put(pack+0xd0,pack+out.geometry.readUInt32LE(0xd0));put(pack+0xec,pack+out.geometry.readUInt32LE(0xec));
  put(0x90b990,pack);put(0x90b988,0x60000);put(0x909294,m.readUInt32LE(pack+0x80));put(0x70dcf4,0x10000);put(F+28,0x61000);put(F+44,0);put(F+20,0);put(F+68,pack+out.geometry.readUInt32LE(0x1c));put(F+72,pack+out.geometry.readUInt32LE(0x88));m[f.extraAddresses.session+0x58c]=2;
  const runtime={memory:m,scratchBase:F+76,roundingMode:'nearest-even',services:{libraryCall(name,args){assert.equal(name,'memset');m.fill(args[1],args[0],args[0]+args[2]);}}},bodies=[];
  for(let index=0;index<4;index++){put(F+24,index);const authored=btp+out.texture.readUInt32LE(0x28)+index*56;bodies.push(constructTrackPlacedObject(authored,pack,F,runtime,{...runtime,scratchBase:F-4}).body);}
  assert.equal(m.readUInt32LE(bodies[0]+0x1b0),bodies[1]);assert.equal(m.readUInt32LE(bodies[1]+0x19c),bodies[0]);assert.equal(m.readUInt32LE(bodies[2]+0x19c),0);assert.equal(m.readUInt32LE(bodies[2]+0x1b0),bodies[3]);assert.equal(m.readUInt32LE(bodies[3]+0x19c),bodies[2]);
  const originalHandles=Array.from({length:5},(_,i)=>m.readUInt16LE(bodies[0]+0x16a+i*2)),cloneHandles=Array.from({length:5},(_,i)=>m.readUInt16LE(bodies[2]+0x16a+i*2));assert.deepEqual(originalHandles,[0x2000,0x2001,0x2002,0x2003,0x2004]);assert.deepEqual(cloneHandles,[0x2005,0x2006,0x2007,0x2008,0x2009]);
  assert.equal(m.readUInt32LE(F+20),10);const originalConfigs=bodies.slice(0,2).map(b=>m.readUInt32LE(b+0x194)),before=originalConfigs.map(p=>m.readUInt32LE(p));put(0x79000,8*65536);
  assert.equal(damagePlacedObject(bodies[2],f.bodies[0].address,0,0x79000,{memory:m,scratchBase:0x9000}),1);assert.equal(m[bodies[3]+0x198],0);assert.equal(m[bodies[1]+0x198],1);assert.deepEqual(originalConfigs.map(p=>m.readUInt32LE(p)),before);assert.equal(m.readUInt32LE(0x9205e0),bodies[3]);assert.equal(m.readUInt32LE(0x9205e8),bodies[2]);
  releaseBodyAttachments(bodies[2],{memory:m});assert.ok(originalHandles.every(h=>m.readUInt32LE(0x80e660+(h&4095)*4)>0));assert.ok(cloneHandles.every((_,i)=>m.readUInt16LE(bodies[2]+0x16a+i*2)===0));assert.deepEqual(Array.from({length:5},(_,i)=>m.readUInt16LE(bodies[0]+0x16a+i*2)),originalHandles);
});
