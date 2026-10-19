// Orthographic wireframes for inspecting recovered local geometry.
import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { findResourceIndex } from '../src/resource-names.mjs';
import { parseGFXM } from '../src/gfxm.mjs';
import { encodePNG } from '../src/png.mjs';
const [name, filename] = process.argv.slice(2);
if (!name || !filename) throw new Error('Usage: node tools/preview-models.mjs <resource-name-or-ID> <new-output.png>');
const index = /^\d+$/.test(name) ? Number(name) : findResourceIndex(name);
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  const { data } = await archive.readResource(index), models = parseGFXM(data).models.filter(Boolean);
  if (!models.length) throw new Error('No models to preview.');
  const size = 200, columns = Math.ceil(Math.sqrt(models.length));
  const width = size * columns, height = Math.ceil(models.length / columns) * size;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([12,18,29,255], i * 4);
  function pixel(x,y,color) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < width && y >= 0 && y < height) rgba.set(color, (y * width + x) * 4);
  }
  function line(a,b,color) {
    const steps = Math.ceil(Math.max(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1])));
    for (let i = 0; i <= steps; i++) pixel(a[0] + (b[0]-a[0])*i/(steps||1), a[1] + (b[1]-a[1])*i/(steps||1),color);
  }
  const placements = models.map((model,i) => {
    const projected = model.vertices.map(([x,y,z]) => [(x-z)*0.70710678, y*0.85+(x+z)*0.3]);
    const min = [0,1].map(axis => Math.min(...projected.map(v=>v[axis])));
    const max = [0,1].map(axis => Math.max(...projected.map(v=>v[axis])));
    const scale = (size-28) / Math.max(max[0]-min[0],max[1]-min[1],1);
    const ox = i%columns*size, oy = Math.floor(i/columns)*size;
    const points = projected.map(p => [ox+size/2+(p[0]-(min[0]+max[0])/2)*scale, oy+size/2+(p[1]-(min[1]+max[1])/2)*scale]);
    for (const face of model.faces) {
      const [a,b,c,d] = face.indices.map(v=>v-1);
      const order = d < 0 ? [a,b,c,a] : [a,b,d,c,a];
      for (let j=1;j<order.length;j++) line(points[order[j-1]],points[order[j]],[78,211,240,255]);
    }
    return { model: model.index, x: ox, y: oy, width: size, height: size, vertices: model.vertexCount, faces: model.faceCount };
  });
  await writeFile(filename,encodePNG({width,height,rgba}),{flag:'wx'});
  await writeFile(filename+'.json',JSON.stringify({resource:index,name,width,height,placements},null,2),{flag:'wx'});
  console.log(JSON.stringify({resource:index,models:models.length,width,height,filename}));
} finally { await archive.close(); }
