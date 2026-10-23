import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync, crc32} from 'node:zlib';
import {buildSceneExport} from '../src/scene-export.mjs';
import {encodePNG} from '../src/png.mjs';
import {buildObjectDownload, buildObjectManifest} from '../tools/object-viewer/export-object.mjs';
import {readTrackZIP} from '../tools/lib/check-track-download.mjs';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {RollcageArchive} from '../src/archive.mjs';
import {FirebugsArchive} from '../src/firebugs-archive.mjs';
import {getGame, identifyGame} from '../src/track-games.mjs';
import {identifyFirebugs} from '../src/firebugs.mjs';
import {openFirebugsZip} from '../tools/lib/firebugs-disc.mjs';
import {listObjectResources, loadObjectCollection} from '../src/object-catalog.mjs';

const encode = image => encodePNG({...image, rgba: Buffer.from(image.rgba)});
function fixture() {
  const textures = new Map([
    [7, {width: 2, height: 1, rgba: Uint8Array.from([9, 18, 27, 0, 200, 100, 50, 128])}],
    [2, {width: 1, height: 1, rgba: Uint8Array.from([90, 40, 10, 255])}],
    [99, {width: 1, height: 1, rgba: Uint8Array.from([1, 2, 3, 255])}],
  ]);
  const mesh = {index: 3, modelIndex: 3, vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]], faces: [
    {page: 7, indices: [0, 1, 2], uv: [[0, 0], [1, 0], [0, 0]]},
    {page: 2, indices: [0, 2, 3], uv: [[0, 0], [0, 0], [0, 0]]},
  ]};
  return {...buildSceneExport({segments: []}, textures, [mesh]), segments: 0, instances: 1, textures, meshes: [mesh],
    entry: {id: '../..\\CON\nvariant:2', label: 'Synthetic body / variant 2', modelIndex: 3, kind: 'primary-model', status: 'supported', materialVariant: {index: 2, table: 'primary'}, placementIndices: [4, 8]},
    source: {game: 'stage2', resourceIndex: 12, resourceName: 'TEST.GFXM', textureResource: 13, coordinates: 'X,-Y,-Z (Y up); source units retained', verified: false},
    limits: ['Synthetic fixture; not original-process or installed asset evidence.']};
}

function decodeHostPNG(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const idat = []; let width, height;
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + length);
    assert.equal(crc32(bytes.subarray(at + 4, at + 8 + length)), bytes.readUInt32BE(at + 8 + length));
    if (type === 'IHDR') {width = data.readUInt32BE(); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6);}
    if (type === 'IDAT') idat.push(data);
    at += length + 12;
  }
  const inflated = inflateSync(Buffer.concat(idat)), rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    assert.equal(inflated[row * (width * 4 + 1)], 0, 'The injected host encoder uses PNG filter0.');
    inflated.copy(rgba, row * width * 4, row * (width * 4 + 1) + 1, (row + 1) * (width * 4 + 1));
  }
  return {width, height, rgba};
}

