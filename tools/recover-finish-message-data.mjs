import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
const executable=await readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'),sha256=createHash('sha256').update(executable).digest('hex');
if(sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error('Unexpected Redux executable.');
const pe=executable.readUInt32LE(0x3c),optional=pe+24,base=executable.readUInt32LE(optional+28),sections=optional+executable.readUInt16LE(pe+20),constants=[];
for(const name of ['184-driver-name-keys.json','192-localization-language-constants.json','193-localization-language-switch.json']){
 const reply=JSON.parse(await readFile('analysis/native-simulation/results/'+name,'utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(item=>item.type==='text').text),value=evidence.normalized_result,address=Number(value.address),rva=address-base,length=value.returned_bytes;let fileOffset;
 for(let index=0;index<executable.readUInt16LE(pe+6);index++){const p=sections+index*40,start=executable.readUInt32LE(p+12),size=executable.readUInt32LE(p+16);if(rva>=start&&rva+length<=start+size)fileOffset=executable.readUInt32LE(p+20)+rva-start;}
 if(fileOffset===undefined||!value.complete||!executable.subarray(fileOffset,fileOffset+length).equals(Buffer.from(value.bytes_hex,'hex')))throw Error(`Native constant mismatch ${name}.`);
 constants.push({address:value.address,fileOffset,length,evidence:evidence.evidence_id,hex:value.bytes_hex});
}
await writeFile('src/finish-message-constants.json',JSON.stringify({executableSHA256:sha256,constants},null,2),{flag:'wx'});
const archive=await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage');
try{const resource=await archive.readResource(8),hash=createHash('sha256').update(resource.data).digest('hex');await writeFile('analysis/finish-message-resource8-original.bin',resource.data,{flag:'wx'});await writeFile('analysis/finish-message-resource8-original.json',JSON.stringify({resource:8,entry:resource.entry,decodedBytes:resource.data.length,sha256:hash,encoding:'Original bytes preserved; readable Western text uses single-byte encodings. This is the original input, not the native preprocessed runtime buffer.'},null,2),{flag:'wx'});console.log(JSON.stringify({constants:constants.length,resourceBytes:resource.data.length,resourceSHA256:hash}));}finally{await archive.close();}
