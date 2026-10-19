import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { findResourceIndex } from '../src/resource-names.mjs';
import { parseGFXM, modelToOBJ } from '../src/gfxm.mjs';
const [name, modelText, filename] = process.argv.slice(2);
if (!name || !/^\d+$/.test(modelText ?? '') || !filename) throw new Error('Usage: node tools/export-gfxm.mjs <resource-name-or-ID> <model-slot> <new-output.obj>');
const index = /^\d+$/.test(name) ? Number(name) : findResourceIndex(name);
if (index < 0) throw new Error(`Unknown resource: ${name}`);
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  const { data } = await archive.readResource(index), gfxm = parseGFXM(data);
  const model = gfxm.models[Number(modelText)];
  await writeFile(filename, modelToOBJ(model), { flag: 'wx' });
  console.log(JSON.stringify({ resource: index, model: model.index, vertices: model.vertexCount, faces: model.faceCount, filename }));
} finally { await archive.close(); }
