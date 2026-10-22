import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const TARGET_SHA256 = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
export async function extractRaceViewportLiterals({executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe', output = 'analysis/race-viewports-next-phase-literals-20261022.json'} = {}) {
  const bytes = await readFile(executable), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== TARGET_SHA256) throw Error('Viewport literal extraction requires the retained Redux target SHA256.');
  const pe = bytes.readUInt32LE(0x3c), optional = pe + 24;
  if (bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(optional) !== 0x10b) throw Error('Expected original PE32 target.');
  const imageBase = bytes.readUInt32LE(optional + 28), sections = pe + 24 + bytes.readUInt16LE(pe + 20), count = bytes.readUInt16LE(pe + 6);
  const fileOffset = address => {
    const rva = address - imageBase;
    for (let i = 0; i < count; i++) {
      const row = sections + i * 40, start = bytes.readUInt32LE(row + 12), size = bytes.readUInt32LE(row + 16);
      if (rva >= start && rva < start + size) return bytes.readUInt32LE(row + 20) + rva - start;
    }
    throw RangeError(`Original VA ${address.toString(16)} has no raw section bytes.`);
  };
  const tables = [0x5d2334, 0x570244, 0x570258].map(address => {
    const offset = fileOffset(address), end = bytes.indexOf(0, offset);
    if (end < offset || end - offset > 100) throw Error('Unexpected native viewport literal extent.');
    return {address: `0x${address.toString(16)}`, fileOffset: offset, text: bytes.toString('latin1', offset, end), bytes_hex: bytes.subarray(offset, end + 1).toString('hex')};
  });
  const report = {method: 'Read-only original PE section mapping and SHA256 verification; no process execution or REA annotation.', executable, sha256, tables};
  if (output) await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
  return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await extractRaceViewportLiterals()));
