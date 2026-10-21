// Installed game files and retained samples are read-only; reports never overwrite.
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { RollcageArchive } from '../src/archive.mjs';
import { getGame } from '../src/track-games.mjs';
import { decodeTrackPaths } from '../src/track-paths.mjs';
import { assertStoredPathBytes } from './lib/check-path-overlay.mjs';

const output = process.argv[2] ?? `analysis/track-paths-${Date.now()}.json`, results = [];
const hash = data => createHash('sha256').update(data).digest('hex');
function check(game, resource, data) {
  const before = hash(data), paths = decodeTrackPaths(data, game === 'firebugs');
  assertStoredPathBytes(paths, data);
  assert.equal(hash(data), before);
  results.push({ game, resource, sha256: before, status: paths.status,
    groups: paths.groups.length, points: paths.groups.reduce((sum, group) => sum + group.positions.length, 0),
    segments: paths.groups.reduce((sum, group) => sum + Math.max(0, group.positions.length - 1), 0) });
}
for (const id of ['rollcage', 'stage2']) {
  const archive = await RollcageArchive.open(getGame(id).installation);
  try {
    for (const entry of archive.entries) {
      const { data } = await archive.readResource(entry.index);
      if (data.toString('ascii', 0, 4) === 'GFXM') check(id, entry.index, data);
    }
  } finally { await archive.close(); }
}
for (const filename of (await readdir('analysis/firebugs-resources')).filter(name => /^\d+-GFXM\.bin$/.test(name))) {
  const data = await readFile(`analysis/firebugs-resources/${filename}`);
  if (data.readUInt32LE(0x10) > 0) check('firebugs', parseInt(filename), data);
}
const summary = ['rollcage', 'stage2', 'firebugs'].map(game => {
  const resources = results.filter(result => result.game === game);
  return { game, resources: resources.length, groups: resources.reduce((n, r) => n + r.groups, 0),
    points: resources.reduce((n, r) => n + r.points, 0), segments: resources.reduce((n, r) => n + r.segments, 0) };
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ method: 'Independent source-byte XYZ/group oracle versus viewer adapter for all PC GFXM and retained terrain-bearing Firebugs resources. Source hashes remain unchanged. Static data check; no AI connectivity or original-process execution claim.', summary, results }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, summary }));
