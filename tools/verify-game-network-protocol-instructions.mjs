import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {readGameMicroseconds, isProtocolPeerActive, findProtocolPeer, hasProtocolRelay, retainProtocolPacket, accountProtocolSend, sendProtocolPeer, sendGameNotificationPacket, sendWormholeLaunchPacket} from '../src/game-network-protocol.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export const protocolAddresses = {stack: 0x9000, packet: 0x100000, arena: 0x180000, object: 0x190000, table: 0x190100};
export function createProtocolServiceFixture(fixture, memory) {
  const trace = []; let ticks = 0;
  const platformCall = (name, raw) => {
    const args = raw.map(v => v >>> 0); trace.push({name, args});
    if (name === 'QueryPerformanceFrequency') {memory.writeBigInt64LE([1000000n, 3579545n, 10000000n][fixture % 3], args[0]); return 1;}
    if (name === 'QueryPerformanceCounter') {memory.writeBigInt64LE(1000000000000n + BigInt(++ticks) * 123456789n, args[0]); return 1;}
    throw Error(`Unexpected platform service ${name}`);
  };
  const networkCall = (object, method, raw) => {const args = raw.map(v => v >>> 0); trace.push({name: 'network', object: object >>> 0, method, args}); if (method === 0x6c) return 2; if (method !== 0x50) throw Error('Unexpected network method.'); word(memory, args[0] + 2, memory.readUInt16LE(args[0] + 2) + (fixture % 3)); return fixture % 7 === 3 ? 0 : 0x1234;};
  return {trace, services: {platformCall, networkCall}};
}
export function createProtocolFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const a = protocolAddresses; memory.fill(0x69, a.stack - 0x2000, a.stack + 128); memory.fill(0x93, a.arena, a.arena + 2048);
  put(memory, 0x6e9f70, fixture % 13 === 0 ? -2 : fixture % 11 === 0 ? -1 : 0); put(memory, 0x6e9f6c, fixture % 17 === 0 ? -1 : fixture & 1); put(memory, 0x6e9f74, 0x77777777); put(memory, 0x6e9f78, 0x22222222);
  for (let i = 0; i < 6; i++) {const p = 0x6e7880 + i * 0x67c; put(memory, p, fixture % 5 === 1 && i ? 0 : 1); put(memory, p + 12, 0x11111111 + i); put(memory, p + 16, 0x22222222 + i);}
  put(memory, 0x6eafe0, [0, 1, 0x81, 0x87, 0x87, 0x87, 0x87][fixture % 7]); put(memory, 0x6e6d10, fixture % 19 === 0 ? 0 : a.object); put(memory, a.object, a.table); put(memory, a.table + 0x50, 0xa20000); put(memory, a.table + 0x6c, 0xa20004);
  word(memory, 0x6e6d14, fixture * 7919); memory[0x6e65db] = fixture * 53; memory[0x6eaecc] = fixture % 32;
  put(memory, 0x6eaed0, a.arena); put(memory, 0x6eaed4, a.arena + 2048); put(memory, 0x6eaed8, a.arena + (fixture % 3 ? 0 : 2032));
  put(memory, 0x6e6c8c, fixture & 1); memory.writeBigInt64LE(3579545n, 0x7135a4); memory.writeBigInt64LE(999000000000n, 0x7135ac);
  for (let i = 0; i < 100; i++) put(memory, 0x6e9f7c + i * 28, fixture % 11 === 0 || i < fixture % 6 ? 1 : 0);
  for (let i = 0; i < 256; i++) memory[a.packet + i] = (fixture * 31 + i * 17) & 255; memory[a.packet] = 0x91;
  for (let i = 0; i < 20; i++) memory[0x6f2424 + i] = i * 7;
  return {memory, scratchBase: a.stack};
}
export function installProtocolInstructionServices(machine, native) {
  for (const [address, op] of [[0x568f10, 'mul'], [0x569380, 'sdiv'], [0x5689e0, 'udiv']]) machine.externalCalls.set(address, m => {const left = op === 'udiv' ? m.bytes.readBigUInt64LE(m.r.ESP) : m.bytes.readBigInt64LE(m.r.ESP), right = op === 'udiv' ? m.bytes.readBigUInt64LE(m.r.ESP + 8) : m.bytes.readBigInt64LE(m.r.ESP + 8), value = BigInt.asUintN(64, op === 'mul' ? left * right : left / right); m.r.EAX = Number(value & 0xffffffffn) | 0; m.r.EDX = Number(value >> 32n) | 0; m.r.ESP += 16;});
  for (const [address, name] of [[0xa20010, 'QueryPerformanceFrequency'], [0xa20014, 'QueryPerformanceCounter']]) machine.externalCalls.set(address, m => {m.r.EAX = native.services.platformCall(name, [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});
  for (const [address, method, count] of [[0xa20000, 0x50, 17], [0xa20004, 0x6c, 10]]) machine.externalCalls.set(address, m => {m.r.EAX = native.services.networkCall(m.r.ECX, method, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))); m.r.ESP += count * 4;});
}
export async function verifyGameNetworkProtocol({fixtures = 3600, output = 'analysis/game-network-protocol-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), a = protocolAddresses;
  const own = await readInstructionEvidence(['174-notification-send-assembly.json', '3169-wormhole-local-packet-send-assembly.json', '3175-wormhole-packet-peer-selector-assembly.json', '3177-wormhole-packet-send-peer-assembly.json', '3189-wormhole-pending-packet-record-assembly.json', '3191-wormhole-failed-peer-policy-assembly.json', '3193-wormhole-send-peer-accounting-assembly.json', '3417-wormhole-network-relay-guard-assembly.json', '3419-wormhole-network-peer-index-assembly.json', '3442-wormhole-network-489cd0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0, cookies = 0, calls = 0; const reached = new Set(), visits = {}, entries = [0x489cd0, 0x46ffd0, 0x49f4b0, 0x46fff0, 0x4a00c0, 0x49fa20, 0x4a0210, 0x4a0420, 0x4710f0];
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  //True CRT/compiler arithmetic: operands are full64-bit little endian.
  for (const [address, op] of [[0x568f10, 'mul'], [0x569380, 'sdiv'], [0x5689e0, 'udiv']]) machine.externalCalls.set(address, m => {const left = op === 'udiv' ? m.bytes.readBigUInt64LE(m.r.ESP) : m.bytes.readBigInt64LE(m.r.ESP), right = op === 'udiv' ? m.bytes.readBigUInt64LE(m.r.ESP + 8) : m.bytes.readBigInt64LE(m.r.ESP + 8), value = BigInt.asUintN(64, op === 'mul' ? left * right : left / right); m.r.EAX = Number(value & 0xffffffffn) | 0; m.r.EDX = Number(value >> 32n) | 0; m.r.ESP += 16;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createProtocolFixture(fixture, memory), selector = fixture % 9, entry = entries[selector], js = createProtocolServiceFixture(fixture, memory); runtime.services = js.services;
    put(memory, 0x56e114, 0xa20010); put(memory, 0x56e0fc, 0xa20014); machine.reset(); memory.copy(machine.bytes); const native = createProtocolServiceFixture(fixture, machine.bytes);
    for (const [address, name] of [[0xa20010, 'QueryPerformanceFrequency'], [0xa20014, 'QueryPerformanceCounter']]) machine.externalCalls.set(address, m => {m.r.EAX = native.services.platformCall(name, [m.bytes.readUInt32LE(m.r.ESP)]); m.r.ESP += 4;});
    for (const [address, method, count] of [[0xa20000, 0x50, 17], [0xa20004, 0x6c, 10]]) machine.externalCalls.set(address, m => {m.r.EAX = native.services.networkCall(m.r.ECX, method, Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4))); m.r.ESP += count * 4;});
    let ecx = 0, edx = 0, args = [], result;
    const length = [0, 1, 2, 3, 7, 8, 15, 32, 96][Math.floor(fixture / 9) % 9], flags = [0, 2, 4, 8, 18, 32][Math.floor(fixture / 81) % 6];
    try {
      if (selector === 0) result = readGameMicroseconds(runtime);
      else if (selector === 1) {ecx = [-1, 0, 1, 5, 6][Math.floor(fixture / 9) % 5]; result = isProtocolPeerActive(ecx, runtime);}
      else if (selector === 2) {args = [0x11111111 + fixture % 8, 0x22222222 + fixture % 8]; result = findProtocolPeer(...args, runtime);}
      else if (selector === 3) {ecx = fixture % 7; result = hasProtocolRelay(ecx, runtime);}
      else if (selector === 4) {ecx = fixture % 8; edx = a.packet; args = [1, 2, 3, 4, fixture % 23 === 0 ? 4096 : length]; result = retainProtocolPacket(ecx, edx, ...args, runtime);}
      else if (selector === 5) {ecx = fixture * 7919; edx = fixture * 731; args = [1, 2, 0x76543210, flags]; result = accountProtocolSend(ecx, edx, ...args, runtime);}
      else if (selector === 6) {ecx = a.packet; edx = length; args = [0x11111111, 0x22222222, flags]; result = sendProtocolPeer(ecx, edx, ...args, runtime);}
      else if (selector === 7) {ecx = Math.floor(fixture / 9) % 4; edx = a.packet; args = [length, flags & ~16]; result = sendGameNotificationPacket(ecx, edx, ...args, runtime);}
      else {ecx = fixture % 8; edx = Math.floor(fixture / 9) % 3; args = [7, a.packet, length]; result = sendWormholeLaunchPacket(ecx, edx, ...args, runtime);}
      machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); args.forEach((v, i) => put(machine.bytes, a.stack + 4 + i * 4, v)); machine.run(3_000_000); calls++;
      if (typeof result === 'bigint') {assert.equal(BigInt.asIntN(64, BigInt(machine.r.EDX >>> 0) << 32n | BigInt(machine.r.EAX >>> 0)), result);} else assert.equal(machine.r.EAX >>> 0, result >>> 0);
      assert.deepEqual(native.trace, js.trace, `services${fixture}`);
      const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`fixture${fixture}/entry${entry.toString(16)} byte0x${(offset + 0x10000).toString(16)} native${actual[offset]} JS${expected[offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16), trace: {native: native.trace, js: js.trace}}); throw error;}
  }
  const report = {method: 'Actual4710f0 launch packet→4a0420→4a0210 headers/peer/broadcast/pending-ring/accounting,46ffd0/49f4b0/46fff0 selection,49fcd0 failed-peer status below retirement, and full489cd0 game performance clock arithmetic. All mapped data>=10000h and exact ordered platform/network requests compared. Real external services are performance counter/frequency, virtual imported network send/status, compiler cookies and CRT64-bit arithmetic. Current explicit game gaps: local generic receiver4730d0, disconnected-peer retirement46f860 and reliable blocking49fee0. Fixtures avoid these declared boundaries; this is NOT general protocol or49ac30 closure. No original process/network execution.', targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameNetworkProtocol()));
