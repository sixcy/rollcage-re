// Read-only archive survey; retained output must be a new directory.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseIndex } from '../src/archive-index.mjs';
import { decodeGT20 } from '../src/gt20.mjs';
import { parseScene } from '../src/scene.mjs';
import { parseGFXM } from '../src/gfxm.mjs';
const [directory = 'analysis/firebugs-layout', output] = process.argv.slice(2);
const image = await readFile(path.join(directory, 'IDXFILES.IMG'));
const index = await readFile(path.join(directory, 'IDXFILES.IDX'));
if (output) await mkdir(output, { recursive: false });
const hash = b => createHash('sha256').update(b).digest('hex');
const resources = [];
for (const entry of parseIndex(index, image.length)) {
  const raw = image.subarray(entry.offset, entry.offset + entry.storedBytes);
  const data = entry.storedBytes === entry.decodedBytes ? raw : decodeGT20(raw).data;
  const magic = data.toString('ascii', 0, 4);
  const item = { ...entry, magic, sha256: hash(data) };
  if (magic === 'GFXM') {
    try { const scene = parseScene(data); item.terrain = scene.segments.map(s => ({ columns: s.columns, rows: s.rows, vertices: s.vertices.length, faces: s.faces.length })); }
    catch (e) { item.terrainError = e.message; }
    try { const gfxm = parseGFXM(data); item.models = gfxm.models.filter(Boolean).length; }
    catch (e) { item.modelError = e.message; }
  }
  if (output && (['GFXM', 'VRAM', 'BTX '].includes(magic) || entry.index < 4)) {
    await writeFile(path.join(output, `${entry.index}-${magic.replace(/[^a-z0-9]/gi, '_')}.bin`), data, { flag: 'wx' });
  }
  resources.push(item);
}
const report = { indexSHA256: hash(index), imageSHA256: hash(image), resources };
if (output) await writeFile(path.join(output, 'inventory.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
