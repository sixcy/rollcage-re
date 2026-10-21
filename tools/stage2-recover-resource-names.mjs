// Reproduce the Stage II environment catalog from the supplied Extreme PE.
// Static anchors: FUN_0042f250 resource selection and the ordered labels at
// 0x512fd0 (REA/Ghidra read_bytes ev_35367aee370a4e10d5d19fccbaef999bc3d95d284593acf605e059281d399ccd).
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const executable = process.argv[2] ?? 'C:/Program Files (x86)/Psygnosis/Rollcage Stage II/BIN/Rollcage Extreme.exe';
const bytes = await readFile(executable);
const executableSHA256 = createHash('sha256').update(bytes).digest('hex');
if (executableSHA256 !== '26f8e8d874e5081f599000e04000414112da6600c493d80f45e4ddd33cd0d148') {
  throw new Error('Stage II label offsets are specific to the supplied Extreme executable.');
}
const labelEnd = bytes.indexOf(Buffer.from('FOOTY1\0'), 0x111dd0) + 7;
const labels = bytes.toString('ascii', 0x111dd0, labelEnd).split('\0').filter(Boolean);
if (labels.length !== 66 || labels[0] !== 'LEV01' || labels.at(-1) !== 'FOOTY1') throw new Error('Unexpected Stage II label inventory.');
const tracks = labels.map((label, ordinal) => ({
  name: `${label}.BLP`, index: 80 + ordinal * 2, textureIndex: 81 + ordinal * 2,
  category: label.startsWith('LEV') ? 'Race' : label.startsWith('SCRAM') ? 'Scramble'
    : label.startsWith('TRAIN') ? 'Training' : label.startsWith('DEATH') ? 'Deathmatch'
      : label.startsWith('PURSUIT') ? 'Pursuit' : 'Football',
}));
const map = {
  executableSHA256,
  labelTableAddress: '0x512fd0',
  labelTableFileOffset: 0x111dd0,
  provenance: 'Labels are observed in shipped executable order; GFXM/BTP pairs follow native FUN_0042f250. BLP/BTP extensions are reconstructed extraction aliases, not recovered original filenames.',
  mappings: tracks.flatMap(({ name, index, textureIndex }) => [{ name, index }, { name: name.replace(/\.BLP$/, '.BTP'), index: textureIndex }]),
  tracks,
};
await writeFile(fileURLToPath(new URL('../src/stage2-resource-map.json', import.meta.url)), JSON.stringify(map, null, 2) + '\n');
console.log(`Recovered ${tracks.length} Stage II environment labels and ${map.mappings.length} resource aliases.`);
