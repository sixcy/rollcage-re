// Traverse retained Ghidra Listing flow through an already-running REA queue.
// This never launches or restarts a provider and never creates a procedure.
import assert from 'node:assert/strict';
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const [entryText, endText, prefix, firstIdText, output, jumpTablePath] = process.argv.slice(2);
if (!output) throw Error('Arguments: entry end-exclusive queue-prefix first-id NEW-output.json');
const entry = Number(entryText), end = Number(endText), firstId = Number(firstIdText);
assert(Number.isInteger(entry) && end > entry && Number.isInteger(firstId));
assert(/^[a-z0-9-]+$/.test(prefix));
const directory = 'analysis/native-simulation', pending = new Map(), decoded = new Map();
let nextId = firstId;
const existing = new Map();
for(const file of await readdir(`${directory}/requests`)){
  const match=/^(\d+)-([a-z0-9-]+)-(?:0x)?([0-9a-f]+)\.json$/.exec(file);
  if(match&&match[2]===prefix){existing.set(Number(`0x${match[3]}`),file);nextId=Math.max(nextId,Number(match[1])+1);}
}
async function enqueue(address) {
  assert(address >= entry && address < end, `Flow leaves declared range: ${address.toString(16)}`);
  if (pending.has(address) || decoded.has(address)) return;
  const name = existing.get(address)??`${nextId++}-${prefix}-${address.toString(16)}.json`;
  if(!existing.has(address))await writeFile(`${directory}/requests/${name}`, JSON.stringify({tool: 'inspect_native_instruction', arguments: {address: `0x${address.toString(16)}`}}, null, 2), {flag: 'wx'});
  else{const request=JSON.parse(await readFile(`${directory}/requests/${name}`,'utf8'));assert.equal(request.tool,'inspect_native_instruction');assert.equal(Number(request.arguments.address),address);}
  pending.set(address, name);
}
await enqueue(entry);
const jumpTablesEvidence=[];
for(const tablePath of jumpTablePath?.split(',')??[]){
  const reply=JSON.parse(await readFile(tablePath,'utf8')),record=reply.structuredContent;
  assert.equal(record.operation,'read_bytes');assert.equal(record.subject.digest.sha256,REDUX_SHA256);
  const raw=record.normalized_result;assert(raw.complete&&raw.requested_bytes===raw.returned_bytes&&raw.returned_bytes%4===0);
  const bytes=Buffer.from(raw.bytes_hex,'hex');assert.equal(bytes.length,raw.returned_bytes);
  const entries=Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4));
  for(const address of new Set(entries))await enqueue(address);
  assert(!jumpTablesEvidence.some(table=>Number(table.address)===Number(raw.address)),'Duplicate declared jump table');
  jumpTablesEvidence.push({file:tablePath,evidenceId:record.evidence_id,address:raw.address,entries});
}
while (pending.size) {
  let progressed = false;
  for (const [address, name] of [...pending]) {
    let reply;
    try {reply = JSON.parse(await readFile(`${directory}/results/${name}`, 'utf8'));}
    catch (error) {if (error.code === 'ENOENT' || error instanceof SyntaxError) continue; throw error;}
    assert(!reply.isError, `${name}: provider error`);
    const evidence = reply.structuredContent ?? JSON.parse(reply.content.find(item => item.type === 'text').text);
    assert.equal(evidence.subject.digest.sha256, REDUX_SHA256);
    assert.equal(evidence.operation, 'inspect_native_instruction');
    const instruction = evidence.normalized_result;
    assert.equal(instruction.status, 'decoded', name); assert.equal(Number(instruction.address), address);
    assert(instruction.length > 0 && address + instruction.length <= end, name);
    assert.equal(Buffer.from(instruction.bytes, 'hex').length, instruction.length);
    decoded.set(address, {file: `${directory}/results/${name}`, evidenceId: evidence.evidence_id, ...instruction});
    pending.delete(address); progressed = true;
    const {flow} = instruction, next = address + instruction.length;
    if (flow.kind === 'jump') {
      if(flow.computed){
        const operand=instruction.operands[0]?.raw?.replace(/\s/g,''),match=/^dwordptr\[E(?:AX|BX|CX|DX|SI|DI|BP)\*0x4\+(0x[0-9a-f]+)\]$/i.exec(operand??'');
        const table=match&&jumpTablesEvidence.find(table=>Number(table.address)===Number(match[1]));
        assert(table,`Unresolved jump: ${instruction.address}`);
        for(const target of new Set(table.entries))await enqueue(target);
      }else{
        assert(flow.direct_destinations.length, `Unresolved jump: ${instruction.address}`);
        for (const target of flow.direct_destinations) await enqueue(Number(target));
      }
      if (flow.conditional) await enqueue(next);
    } else if (flow.kind === 'fallthrough' || flow.kind === 'call') await enqueue(next);
    else assert.equal(flow.kind, 'return', `Unsupported terminal flow at ${instruction.address}`);
  }
  if (progressed && decoded.size % 20 === 0) console.log(JSON.stringify({decoded: decoded.size, pending: pending.size, nextId}));
  if (!progressed) await setTimeout(200);
}
const instructions = [...decoded.values()].sort((a, b) => Number(a.address) - Number(b.address));
for (let index = 1; index < instructions.length; index++) assert(Number(instructions[index - 1].address) + instructions[index - 1].length <= Number(instructions[index].address), 'Overlapping Listing instructions');
const report = {method: 'Exact Ghidra Listing flow traversal of a caller-selected address range; direct jumps and fallthrough traversed, call bodies excluded. Optional seeds come from every original dword in independently retained complete jump-table reads (comma-separated paths). Every computed register-times4 jump requires an exact matching declared table base. Existing exact-address requests may be resumed without restarting the provider or rewriting evidence. Original per-instruction Evidence references retained. No synthetic procedure identity, binary annotation or process execution.', targetSha256: REDUX_SHA256, entry: entryText, endExclusive: endText, firstId, nextId, ...(jumpTablesEvidence.length===1?{jumpTableEvidence:jumpTablesEvidence[0]}:jumpTablesEvidence.length?{jumpTablesEvidence}:{}), instructions};
await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({output, instructions: instructions.length, nextId}));
