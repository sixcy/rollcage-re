import { RollcageArchive } from '../src/archive.mjs';
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  for (const id of process.argv.slice(2).map(Number)) {
    const { data } = await archive.readResource(id);
    const fields = [];
    const size = data.toString('ascii', 0, 4) === 'GFXM' ? 0x120 : 0x70;
    for (let p = 0; p < size; p += 4) fields.push({ offset: '0x'+p.toString(16), u32:data.readUInt32LE(p), u16:[data.readUInt16LE(p),data.readUInt16LE(p+2)] });
    const samples = data.toString('ascii',0,4) === 'GFXM' ? [0x14,0x24,0x110,0x114].map(field => {
      const p = data.readUInt32LE(field);
      return {field:'0x'+field.toString(16),offset:p,hex:data.subarray(p,p+64).toString('hex')};
    }) : [];
    console.log(JSON.stringify({id,bytes:data.length,fields,samples},null,2));
  }
} finally { await archive.close(); }
