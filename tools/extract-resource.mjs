import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { parseGameOptions } from './lib/game-options.mjs';
import { identifyGame } from '../src/track-games.mjs';
import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { openFirebugsZip } from './lib/firebugs-disc.mjs';

const { game, positional, installation } = parseGameOptions(process.argv.slice(2));
const [indexText, destination] = positional;
if (!indexText || !destination || positional.length > 3 || (game.id === 'firebugs' && !positional[2])) throw new Error('Usage: node tools/extract-resource.mjs [--game rollcage|stage2] <index-or-resource-name> <new-output-file> [game-directory]\n       node tools/extract-resource.mjs --game firebugs <resource-id> <new-output-file> <disc.zip>');
const index = /^\d+$/.test(indexText) ? Number(indexText) : game.findResourceIndex?.(indexText);
if (!Number.isInteger(index) || index < 0) throw new Error(`Unknown resource: ${indexText}`);
let disc;
const archive = game.id === 'firebugs'
  ? await FirebugsArchive.open(disc = await openFirebugsZip(positional[2]))
  : await RollcageArchive.open(installation);
try {
  await identifyGame(archive, game.id);
  const { data, entry } = await archive.readResource(index);
  await writeFile(destination, data, { flag: 'wx' });
  console.log(JSON.stringify({ game: game.id, index: entry.index, bytes: data.length, destination }));
} finally { await archive.close(); await disc?.close?.(); }
