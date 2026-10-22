//Preserve exact Listing decodes for the installed46e470 callback, which the
//provider does not classify as a procedure. No guessed disassembly/functions.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';
const directory = 'analysis/native-simulation', base = 0x46e470;
const bytesEvidence = JSON.parse(await readFile(`${directory}/results/1285-script-filter-bytes.json`, 'utf8')).structuredContent;
assert.equal(bytesEvidence.subject.digest.sha256, REDUX_SHA256);
const bytes = Buffer.from(bytesEvidence.normalized_result.bytes_hex, 'hex'), instructions = [], evidence = [];
for (let address = base, index = 0; ; index++) {
  assert(index < 64 && address < base + bytes.length, 'bounded callback span');
  const name = `${1380 + index}-scripted-later-filter-instruction${index ? `-${address.toString(16)}` : ''}.json`;
  let reply;
  try {reply = JSON.parse(await readFile(`${directory}/results/${name}`, 'utf8'));} catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(`${directory}/requests/${name}`, JSON.stringify({tool: 'inspect_native_instruction', arguments: {address: `0x${address.toString(16)}`}}), {flag: 'wx'});
    const deadline = Date.now() + 120000;
    for (;;) {
      try {reply = JSON.parse(await readFile(`${directory}/results/${name}`, 'utf8')); break;} catch (error) {if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;}
      if (Date.now() > deadline) throw Error(`Waiting for existing provider reply${name}; do not restart solely on observation timeout.`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  const record = reply.structuredContent;
  assert.equal(record.subject.digest.sha256, REDUX_SHA256); assert.equal(record.operation, 'inspect_native_instruction');
  const decoded = record.normalized_result;
  assert.equal(decoded.status, 'decoded'); assert.equal(Number(decoded.address), address); assert(decoded.length > 0);
  assert.equal(bytes.subarray(address - base, address - base + decoded.length).toString('hex'), decoded.bytes.toLowerCase());
  instructions.push({address, op: decoded.mnemonic.toUpperCase(), args: decoded.operands.map(item => item.raw), bytes: decoded.bytes, length: decoded.length, flow: decoded.flow, evidence: record.evidence_id});
  evidence.push({path: `${directory}/results/${name}`, evidence: record.evidence_id});
  address += decoded.length;
  if (decoded.mnemonic.toUpperCase() === 'RET') break;
}
const end = instructions.at(-1).address + instructions.at(-1).length;
for (const item of instructions) if (item.op.startsWith('J')) for (const target of item.flow.direct_destinations ?? []) assert(instructions.some(row => row.address === Number(typeof target === 'string' ? target : target.address)), `internal branch${JSON.stringify(target)}`);
const report = {method: 'Exact provider Listing instruction decodes, linearly from known pointer-installed46e470 callback through firstRET. Every byte independently agrees with retained1285 full byte read under the selectedReduxSHA. Branch destinations must resolve to admitted instruction boundaries. This is a derived instruction carrier, not fabricated procedure_assembly Evidence, and not an implementation/runtime/completeness claim.', targetSha256: REDUX_SHA256, start: base, end, byteEvidence: bytesEvidence.evidence_id, evidence, instructions};
await writeFile('analysis/scripted-collision-filter-instructions.json', JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({instructions: instructions.length, bytes: end - base, start: `0x${base.toString(16)}`, end: `0x${end.toString(16)}`, calls: instructions.filter(item => item.op === 'CALL').map(item => item.args)}));
