import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createReduxCaptureConfig} from './lib/redux-capture-config.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

const [root, output, filename, count = '1', mode = 'all', phase = 'any'] = process.argv.slice(2);
if (!root || !output || !filename) throw Error('Usage: node tools/prepare-native-terrain-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE');
const queries = Number(count);
if (!Number.isInteger(queries) || queries < 1 || queries > 32) throw Error('Terrain capture requires 1..32 bounded regular query returns.');
if (!['all', 'body'].includes(mode) || !['any', 'active'].includes(phase)) throw Error('Expected query mode all/body and phase any/active.');
const config = createReduxCaptureConfig(root, 'hidden-idle', output);
const {instructions, evidence} = await readInstructionEvidence(['168-terrain-query-assembly.json']);
const listing = new Map(instructions.map(row => [row.address, row]));
for (const address of [0x424ff0, 0x425e2b, 0x4250c3]) if (!listing.has(address)) throw Error('Missing retained terrain boundary.');
const rva = address => `0x${(address - 0x400000).toString(16)}`;
const global = (id, address, length, extra = {}) => ({id, rva: rva(address), ...(length ? {length} : {}), ...extra});
const shared = [
  global('terrain-globals', 0x90b970, 32),
  global('terrain-pack', 0x90b98c, 0xa0, {dereferenceOffsets: ['0']}),
  global('geometry-region', 0x90b970, 0, {dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes: 64 * 1024 * 1024}),
  global('sector-table-region', 0x90b98c, 0, {dereferenceOffsets: ['0', '0'], readableRegion: true, maxRegionBytes: 64 * 1024 * 1024}),
  global('cross-scratch', 0x91d360, 0x104), global('plane-scratch', 0x91e7a0, 64 * 40),
  global('border-scratch', 0x911c00, 40), global('sqrt-table', 0x5eb290, 384),
  global('normalization-one', 0x5dc774, 4), global('normalization-scale', 0x5dca88, 4),
  global('clock', 0x90a548, 4), global('track-filename', 0x6e6660, 64),
  global('session-settings', 0x5ecb1c, 0xd0, {dereferenceOffsets: ['0'], offset: '0x54d'})
];
const post = [
  {id: 'body', baseRegister: 'esp', dereferenceOffsets: ['0xac'], length: 0x180},
  {id: 'query', baseRegister: 'esp', dereferenceOffsets: ['0xb8'], length: 72},
  {id: 'output', baseRegister: 'esp', dereferenceOffsets: ['0x108'], length: 40},
  {id: 'candidates', baseRegister: 'esp', dereferenceOffsets: ['0xac', '0x154'], length: 1024},
  {id: 'entry-stack', baseRegister: 'esp', offset: '0x104', length: 12},
  {id: 'terrain-local-stack', baseRegister: 'esp', length: 0x104}, ...shared
];
config.breakpoints = config.breakpoints.filter(row => ['launcher-policy', 'graphics-policy', 'before-device-creation'].includes(row.id));
config.maxDurationMs = 90000; config.maxSnapshots = queries * 4 + 16;
config.ranges = [];
config.breakpoints.push({id: 'terrain-before', rva: rva(0x424ff0), ranges: [
  {id: 'body', baseRegister: 'ecx', length: 0x180}, {id: 'query', baseRegister: 'edx', length: 72},
  {id: 'output', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 40},
  {id: 'candidates', baseRegister: 'ecx', dereferenceOffsets: ['0x154'], length: 1024},
  {id: 'entry-stack', baseRegister: 'esp', length: 12},
  {id: 'terrain-local-stack', baseRegister: 'esp', offset: '-0x104', length: 0x104}, ...shared
]}, {id: 'terrain-after', rva: rva(0x425e2b), ranges: post, stopAfterHits: queries},
{id: 'terrain-empty-after', rva: rva(0x4250c3), ranges: post, stopAfterHits: queries});
if (mode === 'body') {
  const caller = await readInstructionEvidence(['024-terrain-batch-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const call = caller.instructions.find(row => row.address === 0x424ed7);
  if (call?.op !== 'CALL' || Number(call.args[0]) !== 0x424ff0 || !caller.instructions.some(row => row.address === 0x424edc)) throw Error('Missing exact body-query call boundary.');
  const entry = config.breakpoints.find(row => row.id === 'terrain-before');
  entry.rva = rva(0x424ed7);
  entry.ranges = entry.ranges.map(row => row.id === 'output' ? {...row, dereferenceOffsets: ['0']} : row.id === 'entry-stack' ? {...row, offset: '-4'} : row.id === 'terrain-local-stack' ? {...row, offset: '-0x108'} : row);
  config.breakpoints = config.breakpoints.filter(row => !['terrain-after', 'terrain-empty-after'].includes(row.id));
  config.breakpoints.push({id: 'terrain-after', rva: rva(0x424edc), stopAfterHits: queries, ranges: [
    {id: 'body', baseRegister: 'edi', length: 0x180},
    {id: 'query', baseRegister: 'esp', dereferenceOffsets: ['0x34'], length: 72},
    {id: 'output', baseRegister: 'esp', dereferenceOffsets: ['0'], length: 40},
    {id: 'candidates', baseRegister: 'edi', dereferenceOffsets: ['0x154'], length: 1024},
    {id: 'entry-stack', baseRegister: 'esp', offset: '-4', length: 12},
    {id: 'terrain-local-stack', baseRegister: 'esp', offset: '-0x108', length: 0x104}, ...shared
  ]});
}
if (phase === 'active') {
  const captureWhen = {range: global('active-race-phase', 0x5ecb1c, 4, {dereferenceOffsets: ['0'], offset: '0x57c'}), equalsBytesHex: '04000000'};
  for (const breakpoint of config.breakpoints.filter(row => row.id.startsWith('terrain-'))) breakpoint.captureWhen = captureWhen;
  config.maxEvents = 1000000;
}
await writeFile(path.resolve(filename), `${JSON.stringify(config, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({configuration: path.resolve(filename), output: config.outputDirectory, queries, mode, phase, evidence: evidence.map(row => row.evidence_id), method: 'Bounded original terrain queries; actual geometry regions and all declared numerical inputs/outputs. No physics writes.'}));
