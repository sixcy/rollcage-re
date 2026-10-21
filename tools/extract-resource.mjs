import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { parseGameOptions } from './lib/game-options.mjs';
import { identifyGame } from '../src/track-games.mjs';

const { game, positional, installation } = parseGameOptions(process.argv.slice(2));
const [indexText, destination] = positional;
if (!indexText || !destination || positional.length > 3) throw new Error('Usage: node tools/extract-resource.mjs [--game rollcage|stage2] <index-or-resource-name> <new-output-file> [game-directory]');
const index = /^\d+$/.test(indexText) ? Number(indexText) : game.findResourceIndex(indexText);
if (index < 0) throw new Error(`Unknown resource: ${indexText}`);
const archive = await RollcageArchive.open(installation);
try {
  await identifyGame(archive, game.id);
  const { data, entry } = await archive.readResource(index);
  await writeFile(destination, data, { flag: 'wx' });
  console.log(JSON.stringify({ game: game.id, index: entry.index, bytes: data.length, destination }));
} finally { await archive.close(); }
