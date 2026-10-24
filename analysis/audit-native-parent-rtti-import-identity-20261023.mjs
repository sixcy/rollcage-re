// Static PE32 import identity only. Reads the original executable without
// loading it or any DLL. An optional output path is created exclusively.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const executable='C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const expectedSha256='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const file=await readFile(executable), sha256=createHash('sha256').update(file).digest('hex');
assert.equal(sha256,expectedSha256,'Original target SHA256');
function extent(offset,length) {assert.ok(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=file.length,'PE raw extent');return file.subarray(offset,offset+length);}
const u16=offset=>extent(offset,2).readUInt16LE(),u32=offset=>extent(offset,4).readUInt32LE();
assert.equal(u16(0),0x5a4d);const peOffset=u32(0x3c);assert.equal(extent(peOffset,4).toString('hex'),'50450000');
const coff=peOffset+4,machine=u16(coff),sectionCount=u16(coff+2),optionalBytes=u16(coff+16),optional=coff+20;
assert.equal(machine,0x14c);assert.equal(u16(optional),0x10b);assert.ok(optionalBytes>=112);
const imageBase=u32(optional+28),sizeOfHeaders=u32(optional+60),directoryCount=u32(optional+92);
assert.equal(imageBase,0x400000);assert.ok(directoryCount>=2);
const importDirectoryRva=u32(optional+104),importDirectoryBytes=u32(optional+108),sectionTable=optional+optionalBytes;
assert.ok(importDirectoryRva>0&&importDirectoryBytes>=20);
const sections=Array.from({length:sectionCount},(_,i)=>{const p=sectionTable+i*40;return {name:extent(p,8).toString('ascii').replace(/\0.*$/,''),virtualSize:u32(p+8),rva:u32(p+12),rawSize:u32(p+16),rawOffset:u32(p+20)};});
function mapping(rva,length=1) {
  assert.ok(Number.isSafeInteger(rva)&&rva>=0&&rva+length<=0x100000000,'PE RVA extent');
  if(rva+length<=sizeOfHeaders){extent(rva,length);return {rva,rawOffset:rva,section:'headers'};}
  const found=sections.filter(s=>rva>=s.rva&&rva-s.rva+length<=s.rawSize);
  assert.equal(found.length,1,'Unique file-backed RVA mapping');const s=found[0],rawOffset=s.rawOffset+rva-s.rva;extent(rawOffset,length);return {rva,rawOffset,section:s.name};
}
const at=(rva,length)=>{const m=mapping(rva,length);return {...m,bytes:extent(m.rawOffset,length)};};
function stringAt(rva) {const bytes=[];for(let i=0;i<4096;i++){const b=at(rva+i,1).bytes[0];if(!b)return Buffer.from(bytes).toString('ascii');assert.ok(b<128,'ASCII PE import string');bytes.push(b);}throw Error('Unterminated bounded import name');}
const callVa=0x402d86,call=at(callVa-imageBase,5);assert.equal(call.bytes[0],0xe8);
const relativeDisplacement=call.bytes.readInt32LE(1),thunkVa=callVa+5+relativeDisplacement;assert.equal(thunkVa,0x56932a);
const thunk=at(thunkVa-imageBase,6);assert.equal(thunk.bytes.subarray(0,2).toString('hex'),'ff25');
const iatVa=thunk.bytes.readUInt32LE(2);assert.equal(iatVa,0x56e4c4);const wantedRva=iatVa-imageBase,iatSlot=at(wantedRva,4);
const descriptors=[];let terminated=false,totalImports=0,selected=[];
for(let i=0;i<Math.floor(importDirectoryBytes/20);i++){
  const descriptorRva=importDirectoryRva+i*20,d=at(descriptorRva,20),words=Array.from({length:5},(_,j)=>d.bytes.readUInt32LE(j*4));
  if(words.every(x=>x===0)){terminated=true;break;}
  const [originalFirstThunk,timeDateStamp,forwarderChain,nameRva,firstThunk]=words;assert.ok(nameRva&&firstThunk);
  const dll=stringAt(nameRva),lookupRva=originalFirstThunk||firstThunk,entries=[];
  let thunkTerminated=false;
  for(let j=0;j<65536;j++){
    const lookup=at(lookupRva+j*4,4),value=lookup.bytes.readUInt32LE();if(!value){thunkTerminated=true;break;}
    const entryIatRva=firstThunk+j*4,entryIat=at(entryIatRva,4),byOrdinal=Boolean(value&0x80000000);
    const item={index:j,lookupRva:lookup.rva,lookupRawOffset:lookup.rawOffset,lookupBytesHex:lookup.bytes.toString('hex'),iatRva:entryIatRva,iatRawOffset:entryIat.rawOffset,iatBytesHex:entryIat.bytes.toString('hex'),byOrdinal};
    if(byOrdinal)item.ordinal=value&65535;
    else {const named=at(value,2);Object.assign(item,{hintNameRva:value,hintRawOffset:named.rawOffset,hint:named.bytes.readUInt16LE(),nameRva:value+2,nameRawOffset:mapping(value+2).rawOffset,name:stringAt(value+2)});}
    entries.push(item);if(entryIatRva===wantedRva)selected.push({dll,descriptorIndex:i,descriptorRva,descriptorRawOffset:d.rawOffset,descriptorBytesHex:d.bytes.toString('hex'),originalFirstThunk,timeDateStamp,forwarderChain,dllNameRva:nameRva,dllNameRawOffset:mapping(nameRva).rawOffset,firstThunk,lookupTableSource:originalFirstThunk?'OriginalFirstThunk':'FirstThunk (OriginalFirstThunk zero)',...item});
  }
  assert.ok(thunkTerminated,'Import thunk terminator');totalImports+=entries.length;descriptors.push({dll,descriptorRva,imports:entries.length});
}
assert.ok(terminated,'Import descriptor terminator');assert.equal(selected.length,1,'Exactly one descriptor owns the called IAT slot');
const identity=selected[0],matchesExpected=identity.dll.toLowerCase()==='msvcr120.dll'&&identity.name==='__RTDynamicCast'&&!identity.byOrdinal;
const report={schemaVersion:1,method:'original-file-PE32-direct-CALL-import-thunk-IAT-descriptor-name-proof',verifiedStaticImportIdentity:true,matchesExpectedMsvcr120DynamicCast:matchesExpected,
  targetSha256:sha256,executable:path.resolve(executable),fileBytes:file.length,imageBase,
  pe:{peHeaderRawOffset:peOffset,machine,optionalHeaderMagic:0x10b,sectionCount,sizeOfHeaders,importDirectoryRva,importDirectoryRawOffset:mapping(importDirectoryRva,20).rawOffset,importDirectoryBytes,descriptorCount:descriptors.length,totalImports},
  call:{preferredAddress:callVa,rva:call.rva,rawOffset:call.rawOffset,section:call.section,bytesHex:call.bytes.toString('hex'),relativeDisplacement,targetPreferredAddress:thunkVa},
  thunk:{preferredAddress:thunkVa,rva:thunk.rva,rawOffset:thunk.rawOffset,section:thunk.section,bytesHex:thunk.bytes.toString('hex'),operation:'JMP DWORD PTR [absolute IAT VA]',iatPreferredAddress:iatVa},
  iat:{preferredAddress:iatVa,rva:iatSlot.rva,rawOffset:iatSlot.rawOffset,section:iatSlot.section,bytesHex:iatSlot.bytes.toString('hex'),descriptorSlotIndex:identity.index},
  importIdentity:identity,
  limits:['Static original PE file import metadata only; no executable or DLL was loaded or run.','The import descriptor names a DLL and symbol; this does not prove the runtime resolved module, version, address, forwarded target or actual CRT behavior.','No observed game-child result, RTTI object/subobject pointer or native return value is supplied by this audit.']};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verifiedStaticImportIdentity:true,matchesExpectedMsvcr120DynamicCast:matchesExpected,targetSha256:sha256,dll:identity.dll,name:identity.name,hint:identity.hint,iatRawOffset:iatSlot.rawOffset,output:process.argv[2]??null}));
if(!matchesExpected)process.exitCode=1;
