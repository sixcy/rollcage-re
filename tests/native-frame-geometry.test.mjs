import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameGeometry, createNativeTerrainSectorViews} from '../tools/lib/native-frame-geometry.mjs';
import {createConnectedFrameCandidateFixture} from '../tools/lib/frame-candidate-runtime-fixtures.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {existsSync} from 'node:fs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {replayNativeTerrain} from '../tools/lib/native-terrain-replay.mjs';
import {nativeFrameGeometryLimits} from '../tools/lib/native-frame-geometry.mjs';
import {queryModelShapeSphere} from '../src/model-sphere-query.mjs';
import {unpackCollisionNormal} from '../src/collision-grid.mjs';
import {compareNativeFrameRegions} from '../tools/lib/native-frame-manifest.mjs';

const bounds = {sectors: 1, sectorColumns: 16, sectorRows: 16, sectorVertices: 289, nodes: 3, normals: 6, regions: 6, modelLinks: 10, models: 3, shapes: 4};
function fixture(index = 3, {sparse = false, omit} = {}) {
  const f = createConnectedFrameCandidateFixture(index), {memory: m, addresses: a} = f, header = 0x8d000;
  // Declare the native producer fields absent from the older connected fixture.
  completeNativeFrameGeometryFixture(f,{headerAddress:header,packAddress:0x909240});
  let memory = m;
  if (sparse) {
    const regions = [[0x90b98c,8],[0x909240,0xa0],[header,0x120],[a.sectors,4],[a.header,0x60],[a.normals,24],[a.vertices,f.grid.sectors[0].vertices.length*8],[a.packets,f.grid.sectors[0].cells.length*8],[a.borders,f.grid.sectors[0].rows*4],[a.regions,36],[a.rows,4096],[a.map,8],[a.nodes,36],[a.links,40]];
    for (let i = 0; i < 3; i++) {
      const model = 0x200000 + i * 0x5000, object = 0x250000 + i * 0x1000, collision = f.models.instances.get(i).collision;
      regions.push([model,0x50],[object,0x1b4],[object+0x200,16],[model+0x100,80],[model+0x800,collision.faceRecords.length*9],[model+0x1200,8],[model+0x1800,collision.vertices.length*8],[model+0x2000,collision.faces.length*8]);
    }
    memory = createCapturedMemory(regions.filter(([address]) => address !== omit).map(([address,length]) => ({address,bytes:Buffer.from(m.subarray(address,address+length))}))).memory;
  }
  return {...f, memory, geometry: () => createNativeFrameGeometry({memory,bounds})};
}
const terrainSummary = result => ({...result,spatial: result.spatial && {...result.spatial,lookup: undefined}});

test('captured pointer geometry reproduces connected terrain forms and spatial fallback/layers', () => {
  for (const index of [0,1,3,7,11,17,28]) {
    const f = fixture(index,{sparse:true}), {grid,nodeForAddress} = f.geometry();
    assert.equal(grid.sectors[0].vertexAddress, f.addresses.vertices);
    for (const position of [[0,0,0],[800<<16,-5<<16,7<<16],[-1000<<16,0,-1000<<16]]) {
      const expected = f.grid.spatial.lookup(position), actual = grid.spatial.lookup(position);
      assert.equal(actual.node?.index, expected.node?.index); assert.equal(actual.outside,expected.outside); assert.equal(actual.layers,expected.layers);
      if (actual.node) assert.equal(nodeForAddress(actual.node.address),actual.node);
    }
    for (const body of f.bodies) assert.deepEqual(terrainSummary(buildTerrainCandidates(grid,body,{radiusQ8:48*256})),terrainSummary(buildTerrainCandidates(f.grid,body,{radiusQ8:48*256})));
    assert.throws(()=>nodeForAddress(f.addresses.nodes+1),/declared node/);
  }
});

test('full two-pass candidate bytes preserve native object and shape pointer identities', () => {
  for (const index of [1,2,3,4,13,17,19,29]) {
    const expected=fixture(index), actual=fixture(index), g=actual.geometry(), a=actual.addresses;
    const views=createPhysicsRuntimeViews({memory:actual.memory,bodyStorage:a.bodies.map(address=>({address,length:0x4000})),bodyLists:[{address:a.list,capacity:8}],bucketAt:address=>g.nodeForAddress(address),candidateCapacity:2048,candidateMapping:g.candidateMapping});
    const left=buildFrameCandidates(expected.bodies,expected.options);
    const right=buildFrameCandidates(views.physicalGroup.bodies.slice(0,actual.count),{records:views.records,grid:g.grid,models:g.modelContext,arena:views.candidateArena});
    assert.equal(right.cursor,left.cursor);
    assert.deepEqual(actual.memory.subarray(a.arena,a.arena+2048*16),expected.memory.subarray(a.arena,a.arena+2048*16));
    for (const instance of g.modelContext.instances.values()) for (const shape of instance.collision.shapes) {
      const pointers=g.candidateMapping.modelPointersFor({...instance,shape});
      assert.equal(g.candidateMapping.modelForPointers(pointers.object,pointers.shape).shape,shape);
    }
  }
});

