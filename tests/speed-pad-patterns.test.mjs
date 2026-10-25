import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainFixture} from './lib/terrain-fixture.mjs';
import {parseScene} from '../src/scene.mjs';
import {speedPadTilePairs as speedPadPatterns,speedPadPatterns as completeArrows,speedPadFootprint,compileSpeedPadPatterns} from '../src/speed-pad-patterns.mjs';
const fixture=()=>{
  const original=terrainFixture(),data=Buffer.alloc(0x3400);data.set(original);data.set(original.subarray(0x100,0x1100),0x2400);data.writeUInt32LE(0x2400,0x24);data.writeUInt32LE(0x1600,0x110);const scene=parseScene(data),uv=scene.uvTable;
  const raw=Buffer.alloc(16);raw.set([160,32],0);raw.set([191,32],4);raw.set([160,63],8);raw.set([191,63],10);raw.writeUInt16LE(20,6);raw.writeUInt32LE(1,12);data.set(raw,uv);
  const mirrored=Buffer.from(raw);for(const [a,b]of [[0,4],[8,10]]){const x=[raw[b],raw[b+1]];mirrored[a]=x[0];mirrored[a+1]=x[1];mirrored[b]=raw[a];mirrored[b+1]=raw[a+1];}data.set(mirrored,uv+16);
  for(const s of scene.segments){data.writeUInt32LE(0,s.packetsOffset+4);data.writeUInt32LE(1,s.packetsOffset+12);for(const f of s.faces)data.writeUInt16LE(data.readUInt16LE(s.verticesOffset+f.gridIndices[3]*8+6)|4,s.verticesOffset+f.gridIndices[3]*8+6);}
  return data;
};
test('recognizes a complete mirrored native arrow and rejects an isolated material tile',()=>{
  const data=fixture();assert.ok(speedPadPatterns(data,data).length);const scene=parseScene(data);data.writeUInt32LE(0,scene.segments[0].packetsOffset+12);assert.ok(!speedPadPatterns(data,data).some(p=>p.sector===0));
});
test('quarter turns map footprint and UV corners without changing collision/grid flags',()=>{
  const data=fixture(),before=Buffer.from(data),pattern=speedPadPatterns(data,data)[0],scene=parseScene(data),placement={sector:0,cell:0,sourceSector:pattern.sector,sourceCell:pattern.cell,rotation:1};
  assert.deepEqual(speedPadFootprint(scene,placement,pattern).map(p=>p.cell),[0,2]);
  const out=compileSpeedPadPatterns(data,[placement]),edited=parseScene(out);assert.deepEqual(edited.segments[0].faces[0].uv,[[160,63],[160,32],[191,63],[191,32]]);
  assert.deepEqual(edited.segments[0].vertices,scene.segments[0].vertices);assert.deepEqual(data,before);
});
test('destination native corner mapping is compensated; invalid full footprints fail atomically',()=>{
  const data=fixture(),pattern=speedPadPatterns(data,data)[0],scene=parseScene(data),s=scene.segments[0],f=s.faces[0];data.writeUInt16LE(data.readUInt16LE(s.verticesOffset+f.gridIndices[3]*8+6)&~4,s.verticesOffset+f.gridIndices[3]*8+6);
  const placement={sector:0,cell:0,sourceSector:pattern.sector,sourceCell:pattern.cell,rotation:0},out=compileSpeedPadPatterns(data,[placement],{originalGeometry:fixture()});assert.deepEqual(parseScene(out).segments[0].faces[0].uv,[[191,32],[191,63],[160,32],[160,63]]);
  const before=Buffer.from(data);assert.throws(()=>compileSpeedPadPatterns(data,[{...placement,cell:1}],{originalGeometry:fixture()}),/complete arrow/);assert.deepEqual(data,before);
  assert.throws(()=>compileSpeedPadPatterns(data,[placement],{originalGeometry:fixture(),locked:new Set([0])}),/Animated/);
});

test('v6 recognizes complementary rows as one four-cell arrow while legacy commands stay two cells',()=>{
  const data=fixture(),scene=parseScene(data),s=scene.segments[0],uv=scene.uvTable;
  for(let i=0;i<2;i++){const raw=Buffer.from(data.subarray(uv+i*16,uv+(i+1)*16));for(const o of [0,4,8,10])raw[o]-=64;data.set(raw,uv+(i+2)*16);data.writeUInt32LE(i+2,s.packetsOffset+(i+2)*8+4);}
  const patterns=completeArrows(data,data);assert.equal(patterns.length,1);assert.equal(patterns[0].cells.length,4);
  const command={kind:'arrow4',sector:1,cell:0,sourceSector:0,sourceCell:0,rotation:0},out=compileSpeedPadPatterns(data,[command]),edited=parseScene(out);
  for(let i=0;i<4;i++)assert.deepEqual(edited.segments[1].faces[i].uv,parseScene(data).segments[0].faces[i].uv);
  assert.equal(speedPadFootprint(scene,command,patterns[0]).length,4);
  const legacy={sector:1,cell:0,sourceSector:0,sourceCell:0,rotation:0},old=compileSpeedPadPatterns(data,[legacy]);assert.deepEqual(parseScene(old).segments[1].faces[2].uv,parseScene(data).segments[1].faces[2].uv);
  for(let rotation=1;rotation<4;rotation++)assert.deepEqual(new Set(speedPadFootprint(scene,{...command,rotation},patterns[0]).map(p=>p.cell)),new Set([0,1,2,3]));
});