test('selected object ZIP keeps OBJ UV/material bindings, PNG RGBA alpha and exact provenance', async () => {
  const scene = fixture(), original = scene.obj, calls = [];
  const download = await buildObjectDownload(scene, {encodeTexturePNG: async image => {calls.push(image); return encode(image);}});
  assert.match(download.filename, /^object-stage2-[a-z0-9_-]+\.zip$/); assert.ok(!download.filename.includes('..'));
  assert.equal(download.blob.type, 'application/zip');
  const files = readTrackZIP(Buffer.from(await download.blob.arrayBuffer()));
  assert.deepEqual([...files.keys()], ['object.obj', 'texture-2.png', 'texture-7.png', 'object.mtl', 'manifest.json', 'README.txt']);
  assert.equal(calls.length, 2, 'Unreferenced archive texture pages do not enter a selected-object ZIP.');
  const obj = files.get('object.obj').toString('utf8'), mtl = files.get('object.mtl').toString('utf8');
  assert.equal(obj.match(/^mtllib /gm)?.length, 1); assert.match(obj, /^mtllib object\.mtl$/m);
  assert.equal(obj.replace(/^mtllib object\.mtl\n/m, ''), original.replace(/^mtllib scene\.mtl\n/m, ''));
  const references = [...obj.matchAll(/^usemtl (\S+)$/gm)].map(match => match[1]);
  assert.deepEqual(new Set(references), new Set([...mtl.matchAll(/^newmtl (\S+)$/gm)].map(match => match[1])));
  for (const match of mtl.matchAll(/^map_(Kd|d) (.+)$/gm)) assert.ok(files.has(match[2]));
  for (const page of [2, 7]) {
    const decoded = decodeHostPNG(files.get(`texture-${page}.png`)), expected = scene.textures.get(page);
    assert.equal(decoded.width, expected.width); assert.equal(decoded.height, expected.height); assert.deepEqual(decoded.rgba, Buffer.from(expected.rgba));
  }
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.deepEqual(manifest, download.manifest); assert.deepEqual(manifest.entry, scene.entry); assert.deepEqual(manifest.source, scene.source);
  assert.deepEqual(manifest.limits, scene.limits); assert.deepEqual(manifest.bounds, scene.bounds);
  assert.equal(manifest.vertices, scene.vertices); assert.equal(manifest.triangles, 2);
  assert.deepEqual(manifest.files.textures.map(page => [page.page, page.hasAlpha]), [[2, false], [7, true]]);
  assert.match(files.get('README.txt').toString(), /one folder/); assert.match(files.get('README.txt').toString(), /material-variant provenance/);
  assert.equal(scene.obj, original, 'Export does not mutate the loaded scene.');
});

test('selected archive serialization is deterministic and metadata snapshots exclude mesh/texture buffers', async () => {
  const scene = fixture(), first = await buildObjectDownload(scene, {encodeTexturePNG: encode}), second = await buildObjectDownload(scene, {encodeTexturePNG: encode});
  assert.deepEqual(Buffer.from(await first.blob.arrayBuffer()), Buffer.from(await second.blob.arrayBuffer()));
  const manifest = buildObjectManifest(scene); scene.entry.placementIndices.push(99); scene.source.resourceIndex = 200;
  assert.deepEqual(manifest.entry.placementIndices, [4, 8]); assert.equal(manifest.source.resourceIndex, 12);
  assert.ok(!Object.hasOwn(manifest, 'meshes')); assert.ok(!Object.hasOwn(manifest, 'groups'));
  assert.ok(!JSON.stringify(manifest).includes('rgba'));
});

test('export rejects missing textures, unsupported geometry, unsafe page identities and lossy metadata', async () => {
  for (const mutate of [
    scene => scene.entry.status = 'unsupported', scene => scene.textures.delete(7),
    scene => scene.textures.set('../bad', scene.textures.get(7)), scene => scene.textures.get(7).rgba = new Uint8Array(1),
    scene => scene.obj = scene.obj.replace('usemtl page_7', 'usemtl ../../bad'), scene => scene.triangles++,
    scene => scene.source.data = new Uint8Array(5), scene => scene.source.self = scene.source,
    scene => scene.bounds[0][0] = NaN,
  ]) {const scene = fixture(); mutate(scene); await assert.rejects(buildObjectDownload(scene, {encodeTexturePNG: encode}));}
});

test('PNG encoding failures propagate without mutating the selection and can be retried', async () => {
  const scene = fixture(), original = scene.obj;
  await assert.rejects(buildObjectDownload(scene, {encodeTexturePNG: () => {throw Error('Canvas failed.');}}), /PNG encoding failed/);
  await assert.rejects(buildObjectDownload(scene, {encodeTexturePNG: () => new Uint8Array(4)}), /did not encode as a PNG/);
  await assert.rejects(buildObjectDownload(scene, {encodeTexturePNG: () => encode({width: 1, height: 1, rgba: new Uint8Array(4)})}), /dimensions differ/);
  assert.equal(scene.obj, original); assert.equal((await buildObjectDownload(scene, {encodeTexturePNG: encode})).blob.type, 'application/zip');
});

