// Staged proof; no changes to the source/evidence set under aggregate testing.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from '../lib/bounded-x86.mjs';
import {loadRetainedNativeProgram, REDUX_SHA256} from '../lib/retained-native-program.mjs';
import {discoverGameRootName} from './root-name-discovery.mjs';

const target = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const binary = await readFile(target);
assert.equal(createHash('sha256').update(binary).digest('hex'), REDUX_SHA256);
const pe = binary.readUInt32LE(0x3c), optional = pe + 24;
assert.equal(binary.readUInt32LE(pe), 0x4550);
assert.equal(binary.readUInt16LE(optional), 0x10b);
const imageBase = binary.readUInt32LE(optional + 28), sections = [];
for (let i = 0; i < binary.readUInt16LE(pe + 6); i++) {
  const p = optional + binary.readUInt16LE(pe + 20) + i * 40;
  sections.push({rva: binary.readUInt32LE(p + 12), rawSize: binary.readUInt32LE(p + 16), rawOffset: binary.readUInt32LE(p + 20)});
}
const rva = 0x5d3468 - imageBase, section = sections.find(s => rva >= s.rva && rva + 48 <= s.rva + s.rawSize);
assert(section);
const fileOffset = section.rawOffset + rva - section.rva, literals = binary.subarray(fileOffset, fileOffset + 48);
assert.equal(literals.length, 48);
const literalRecord = {method: 'Independent read-only original-PE byte extraction; not a provider Evidence record. Exact selected file SHA and PE section mapping retained. To be corroborated against a new REA read after the frozen sweep.', target, sha256: REDUX_SHA256, address: '0x5d3468', fileOffset, bytes_hex: literals.toString('hex')};
await writeFile('analysis/root-name-literals-independent-20261022.json', JSON.stringify(literalRecord, null, 2), {flag: 'wx'});

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions);
const S = 0x9000, HANDLE = 0x210000, SERVICE = 0x760000, fixtures = Number(process.argv[2] ?? 600);
const reached = new Set(), visits = {};
let steps = 0, totalCalls = 0, cachedReads = 0;
machine.onInstruction = address => {reached.add(address); if ([0x4797a0, 0x4795a0, 0x447d60, 0x447d20, 0x447c50].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
function services(memory, fixture) {
  const log = []; let searches = 0, creates = 0, prints = 0;
  const variant = fixture % 10, selected = fixture % 3;
  const invoke = (name, args) => {
    log.push([name, ...args.map(v => v >>> 0)]);
    switch (name) {
      case 'FindFirstFileA': {
        memory.fill(fixture + searches & 255, args[1], args[1] + 320);
        const index = searches++;
        return variant === 1 || variant === 2 && index !== 0 || variant !== 5 && index !== selected ? -1 : 0x1230 + index;
      }
      case 'FindClose': if (variant === 9) memory[0x6e6b50] = 0x60 + searches; return 1;
      case 'CreateFileA': creates++; return variant === 2 || variant === 9 || variant === 5 && creates < 3 ? -1 : HANDLE;
      case 'GetLastError': return variant === 5 ? 33 : 5;
      case 'Sleep': return 0;
      case 'ReadFile': {
        const count = fixture % 81;
        for (let i = 0; i < count; i++) memory[args[1] + i] = i === fixture % 17 ? [0, 9, 13, 127, 160][fixture % 5] : 32 + (i + fixture) % 95;
        memory.writeUInt32LE(count, args[3]);
        return variant === 6 ? 0 : 1;
      }
      case 'CloseHandle': return 1;
      case 'free': return 0;
      case 'memcpy': Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];
      case 'isprint': {
        if (variant === 8 && prints++ === 0) memory[0x6e6b51] = 9;
        return args[0] >= 32 && args[0] <= 126 || fixture & 1 && args[0] >= 160 ? 0x400 : 0;
      }
      case '__security_check_cookie': assert.equal(args[0] | 0, memory.readInt32LE(0x5e8890)); return 0;
      default: throw Error(`Unexpected root-name fixture service ${name}`);
    }
  };
  return {platformCall: invoke, libraryCall: invoke, crtCall: invoke, log};
}
const definitions = [[0x56e104, 'FindFirstFileA', 2, true], [0x56e110, 'FindClose', 1, true], [0x56e0d0, 'CreateFileA', 7, true], [0x56e0e4, 'GetLastError', 0, true], [0x56e0cc, 'Sleep', 1, true], [0x56e100, 'ReadFile', 5, true], [0x56e0bc, 'CloseHandle', 1, true], [0x56e25c, 'isprint', 1, false], [0x5e8004, 'free', 1, false]];
for (let fixture = 0; fixture < fixtures; fixture++) {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); memory.fill(0xa7, S - 0x600, S + 128);
  literals.copy(memory, 0x5d3468); memory[0x6e6660] = 0; if (!(fixture % 10)) memory.write('configured-root\0', 0x6e6660);
  memory.fill(65, 0x6e6b50, 0x6e6bb0); memory[0x6e6ba0] = 0; memory.writeUInt32LE(0xa1b2c3d4, 0x5e8890);
  memory.writeInt32LE(1, 0x6e6708); memory.fill(0, 0x90c0a0, 0x90cb60);
  if (fixture % 10 === 7) {
    memory.writeUInt32LE(HANDLE, 0x90c0a0); memory.writeUInt32LE(fixture % 7, 0x90c0a4);
    memory.fill(66, HANDLE, HANDLE + 100); memory[HANDLE + fixture % 53] = 10; cachedReads++;
  }
  definitions.forEach(([slot], i) => memory.writeUInt32LE(SERVICE + i * 16, slot));
  machine.reset(); machine.fs0 = 0x13572468; memory.copy(machine.bytes);
  const native = services(machine.bytes, fixture), source = services(memory, fixture);
  definitions.forEach(([, name, count, stdcall], i) => machine.externalCalls.set(SERVICE + i * 16, m => {
    const args = Array.from({length: count}, (_, j) => m.bytes.readUInt32LE(m.r.ESP + j * 4));
    m.r.EAX = native.platformCall(name, args) | 0; if (stdcall) m.r.ESP += count * 4;
  }));
  machine.externalCalls.set(0x568a48, m => {m.r.EAX = native.libraryCall('memcpy', Array.from({length: 3}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4)));});
  machine.externalCalls.set(0x568162, m => native.crtCall('__security_check_cookie', [m.r.ECX]));
  const result = discoverGameRootName({memory, scratchBase: S, services: source});
  machine.entry = 0x4797a0; machine.r.ESP = S; machine.bytes.writeInt32LE(-1, S); steps += machine.run(100000);
  assert.equal(machine.r.EAX >>> 0, result, `fixture${fixture} return`);
  assert.equal(machine.fs0, 0x13572468);
  const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000);
  if (!actual.equals(expected)) {const i = actual.findIndex((v, j) => v !== expected[j]); assert.fail(`fixture${fixture} byte0x${(i + 0x10000).toString(16)} native${actual[i]} source${expected[i]}`);}
  assert.deepEqual(native.log.filter(([name]) => name !== 'memcpy'), source.log, `fixture${fixture} ordered Windows/CRT requests`);
  totalCalls += source.log.length;
}
const report = {method: 'Staged full4797a0 -> actual4795a0/447d60/447d20/447c50/401230 instruction/source comparison. All mapped bytes>=10000h, return and ordered API/CRT requests compare. Synthetic early-existing-root, invalid finds, first/second/third path success, lock retry, read failure/short read, retained printable tail, cached handles, live classification mutation and failed-open domains. Only original Win32/CRT services are external. Find-data pointer and ReadFile output pointer use native parent/child stack positions. Private stack bytes are excluded; no original process execution. Literal bytes are an independent PE extraction pending provider corroboration; source remains staged outside canonical src.', targetSHA256: REDUX_SHA256, fixtures, reachedInstructions: reached.size, instructionSteps: steps, totalCalls, cachedReads, visits, evidence: program.references.filter(r => /9042-|3431-|3711-|3713-/.test(r.path)), literalRecord, matched: true};
await writeFile('analysis/root-name-discovery-staged-instruction-check-20261022.json', JSON.stringify(report, null, 2), {flag: 'wx'});
console.log(JSON.stringify({fixtures, reachedInstructions: reached.size, instructionSteps: steps, totalCalls, cachedReads, visits, matched: true}));
