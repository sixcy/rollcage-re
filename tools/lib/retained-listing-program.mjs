import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REDUX_SHA256} from './retained-native-program.mjs';

// Admit exact Listing decodes independently of Ghidra's procedure inventory.
export async function loadRetainedListing(manifestPath, bytesPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.targetSha256, REDUX_SHA256);
  const bytesReply = JSON.parse(await readFile(bytesPath, 'utf8')), bytesEvidence = bytesReply.structuredContent;
  assert.equal(bytesEvidence.subject.digest.sha256, REDUX_SHA256); assert.equal(bytesEvidence.operation, 'read_bytes');
  const raw = bytesEvidence.normalized_result, bytes = Buffer.from(raw.bytes_hex, 'hex'), base = Number(raw.address);
  assert.notEqual(raw.complete, false);
  assert.equal(bytes.length, raw.returned_bytes); assert.equal(raw.requested_bytes, raw.returned_bytes);
  const instructions = [], evidence = [bytesEvidence.evidence_id], flows = new Map();
  for (const reference of manifest.instructions) {
    const reply = JSON.parse(await readFile(reference.file, 'utf8')), record = reply.structuredContent, n = record.normalized_result;
    assert(!reply.isError); assert.equal(record.evidence_id, reference.evidenceId); assert.equal(record.subject.digest.sha256, REDUX_SHA256);
    assert.equal(record.operation, 'inspect_native_instruction'); assert.equal(n.status, 'decoded'); assert.equal(n.address, reference.address);
    const address = Number(n.address); assert(Number.isInteger(n.length) && n.length > 0); assert(address >= base && address + n.length <= base + bytes.length);
    assert.equal(bytes.subarray(address - base, address - base + n.length).toString('hex'), n.bytes.toLowerCase());
    assert(!flows.has(address)); flows.set(address, n);
    instructions.push({address, op: n.mnemonic.toUpperCase(), args: n.operands.map(operand => operand.raw)}); evidence.push(record.evidence_id);
  }
  assert(flows.has(Number(manifest.entry)));
  const jumpTables=new Map();
  for(const reference of manifest.jumpTablesEvidence??(manifest.jumpTableEvidence?[manifest.jumpTableEvidence]:[])){
    const record=JSON.parse(await readFile(reference.file,'utf8')).structuredContent;
    assert.equal(record.evidence_id,reference.evidenceId);assert.equal(record.operation,'read_bytes');assert.equal(record.subject.digest.sha256,REDUX_SHA256);
    const raw=record.normalized_result,bytes=Buffer.from(raw.bytes_hex,'hex');assert(raw.complete&&raw.requested_bytes===raw.returned_bytes&&raw.returned_bytes%4===0);assert.equal(bytes.length,raw.returned_bytes);assert.equal(raw.address,reference.address);
    const entries=Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4));assert.deepEqual(entries,reference.entries);assert(!jumpTables.has(Number(raw.address)),'Duplicate declared jump table');jumpTables.set(Number(raw.address),{address:Number(raw.address),entries});evidence.push(record.evidence_id);
  }
  const ordered = [...flows].sort(([a], [b]) => a - b);
  for (let index = 1; index < ordered.length; index++) assert(ordered[index - 1][0] + ordered[index - 1][1].length <= ordered[index][0], 'Overlapping Listing boundaries');
  for (const [address, instruction] of flows) {
    const {flow} = instruction;
    if (flow.kind === 'jump') {
      if(flow.computed){
        const operand=instruction.operands[0]?.raw?.replace(/\s/g,''),match=/^dwordptr\[E(?:AX|BX|CX|DX|SI|DI|BP)\*0x4\+(0x[0-9a-f]+)\]$/i.exec(operand??'');
        const jumpTable=match&&jumpTables.get(Number(match[1]));assert(jumpTable,'Unproven computed jump table');
        for(const target of jumpTable.entries)assert(flows.has(target),'Missing jump-table case boundary');
      }else{
        assert(flow.direct_destinations.length);
        for (const target of flow.direct_destinations) assert(flows.has(Number(target)), 'Missing branch boundary');
      }
    }
    if (flow.kind === 'fallthrough' || flow.kind === 'call' || flow.conditional) assert(flows.has(address + instruction.length), 'Missing fallthrough boundary');
    else assert(flow.kind === 'jump' || flow.kind === 'return');
  }
  return {instructions, evidence, entry: Number(manifest.entry)};
}
