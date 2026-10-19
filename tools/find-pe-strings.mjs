// Original file bytes and PE mappings, independent of REA/Ghidra string discovery.
import { readFile } from 'node:fs/promises';
const [filename, expression = 'GT20|Rollcage\\.(idx|img)|IDXData'] = process.argv.slice(2);
if (!filename) throw new Error('Usage: node find-pe-strings.mjs <PE path> [regex]');
const data = await readFile(filename);
const pe = data.readUInt32LE(0x3c);
if (data.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Not a PE image.');
const count = data.readUInt16LE(pe + 6);
const optional = pe + 24;
if (data.readUInt16LE(optional) !== 0x10b) throw new Error('Only PE32 is supported.');
const imageBase = data.readUInt32LE(optional + 28);
const sectionStart = optional + data.readUInt16LE(pe + 20);
const sections = Array.from({ length: count }, (_, i) => {
  const p = sectionStart + i * 40;
  return { name: data.toString('ascii', p, p + 8).replace(/\0.*$/, ''),
    rva: data.readUInt32LE(p + 12), rawSize: data.readUInt32LE(p + 16), offset: data.readUInt32LE(p + 20) };
});
const pattern = new RegExp(expression, 'i');
const matches = [];
for (let start = 0; start < data.length;) {
  if (data[start] < 32 || data[start] > 126) { start++; continue; }
  let end = start;
  while (end < data.length && data[end] >= 32 && data[end] <= 126) end++;
  const value = data.toString('ascii', start, end);
  if (value.length >= 4 && pattern.test(value)) {
    const section = sections.find(s => start >= s.offset && end <= s.offset + s.rawSize);
    matches.push({ offset: start, address: section ? '0x' + (imageBase + section.rva + start - section.offset).toString(16) : null,
      section: section?.name ?? null, text: value });
  }
  start = end;
}
console.log(JSON.stringify({ method: 'Direct original-file ASCII scan; not REA Evidence. Addresses derive from PE section mappings.', filename, imageBase, sections, matches }, null, 2));
