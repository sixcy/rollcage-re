import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createProtocolFixture, createProtocolServiceFixture, installProtocolInstructionServices, protocolAddresses as a} from './verify-game-network-protocol-instructions.mjs';
import {initializeGameNetworkProtocolTables, dispatchLocalProtocolPacket, receiveWormholeProtocolPacket} from '../src/game-network-protocol.mjs';
import {checksumNotificationPacket} from '../src/vehicle-auxiliary-input.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export async function verifyWormholeProtocolReceiver({fixtures = 1200, output = 'analysis/wormhole-protocol-receiver-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), own = await readInstructionEvidence(['3173-wormhole-packet-checksum-stage-assembly.json', '3187-wormhole-local-packet-dispatch-assembly.json', '3421-wormhole-network-remove-active-assembly.json', '3423-wormhole-network-reply-assembly.json', '3427-wormhole-network-corrupt-packet-assembly.json', '3456-wormhole-network-489450-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0, cookies = 0; const reached = new Set(), visits = {}, watched = [0x4a01d0, 0x4730d0, 0x470030, 0x49df90, 0x4a03d0, 0x4a0210, 0x4a0420, 0x46f6d0];
  machine.onInstruction = p => {steps++; reached.add(p); if (watched.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;}; machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createProtocolFixture(fixture, memory); initializeGameNetworkProtocolTables(memory); put(memory, 0x56e114, 0xa20010); put(memory, 0x56e0fc, 0xa20014);
    const tag = [0x91, 0xac, 0x99, 0x9a, 0xae, 0x86][fixture % 6], length = tag === 0x9a ? 272 : tag === 0xae ? 32 : tag === 0x91 ? 108 : 12, local = fixture & 1 ? -1 : 0;
    put(memory, 0x6e9f70, local); put(memory, 0x6eafe0, [0x87, 0xc7][Math.floor(fixture / 6) & 1]); memory[a.packet] = tag; put(memory, a.packet + 8, tag === 0x91 ? (96 << 15 | 7 << 10 | (fixture % 12 ? 0 : 31)) : 1);
    if (tag === 0xae) {memory.write('wormhole update', a.packet + 8); memory[a.packet + 23] = 0; for (let i = 0; i < 4; i++) {memory.write(`old${i}`, 0x6eaedc + i * 65); memory[0x6eaedc + i * 65 + 4] = 0;}}
    put(memory, 0x80b5e0, 0x210000); put(memory, 0x210198, 0x214000); word(memory, 0x21465e, 1); put(memory, 0x210188, [0, 1, 16, 128][Math.floor(fixture / 12) % 4]); put(memory, 0x210180, 99);
    const row = fixture % 4 ? 0 : -1; put(memory, 0x6e787c, row); put(memory, 0x6e6e28, fixture % 5 ? 1 : 0); for (let i = 1; i < 66; i++) put(memory, 0x6e6e28 + i * 4, fixture * 713 + i);
    put(memory, a.packet + 4, checksumNotificationPacket(a.packet, length, runtime)); if (fixture % 7 === 3) memory[a.packet + 4]++;
    const js = createProtocolServiceFixture(fixture, memory); runtime.services = js.services; machine.reset(); memory.copy(machine.bytes); const native = createProtocolServiceFixture(fixture, machine.bytes); installProtocolInstructionServices(machine, native);
    const localDispatch = Math.floor(fixture / 6) % 3 === 0, low = localDispatch ? memory.readUInt32LE(0x6e9f74) : 0x11111111, high = localDispatch ? memory.readUInt32LE(0x6e9f78) : 0x22222222;
    try {
      if (localDispatch) dispatchLocalProtocolPacket(a.packet, length, runtime); else receiveWormholeProtocolPacket(a.packet, length, low, high, runtime);
      machine.entry = localDispatch ? 0x4a01d0 : 0x4730d0; machine.r.ECX = a.packet; machine.r.EDX = length; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, low); put(machine.bytes, a.stack + 8, high); machine.run(3_000_000);
      assert.deepEqual(native.trace, js.trace, `services${fixture}`); const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`fixture${fixture}/tag${tag.toString(16)} byte0x${(offset + 0x10000).toString(16)} native${actual[offset]} JS${expected[offset]}`);}
    } catch (error) {console.error({fixture, tag: tag.toString(16), localDispatch, trace: {native: native.trace, js: js.trace}}); throw error;}
  }
  const report = {method: 'Actual4730d0 selected wormhole-domain receiver paths91(local/self or out-of-range activation),ac transport completion,99 snapshot request,9a snapshot accept,ae history, outside-range default and corrupt checksum470030;4a01d0 local checksum dispatch and actual relay/reply/send/accounting/clock descendants. All mapped memory>=10000h and ordered imported network/performance requests compared. No game handler mocks. Valid nonlocal91→47be20 and general unrelated tags are explicitly outside this proof, as are failed-peer retirement/reliable wait. No original process/network execution.', targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWormholeProtocolReceiver()));
