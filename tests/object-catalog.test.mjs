import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {decodeObjectCollection, listObjectResources, loadObjectCollection} from '../src/object-catalog.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

function fixture(game = 'rollcage') {
  const geometry = Buffer.alloc(0x700), texture = Buffer.alloc(game === 'firebugs' ? 16 + 512 * 512 * 2 : 0x800), btx = Buffer.alloc(0x100);
  geometry.write('GFXM'); geometry.writeUInt16LE(game === 'stage2' ? 4 : 1, 4);
  geometry.writeUInt32LE(0x140, 0x18); geometry.writeUInt16LE(1, 0x2c); geometry.writeUInt32LE(0x200, 0x140);
  if (game === 'firebugs') geometry.writeUInt32LE(0x4d4f4401, 0x200); else geometry.write('MODL', 0x200);
  geometry.writeUInt16LE(3, 0x204); geometry.writeUInt16LE(1, 0x206); geometry.writeUInt32LE(0x70, 0x20c);
  geometry.writeUInt32LE(0x100, 0x210); geometry.writeUInt32LE(0x128, 0x214);
  geometry.writeUInt32LE(0x80, 0x200 + (game === 'firebugs' ? 0x44 : 0x40));
  [[0,0,0],[10,0,0],[0,10,0]].forEach((v,i) => v.forEach((n,a) => geometry.writeInt16LE(n, 0x280+i*8+a*2)));
  geometry.set([1,2,3,0], 0x270);
  geometry.writeUInt32LE(0x400, 0xcc); geometry.writeUInt32LE(0x420, 0xd8); geometry.writeUInt32LE(0x500, 0x84);
  geometry.writeUInt16LE(0xffff, 0x422); geometry.writeUInt16LE(game === 'firebugs' ? 0x108 : 0, 0x426);
  for (const [offset, pair] of [[12,[0,0]],[20,[1,0]],[28,[0,1]]]) geometry.set(pair, 0x300+offset);
  const placements = game === 'firebugs' ? btx : texture;
  placements.write(game === 'firebugs' ? 'BTX ' : 'BTP '); placements.writeUInt32LE(1, 0x14); placements.writeUInt32LE(0x80, 0x28); placements.writeUInt16LE(0x400, 0x80);
  if (game === 'firebugs') {texture.write('VRAM'); for (let p=16;p<texture.length;p+=2) texture.writeUInt16LE(0x7fff,p);}
  else {
    texture.writeUInt32LE(0x100, 0x24); texture.writeUInt16LE(1, 0x34); texture.writeUInt16LE(1, 0x36); texture.writeUInt32LE(0x120, 0x38); texture.writeUInt32LE(0x200, 0x3c);
    texture.writeUInt16LE(2, 0x120); texture.writeUInt16LE(2, 0x122); texture.fill(1,0x100,0x104); texture.set([0,0,255,0],0x204);
  }
  return {geometry, texture, btx, options: {game, btxData: btx, resource: {game, id: `${game}:10`, name: 'TEST', index: 10, textureIndex: game === 'firebugs' ? 12 : 11, vramIndex: 11, btxIndex: 12}}};
}

test('all three readers produce textured model-local scenes with original winding and source metadata', () => {
  for (const game of ['rollcage','stage2','firebugs']) {
    const f=fixture(game), bytes=Buffer.from(f.geometry), catalog=decodeObjectCollection(f.geometry,f.texture,f.options), entry=catalog.entries.find(e=>e.kind==='scenery');
    assert.equal(entry.status,'supported'); assert.deepEqual(entry.placementIndices,[0]);
    const scene=catalog.load(entry); assert.equal(scene.triangles,1); assert.equal(scene.vertices,3); assert.equal(scene.segments,0);
    assert.deepEqual(scene.meshes[0].faces[0].indices,[0,2,1]); assert.deepEqual(scene.bounds,[[0,10],[-10,0],[0,0]]);
    assert.equal(scene.textures.size,1); assert.ok(scene.obj.includes('mtllib scene.mtl')); assert.equal(scene.source.game,game);
    assert.deepEqual(f.geometry,bytes); assert.deepEqual(catalog.load(entry.id).groups,scene.groups);
    if(game==='rollcage') {assert.ok(catalog.entries.some(e=>e.kind==='vehicle-body'));assert.ok(catalog.entries.some(e=>e.kind==='vehicle-wheel'));}
    else assert.equal(catalog.counts.vehicleParts,0);
  }
});

