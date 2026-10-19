import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { findResourceIndex } from '../src/resource-names.mjs';
import { parseBTP, decodeBTPTexture } from '../src/btp.mjs';
import { encodePNG } from '../src/png.mjs';
const [name, filename, textureIndex] = process.argv.slice(2);
if (!name || !filename) throw new Error('Usage: node tools/export-btp.mjs <resource-name-or-ID> <new-output.png> [texture-index]');
const index = /^\d+$/.test(name) ? Number(name) : findResourceIndex(name);
if (index < 0) throw new Error(`Unknown resource: ${name}`);
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  const { data } = await archive.readResource(index);
  const btp = parseBTP(data);
  let image, placements;
  if (textureIndex !== undefined) {
    if (!/^\d+$/.test(textureIndex)) throw new Error('Texture index must be a nonnegative integer.');
    image = decodeBTPTexture(btp, Number(textureIndex));
    placements = [{ texture: Number(textureIndex), x: 0, y: 0, width: image.width, height: image.height }];
  } else {
    const textures = btp.textures.filter(t => !t.empty);
    if (!textures.length) throw new Error('BTP has no active PC texture slots.');
    const tileWidth = Math.max(...textures.map(t => t.width)) + 8;
    const tileHeight = Math.max(...textures.map(t => t.height)) + 8;
    const columns = Math.ceil(Math.sqrt(textures.length));
    const width = columns * tileWidth, height = Math.ceil(textures.length / columns) * tileHeight;
    if (width * height * 4 > 256 * 1024 * 1024) throw new Error('Contact sheet exceeds image size limit; export one texture instead.');
    image = { width, height, rgba: Buffer.alloc(width * height * 4) };
    placements = textures.map((texture, i) => {
      const decoded = decodeBTPTexture(btp, texture.index);
      const x = (i % columns) * tileWidth, y = Math.floor(i / columns) * tileHeight;
      for (let row = 0; row < decoded.height; row++) decoded.rgba.copy(image.rgba,
        ((y + row) * width + x) * 4, row * decoded.width * 4, (row + 1) * decoded.width * 4);
      return { texture: texture.index, x, y, width: decoded.width, height: decoded.height };
    });
  }
  await writeFile(filename, encodePNG(image), { flag: 'wx' });
  await writeFile(filename + '.json', JSON.stringify({ resource: index, name, width: image.width, height: image.height, placements }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ resource: index, textures: placements.length, width: image.width, height: image.height, filename }));
} finally { await archive.close(); }
