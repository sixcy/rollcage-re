// Independent installed-data expectations for the viewer's color/axis boundary.
// Native archive data and old evidence reports are read-only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RollcageArchive } from '../src/archive.mjs';
import { parseBTP, decodeBTPTexture } from '../src/btp.mjs';
import { parseScene } from '../src/scene.mjs';
import { parseGFXM } from '../src/gfxm.mjs';
import { parsePlacements } from '../src/placements.mjs';
import { buildPlacedMeshes } from '../src/placed-meshes.mjs';
import { decodeTrack, tracks } from './track-viewer/track-data.mjs';

const [installation = 'C:\\Program Files (x86)\\Psygnosis\\Rollcage', output = `analysis/viewer-presentation/check-${Date.now()}`] = process.argv.slice(2);
const archive = await RollcageArchive.open(installation);
let resources = 0, activeTextures = 0, pixels = 0, exportedVertices = 0;
const trackResults = [];
try {
  for (const entry of archive.entries) {
    const { data } = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'BTP ') continue;
    resources++;
    const btp = parseBTP(data);
    for (const texture of btp.textures) {
      if (texture.empty) continue;
      const { rgba } = decodeBTPTexture(btp, texture.index);
      activeTextures++; pixels += texture.width * texture.height;
      for (let pixel = 0; pixel < texture.width * texture.height; pixel++) {
        const index = data[texture.pixelOffset + pixel], palette = texture.paletteOffset + index * 4, target = pixel * 4;
        const blue = data[palette], green = data[palette + 1], red = data[palette + 2];
        const black = (red | green | blue) === 0;
        const alpha = black && (index === 0 || texture.transparentBlack) ? 0 : 255;
        if (rgba[target] !== red || rgba[target + 1] !== green || rgba[target + 2] !== blue || rgba[target + 3] !== alpha) {
          throw new Error(`BGR/alpha mismatch at resource ${entry.index}, texture ${texture.index}, pixel ${pixel}.`);
        }
      }
    }
  }
  for (const track of tracks) {
    const { data } = await archive.readResource(track.index), pair = await archive.readResource(track.index + 1);
    const terrain = parseScene(data), models = parseGFXM(data);
    const objects = buildPlacedMeshes(data, models, parsePlacements(pair.data, models.models));
    const expectedVertices = [...terrain.segments, ...objects].flatMap(mesh => mesh.vertices);
    const scene = decodeTrack(data, pair.data);
    const actualVertices = scene.obj.split('\n').filter(line => line.startsWith('v ')).map(line => line.split(' ').slice(1).map(Number));
    assert.equal(actualVertices.length, expectedVertices.length, track.name);
    for (const [index, source] of expectedVertices.entries()) {
      const [x, y, z] = source;
      assert.deepEqual(actualVertices[index], [x, y === 0 ? 0 : -y, z === 0 ? 0 : -z], `${track.name} vertex ${index}`);
    }
    const expectedBounds = [0, 1, 2].map(axis => actualVertices.reduce(([min, max], point) => [Math.min(min, point[axis]), Math.max(max, point[axis])], [Infinity, -Infinity]));
    assert.deepEqual(scene.bounds, expectedBounds, track.name);
    exportedVertices += actualVertices.length;
    trackResults.push({ name: track.name, vertices: actualVertices.length, triangles: scene.triangles, objects: objects.length, bounds: scene.bounds });
  }
} finally { await archive.close(); }
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const report = { method: 'Installed-data checks against source BGR palettes and native world-space terrain/object coordinates; not an original-process comparison.',
  resources, activeTextures, pixels, tracks: trackResults.length, exportedVertices, coordinates: 'X,-Y,-Z', matched: true, trackResults };
await writeFile(path.join(output, 'presentation-check.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ resources, activeTextures, pixels, tracks: trackResults.length, exportedVertices, matched: true, output }));
