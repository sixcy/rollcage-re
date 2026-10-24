import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const fail=message=>{throw Error(`Held range storage: ${message}`);};
const sha=b=>createHash('sha256').update(b).digest('hex');
const rowsOf=rows=>rows instanceof Map?[...rows.values()]:rows;
function backingOverlaps(bytes,previous) {return bytes.buffer===previous.buffer&&bytes.byteOffset<previous.byteOffset+previous.length&&previous.byteOffset<bytes.byteOffset+bytes.length;}
export function planContainedRangeStorage(rows,debugOrdinal,{actual=false}={}) {
  rows=rowsOf(rows);if(!Array.isArray(rows)||!Number.isSafeInteger(debugOrdinal)||debugOrdinal<1)fail('actual snapshot rows/order');
  const ids=new Set(),input=rows.map((r,index)=>{
    const address=Number(r.address),length=r.length;if(typeof r.id!=='string'||ids.has(r.id)||!Number.isInteger(address)||address<0||address>0xffffffff||!Number.isSafeInteger(length)||length<0||length>0x4000000||address+length>0x100000000||length>0&&address===0)fail('unique bounded x86 row');ids.add(r.id);return {id:r.id,index,address,length,end:address+length};
  }),owners=[],views=new Array(input.length);
  for(const row of input.toSorted((a,b)=>b.length-a.length||a.index-b.index)) {
    let owner=null;if(row.length){owner=owners.find(o=>o.address<=row.address&&row.end<=o.end);if(!owner){owner=row;owners.push(row);}}
    views[row.index]={id:row.id,ownerId:owner?.id??null,dataOffset:owner?row.address-owner.address:0,length:row.length};
  }
  return {mode:'snapshot-local-contained-ranges',snapshotLocal:true,observedDebugEventOrdinal:debugOrdinal,logicalRangeBytes:input.reduce((n,r)=>n+r.length,0),backingBytes:owners.reduce((n,r)=>n+r.length,0),backings:owners.map(r=>({id:r.id,address:`0x${r.address.toString(16).padStart(8,'0')}`,length:r.length})),views,physicalBufferIdentityVerified:actual};
}
export function verifyContainedRangeStorage(snapshot,storage,{actual=true}={}) {
  const rows=rowsOf(snapshot.ranges),core=rows.filter(r=>r.id!=='thread-seh-head'),heads=rows.filter(r=>r.id==='thread-seh-head');
  if(heads.length!==1||heads[0].length!==4)fail('separate actual4B thread environment');
  const expected=planContainedRangeStorage(core,snapshot.observedDebugEventOrdinal,{actual});if(!isDeepStrictEqual(storage,expected))fail('deterministic physical backing/view proof differs');
  const headers=core.reduce((n,r)=>n+(r.rangeMode==='vector-storage'?12:0),0);
  if(core.some(r=>r.rangeMode==='guarded-pointer'))fail('guarded pointer sharing is outside held policy');
  return {verified:true,logicalSnapshotBytes:expected.logicalRangeBytes+headers+720,retainedSnapshotBytes:expected.backingBytes+headers+720,backingCount:expected.backings.length,viewCount:expected.views.length,storage:expected};
}
export function verifyHeldRangeStorageDiagnostic(snapshot,records,{pid,role}) {
  const proof=verifyContainedRangeStorage(snapshot,snapshot.rangeStorage),matches=records.filter(r=>r.type==='held-force-range-storage'&&r.role===role&&r.observedDebugEventOrdinal===snapshot.observedDebugEventOrdinal);
  if(matches.length!==1||matches[0].pid!==pid||matches[0].tid!==snapshot.tid||!isDeepStrictEqual(matches[0].rangeStorage,snapshot.rangeStorage))fail('missing/forged actual snapshot-local allocation diagnostic');
  const at=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===snapshot.ordinal);
  if(at<0||records.indexOf(matches[0])>=at)fail('actual allocation diagnostic must precede snapshot publication');
  return proof;
}
export function createContainedRangeViews(rows,read) {
  rows=rowsOf(rows);const plan=planContainedRangeStorage(rows,1,{actual:true}),buffers=new Map();
  for(const b of plan.backings){const bytes=read(rows.find(r=>r.id===b.id));if(!Buffer.isBuffer(bytes)||bytes.length!==b.length||[...buffers.values()].some(previous=>backingOverlaps(bytes,previous)))fail('distinct exact owned read buffers');buffers.set(b.id,bytes);}
  const views=new Map();for(const v of plan.views){const bytes=v.ownerId===null?Buffer.alloc(0):buffers.get(v.ownerId).subarray(v.dataOffset,v.dataOffset+v.length);if(bytes.length!==v.length)fail('view bounds');views.set(v.id,bytes);}
  return {plan,buffers,views};
}
//Read each real owner blob once. A child file is still independently streamed
//and hashed, while its retained bytes are a view, not a duplicate allocation.
export async function loadContainedRangeBlobs(rows,directory) {
  rows=rowsOf(rows);const root=await realpath(directory),plan=planContainedRangeStorage(rows,1,{actual:true}),buffers=new Map(),result=new Map();
  async function filename(row) {if(typeof row.file!=='string'||path.basename(row.file)!==row.file||/[\\/]/.test(row.file))fail('unsafe blob path');const file=await realpath(path.join(root,row.file));if(path.dirname(file)!==root)fail('blob escapes output');return file;}
  for(const owner of plan.backings){const row=rows.find(r=>r.id===owner.id),bytes=await readFile(await filename(row));if(bytes.length!==row.length||sha(bytes)!==row.sha256||[...buffers.values()].some(previous=>backingOverlaps(bytes,previous)))fail('backing blob length/hash/physical alias');buffers.set(row.id,bytes);}
  for(const v of plan.views){const row=rows.find(r=>r.id===v.id),bytes=v.ownerId===null?Buffer.alloc(0):buffers.get(v.ownerId).subarray(v.dataOffset,v.dataOffset+v.length);if(bytes.length!==v.length||sha(bytes)!==row.sha256)fail('child bytes/header/overlap hash differs');
    if(v.ownerId!==v.id){let length=0;const hash=createHash('sha256');for await(const chunk of createReadStream(await filename(row),{highWaterMark:65536})){length+=chunk.length;if(length>row.length)fail('child blob excess bytes');hash.update(chunk);}if(length!==row.length||hash.digest('hex')!==row.sha256)fail('child blob length/hash');}
    result.set(row.id,{...row,bytes});
  }
  return result;
}
