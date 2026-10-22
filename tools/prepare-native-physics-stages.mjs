import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createReduxCaptureConfig} from './lib/redux-capture-config.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

const [root, output, filename, frameArgument = '1'] = process.argv.slice(2);
if (!root || !output || !filename) throw Error('Usage: node tools/prepare-native-physics-stages.mjs ISOLATED_INSTALLATION_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIGURATION_FILE');
const frames = Number(frameArgument);
if (!Number.isInteger(frames) || frames < 1 || frames > 30) throw Error('Capture requires 1..30 explicitly bounded native frames.');
const config = createReduxCaptureConfig(root, 'hidden-idle', output);
const own = await readInstructionEvidence(['050-ordinary-preparation-assembly.json'], {directory: 'analysis/native-simulation/results'});
const parent = await readInstructionEvidence(['278-physics-frame-assembly.json', '272-vehicle-derivatives-parent-assembly.json', '233-wheel-frame-assembly.json']);
const instructions = new Map([...own.instructions, ...parent.instructions].map(row => [row.address, row]));
for (const [address, op, operand] of [[0x47ab0f, 'CALL', '0x00479ed0'], [0x47ab14, 'LEA', 'ECX'], [0x474a11, 'CALL', '0x0047a8e0'], [0x474a16, 'DEC', 'ESI'], [0x47578d, 'CALL', '0x004799f0'], [0x475792, 'DEC', 'ESI'], [0x474b1e, 'RET', undefined]]) {
  const row = instructions.get(address);
  if (row?.op !== op || (operand !== undefined && row.args[0] !== operand)) throw Error(`Retained instruction boundary differs: ${address.toString(16)}`);
}
const vehicleStages = [
  ['directions', 0x47ab4a, 0x47ab4f, 0x41d680, true],
  ['suspension', 0x47aba6, 0x47abab, 0x488370, true],
  ['rest', 0x47ac14, 0x47ac19, 0x47ac50, false],
  ['air-spin', 0x47ac1b, 0x47ac20, 0x47ada0, false],
  ['orientation', 0x47ac22, 0x47ac27, 0x47ae30, false]
];
for (const [, before, after, callee] of vehicleStages) {
  const call = instructions.get(before);
  if (call?.op !== 'CALL' || Number(call.args[0]) !== callee || !instructions.has(after)) throw Error('Retained vehicle stage boundary differs.');
}
const rva = address => `0x${(address - 0x400000).toString(16)}`;
const global = (id, address, length, extra = {}) => ({id, rva: rva(address), length, ...extra});
const frameRanges = [
  global('vehicle0', 0x909300, 0x3e78, {dereferenceOffsets: ['0']}),
  global('effect-first', 0x91cd90, 4), global('effect-second', 0x9153d0, 4),
  global('time-options', 0x811180, 16), global('root-scratch', 0x91d45c, 8),
  global('contact-records', 0x91e79c, 256 * 72, {dereferenceOffsets: ['0']}),
  global('physical-group', 0x902bc0, 8)
];
const beforeBody = {id: 'body', baseRegister: 'ecx', length: 0x180};
const afterBody = {id: 'body', baseRegister: 'edi', dereferenceOffsets: ['0'], length: 0x180};
const stage = (id, address, body, extra = {}) => ({id, rva: rva(address), ranges: [body, ...frameRanges], ...extra});
// Retain the already validated display/launcher policies. Replace the first-entry
// stop with an actual end-of-frame stop; no physics or AI values are written.
config.maxDurationMs = 90000; config.maxSnapshots = 4096;
config.breakpoints = config.breakpoints.filter(row => ['launcher-policy', 'graphics-policy', 'before-device-creation', 'physics-frame-entry'].includes(row.id));
const entry = config.breakpoints.find(row => row.id === 'physics-frame-entry');
if (!entry) throw Error('Expected validated first-physics boundary.');
entry.stopAfterHits = 0;
entry.ranges = frameRanges;
config.breakpoints.push(
  stage('preparation-before', 0x474a11, beforeBody),
  stage('forces-before', 0x47ab0f, beforeBody),
  stage('forces-after', 0x47ab14, {id: 'body', baseRegister: 'edi', length: 0x180}),
  stage('preparation-after', 0x474a16, afterBody),
  stage('derivatives-before', 0x47578d, {...beforeBody, offset: '-0x34'}),
  stage('derivatives-after', 0x475792, afterBody),
  {id: 'physics-finish', rva: rva(0x474b1e), stopAfterHits: frames, ranges: frameRanges}
);
for (const [name, before, after, , recordRoot] of vehicleStages) config.breakpoints.push(
  stage(`${name}-before`, before, {id: 'body', baseRegister: 'ecx', length: 0x3e78}),
  stage(`${name}-after`, after, {id: 'body', baseRegister: 'esi', ...(recordRoot ? {dereferenceOffsets: ['0']} : {}), length: 0x3e78})
);
await writeFile(path.resolve(filename), `${JSON.stringify(config, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({configuration: path.resolve(filename), output: config.outputDirectory, frames, method: 'Bounded native hidden frames, fixed recovered call-site observations, no physics writes.', evidence: [...own.evidence, ...parent.evidence].map(row => row.evidence_id)}));
