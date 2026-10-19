import { RollcageArchive } from '../src/archive.mjs';
const ids = process.argv.slice(2).map(Number);
if (ids.length === 0 || ids.some(id => !Number.isInteger(id))) throw new Error('Pass one or more resource IDs.');
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  for (const id of ids) {
    const { data } = await archive.readResource(id);
    const words = Array.from({ length: Math.min(data.length >>> 2, 48) }, (_, i) => ({
      offset: '0x' + (i * 4).toString(16), uint: data.readUInt32LE(i * 4),
      hex: data.readUInt32LE(i * 4).toString(16).padStart(8, '0'), float: data.readFloatLE(i * 4),
      text: data.toString('latin1', i * 4, i * 4 + 4).replace(/[^\x20-\x7e]/g, '.'),
    }));
    console.log(JSON.stringify({ id, bytes: data.length, words }, null, 2));
  }
} finally { await archive.close(); }