function assembledFixture() {
  const single = fixture(), identity = [4096, 0, 0, 0, 4096, 0, 0, 0, 4096];
  const parts = Array.from({length: 5}, (_, index) => ({index, name: index ? `wheel-${index}` : 'body', modelIndex: index ? 8 : 3,
    positionQ16: [index * 4 * 65536, 0, 0], rotationQ12: identity.slice(), scale: 1}));
  const meshes = parts.map(part => ({index: part.index, modelIndex: part.modelIndex, part: part.name,
    vertices: (part.index ? [[0, 0, 0], [1, 0, 0], [0, 1, 0]] : single.meshes[0].vertices).map(v => v.map((value, axis) => value + part.positionQ16[axis] / 65536)),
    faces: part.index ? [{page: 2, indices: [0, 1, 2], uv: [[0, 0], [0, 0], [0, 0]]}] : single.meshes[0].faces}));
  return {...single, ...buildSceneExport({segments: []}, single.textures, meshes), meshes, instances: 5,
    source: {...single.source, game: 'rollcage'},
    entry: {...single.entry, id: 'rollcage:fixture:car:0', label: 'Synthetic complete car', kind: 'vehicle-assembled', materialVariant: 'assembled-neutral'},
    assembly: {vehicleType: 0, pose: 'neutral', coordinates: 'source model-local X,Y,Z; transforms Q12/Q16', parts, scope: 'Synthetic assembly fixture only.'}};
}

test('assembled car ZIP preserves all five baked mesh groups and neutral part/model transforms', async () => {
  const scene = assembledFixture(), download = await buildObjectDownload(scene, {encodeTexturePNG: encode});
  const files = readTrackZIP(Buffer.from(await download.blob.arrayBuffer())), manifest = JSON.parse(files.get('manifest.json').toString());
  assert.equal(manifest.kind, 'selected-static-vehicle-assembly'); assert.equal(manifest.meshCount, 5);
  assert.equal(manifest.vertices, 16); assert.equal(manifest.triangles, 6); assert.deepEqual(manifest.bounds, scene.bounds);
  assert.deepEqual(manifest.assembly, scene.assembly); assert.deepEqual(manifest.assembly.parts.map(part => part.modelIndex), [3, 8, 8, 8, 8]);
  assert.match(manifest.scope, /body and four wheels/); assert.doesNotMatch(manifest.scope, /no inferred assembly/);
  assert.deepEqual([...files.get('object.obj').toString().matchAll(/^g (\S+)$/gm)].map(match => match[1]), ['object_0', 'object_1', 'object_2', 'object_3', 'object_4']);
  assert.match(files.get('README.txt').toString(), /do not apply those transforms a second time/);
  const snapshot = buildObjectManifest(scene); scene.assembly.parts[1].positionQ16[0]++;
  assert.notDeepEqual(snapshot.assembly.parts[1].positionQ16, scene.assembly.parts[1].positionQ16);
});

test('assembled car export rejects missing wheels and mismatched part identity or transform metadata', async () => {
  for (const mutate of [
    scene => delete scene.assembly, scene => scene.meshes.pop(), scene => scene.assembly.parts.pop(),
    scene => scene.assembly.parts[1].modelIndex++, scene => scene.assembly.parts[1].name = 'body',
    scene => scene.assembly.parts[1].positionQ16[0] = Infinity, scene => scene.obj = scene.obj.replace('g object_4', 'g object_5'),
  ]) {const scene = assembledFixture(); mutate(scene); await assert.rejects(buildObjectDownload(scene, {encodeTexturePNG: encode}));}
});

