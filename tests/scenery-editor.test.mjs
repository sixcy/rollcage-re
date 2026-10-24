import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {createSceneryDraft, inspectScenery, compileSceneryEdits, validateSceneryRows, validateSceneryImport} from '../src/scenery-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
import {createModelCollisionContext,buildModelCandidates} from '../src/model-candidates.mjs';
import {queryPlacedModelSphere} from '../src/placed-model-sphere-query.mjs';
const placements=c=>parsePlacements(c.texture,parseGFXM(c.geometry).models);
const links=c=>parseStaticModelLinks(c.geometry,parseSpatialIndex(c.geometry),placements(c));

test('plain scenery eligibility locks destruction, groups, effects and animation',()=>{
  const source=sceneryFixture();assert.deepEqual(inspectScenery(source.geometry,source.texture).map(p=>p.editable),[true,false]);
  for(const change of [s=>s.texture.writeUInt16LE(0,0x506),s=>s.texture[0x500+46]=2,s=>s.texture.writeInt16LE(16,0x50e),s=>s.geometry.writeUInt16LE(0,0x1412),s=>s.geometry.writeUInt16LE(0x80,0x1416)]){const s=sceneryFixture();change(s);assert.equal(inspectScenery(s.geometry,s.texture)[0].editable,false);}
});
test('no edits preserve bytes; moving and rotating preserves model and locked placement',()=>{
  const source=sceneryFixture(),before=structuredClone(source),draft=createSceneryDraft(source.geometry,source.texture,1);
  let c=compileSceneryEdits(source,draft,{level:1});assert.deepEqual(c.geometry,source.geometry);assert.deepEqual(c.texture,source.texture);
  draft[0].position=[60,-20,40];draft[0].yaw=1024;c=compileSceneryEdits(source,draft,{level:1});
  assert.deepEqual(placements(c).records[0].position,draft[0].position);assert.equal(placements(c).records[0].angles[1],1024);
  assert.deepEqual(placements(c).records[1].raw,placements(source).records[1].raw);assert.deepEqual(c.geometry.subarray(0x1140,0x1300),source.geometry.subarray(0x1140,0x1300));
  assert.ok(links(c).nodes[0].placementIndices.includes(0));assert.deepEqual(source.geometry,Buffer.from(before.geometry));assert.deepEqual(source.texture,Buffer.from(before.texture));
});
test('deletion keeps unrelated native indices using skipped-dispatch tombstones',()=>{
  const source=sceneryFixture(),draft=createSceneryDraft(source.geometry,source.texture,1).slice(1),c=compileSceneryEdits(source,draft,{level:1});
  assert.equal(placements(c).count,2);assert.equal(placements(c).records[0].type,25);assert.equal(placements(c).records[1].type,0);assert.deepEqual(links(c).nodes[0].placementIndices,[1]);
});
test('duplicate retains model collision settings; overflowing candidate cells rejects atomically',()=>{
  const source=sceneryFixture(),draft=createSceneryDraft(source.geometry,source.texture,1);
  draft.push({...draft[0],id:'copy',position:[50,0,40]});const c=compileSceneryEdits(source,draft,{level:1});assert.equal(c.indices.copy,2);
  const model=parseGFXM(c.geometry).models[0],settings=readPlacementCollision(c.geometry,placements(c).records[2],parseModelCollision(c.geometry,model));assert.equal(settings.class,7);assert.equal(settings.configurations[0].type,0);
  for(let i=0;i<6;i++)draft.push({...draft[0],id:`extra-${i}`});assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/7 static models/);assert.equal(placements(source).count,2);
});
test('cross-library import preserves collision/LOD closure and remaps palette/texture/material dependencies',()=>{
  const source=sceneryFixture(),donor=sceneryFixture({color:200}),draft=createSceneryDraft(source.geometry,source.texture,1);
  draft.push({id:'foreign',sourceLevel:2,templateIndex:0,position:[50,0,30],yaw:512});const c=compileSceneryEdits(source,draft,{level:1,donors:new Map([[2,{LOW:donor,HIGH:donor}]])});
  const models=parseGFXM(c.geometry).models,p=placements(c).records[2];assert.equal(models.length,2);assert.equal(p.modelIndex,1);
  const collision=parseModelCollision(c.geometry,models[1]);assert.equal(collision.available,true);assert.deepEqual(collision.vertices,parseModelCollision(donor.geometry,parseGFXM(donor.geometry).models[0]).vertices);
  assert.equal(readPlacementCollision(c.geometry,p,collision).class,7);const btp=parseBTP(c.texture);assert.equal(btp.textureCount,2);assert.deepEqual(decodeBTPTexture(btp,1).rgba,decodeBTPTexture(parseBTP(donor.texture),0).rgba);
  assert.deepEqual(decodeBTPTexture(btp,0).rgba,decodeBTPTexture(parseBTP(source.texture),0).rgba);assert.ok(links(c).nodes[0].placementIndices.includes(2));
});
test('locked edits, invalid donors, coordinates, identities and sparse rows are rejected',()=>{
  const source=sceneryFixture(),original=createSceneryDraft(source.geometry,source.texture,1);
  const changed=structuredClone(original);changed[1].position[0]++;assert.throws(()=>compileSceneryEdits(source,changed,{level:1}),/locked/);
  assert.throws(()=>compileSceneryEdits(source,original.slice(0,1),{level:1}),/locked/);
  for(const row of [{...original[0],position:[0,0,32768]},{...original[0],yaw:NaN},{...original[0],raw:[]},{...original[0],sourceLevel:21}])assert.throws(()=>validateSceneryRows([row]));
  assert.throws(()=>validateSceneryRows(new Array(1)));assert.throws(()=>validateSceneryRows([original[0],original[0]]),/duplicate/);
});
test('native nearest-cell fallback retains moved collision; old and deleted positions are clear',()=>{
  const source=sceneryFixture(),draft=createSceneryDraft(source.geometry,source.texture,1);draft[0].position=[1024,0,32];
  const moved=compileSceneryEdits(source,draft,{level:1}),context=createModelCollisionContext(moved.geometry,moved.texture);
  function contact(c,position){const body={flags:3,position:[(position[0]+10)*65536,position[1]*65536,position[2]*65536],linearVelocity:[-20*65536,0,0]},query={originQ8:body.position.map(n=>n>>8),deltaQ8:body.linearVelocity.map(n=>n>>8),radiusQ8:512,tag:1};
    const candidates=buildModelCandidates(c,body,{radiusQ8:512}).candidates.filter(p=>p.settings.placementIndex===0),output={flags:0,point:[0,0,0],normal:[0,0,0],scalar:0};queryPlacedModelSphere(candidates,query,output,{roundingMode:'nearest-even',effects:{onObjectContact:()=>0}});return output.flags;}
  assert.notEqual(contact(context,[1024,0,32]),0);assert.equal(contact(context,[32,0,32]),0);
  const deleted=compileSceneryEdits(source,draft.slice(1),{level:1});assert.equal(contact(createModelCollisionContext(deleted.geometry,deleted.texture),[32,0,32]),0);
});
test('yaw rotates the collision point, rather than only the visible model',()=>{
  const source=sceneryFixture();source.geometry.writeInt16LE(12,0x12d8);const draft=createSceneryDraft(source.geometry,source.texture,1);draft[0].yaw=1024;
  const c=compileSceneryEdits(source,draft,{level:1}),context=createModelCollisionContext(c.geometry,c.texture);
  const hit=position=>{const body={flags:3,position:position.map(n=>n*65536),linearVelocity:[-20*65536,0,0]},candidates=buildModelCandidates(context,body,{radiusQ8:512}).candidates.filter(c=>c.settings.placementIndex===0),output={flags:0,point:[0,0,0],normal:[0,0,0],scalar:0};queryPlacedModelSphere(candidates,{originQ8:position.map(n=>n*256),deltaQ8:[-5120,0,0],radiusQ8:512,tag:1},output,{roundingMode:'nearest-even',effects:{onObjectContact:()=>0}});return output.flags;};
  assert.notEqual(hit([42,0,20]),0);assert.equal(hit([54,0,32]),0);
});
test('foreign imports reject full texture slots, model bytes and material-key overflow without overwriting originals',()=>{
  const donor=sceneryFixture({color:200});
  for(const kind of ['textures','models','materials']){
    const source=sceneryFixture();
    if(kind==='textures'){const texture=Buffer.alloc(0xc00);texture.set(source.texture);texture.writeUInt32LE(0x700,0x38);texture.writeUInt16LE(63,0x34);for(let i=0;i<63;i++){texture.writeUInt16LE(4,0x700+i*12);texture.writeUInt16LE(4,0x702+i*12);}source.texture=texture;}
    else {const geometry=Buffer.alloc(kind==='models'?0x1c00:0x5500);geometry.set(source.geometry);source.geometry=geometry;if(kind==='models'){geometry.writeUInt32LE(0x1600,0x18);geometry.writeUInt32LE(0x1140,0x1600);geometry.writeUInt16LE(256,0x2c);}else{geometry.set(geometry.subarray(0x1434,0x1440),0x5410);geometry.writeUInt32LE(0x5410,0xac);}}
    const before={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)},draft=createSceneryDraft(source.geometry,source.texture,1);draft.push({id:'foreign',sourceLevel:2,templateIndex:0,position:[50,0,30],yaw:0});
    assert.throws(()=>compileSceneryEdits(source,draft,{level:1,donors:new Map([[2,{LOW:donor,HIGH:donor}]])}),kind==='textures'?/texture slot/:kind==='models'?/native byte/:/Material key/);
    assert.throws(()=>validateSceneryImport(source,draft,{level:1,donors:new Map([[2,{LOW:donor,HIGH:donor}]])}),kind==='textures'?/texture slot/:kind==='models'?/native byte/:/Material key/);
    assert.deepEqual(source,before);
  }
});
test('asset preflight returns no resource bytes and leaves location-specific collision checks to committing',()=>{
  const source=sceneryFixture(),draft=createSceneryDraft(source.geometry,source.texture,1),before={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)};
  for(let i=0;i<6;i++)draft.push({...draft[0],id:`copy-${i}`});
  assert.equal(validateSceneryImport(source,draft,{level:1}),undefined);
  assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/7 static models/);assert.deepEqual(source,before);
});
test('collision list rebuilding preserves per-cell route fallback words even when model lists are identical',()=>{
  const source=sceneryFixture(),geometry=Buffer.alloc(0x1700);geometry.set(source.geometry);source.geometry=geometry;
  geometry.writeUInt32LE(2,0xc);geometry.writeUInt32LE(0x1600,0x68);geometry.writeUInt16LE(0x8180,0x100+128*16);geometry.writeUInt16LE(12,0x1102);
  geometry.writeUInt32LE(2<<19,0x1600);geometry.writeUInt32LE((3<<22)|(2<<19),0x160c);geometry.writeUInt16LE(6,0x96);
  [0x10002,0,1,0x20003,0,1].forEach((n,i)=>geometry.writeUInt32LE(n,0x1434+i*4));
  const original=links(source),draft=createSceneryDraft(geometry,source.texture,1),moved=structuredClone(draft);moved[0].position[0]+=16;
  for(const rows of [moved,draft.slice(1),[...draft,{...draft[0],id:'copy'}]]){
    const c=compileSceneryEdits(source,rows,{level:1}),after=links(c);
    assert.deepEqual(after.nodes[0].placementIndices,after.nodes[1].placementIndices);
    assert.notEqual(after.nodes[0].start,after.nodes[1].start);
    for(let i=0;i<2;i++)assert.equal(after.entries[after.nodes[i].start],original.entries[original.nodes[i].start]);
  }
});
