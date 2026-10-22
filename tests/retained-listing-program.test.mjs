import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readdir, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {loadRetainedListing} from '../tools/lib/retained-listing-program.mjs';
import {REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

// Synthetic provider-shaped evidence checks the admission boundary, not x86.
async function fixture(change, run) {
  const directory = await mkdtemp(join(tmpdir(), 'redux-listing-evidence-'));
  try {
    const subject = {digest: {sha256: REDUX_SHA256}}, manifest = {targetSha256: REDUX_SHA256, entry: '0x1000', instructions: []};
    const records = [
      {address: '0x1000', length: 2, bytes: '7501', mnemonic: 'JNZ', operands: [{raw: '0x1003'}], flow: {kind: 'jump', computed: false, conditional: true, direct_destinations: ['0x1003']}},
      {address: '0x1002', length: 1, bytes: '90', mnemonic: 'NOP', operands: [], flow: {kind: 'fallthrough'}},
      {address: '0x1003', length: 1, bytes: 'c3', mnemonic: 'RET', operands: [], flow: {kind: 'return'}}
    ].map((normalized_result, index) => ({evidence_id: `instruction${index}`, subject, operation: 'inspect_native_instruction', normalized_result: {status: 'decoded', ...normalized_result}}));
    const bytes = {subject, operation: 'read_bytes', normalized_result: {address: '0x1000', bytes_hex: '750190c3', returned_bytes: 4, requested_bytes: 4, complete: true}};
    for (const [index, record] of records.entries()) manifest.instructions.push({address: record.normalized_result.address, evidenceId: record.evidence_id, file: join(directory, `${index}.json`)});
    await change?.({manifest, records, bytes});
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); await writeFile(join(directory, 'bytes.json'), JSON.stringify({structuredContent: bytes}));
    for (const [index, record] of records.entries()) await writeFile(join(directory, `${index}.json`), JSON.stringify({structuredContent: record}));
    await run(() => loadRetainedListing(join(directory, 'manifest.json'), join(directory, 'bytes.json')));
  } finally {for (const name of await readdir(directory)) await unlink(join(directory, name)); await rmdir(directory);}
}

test('Listing loader admits exact bytes and both conditional successors without a procedure identity', async () => {
  await fixture(null, async load => {const result = await load(); assert.equal(result.entry, 0x1000); assert.equal(result.instructions.length, 3);});
});

test('Listing loader rejects modified raw instruction bytes and incomplete byte carriers', async () => {
  await fixture(({records}) => {records[1].normalized_result.bytes = 'cc';}, load => assert.rejects(load));
  await fixture(({bytes}) => {bytes.normalized_result.complete = false;}, load => assert.rejects(load));
});

test('Listing loader rejects a missing branch target or fallthrough boundary', async () => {
  await fixture(({manifest}) => {manifest.instructions.pop();}, load => assert.rejects(load, /Missing branch boundary/));
  await fixture(({manifest}) => {manifest.instructions.splice(1, 1);}, load => assert.rejects(load, /Missing fallthrough boundary/));
});

test('Listing loader rejects changed evidence identity and target digest', async () => {
  await fixture(({records}) => {records[1].evidence_id = 'replacement';}, load => assert.rejects(load));
  await fixture(({records}) => {records[1].subject = {digest: {sha256: '0'.repeat(64)}};}, load => assert.rejects(load));
});

test('Listing loader admits multiple exact ECX/EAX dispatch tables and rejects an undeclared interior base', async () => {
  for (const undeclared of [false, true]) await fixture(async ({manifest, records, bytes}) => {
    const decoded = [
      {address: '0x1000', length: 7, bytes: 'ff248d00200000', mnemonic: 'JMP', operands: [{raw: `dword ptr [ECX*0x4 + ${undeclared ? '0x2004' : '0x2000'}]`}], flow: {kind: 'jump', computed: true, conditional: false, direct_destinations: []}},
      {address: '0x1007', length: 1, bytes: 'c3', mnemonic: 'RET', operands: [], flow: {kind: 'return'}},
      {address: '0x1008', length: 7, bytes: 'ff248500210000', mnemonic: 'JMP', operands: [{raw: 'dword ptr [EAX*0x4 + 0x2100]'}], flow: {kind: 'jump', computed: true, conditional: false, direct_destinations: []}}
    ];
    for (let i = 0; i < records.length; i++) {records[i].normalized_result = {status: 'decoded', ...decoded[i]}; manifest.instructions[i].address = decoded[i].address;}
    Object.assign(bytes.normalized_result, {bytes_hex: decoded.map(i => i.bytes).join(''), returned_bytes: 15, requested_bytes: 15});
    manifest.jumpTablesEvidence = [];
    for (const [i, address, entries] of [[0, '0x2000', [0x1007, 0x1008]], [1, '0x2100', [0x1007]]]) {
      const file = join(dirname(manifest.instructions[0].file), `table${i}.json`), evidenceId = `table${i}`, data = Buffer.alloc(entries.length * 4); entries.forEach((v, j) => data.writeUInt32LE(v, j * 4));
      await writeFile(file, JSON.stringify({structuredContent: {evidence_id: evidenceId, subject: bytes.subject, operation: 'read_bytes', normalized_result: {address, complete: true, requested_bytes: data.length, returned_bytes: data.length, bytes_hex: data.toString('hex')}}}));
      manifest.jumpTablesEvidence.push({file, evidenceId, address, entries});
    }
  }, async load => {
    if (undeclared) await assert.rejects(load, /Unproven computed jump table/);
    else {const result = await load(); assert.equal(result.instructions.length, 3); assert(result.evidence.includes('table0')); assert(result.evidence.includes('table1'));}
  });
});
