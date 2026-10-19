import { RollcageArchive } from '../src/archive.mjs';
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  for (const id of process.argv.slice(2).map(Number)) {
    const { data } = await archive.readResource(id);
    const count = data.readUInt16LE(0x2c), table = data.readUInt32LE(0x18);
    const objects = Array.from({ length: count }, (_, i) => data.readUInt32LE(table + i * 4));
    const first = objects[0];
    const fields = Array.from({ length: 24 }, (_, i) => ({ offset: '0x' + (i * 4).toString(16),
      uint32: data.readUInt32LE(first + i * 4), int16: [data.readInt16LE(first + i * 4), data.readInt16LE(first + i * 4 + 2)] }));
    const samples = [0xc, 0x18, 0x40, 0x44].map(field => {
      const relative = data.readUInt32LE(first + field), offset = first + relative;
      return { field: '0x' + field.toString(16), relative, offset,
        hex: data.subarray(offset, offset + 96).toString('hex'),
        int16: Array.from({ length: 24 }, (_, i) => data.readInt16LE(offset + i * 2)) };
    });
    console.log(JSON.stringify({ id, bytes: data.length, count, table, objects: objects.slice(0, 8), first, fields, samples }, null, 2));
  }
} finally { await archive.close(); }
