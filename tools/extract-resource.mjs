import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { findResourceIndex } from '../src/resource-names.mjs';

const [indexText, destination, game = 'C:\\Program Files (x86)\\Psygnosis\\Rollcage'] = process.argv.slice(2);
if (!indexText || !destination) throw new Error('Usage: node tools/extract-resource.mjs <index-or-resource-name> <new-output-file> [game-directory]');
const index = /^\d+$/.test(indexText) ? Number(indexText) : findResourceIndex(indexText);
if (index < 0) throw new Error(`Unknown resource: ${indexText}`);
const archive = await RollcageArchive.open(game);
try {
  const { data, entry } = await archive.readResource(index);
  await writeFile(destination, data, { flag: 'wx' });
  console.log(JSON.stringify({ index: entry.index, bytes: data.length, destination }));
} finally { await archive.close(); }