test('live memory mutations reach native terrain, object settings, configurations and model vertices', () => {
  const f=fixture(3,{sparse:true}), g=f.geometry(), {memory:m}=f;
  m.writeInt16LE(321,f.addresses.vertices); assert.equal(g.grid.sectors[0].vertices[0][0],321);
  m.writeUInt32LE(0,f.addresses.normals); assert.equal(g.grid.normals[0].packed,0);
  const [object,instance]=g.modelContext.instances.entries().next().value;
  m[object+0x19a]=5; m[object+0x199]=77; m.writeInt32LE(-4*65536,object+0x34);
  assert.equal(instance.settings.class,5); assert.equal(instance.settings.yaw,77); assert.equal(instance.settings.position[0],-4);
  m[instance.settings.configurationBase+3]=5; assert.equal(instance.settings.configurations[0].type,5);
  m.writeInt16LE(-123,m.readUInt32LE(m.readUInt32LE(object+0x10)+0x40)); assert.equal(instance.collision.vertices[0][0],-123);
  assert.throws(()=>g.candidateMapping.modelForPointers(object,instance.collision.shapeBase+1),/not a captured/);
  assert.throws(()=>g.candidateMapping.modelPointersFor({...instance,settings:{...instance.settings},shape:instance.collision.shapes[0]}),/exact object/);
});

test('native model records preserve point, edge, triangle and quad sphere-query results', () => {
  for (const index of [2,3]) {
    const f=fixture(index,{sparse:true}), g=f.geometry();
    for (const [ordinal,source] of f.models.instances) {
      const object=0x250000+ordinal*0x1000, native=g.modelContext.instances.get(object);
      // Complete the older candidate-only fixture's declared edge arithmetic.
      for (const edge of source.collision.edges) {edge.indices=[edge.raw[4],edge.raw[5]]; edge.normalQ8=unpackCollisionNormal(edge.raw.readUInt32LE());}
      for (const shape of source.collision.shapes) for (const [originQ8,deltaQ8] of [[[0,0,0],[0,0,0]],[[64*256,0,0],[-128*256,0,0]],[[0,-64*256,0],[0,128*256,0]]]) {
        const leftQuery={originQ8,deltaQ8,radiusQ8:6*256},rightQuery={...leftQuery},left={},right={};
        const expected=queryModelShapeSphere(source.collision,shape,leftQuery,left,{roundingMode:'nearest-even'}),actual=queryModelShapeSphere(native.collision,native.collision.shapes[shape.index],rightQuery,right,{roundingMode:'nearest-even'});
        assert.equal(actual,expected); assert.deepEqual(right,left); assert.deepEqual(rightQuery,leftQuery);
      }
    }
  }
});

test('bounds and missing captured rows fail instead of filling absent native storage', () => {
  const f=fixture(3,{sparse:true});
  assert.throws(()=>createNativeFrameGeometry({memory:f.memory,bounds:{...bounds,nodes:2}}),/nodes exceeds/);
  assert.throws(()=>fixture(3,{sparse:true,omit:0x201800}).geometry(),/Uncaptured native memory/);
  assert.throws(()=>createNativeFrameGeometry({memory:f.memory,bounds:{...bounds,modelBoundsFor:()=>({vertexCount:1,faceCount:1,faceRecordCount:1,edgeCount:1})}}),/out-of-bounds/);
  const g=f.geometry(); assert.throws(()=>g.modelContext.instances.values().next().value.collision.vertices[200],/Uncaptured native memory/);
});

test('sector-only decoder admits explicit partial query captures without fabricating spatial nodes', () => {
  const f=fixture(3,{sparse:true});
  const sectors=createNativeTerrainSectorViews({memory:f.memory,sectorTable:f.addresses.sectors,sectorCount:1,bounds});
  assert.deepEqual(sectors[0].vertices[0],f.grid.sectors[0].vertices[0]);
  assert.equal(sectors[0].packetAddress,f.addresses.packets);
});

