import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const executable=await readFile('C:\\Program Files (x86)\\Psygnosis\\Rollcage\\Direct3D\\Rollcage Redux.exe'),sha256=createHash('sha256').update(executable).digest('hex');
if(sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error('Unexpected executable build.');
const pe=executable.readUInt32LE(0x3c),optional=pe+24,base=executable.readUInt32LE(optional+28),sections=optional+executable.readUInt16LE(pe+20),result={executableSHA256:sha256};
for(const [name,address,length,evidenceFile]of [['wheels',0x5eac60,112,'206-wheel-template-bytes.json'],['shapes',0x5ead60,100,'209-vehicle-collision-shapes-complete.json']]) {
 let fileOffset;
 for(let i=0;i<executable.readUInt16LE(pe+6);i++){const p=sections+i*40,rva=executable.readUInt32LE(p+12),size=executable.readUInt32LE(p+16);if(address-base>=rva&&address-base+length<=rva+size)fileOffset=executable.readUInt32LE(p+20)+address-base-rva;}
 if(fileOffset===undefined)throw Error('Contact template has no file-backed section.');
 const reply=JSON.parse(await readFile('analysis/scene/results/'+evidenceFile,'utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text),observed=evidence.normalized_result,bytes=executable.subarray(fileOffset,fileOffset+length);
 if(!observed.complete||observed.returned_bytes!==length||!bytes.equals(Buffer.from(observed.bytes_hex,'hex')))throw Error('Contact template differs from retained Ghidra memory.');
 result[name]={address:'0x'+address.toString(16),fileOffset,bytes:length,hex:bytes.toString('hex'),evidence:evidence.evidence_id,matchesGhidra:true};
}
await writeFile('src/vehicle-contact-template.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,wheels:{...result.wheels,hex:undefined},shapes:{...result.shapes,hex:undefined}}));
