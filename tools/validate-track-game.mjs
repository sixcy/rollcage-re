// Installed-data validation. Reads game files only; every report is new.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RollcageArchive } from '../src/archive.mjs';
import { getGame, identifyGame } from '../src/track-games.mjs';
import { parseScene } from '../src/scene.mjs';
import { parseBTP, decodeBTPTexture } from '../src/btp.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';

const [gameId = 'rollcage', installationArgument, reportArgument] = process.argv.slice(2);
const game = getGame(gameId), installation = installationArgument ?? game.installation;
const destination = reportArgument ?? `analysis/track-games/${game.id}-${Date.now()}`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = await RollcageArchive.open(installation);
const resources = [], tracks = [], failures = [];
let identified;
try {
  identified = await identifyGame(archive, game.id);
  for (const entry of archive.entries) {
    try {
      const { data } = await archive.readResource(entry.index);
      resources.push({ index: entry.index, bytes: data.length, signature: data.subarray(0, 4).toString('hex'), sha256: hash(data) });
    } catch (error) { failures.push({ resource: entry.index, error: error.message }); }
  }
  for (const track of game.tracks) {
    try {
      const scene = await game.loadTrack(archive, track);
      assert.ok(scene.triangles > 0); assert.ok(scene.bounds.flat().every(Number.isFinite));
      const geometry = await archive.readResource(track.index), texture = await archive.readResource(track.textureIndex);
      const terrain = parseScene(geometry.data), btp = parseBTP(texture.data);
      // Check terrain UVs against independently parsed texture dimensions.
      for (const segment of terrain.segments) for (const face of segment.faces) {
        const image = btp.textures[face.page];
        assert.ok(image && !image.empty, `Missing terrain page ${face.page}`);
        for (const [u, v] of face.uv) assert.ok(u < image.width && v < image.height, 'Terrain UV exceeds texture dimensions');
      }
      // OBJ must contain the full terrain and all ordinary object groups.
      assert.equal(scene.obj.split('\n').filter(line => line.startsWith('f ')).length, scene.triangles);
      assert.equal(scene.obj.split('\n').filter(line => line.startsWith('g object_')).length, scene.instances);
      const sourceVertices = terrain.segments.flatMap(segment => segment.vertices);
      const objVertices = scene.obj.split('\n').filter(line => line.startsWith('v '));
      assert.equal(objVertices.length, scene.vertices);
      for (const [index, [x, y, z]] of sourceVertices.entries()) {
        assert.deepEqual(objVertices[index].split(' ').slice(1).map(Number), [x, y === 0 ? 0 : -y, z === 0 ? 0 : -z]);
      }
      const textures = [];
      for (const [page, image] of scene.textures) {
        const independent = decodeBTPTexture(btp, page);
        assert.deepEqual(image, independent);
        textures.push({ page, width: image.width, height: image.height, rgbaSHA256: hash(image.rgba) });
      }
      tracks.push({ ...buildTrackManifest(scene, track), groupsSHA256: hash(JSON.stringify(scene.groups)), objSHA256: hash(scene.obj), textures });
    } catch (error) { failures.push({ name: track.name, resource: track.index, error: error.message }); }
  }
} finally { await archive.close(); }
await mkdir(path.dirname(destination), { recursive: true });
await mkdir(destination, { recursive: false });
const report = { game: game.id, installation, indexSHA256: identified.indexSHA256, verifiedArchive: identified.verified,
  method: 'Installed-data structural, source-coordinate and shared-decoder checks. Not original-process runtime equivalence.',
  resources, tracks, failures };
await writeFile(path.join(destination, 'validation.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ game: game.id, resources: resources.length, tracks: tracks.length, objects: tracks.reduce((sum, track) => sum + track.instances, 0), failures, destination }));
if (failures.length) process.exitCode = 1;