const covers=(regions,address,length=1)=>regions.some(row=>address>=row.address&&address+length<=row.address+row.length);
test('comparison ledger covers exact native structures, merges repeats and adds only reached lazy vertex rows',()=>{
  const f=fixture(3),g=f.geometry(),a=f.addresses,regions=g.comparisonRegions;
  for(const[address,length]of[[a.header,0x60],[a.vertices,f.grid.sectors[0].vertices.length*8],[a.packets,f.grid.sectors[0].cells.length*8],[a.normals,24],[a.regions,36],[a.rows,4096],[a.nodes,36],[a.map,8],[a.links,40],[0x200000,0x50],[0x200100,80],[0x200800,12*9],[0x201200,8],[0x201800,8*8],[0x202000,12*8],[0x250200,16]])assert.ok(covers(regions,address,length),`Owned geometry span0x${address.toString(16)}`);
  assert.ok(Object.isFrozen(regions));assert.ok(regions.every(Object.isFrozen));
  assert.ok(regions.every(row=>row.comparison==='mutable'&&row.evidence&&row.id.startsWith('native-geometry-')));
  for(let i=1;i<regions.length;i++)assert.ok(regions[i-1].address+regions[i-1].length<regions[i].address,'Overlapping or adjacent intervals merged.');
  const collision=g.modelContext.instances.values().next().value.collision,late=0x201800+200*8;
  assert.equal(covers(regions,late,8),false,'Admission ceiling does not become an allocation claim.');
  collision.vertices[200];assert.ok(covers(g.comparisonRegions,late,8));
  assert.equal(covers(g.comparisonRegions,late-8,8),false);assert.equal(covers(g.comparisonRegions,late+8,8),false);
  const once=g.comparisonRegions;collision.vertices[200];collision.vertices[0];assert.deepEqual(g.comparisonRegions,once,'Repeated reads do not create duplicate regions.');
  assert.equal(covers(regions,late,8),false,'Previously returned frozen ledger snapshots remain stable.');
});

test('ledger resolves preferred aliases into actual native addresses and compares declared render vertex copies',()=>{
  const f=fixture(2),delta=0x300000,canonical=0x909240,actual=canonical+delta,object=0x250000,render=0x270000;
  f.memory.copy(f.memory,render,0x201800,0x201800+64);f.memory.writeUInt32LE(render,object+0x24);
  const globals=Buffer.from(f.memory.subarray(canonical,canonical+0xa0));
  const spans=[{address:0,bytes:Buffer.from(f.memory.subarray(0,canonical))},{address:canonical+0xa0,bytes:Buffer.from(f.memory.subarray(canonical+0xa0))},{address:actual,bytes:globals}];
  const {memory}=createCapturedMemory(spans,{aliases:[{address:canonical,targetAddress:actual,length:0xa0}]}),g=createNativeFrameGeometry({memory,bounds});
  assert.ok(covers(g.comparisonRegions,actual,0xa0));assert.equal(covers(g.comparisonRegions,canonical,0xa0),false);
  assert.ok(covers(g.comparisonRegions,render,64));
  const sparse=fixture(3,{sparse:true}),other=sparse.geometry(),prior=other.comparisonRegions;
  assert.throws(()=>other.modelContext.instances.values().next().value.collision.vertices[200],/Uncaptured/);assert.deepEqual(other.comparisonRegions,prior,'Failed reads never admit a comparison region.');
});

test('geometry comparison rejects terrain/model/config mutations outside core physics pools',()=>{
  const f=fixture(3),g=f.geometry(),initial=Buffer.from(f.memory),manifest={requiredRegions:g.comparisonRegions};
  assert.equal(compareNativeFrameRegions(manifest,[{address:0,bytes:initial}],[{address:0,bytes:initial}]).matched,true);
  for(const address of [f.addresses.vertices+(f.grid.sectors[0].vertices.length-1)*8,0x202004,0x201800+7*8,0x250203]) {
    const changed=Buffer.from(initial);changed[address]^=1;
    const result=compareNativeFrameRegions(manifest,[{address:0,bytes:initial}],[{address:0,bytes:changed}]);
    assert.equal(result.matched,false);assert.equal(result.divergence.address,address);assert.equal(result.divergence.comparison,'mutable');
  }
});

const retainedCapture = 'analysis/native-physics-local/startup-20261022/hidden-terrain-active-wheel-capture';
test('retained original-process geometry agrees with every reached native terrain vertex read', {skip: !existsSync(`${retainedCapture}/trace.jsonl`)}, async t => {
  const capture = await loadPhysicsCapture(retainedCapture);
  let checked = 0, queries = 0;
  for (const snapshot of capture.snapshots.filter(row => row.breakpointId === 'terrain-before')) {
    const replay = replayNativeTerrain(snapshot), {memory} = replay, pack = memory.readUInt32LE(0x90b98c);
    const sectors = createNativeTerrainSectorViews({memory,sectorTable:memory.readUInt32LE(pack),sectorCount:memory.readUInt32LE(pack+0x10),bounds:nativeFrameGeometryLimits});
    for (const read of replay.vertexReads) {
      const sector = sectors.find(row => read.address >= row.vertexAddress && read.address < row.vertexAddress + row.vertices.length * 8);
      assert.ok(sector,'reached native vertex belongs to an explicit captured sector allocation');
      const index = (read.address - sector.vertexAddress) / 8;
      assert.deepEqual(sector.vertices[index],[0,2,4,6].map(delta=>read.bytes.readInt16LE(delta))); checked++;
    }
    queries++;
  }
  assert.ok(queries > 0); assert.ok(checked > 0);
  t.diagnostic(`${queries} retained original-process queries, ${checked} reached vertex rows`);
});