async function verifyInstalledSelection(archive, game, identified, t) {
  const resources = await listObjectResources(archive, game, identified.tracks); assert.ok(resources.length);
  const resource = resources[0], collection = await loadObjectCollection(archive, game, resource);
  const entries = [collection.entries.find(row => row.status === 'supported' && row.kind !== 'vehicle-assembled')];
  if (game.id === 'rollcage') for (const kind of ['vehicle-body', 'vehicle-wheel', 'vehicle-linked']) entries.push(collection.entries.find(row => row.kind === kind && row.status === 'supported'));
  for (const entry of entries) {
    assert.ok(entry, `${game.id} first resource has each selected supported static model.`);
    const scene = await collection.load(entry), download = await buildObjectDownload(scene, {encodeTexturePNG: encode});
    const files = readTrackZIP(Buffer.from(await download.blob.arrayBuffer()));
    assert.equal(files.get('object.obj').toString(), scene.obj.replace(/^mtllib scene\.mtl\n/m, '').replace(/^/, 'mtllib object.mtl\n'));
    const manifest = JSON.parse(files.get('manifest.json').toString());
    assert.equal(manifest.source.game, game.id); assert.equal(manifest.source.geometryResource, resource.index);
    assert.equal(manifest.source.textureResource, resource.textureIndex); assert.equal(manifest.entry.modelIndex, entry.modelIndex);
    assert.equal(manifest.entry.materialVariant, entry.materialVariant); assert.deepEqual(manifest.entry.placementIndices, entry.placementIndices);
    assert.equal(manifest.entry.kind, entry.kind); assert.deepEqual(manifest.entry.vehicleTypes, entry.vehicleTypes);
    assert.deepEqual(manifest.limits, scene.limits);
    const materials = new Set([...files.get('object.mtl').toString().matchAll(/^newmtl (\S+)$/gm)].map(match => match[1]));
    for (const match of files.get('object.obj').toString().matchAll(/^usemtl (\S+)$/gm)) assert.ok(materials.has(match[1]));
    for (const page of manifest.files.textures) {
      const image = scene.textures.get(page.page), png = decodeHostPNG(files.get(page.filename));
      assert.equal(png.width, image.width); assert.equal(png.height, image.height); assert.deepEqual(png.rgba, Buffer.from(image.rgba));
      assert.match(files.get('object.mtl').toString(), new RegExp(`map_Kd ${page.filename.replace('.', '\\.')}\\nmap_d ${page.filename.replace('.', '\\.')}`));
    }
    assert.equal(files.size, manifest.files.textures.length + 4);
    t.diagnostic(`${game.id}: resource${resource.index}, model${entry.modelIndex}, ${entry.materialVariant}, ${scene.triangles} triangles, ${manifest.files.textures.length} PNGs, ${download.blob.size} ZIP bytes.`);
  }
}

