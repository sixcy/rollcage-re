import test from 'node:test';
import assert from 'node:assert/strict';
import {createZIP,createBlobZIP} from '../tools/track-viewer/zip.mjs';
import {buildPickupGameDownload} from '../tools/track-viewer/editor-download.mjs';
import {readTrackZIP} from '../tools/lib/check-track-download.mjs';
import {parseIndex} from '../src/archive-index.mjs';

test('chunked Blob ZIP matches the existing deterministic writer and independent native CRC reader',async()=>{
  const payload=Buffer.alloc(2*1048576+37);for(let i=0;i<payload.length;i++)payload[i]=i%251;
  const files=[{name:'image.img',data:payload},{name:'notes.txt',data:'Unicode text: été'},{name:'empty',data:new Uint8Array()}],progress=[];
  const actual=Buffer.from(await(await createBlobZIP(files.map(row=>({...row,data:new Blob([row.data])})),{onProgress:row=>progress.push(row)})).arrayBuffer());
  const expected=Buffer.from(await createZIP(files).arrayBuffer());assert.deepEqual(actual,expected);
  const unpacked=readTrackZIP(actual);assert.deepEqual(unpacked.get('image.img'),payload);assert.equal(unpacked.get('notes.txt').toString(),'Unicode text: été');
  assert.ok(progress.length>=4);assert.equal(progress.at(-1).completed,progress.at(-1).total);assert.ok(progress.every((row,i)=>!i||row.completed>=progress[i-1].completed));
});

test('Blob export cancels between chunks and rejects unsafe names and unsupported inputs',async()=>{
  const controller=new AbortController();let progress=0;
  await assert.rejects(createBlobZIP([{name:'large',data:new Blob([new Uint8Array(3*1048576)])}],{signal:controller.signal,onProgress(){progress++;controller.abort();}}),{name:'AbortError'});
  assert.equal(progress,1);
  for(const files of [[{name:'../escape',data:''}],[{name:'a',data:''},{name:'a',data:''}],[{name:'a',data:{}}]])await assert.rejects(createBlobZIP(files),/ZIP|filename/);
});

test('game ZIP preserves original image bytes and index metadata and packages both files plus reloadable project',async()=>{
  const source=Buffer.from('original image prefix'),index=Buffer.alloc(32);index.writeUInt32LE(source.length,4);index.writeUInt32LE(source.length,8);index.writeUInt16LE(7,12);
  index.writeUInt32LE(source.length,16); //Empty second entry at EOF.
  const archive={image:new Blob([source]),indexData:index},replacement=Buffer.from('new decoded track data'),project={schemaVersion:1,game:'rollcage',levels:[]};
  const download=await buildPickupGameDownload(archive,new Map([[0,replacement]]),project);
  const files=readTrackZIP(Buffer.from(await download.blob.arrayBuffer()));assert.deepEqual([...files.keys()],['Rollcage.img','Rollcage.idx','pickup-project.json','README.txt']);
  const image=files.get('Rollcage.img'),updated=files.get('Rollcage.idx'),entries=parseIndex(updated,image.length);
  assert.deepEqual(image.subarray(0,source.length),source);assert.equal(entries[0].storedBytes,replacement.length);assert.equal(entries[0].decodedBytes,replacement.length);assert.equal(entries[0].allocationExtra,7);
  assert.deepEqual(image.subarray(entries[0].offset,entries[0].offset+replacement.length),replacement);assert.deepEqual(updated.subarray(16),index.subarray(16));
  assert.deepEqual(JSON.parse(files.get('pickup-project.json')),project);assert.match(files.get('README.txt').toString(),/separate copy.*Rollcage Redux/);assert.match(files.get('README.txt').toString(),/Edited archive entries: 0/);
  assert.equal(download.imageBytes,image.length);assert.equal(source.toString(),'original image prefix');
});
