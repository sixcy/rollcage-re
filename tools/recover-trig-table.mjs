// Recover native math lookup bytes and verify them against retained Ghidra
// memory. Defaults to cosine; pass "sqrt" or "yaw" for the other lookups.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const executable=await readFile('C:\\Program Files (x86)\\Psygnosis\\Rollcage\\Direct3D\\Rollcage Redux.exe');
const sha256=createHash('sha256').update(executable).digest('hex');
if(sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error('Unexpected executable build.');
const pe=executable.readUInt32LE(0x3c),optional=pe+24,base=executable.readUInt32LE(optional+28),start=optional+executable.readUInt16LE(pe+20);
const kind=process.argv[2]??'cosine';
const settings={cosine:{address:0x575228,length:808,stride:4,evidenceFile:'078-cosine-table.json',output:'trig-table.json'},
 sqrt:{address:0x5eb290,length:384,stride:2,evidenceFile:'131-sqrt-lookup-table.json',output:'sqrt-table.json'},
 yaw:{address:0x5ed030,length:642,stride:2,signed:true,evidenceFile:'198-model-yaw-table.json',output:'yaw-table.json'}}[kind];
if(!settings)throw Error('Select cosine, sqrt or yaw.');
const {address,length,stride,evidenceFile,output}=settings,rva=address-base;
let offset;
for(let i=0;i<executable.readUInt16LE(pe+6);i++) {
 const p=start+i*40,sectionRVA=executable.readUInt32LE(p+12),size=executable.readUInt32LE(p+16);
 if(rva>=sectionRVA&&rva+length<=sectionRVA+size)offset=executable.readUInt32LE(p+20)+rva-sectionRVA;
}
if(offset===undefined)throw Error('Math table is not file-backed.');
const reply=JSON.parse(await readFile('analysis/scene/results/'+evidenceFile,'utf8'));
const evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text),observed=evidence.normalized_result;
const bytes=executable.subarray(offset,offset+length);
if(!observed.complete||observed.returned_bytes!==length||!bytes.equals(Buffer.from(observed.bytes_hex.replace(/\s/g,''),'hex')))throw Error('Native and file math table bytes differ.');
const values=Array.from({length:length/stride},(_,i)=>stride===4?bytes.readInt32LE(i*stride):settings.signed?bytes.readInt16LE(i*stride):bytes.readUInt16LE(i*stride));
await writeFile('src/'+output,JSON.stringify({executableSHA256:sha256,address:'0x'+address.toString(16),fileOffset:offset,evidence:evidence.evidence_id,values},null,2));
console.log(JSON.stringify({entries:values.length,fileOffset:offset,matchesGhidra:true,first:values[0],last:values.at(-1)}));
