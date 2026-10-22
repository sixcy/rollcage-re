import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadRetainedNativeProgram,REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

//Synthetic provider-shaped carriers validate the evidence loader, not gamecode.
async function fixture(records,run) {
 const directory=await mkdtemp(join(tmpdir(),'redux-retained-program-'));
 try {
  for(const [i,record]of records.entries())await writeFile(join(directory,`${i}.json`),JSON.stringify({structuredContent:{subject:{digest:{sha256:REDUX_SHA256}},...record}}));
  return await run(()=>loadRetainedNativeProgram({directories:[directory],memorySize:64}));
 }finally{for(const name of await readdir(directory))await unlink(join(directory,name));await rmdir(directory);}
}
const assembly=(id,text)=>({evidence_id:id,operation:'procedure_assembly',normalized_result:text});
const bytes=(id,address,hex,complete=true)=>({evidence_id:id,operation:'read_bytes',normalized_result:{address,bytes_hex:hex,returned_bytes:hex.length/2,complete}});

test('retained loader combines agreeing instructions and overlapping literal bytes without executing them',async()=>{
 await fixture([assembly('a','0x10: MOV EAX, 0x7\n0x11: RET'),assembly('b','0x11: RET'),bytes('c','0x20','010203'),bytes('d','0x22','0304')],async load=>{
  const result=await load(),memory=Buffer.alloc(64,0x69);result.initializeMemory(memory);
  assert.equal(result.instructions.length,2);assert.equal(result.references.length,4);assert.deepEqual([...memory.subarray(31,37)],[0x69,1,2,3,4,0x69]);
 });
});
test('retained loader rejects wrong target identities and changed contents under the same Evidence ID',async()=>{
 await fixture([{...assembly('a','0x10: RET'),subject:{digest:{sha256:'0'.repeat(64)}}}],async load=>assert.rejects(load,/target digest mismatch/));
 await fixture([assembly('a','0x10: RET'),assembly('a','0x10: NOP')],async load=>assert.rejects(load,/Conflicting retained Evidence identity/));
});
test('retained loader rejects incompatible disassembly and byte reads',async()=>{
 await fixture([assembly('a','0x10: RET'),assembly('b','0x10: NOP')],async load=>assert.rejects(load,/Conflicting retained instruction/));
 await fixture([bytes('a','0x20','0102'),bytes('b','0x21','03')],async load=>assert.rejects(load,/Conflicting retained byte/));
});
test('retained loader skips incomplete byte reads and rejects out-of-memory spans',async()=>{
 await fixture([bytes('a','0x20','01',false)],async load=>{const result=await load();assert.equal(result.tables.length,0);assert.equal(result.skipped.length,1);});
 await fixture([bytes('a','0x3f','0102')],async load=>assert.rejects(load,/exceeds declared memory/));
});
