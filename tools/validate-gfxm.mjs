import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { parseGFXM } from '../src/gfxm.mjs';
import { resourceMappings } from '../src/resource-names.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = await RollcageArchive.open(process.argv[2] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources = [], failures = [];
try {
  for (const entry of archive.entries) {
    const { data } = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'GFXM') continue;
    try {
      const gfxm = parseGFXM(data);
      resources.push({ resource: entry.index, names: resourceMappings.filter(m => m.index === entry.index).map(m => m.name),
        version: gfxm.version, modelTable: gfxm.modelTable, modelSlots: gfxm.modelSlots,
        models: gfxm.models.filter(Boolean).map(({ vertices, faces, ...model }) => ({ ...model,
          triangles: faces.filter(f => f.triangle).length, quads: faces.filter(f => !f.triangle).length,
          bounds: [0,1,2].map(axis => [Math.min(...vertices.map(v => v[axis])), Math.max(...vertices.map(v => v[axis]))]) })) });
    } catch (error) { failures.push({ resource: entry.index, error: error.message }); }
  }
} finally { await archive.close(); }
const models = resources.flatMap(r => r.models);
const summary = { resources: resources.length, models: models.length, vertices: models.reduce((n,m) => n+m.vertexCount,0),
  triangles: models.reduce((n,m) => n+m.triangles,0), quads: models.reduce((n,m) => n+m.quads,0), failures };
await writeFile(path.join(root, 'analysis', 'gfxm-catalog.json'), JSON.stringify({ summary, resources }, null, 2));
console.log(JSON.stringify(summary));
if (failures.length) process.exitCode = 1;
