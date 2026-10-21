import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe',executable=await readFile(path),sha256=createHash('sha256').update(executable).digest('hex');
if(sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error('Unexpected executable.');
const pe=executable.readUInt32LE(0x3c),optional=pe+24,base=executable.readUInt32LE(optional+28),sections=optional+executable.readUInt16LE(pe+20),address=0x570680,length=113,rva=address-base;let fileOffset;
for(let index=0;index<executable.readUInt16LE(pe+6);index++){const p=sections+index*40,start=executable.readUInt32LE(p+12),size=executable.readUInt32LE(p+16);if(rva>=start&&rva+length<=start+size)fileOffset=executable.readUInt32LE(p+20)+rva-start;}
if(fileOffset===undefined)throw Error('Skill tables are not file-backed.');
const reply=JSON.parse(await readFile('analysis/native-simulation/results/146-finish-skill-tables.json','utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text),native=evidence.normalized_result,bytes=executable.subarray(fileOffset,fileOffset+length);
if(!native.complete||native.returned_bytes!==length||!bytes.equals(Buffer.from(native.bytes_hex,'hex')))throw Error('REA table bytes differ from installed executable.');
await writeFile('src/finish-skill-tables.json',JSON.stringify({executableSHA256:sha256,address:'0x570680',fileOffset,length,evidence:evidence.evidence_id,hex:bytes.toString('hex')},null,2));console.log(JSON.stringify({fileOffset,length,matchesGhidra:true}));
