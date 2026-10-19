import { RollcageArchive } from '../src/archive.mjs';
import { writeFile } from 'node:fs/promises';
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const report = [], issues = [];
try {
  for (const entry of archive.entries) {
    const { data } = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'GFXM') continue;
    const table = data.readUInt32LE(0x18), count = data.readUInt16LE(0x2c), models = [];
    for (let id = 0; id < count; id++) {
      const offset = data.readUInt32LE(table + id * 4);
      if (!offset) continue;
      const vertexCount = data.readUInt16LE(offset + 4), faceCount = data.readUInt16LE(offset + 6);
      const verticesOffset = offset + data.readUInt32LE(offset + 0x40), facesOffset = offset + data.readUInt32LE(offset + 0xc);
      const zeros = [0,0,0,0]; let outside = 0, maxIndex = 0;
      if (facesOffset + faceCount * 8 > data.length || verticesOffset + vertexCount * 8 > data.length) {
        issues.push({ resource: entry.index, id, error: 'range' }); continue;
      }
      for (let face = 0; face < faceCount; face++) for (let corner = 0; corner < 4; corner++) {
        const value = data[facesOffset + face * 8 + corner];
        if (value === 0) zeros[corner]++;
        if (value > vertexCount) outside++;
        maxIndex = Math.max(maxIndex, value);
      }
      if (outside) issues.push({ resource: entry.index, id, error: 'index', vertexCount, outside });
      models.push({ id, offset, type: data.toString('ascii', offset, offset + 4), vertexCount, faceCount, verticesOffset, facesOffset,
        zeros, maxIndex, lodOffsets: [data.readUInt16LE(offset + 0x1c), data.readUInt16LE(offset + 0x1e)] });
    }
    report.push({ resource: entry.index, slots: count, models });
  }
} finally { await archive.close(); }
await writeFile('analysis/model-probe.json', JSON.stringify({ issues, resources: report }, null, 2));
console.log(JSON.stringify({ resources: report.length, models: report.reduce((n,r) => n+r.models.length,0),
  types: [...new Set(report.flatMap(r => r.models.map(m => m.type)))],
  zeroCorners: [0,1,2,3].map(c => report.flatMap(r => r.models).reduce((n,m) => n+m.zeros[c],0)), issues: issues.slice(0, 12), totalIssues: issues.length }));
