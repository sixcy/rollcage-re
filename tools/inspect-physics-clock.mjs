import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

// Read-only inspection of the exact original target. This is shell-derived
// artifact evidence, not REA Evidence or original-process observation.
const target = process.argv[2] ?? 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const bytes = await readFile(target);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== REDUX_SHA256) throw Error('Physics clock inspection requires the verified Redux executable.');
const pe = bytes.readUInt32LE(0x3c), optional = pe + 24;
if (bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(optional) !== 0x10b) throw Error('Expected a PE32 executable.');
const imageBase = bytes.readUInt32LE(optional + 28), sections = [];
const sectionStart = optional + bytes.readUInt16LE(pe + 20);
for (let index = 0; index < bytes.readUInt16LE(pe + 6); index++) {
  const p = sectionStart + index * 40;
  sections.push({name: bytes.toString('ascii', p, p + 8).replace(/\0/g, ''),
    address: imageBase + bytes.readUInt32LE(p + 12), virtualSize: bytes.readUInt32LE(p + 8),
    fileOffset: bytes.readUInt32LE(p + 20), fileSize: bytes.readUInt32LE(p + 16)});
}
const hex = value => `0x${value.toString(16)}`;
function read(address, length) {
  const section = sections.find(value => address >= value.address && address + length <= value.address + value.fileSize);
  if (!section) throw Error(`Unbacked original bytes at ${hex(address)}.`);
  const fileOffset = section.fileOffset + address - section.address;
  const data = bytes.subarray(fileOffset, fileOffset + length);
  return {address: hex(address), fileOffset: hex(fileOffset), bytesHex: data.toString('hex'), signed32: length === 4 ? data.readInt32LE() : undefined};
}
const directCallCandidates = [];
for (const section of sections.filter(value => value.name === '.text')) {
  for (let offset = 0; offset + 5 <= section.fileSize; offset++) {
    const p = section.fileOffset + offset, address = section.address + offset;
    if (bytes[p] === 0xe8 && (address + 5 + bytes.readInt32LE(p + 1)) >>> 0 === 0x450e50) directCallCandidates.push(hex(address));
  }
}
const report = {
  method: 'Read-only PE32 mapping and exact-byte inspection; CALL scan yields candidates, not decoded instruction or reachability claims. Original executable was not launched.',
  target: {path: target, sha256},
  gravityImageInitializer: read(0x5eb5e0, 4),
  ordinaryRaceUpdateDirectCallCandidates: directCallCandidates,
  limitations: ['Initialized image bytes do not establish the live value after all startup/configuration producers.', 'No original-process timing or floating-point context was observed.']
};
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));