for (const id of ['rollcage', 'stage2']) {
  const game = getGame(id), installed = existsSync(path.join(game.installation, 'IDXData', 'Rollcage.idx'));
  test(`installed ${id} selected-object ZIP matches decoded model/material/texture bytes`, {skip: !installed}, async t => {
    const archive = await RollcageArchive.open(game.installation);
    try {await verifyInstalledSelection(archive, game, await identifyGame(archive, id), t);} finally {await archive.close();}
  });
}
const rollcage = getGame('rollcage');
test('installed Rollcage complete-car ZIP contains body plus four baked wheels with aggregate bounds, UVs and provenance', {skip: !existsSync(path.join(rollcage.installation, 'IDXData', 'Rollcage.idx'))}, async t => {
  const archive = await RollcageArchive.open(rollcage.installation);
  try {
    const identified = await identifyGame(archive, 'rollcage'), resources = await listObjectResources(archive, rollcage, identified.tracks);
    const collection = await loadObjectCollection(archive, rollcage, resources[0]);
    const cars = collection.entries.filter(row => row.kind === 'vehicle-assembled' && row.status === 'supported');
    assert.equal(cars.length, 7);
    for (const entry of cars) {
      const scene = await collection.load(entry), download = await buildObjectDownload(scene, {encodeTexturePNG: encode});
      const files = readTrackZIP(Buffer.from(await download.blob.arrayBuffer())), manifest = JSON.parse(files.get('manifest.json').toString());
      assert.equal(scene.meshes.length, 5); assert.equal(manifest.meshCount, 5); assert.equal(manifest.kind, 'selected-static-vehicle-assembly');
      assert.deepEqual(manifest.assembly, scene.assembly); assert.deepEqual(manifest.entry, entry); assert.deepEqual(manifest.source, scene.source);
      assert.deepEqual(manifest.assembly.parts.map(part => part.name), ['body', 'wheel-1', 'wheel-2', 'wheel-3', 'wheel-4']);
      const obj = files.get('object.obj').toString(), vertices = [...obj.matchAll(/^v (.+)$/gm)].map(match => match[1].split(' ').map(Number));
      const uv = [...obj.matchAll(/^vt (.+)$/gm)].map(match => match[1].split(' ').map(Number));
      assert.deepEqual([...obj.matchAll(/^g (\S+)$/gm)].map(match => match[1]), ['object_0', 'object_1', 'object_2', 'object_3', 'object_4']);
      assert.deepEqual(new Set(scene.groups.map(group => group.instance)), new Set([0, 1, 2, 3, 4]));
      const expectedPositions = [], expectedUV = [], pages = new Set(); let expectedVertices = 0, expectedTriangles = 0;
      for (const part of scene.assembly.parts) {
        const standalone = collection.entries.find(row => row.kind === (part.index ? 'vehicle-wheel' : 'vehicle-body') && row.modelIndex === part.modelIndex && row.status === 'supported');
        assert.ok(standalone);
        const original = (await collection.load(standalone)).meshes[0], baked = scene.meshes[part.index];
        assert.equal(baked.modelIndex, part.modelIndex); assert.equal(baked.part, part.name); assert.equal(baked.vertices.length, original.vertices.length);
        const transformed = original.vertices.map(vertex => [0, 1, 2].map(row => [0, 1, 2].reduce((sum, lane) => sum + part.rotationQ12[row * 3 + lane] * vertex[lane], 0) / 4096 + part.positionQ16[row] / 65536));
        assert.deepEqual(baked.vertices.map(vertex => vertex.slice(0, 3)), transformed, 'Each part uses its recorded source Q12 rotation and Q16 position exactly once.');
        assert.deepEqual(baked.faces.map(face => [face.page, face.indices, face.uv]), original.faces.map(face => [face.page, face.indices, face.uv]));
        expectedVertices += original.vertices.length;
        for (const face of original.faces) {
          expectedTriangles += face.indices.length === 4 ? 2 : 1; pages.add(face.page);
          const image = scene.textures.get(face.page);
          expectedUV.push(...face.uv.map(([u, v]) => [(u + 0.5) / image.width, 1 - (v + 0.5) / image.height]));
        }
        expectedPositions.push(...baked.vertices.map(([x, y, z]) => [x, y === 0 ? 0 : -y, z === 0 ? 0 : -z]));
      }
      assert.equal(vertices.length, expectedVertices); assert.equal(manifest.vertices, expectedVertices);
      assert.equal(obj.match(/^f /gm).length, expectedTriangles); assert.equal(manifest.triangles, expectedTriangles);
      assert.deepEqual(vertices, expectedPositions); assert.deepEqual(uv, expectedUV);
      const bounds = [0, 1, 2].map(axis => [Math.min(...vertices.map(v => v[axis])), Math.max(...vertices.map(v => v[axis]))]);
      assert.deepEqual(manifest.bounds, bounds);
      assert.deepEqual(new Set(manifest.files.textures.map(page => page.page)), pages);
      for (const page of manifest.files.textures) assert.deepEqual(decodeHostPNG(files.get(page.filename)).rgba, Buffer.from(scene.textures.get(page.page).rgba));
      for (const match of files.get('object.mtl').toString().matchAll(/^map_(?:Kd|d) (\S+)$/gm)) assert.ok(files.has(match[1]));
      t.diagnostic(`Assembled type${scene.assembly.vehicleType}: ${expectedVertices} vertices, ${expectedTriangles} triangles, 5 meshes, ${pages.size} PNGs, ${download.blob.size} ZIP bytes.`);
    }
  } finally {await archive.close();}
});
const firebugsZip = path.join(process.env.USERPROFILE ?? '', 'Downloads', 'Firebugs (Europe) (EnFrDeEsItNlPtSvNoDaFi).zip');
test('installed Firebugs selected-object ZIP matches decoded local PS1 material and RGBA texture bytes', {skip: !existsSync(firebugsZip)}, async t => {
  const disc = await openFirebugsZip(firebugsZip);
  try {
    const archive = await FirebugsArchive.open(disc);
    await verifyInstalledSelection(archive, getGame('firebugs'), await identifyFirebugs(archive), t);
  } finally {await disc.close();}
});
