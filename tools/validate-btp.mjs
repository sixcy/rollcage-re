import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RollcageArchive } from '../src/archive.mjs';
import { parseBTP, decodeBTPTexture } from '../src/btp.mjs';
import { resourceMappings } from '../src/resource-names.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = await RollcageArchive.open(process.argv[2] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources = [];
const failures = [];
try {
  for (const entry of archive.entries) {
    const { data } = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'BTP ') continue;
    try {
      const btp = parseBTP(data);
      for (const texture of btp.textures) if (!texture.empty) decodeBTPTexture(btp, texture.index);
      const { data: ignored, ...metadata } = btp;
      resources.push({ resource: entry.index, names: resourceMappings.filter(m => m.index === entry.index).map(m => m.name), ...metadata });
    } catch (error) { failures.push({ resource: entry.index, error: error.message }); }
  }
} finally { await archive.close(); }
const summary = { resources: resources.length, textures: resources.reduce((n, r) => n + r.textureCount, 0),
  activeTextures: resources.reduce((n, r) => n + r.textures.filter(t => !t.empty).length, 0),
  palettes: resources.reduce((n, r) => n + r.paletteCount, 0), versions: [...new Set(resources.map(r => r.version))], failures };
await writeFile(path.join(root, 'analysis', 'btp-catalog.json'), JSON.stringify({ summary, resources }, null, 2));
console.log(JSON.stringify(summary));
if (failures.length) process.exitCode = 1;
