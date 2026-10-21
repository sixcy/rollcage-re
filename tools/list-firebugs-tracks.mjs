import { FirebugsArchive } from '../src/firebugs-archive.mjs';
import { identifyFirebugs } from '../src/firebugs.mjs';
import { openFirebugsZip } from './lib/firebugs-disc.mjs';

const [filename, ...extra] = process.argv.slice(2);
if (!filename || extra.length) throw new Error('Usage: node tools/list-firebugs-tracks.mjs <disc.zip>');
const disc = await openFirebugsZip(filename);
let archive;
try {
  archive = await FirebugsArchive.open(disc);
  const identified = await identifyFirebugs(archive, 'firebugs');
  console.log(JSON.stringify({ game: identified.game.id, verified: identified.verified,
    identity: identified.identity, tracks: identified.tracks }, null, 2));
} finally {
  await archive?.close?.();
  await disc.close?.();
}
