import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {releaseBodyAttachments} from '../src/body-attachment-release.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export const attachmentAddresses = {body: 0x60000, particles: 0x70000, scripts: 0x80000, bucket: 0x50000, bands: 0x40000, stack: 0x9000};

export function createBodyAttachmentReleaseFixture(fixture = 0) {
  const memory = Buffer.alloc(0xa00000), a = attachmentAddresses, body = a.body;
  put(memory, 0x80f20c, [0, 1, 2, 4, 6, 7, 72][fixture % 7]);
  put(memory, 0x80f210, [0, 1, 62, 63, 64][fixture % 5]);
  put(memory, 0x9092b4, a.scripts); put(memory, 0x902eec, a.particles);
  for (let index = 0; index < 64; index++) put(memory, 0x80f420 + index * 4, index * 71);
  for (let sector = 0; sector < 3; sector++) put(memory, 0x80f220 + sector * 4, a.bands + sector * 0x1000);
  for (let id = 0; id < 6; id++) {
    const light = id + 1, address = 0x80f520 + light * 64, particle = a.particles + id * 128;
    word(memory, address + 0x24, id + 1);
    for (let range = 0; range < 4; range++) {
      const sector = range % 3, band = id * 4 + range, packed = (band << 24) | (band << 12) | sector;
      put(memory, address + 20 + range * 4, range > fixture % 5 ? 0 : packed);
      const start = a.bands + sector * 0x1000 + band * 32;
      for (let slot = 0; slot < 8; slot++) put(memory, start + slot * 4, slot === (fixture + range) % 8 ? (light << 22) | (id * 13 + range + 1) : 0);
    }
    put(memory, 0x80e660 + id * 4, particle);
    word(memory, particle + 4, id === 5 ? 0 : id + 2);
    word(memory, particle + 6, id ? id : 0);
    put(memory, particle + 12, a.bucket | (fixture & 1));
    memory[particle + 0x94] = 1; put(memory, particle + 0xb0, 0x12340000 | id);
    word(memory, a.scripts + id * 2, [0, 1, 15, 0x8000, 0xffff, 0x1234][(fixture + id) % 6]);
  }
  word(memory, a.bucket + 10, 1);
  const types = [1, 2, 5, 3, 4, 6, 15, 0];
  for (let index = 0; index < 5; index++) word(memory, body + 0x16a + index * 2, (types[(fixture + index * 3) % types.length] << 12) | ((fixture + index) % 6));
  let alias = 'none';
  if (fixture % 3 === 0) {
    const variant = Math.floor(fixture / 3) % 8;
    // Each alias has valid native storage; later handles remain live inputs.
    for (let index = 0; index < 5; index++) word(memory, body + 0x16a + index * 2, [0x5000, 0x1000, 0x2000, 0xf003, 0][index]);
    if (variant === 0) {put(memory, 0x9092b4, body + 0x16c); alias = 'script-next-handle';}
    if (variant === 1) {put(memory, 0x9092b4, 0x80f20c); alias = 'script-captured-light-count';}
    if (variant === 2) {put(memory, 0x9092b4, 0x80f544 + 64); alias = 'script-light-kind';}
    if (variant === 3) {put(memory, 0x9092b4, 0x80f534 + 64); alias = 'script-light-range';}
    if (variant === 4) {put(memory, a.particles + 12, body + 0x160); alias = 'particle-bucket-head-handles';}
    if (variant === 5) {
      // Light removal zeroes the next pair of handles through a band cell.
      word(memory, body + 0x16a, 0x1000); put(memory, body + 0x16c, (1 << 22) | 0x2000);
      put(memory, 0x80f534 + 64, 1 << 24 | 1 << 12); put(memory, 0x80f538 + 64, 0);
      put(memory, 0x80f220, body + 0x16c - 32); alias = 'light-band-next-handles';
    }
    if (variant === 6) {put(memory, 0x9092b4, 0x80f420); alias = 'script-dirty-queue';}
    if (variant === 7) {put(memory, 0x9092b4, a.particles + 6); alias = 'script-particle-previous';}
  }
  return {memory, body, alias};
}

export async function verifyBodyAttachmentRelease({fixtures = 2400, output = 'analysis/body-attachment-release-instruction-check.json'} = {}) {
  const directory = 'analysis/native-simulation/results';
  const {instructions, evidence} = await readInstructionEvidence(['1250-light-free-reuse-assembly.json', '1167-dynamic-stage-remove-assembly.json', '118-particle-removal-assembly.json'], {directory});
  const reply = JSON.parse(await readFile(`${directory}/1451-attachment-release-switch.json`, 'utf8')), table = reply.structuredContent;
  assert.equal(table.subject.digest.sha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  const machine = new BoundedX86(instructions), visits = new Map(), aliases = {};
  machine.onInstruction = address => {if (address === 0x44d6a0 || address === 0x4748d0) visits.set(address, (visits.get(address) ?? 0) + 1);};
  let steps = 0;
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createBodyAttachmentReleaseFixture(fixture);
    Buffer.from(table.normalized_result.bytes_hex, 'hex').copy(source.memory, Number(table.normalized_result.address));
    machine.reset(); source.memory.copy(machine.bytes);
    releaseBodyAttachments(source.body, source);
    machine.entry = 0x44ef90; machine.r.ECX = source.body; machine.r.ESP = attachmentAddresses.stack; put(machine.bytes, attachmentAddresses.stack, -1);
    steps += machine.run(100000);
    const native = machine.bytes.subarray(0x10000), reference = source.memory.subarray(0x10000);
    if (!native.equals(reference)) {
      const offset = native.findIndex((value, index) => value !== reference[index]);
      assert.fail(`fixture${fixture}/${source.alias} byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${reference[offset]}`);
    }
    aliases[source.alias] = (aliases[source.alias] ?? 0) + 1;
  }
  const report = {method: 'Actual44ef90 attachment release with actual44d6a0 light range removal and4748d0 particle spatial unlink. All bytes above10000h compared, including live handles, captured light count, complete light/range/dirty/script/particle/bucket state. Explicit source-owned pool/band/body/script inputs; eight shared-storage aliases. No game callees replaced or original-process execution.', evidence: [...evidence, table].map(item => item.evidence_id), instructions: instructions.length, fixtures, aliases, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), externalCalls: 0, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyBodyAttachmentRelease()));
