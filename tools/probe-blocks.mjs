import { RollcageArchive } from '../src/archive.mjs';
const archive = await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
  for (const id of process.argv.slice(2).map(Number)) {
    const { data } = await archive.readResource(id);
    const count = data.readUInt32LE(0x10), table = data.readUInt32LE(0x14);
    const offsets = Array.from({length:count},(_,i)=>data.readUInt32LE(table+i*4));
    const fields = [];
    for (let p=0;p<0x80;p+=4) fields.push({offset:'0x'+p.toString(16),u32:data.readUInt32LE(offsets[0]+p),i16:[data.readInt16LE(offsets[0]+p),data.readInt16LE(offsets[0]+p+2)]});
    const samples = [0x20,0x28,0x2c,0x30,0x3c,0x40,0x50,0x54,0x58,0x5c].map(field=>{
      const offset=data.readUInt32LE(offsets[0]+field);
      return {field:'0x'+field.toString(16),offset,hex:data.subarray(offset,offset+64).toString('hex'),i16:offset+32<=data.length?Array.from({length:16},(_,i)=>data.readInt16LE(offset+i*2)):[]};
    });
    const globalSamples = [0x20,0x24,0x28,0x110,0x114].map(field=>{
      const offset=data.readUInt32LE(field);
      return {field:'0x'+field.toString(16),offset,hex:data.subarray(offset,offset+96).toString('hex')};
    });
    const firstStream=data.readUInt32LE(offsets[0]+0x50), nextStream=data.readUInt32LE(offsets[0]+0x54);
    const packetHeaders=[];
    for(let p=firstStream;p<nextStream;p+=8) if(data.readUInt16LE(p+2)) packetHeaders.push({entry:(p-firstStream)/8,id:data.readUInt16LE(p),header:data.readUInt16LE(p+2).toString(16),second:data.readUInt32LE(p+4)});
    console.log(JSON.stringify({id,count,table,offsets,fields,samples,globalSamples,packetHeaders},null,2));
  }
} finally { await archive.close(); }
