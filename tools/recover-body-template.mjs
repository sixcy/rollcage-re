// Recover the immutable initial body template used by FUN_0041dbb0.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initializeBody} from '../src/body-physics.mjs';
const data=await readFile('C:\\Program Files (x86)\\Psygnosis\\Rollcage\\Direct3D\\Rollcage Redux.exe');
const sha256=createHash('sha256').update(data).digest('hex');
if(sha256!=='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5')throw Error('Unexpected executable build.');
const address=0x5eab18,length=128,pe=data.readUInt32LE(0x3c),optional=pe+24,base=data.readUInt32LE(optional+28),sections=optional+data.readUInt16LE(pe+20);
let fileOffset;
for(let i=0;i<data.readUInt16LE(pe+6);i++) {
 const p=sections+i*40,rva=data.readUInt32LE(p+12),size=data.readUInt32LE(p+16);
 if(address-base>=rva&&address-base+length<=rva+size)fileOffset=data.readUInt32LE(p+20)+address-base-rva;
}
if(fileOffset===undefined)throw Error('Body template has no contiguous source mapping.');
const reply=JSON.parse(await readFile('analysis/scene/results/094-vehicle-base-state.json','utf8'));
const evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text),observed=evidence.normalized_result;
const delta=address-Number(observed.address),bytes=data.subarray(fileOffset,fileOffset+length);
if(!observed.complete||delta<0||delta+length>observed.returned_bytes||!bytes.equals(Buffer.from(observed.bytes_hex,'hex').subarray(delta,delta+length)))throw Error('Body template differs from retained Ghidra memory.');
const body=initializeBody(bytes);
const report={executableSHA256:sha256,address:'0x5eab18',fileOffset,bytes:length,evidence:evidence.evidence_id,matchesGhidra:true,
 scope:'Serialized initial body template, before spawn position and per-vehicle initialization changes.',hex:bytes.toString('hex'),body};
await writeFile('analysis/body-template.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({address:report.address,fileOffset,matchesGhidra:true,body}));
