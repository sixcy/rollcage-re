// Table location/count recovered from Redux FUN_00447ae0.
// Reads original PE bytes, independently of loaded analysis memory.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = process.argv[2] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage\\Direct3D\\Rollcage Redux.exe';
const data = await readFile(filename);
const sha256 = createHash('sha256').update(data).digest('hex');
if (sha256 !== 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5') throw new Error('Resource table addresses are specific to the selected Redux build.');
const pe = data.readUInt32LE(0x3c), optional = pe + 24;
const imageBase = data.readUInt32LE(optional + 28);
const sectionStart = optional + data.readUInt16LE(pe + 20);
const sections = Array.from({ length: data.readUInt16LE(pe + 6) }, (_, i) => {
  const p = sectionStart + i * 40;
  return { rva: data.readUInt32LE(p + 12), size: data.readUInt32LE(p + 16), offset: data.readUInt32LE(p + 20) };
});
function fileOffset(address, bytes = 1) {
  const rva = address - imageBase;
  const section = sections.find(s => rva >= s.rva && rva + bytes <= s.rva + s.size);
  if (!section) throw new Error(`Address outside file-backed sections: 0x${address.toString(16)}`);
  return section.offset + rva - section.rva;
}
const tableAddress = 0x5eb600, rowCount = 0x154;
const tableOffset = fileOffset(tableAddress, rowCount * 8);
let analysisTableVerification = null;
try {
  const response = JSON.parse(await readFile(path.join(root, 'analysis', 'asset-formats', 'results', '017-live-filename-table.json'), 'utf8'));
  const evidence = response.structuredContent ?? JSON.parse(response.content.find(c => c.type === 'text').text);
  const observed = evidence.normalized_result;
  if (!observed.complete || observed.returned_bytes !== rowCount * 8 ||
      !Buffer.from(observed.bytes_hex.replace(/\s/g, ''), 'hex').equals(data.subarray(tableOffset, tableOffset + rowCount * 8))) throw new Error('Filename table differs from retained Ghidra bytes.');
  analysisTableVerification = { evidence: evidence.evidence_id, bytes: observed.returned_bytes, matchesOriginalFile: true };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const mappings = Array.from({ length: rowCount }, (_, i) => {
  const row = tableOffset + i * 8;
  const nameAddress = data.readUInt32LE(row);
  const start = fileOffset(nameAddress);
  const end = data.indexOf(0, start);
  if (end < start || end - start > 1024) throw new Error('Unterminated resource name.');
  fileOffset(nameAddress, end - start + 1);
  return { name: data.toString('latin1', start, end), index: data.readInt16LE(row + 4),
    tableAddress: '0x' + (tableAddress + i * 8).toString(16), tableFileOffset: row,
    nameAddress: '0x' + nameAddress.toString(16), nameFileOffset: start, reserved: data.readUInt16LE(row + 6) };
});
const decoded = JSON.parse(await readFile(path.join(root, 'analysis', 'decoded-archive.json'), 'utf8'));
const resources = decoded.resources.map(resource => ({ ...resource, names: mappings.filter(m => m.index === resource.index).map(m => m.name) }));
if (mappings.some(m => m.index < 0 || m.index >= resources.length)) throw new Error('Resource ID outside archive.');
const catalog = { method: 'Original PE filename table plus validated reconstructed archive output; table format recovered from REA/Ghidra pseudocode.',
  executable: { filename, sha256 }, table: { address: '0x5eb600', fileOffset: tableOffset, rows: rowCount, stride: 8, analysisTableVerification }, mappings, resources };
await writeFile(path.join(root, 'analysis', 'resource-catalog.json'), JSON.stringify(catalog, null, 2));
await writeFile(path.join(root, 'src', 'resource-map.json'), JSON.stringify({ executableSHA256: sha256,
  mappings: mappings.map(({ name, index }) => ({ name, index })) }, null, 2));
console.log(JSON.stringify({ mappings: mappings.length, namedResources: resources.filter(r => r.names.length).length,
  unnamedResources: resources.filter(r => !r.names.length).map(r => r.index),
  samples: resources.slice(0, 30).map(r => ({ index: r.index, names: r.names, bytes: r.decodedBytes })) }, null, 2));
