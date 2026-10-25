import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptedSceneryFixture} from './lib/scripted-scenery-fixture.mjs';
import {createSceneryDraft,inspectScenery,compileSceneryEdits,applySceneryTransform} from '../src/scenery-editor.mjs';
import {inspectSceneryScript,buildScriptedEditorMeshes} from '../src/scripted-scenery-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
const placements=s=>parsePlacements(s.texture,parseGFXM(s.geometry).models);

test('animated translation moves absolute points and restarts while preserving relative velocity, timing and opcodes',()=>{
  const source=scriptedSceneryFixture(),info=inspectScenery(source.geometry,source.texture),original=createSceneryDraft(source.geometry,source.texture,1),draft=applySceneryTransform(original,{id:'original-2',position:[48,-8,35]},info),out=compileSceneryEdits(source,draft,{level:1}),script=inspectSceneryScript(source.geometry,0),delta=[16,-8,3],allowed=new Set();
  assert.equal(info[2].kind,'animated');assert.equal(info[2].bodyType,25);assert.equal(info[2].yawEditable,false);assert.equal(info[2].importable,false);
  for(const p of script.coordinates)for(let i=0;i<3;i++){assert.equal(out.geometry.readInt32LE(p+i*4),source.geometry.readInt32LE(p+i*4)+delta[i]*65536);for(let b=0;b<4;b++)allowed.add(p+i*4+b);}
  for(let i=0;i<3;i++){assert.equal(out.geometry.readInt16LE(0x1700+i*2),source.geometry.readInt16LE(0x1700+i*2)+delta[i]);allowed.add(0x1700+i*2);allowed.add(0x1701+i*2);}
  assert.equal(out.geometry.length,source.geometry.length);for(let i=0;i<source.geometry.length;i++)if(!allowed.has(i))assert.equal(out.geometry[i],source.geometry[i],`Opaque/script control byte ${i.toString(16)}`);
  assert.deepEqual(placements(out).records[2].position,[48,-8,35]);assert.equal(source.geometry.readInt16LE(0x1700),70);
});

test('shared script and restart owners are grouped and partial edits reject atomically',()=>{
  const source=scriptedSceneryFixture({shared:true}),info=inspectScenery(source.geometry,source.texture),original=createSceneryDraft(source.geometry,source.texture,1);assert.deepEqual(info[2].linkedIndices,[2,3]);
  const partial=structuredClone(original);partial[2].position[0]++;assert.throws(()=>compileSceneryEdits(source,partial,{level:1}),/transformed together|every owner/);
  const draft=applySceneryTransform(original,{id:'original-2',position:[40,0,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(out.geometry.readInt16LE(0x1700),78);assert.deepEqual(placements(out).records.slice(2).map(p=>p.position),[[40,0,32],[40,0,32]]);
});

test('unknown script commands remain locked and Q16/short overflow leaves source bytes untouched',()=>{
  const source=scriptedSceneryFixture(),original=createSceneryDraft(source.geometry,source.texture,1),before=Buffer.from(source.geometry),info=inspectScenery(source.geometry,source.texture);
  source.geometry.writeInt16LE(99,0x1610);assert.equal(inspectScenery(source.geometry,source.texture)[2].editable,false);source.geometry.set(before);
  const draft=applySceneryTransform(original,{id:'original-2',position:[32767,0,32]},info);assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/Q16|16-bit/);assert.deepEqual(source.geometry,before);
});

test('scripted editor meshes retain embedded materials and their own authored pose',()=>{
  const source=scriptedSceneryFixture(),gfxm=parseGFXM(source.geometry),meshes=buildScriptedEditorMeshes(source.geometry,gfxm,placements(source));assert.equal(meshes.length,1);assert.equal(meshes[0].index,2);assert.equal(meshes[0].modelIndex,0);assert.equal(meshes[0].faces.length,1);assert.ok(meshes[0].vertices.flat().every(Number.isFinite));
  assert.deepEqual(meshes[0].vertices[0],[-20+32,0,-20+32]);
});

test('scripted attached lights share complete path/spawn ownership with animated objects',()=>{
  const source=scriptedSceneryFixture(),geometry=Buffer.alloc(0x1c00);geometry.set(source.geometry);source.geometry=geometry;
  geometry.writeUInt32LE(0x1800,0x14);geometry.writeUInt32LE(0x1810,0x1800);geometry.writeUInt32LE(32,0x181c);geometry.writeUInt32LE(0x1880,0x28);geometry.writeUInt16LE(8,0x1880);
  geometry.writeUInt32LE((2<<19)|1|(2<<7)|(2<<1),0x1120);geometry.writeUInt32LE(0x1a00,0x44);geometry.writeUInt32LE(1,0x48);geometry[0x1a0c]=10;geometry[0x1a0e]=1;source.texture.writeUInt16LE(0x1000,0x52e);
  const info=inspectScenery(geometry,source.texture),original=createSceneryDraft(geometry,source.texture,1);assert.deepEqual(info[0].linkedIndices,[0,2]);assert.equal(info[0].yawEditable,false);
  const draft=applySceneryTransform(original,{id:'original-0',position:[32,-4,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(out.geometry.readInt16LE(0x1702),-4);assert.equal(out.geometry.readInt32LE(0x1610+24+4),-4*65536);assert.notEqual(out.geometry.readUInt32LE(0x1a10),0);assert.equal(out.geometry[0x1a0e],1);
});

test('shared standalone scripted lights move implicitly with their object and retain light coverage and control metadata',()=>{
  const source=scriptedSceneryFixture(),geometry=Buffer.alloc(0x1c00);geometry.set(source.geometry);source.geometry=geometry;
  geometry.writeUInt32LE(0x1800,0x14);geometry.writeUInt32LE(0x1810,0x1800);geometry.writeUInt32LE(32,0x181c);geometry.writeUInt32LE(0x1880,0x28);geometry.writeUInt16LE(8,0x1880);geometry.writeUInt32LE((2<<19)|1|(2<<7)|(2<<1),0x1120);
  geometry.writeUInt32LE(0x1a00,0x44);geometry.writeUInt32LE(1,0x48);geometry[0x1a0c]=10;geometry[0x1a0e]=1;geometry[0x1a02]=77;geometry.writeUInt32LE(0xdeadbeef,0x1a10);
  const original=createSceneryDraft(geometry,source.texture,1),info=inspectScenery(geometry,source.texture),entry=info.find(p=>p.index===2);assert.equal(entry.editable,true);assert.deepEqual(entry.sharedLightIds,[0]);assert.match(entry.operationNotice,/light paths/);
  const draft=applySceneryTransform(original,{id:'original-2',position:[32,-4,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(out.geometry.readInt16LE(0x1702),-4);assert.equal(out.geometry.readInt16LE(0x1a08),-4);assert.notEqual(out.geometry.readUInt32LE(0x1a10),0xdeadbeef);assert.equal(out.geometry[0x1a02],77);assert.equal(out.geometry[0x1a0e],1);assert.equal(geometry.readInt16LE(0x1702),0);
});

test('partially aliased restart coordinates and command words reject conflicting edits before output',()=>{
  for(const spawn of [0x1610,0x162c]){
    const source=scriptedSceneryFixture();source.geometry.writeUInt32LE(spawn,0xa8);const before=Buffer.from(source.geometry),original=createSceneryDraft(source.geometry,source.texture,1),info=inspectScenery(source.geometry,source.texture),draft=applySceneryTransform(original,{id:'original-2',position:[33,0,32]},info);
    assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/Aliased scenery script/);assert.deepEqual(source.geometry,before);
  }
});