test('Rollcage keeps distinct placement material variants and inventories unsupported special-only models', () => {
  const f=fixture(); f.texture.writeUInt32LE(3,0x14); f.texture.writeUInt16LE(0x400,0x80+56); f.texture.writeUInt16LE(1,0x80+56+40); f.texture.writeUInt16LE(2,0x80+112);
  const catalog=decodeObjectCollection(f.geometry,f.texture,f.options), scenery=catalog.entries.filter(e=>e.kind==='scenery');
  assert.equal(scenery.length,2); assert.notEqual(scenery[0].id,scenery[1].id); assert.equal(catalog.counts.specialPlacements,1);
  const g=fixture('stage2'); g.texture.writeUInt16LE(2,0x80);
  const unresolved=decodeObjectCollection(g.geometry,g.texture,g.options); assert.equal(unresolved.counts.supported,0);
  assert.equal(unresolved.entries[0].status,'unsupported'); assert.throws(()=>unresolved.load(unresolved.entries[0]),/context/);
});

test('collections reject wrong pairs, invalid faces/material pages and foreign entry identity', async () => {
  const f=fixture(), catalog=decodeObjectCollection(f.geometry,f.texture,f.options), entry=catalog.entries[0];
  assert.throws(()=>catalog.load({...entry}),/belong/); assert.throws(()=>catalog.load('missing'),/belong/);
  assert.throws(()=>decodeObjectCollection(f.geometry,f.texture,{...f.options,game:'stage2'}),/another game/);
  assert.throws(()=>decodeObjectCollection(f.geometry,f.texture,{game:'firebugs'}),/BTX/);
  f.geometry.writeUInt16LE(63,0x426); const bad=decodeObjectCollection(f.geometry,f.texture,f.options);
  assert.equal(bad.entries.find(e=>e.kind==='scenery').status,'unsupported');
  const reads=[], archive={readResource:async index=>{reads.push(index);return{data:index===10?fixture().geometry:fixture().texture};}};
  const resources=await listObjectResources(archive,'rollcage',[{game:'rollcage',index:10,textureIndex:11,name:'TEST'}]);
  assert.deepEqual(reads,[]); const loaded=await loadObjectCollection(archive,'rollcage',resources[0]); assert.deepEqual(reads,[10,11]); assert.ok(loaded.counts.supported);
  await assert.rejects(loadObjectCollection(archive,'stage2',resources[0]),/matching/);
});

test('bundled browser catalog, geometry and decoded textures match Node for all three games',async()=>{
  const browser=runInNewContext(await buildViewerBundle('src/object-catalog.mjs'),{btoa,atob,TextEncoder,TextDecoder});
  for(const game of ['rollcage','stage2','firebugs']) {
    const f=fixture(game), native=decodeObjectCollection(f.geometry,f.texture,f.options), bundled=browser.decodeObjectCollection(f.geometry,f.texture,f.options);
    assert.equal(JSON.stringify(bundled.entries),JSON.stringify(native.entries));
    const id=native.entries.find(e=>e.status==='supported').id, first=native.load(id), second=bundled.load(id);
    assert.equal(JSON.stringify(second.groups),JSON.stringify(first.groups));assert.equal(second.obj,first.obj);
    assert.deepEqual([...second.textures.values()].map(t=>[...t.rgba]),[...first.textures.values()].map(t=>[...t.rgba]));
  }
});
