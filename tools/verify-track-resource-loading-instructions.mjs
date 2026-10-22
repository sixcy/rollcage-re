import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {allocateZeroedTrackResource, loadDiskTrackResource, loadTrackResource} from '../src/track-resource-loading.mjs';

const program = await loadRetainedNativeProgram();
const allocator = await loadRetainedListing('analysis/track-resource-zeroing-allocator-listing.json', 'analysis/native-simulation/results/9077-track-resource-hook-bytes.json');
const instructions = new Map(program.instructions.map(i => [i.address, i]));
for (const instruction of allocator.instructions) instructions.set(instruction.address, instruction);
const machine = new BoundedX86([...instructions.values()].sort((a, b) => a.address - b.address));
const S = 0x9000, NAME = 0x100000, INDEX = 0x110000, HANDLE = 0x270000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), reached = new Set(), visits = {};
let steps = 0, totalCalls = 0, cachedReads = 0, nullAllocations = 0, compressedReads = 0;
machine.onInstruction = p => {reached.add(p); if ([0x447ba0, 0x479620, 0x4512c0, 0x401160, 0x401380, 0x4795a0, 0x447d60].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
const fixtures = Number(process.argv[2] ?? 900);
const definitions = [[0x56e258, 'allocate', 1], [0x56e23c, 'free', 1], [0x56e0d0, 'CreateFileA', 7, true], [0x56e0e4, 'GetLastError', 0, true], [0x56e0cc, 'Sleep', 1, true], [0x56e0bc, 'CloseHandle', 1, true], [0x56e100, 'ReadFile', 5, true], [0x56e0e0, 'SetFilePointer', 4, true], [0x56e250, 'toupper', 1]];
function services(memory, fixture, file, allocation, nullAllocation) {
  const calls = []; let cursor = 0, creates = 0;
  const invoke = (name, args) => {
    calls.push([name, ...args.map(v => v >>> 0)]);
    switch (name) {
      case 'allocate':
        if (nullAllocation) return 0;
        memory.fill(0xcd, allocation, allocation + args[0]); return allocation;
      case 'free': if (fixture % 17 === 0) put(memory, 0x90c0a4, 0x11223344); return 0;
      case 'CreateFileA': creates++; cursor = fixture % 4; return fixture % 11 === 0 || fixture % 11 === 1 && creates < 3 ? -1 : HANDLE;
      case 'GetLastError': return fixture % 11 === 1 ? 33 : 5;
      case 'Sleep': return 0;
      case 'CloseHandle': if (fixture % 13 === 0) put(memory, 0x5e8000, 0x12345678); return 1;
      case 'SetFilePointer': {
        const old = cursor;
        if (args[3] === 0) cursor = args[1]; else if (args[3] === 2) cursor = file.length;
        return args[3] === 1 ? old : cursor;
      }
      case 'ReadFile': {
        const size = Math.min(args[2], file.length - cursor, fixture % 7 === 0 ? 3 : file.length);
        if (size) file.copy(memory, args[1], cursor, cursor + size);
        put(memory, args[3], size); cursor += size;
        if (fixture % 19 === 0) put(memory, 0x90c0a0, HANDLE);
        return fixture % 7 === 0 ? 0 : 1;
      }
      case 'fopen': cursor = 0; return 0x1234;
      case 'fclose': return 0;
      case 'fseek': cursor = args[1]; return 0;
      case 'fread': {const size = Math.min(args[1] * args[2], file.length - cursor); file.copy(memory, args[0], cursor, cursor + size); cursor += size; return size / args[1] | 0;}
      case 'memset': memory.fill(args[1] & 255, args[0], args[0] + args[2]); return args[0];
      case 'memcpy': Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];
      case 'toupper': return args[0] >= 97 && args[0] <= 122 ? args[0] - 32 : args[0];
      default: throw Error(`Unexpected track resource CRT/Win32 service ${name}`);
    }
  };
  return {calls, platformCall: invoke, libraryCall: invoke};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); memory.fill(0x36, S - 512, S + 128);
  const variant = Math.floor(fixture / 3), entry = [0x4512c0, 0x479620, 0x447ba0][fixture % 3];
  const archived = entry === 0x447ba0 && variant % 4 !== 0, compressed = archived && variant % 3 === 0;
  const nullAllocation = variant % 9 === 0 && !compressed;
  const allocation = archived && variant % 5 === 0 ? 0x5e8000 : 0x400000;
  memory.write('LOW/LEVEL.BLP\0', NAME); memory.write('missing\0', NAME + 128); memory.write('low__level_blp\0', NAME + 256);
  for (let i = 0; i < 324; i++) {put(memory, 0x5eb600 + i * 8, NAME + 128); memory.writeUInt16LE(65535, 0x5eb604 + i * 8);}
  if (archived) {put(memory, 0x5eb600 + 7 * 8, NAME + 256); memory.writeUInt16LE(3, 0x5eb604 + 7 * 8);}
  put(memory, 0x717388, INDEX); put(memory, 0x717380, variant & 1 ? 0 : 0x90); put(memory, 0x6e4900, 0x1234);
  memory.writeInt16LE(variant % 3, 0x5e8008); memory.write('Data.img\0', 0x717360);
  const packed = Buffer.alloc(25); packed.write('GT20'); put(packed, 4, 6); put(packed, 16, 0x7a); packed.set([65, 255, 0, 0, 1], 20);
  const file = Buffer.from(Array.from({length: 256}, (_, i) => i * 13 + fixture & 255)); packed.copy(file, 0x40); packed.copy(file, 0xa0);
  for (const id of [3, 5]) {
    const p = INDEX + id * 16; put(memory, p, id === 3 ? 0x40 : 0xa0); put(memory, p + 4, compressed ? packed.length : 16); put(memory, p + 8, compressed ? 6 : 16);
    memory.writeInt16LE(compressed ? 32 : variant % 5, p + 12); memory.writeInt16LE(id === 3 && variant & 1 ? 5 : 0, p + 14);
  }
  put(memory, 0x6e6708, variant % 3 ? 1 : 0); memory.fill(0, 0x90c0a0, 0x90cb60);
  if (variant % 7 === 2) {put(memory, 0x90c0a0, HANDLE); put(memory, 0x90c0a4, variant % 13); memory.fill(0x5a, HANDLE, HANDLE + 512); cachedReads++;}
  definitions.forEach(([slot], i) => put(memory, slot, 0x760000 + i * 16));
  put(memory, 0x5e8000, 0x760000); put(memory, 0x5e8004, 0x760010);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
  const native = services(machine.bytes, fixture, file, allocation, nullAllocation), source = services(memory, fixture, file, allocation, nullAllocation);
  definitions.forEach(([, name, count, stdcall], i) => machine.externalCalls.set(0x760000 + i * 16, state => {
    const args = Array.from({length: count}, (_, j) => state.bytes.readUInt32LE(state.r.ESP + j * 4));
    state.r.EAX = native.platformCall(name, args) | 0; if (stdcall) state.r.ESP += count * 4;
  }));
  for (const [address, name, count] of [[0x568a50, 'memset', 3], [0x568a48, 'memcpy', 3], [0x5685c8, 'fopen', 2], [0x5685ce, 'fclose', 1], [0x5688a2, 'fseek', 3], [0x568896, 'fread', 4]]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.libraryCall(name, Array.from({length: count}, (_, j) => state.bytes.readUInt32LE(state.r.ESP + j * 4))) | 0;
  });
  const runtime = {memory, scratchBase: S, services: source}, size = variant % 65;
  const result = entry === 0x4512c0 ? allocateZeroedTrackResource(size, runtime) : entry === 0x479620 ? loadDiskTrackResource(NAME, runtime) : loadTrackResource(NAME, runtime);
  machine.entry = entry; machine.r.ESP = S; machine.r.ECX = NAME; put(machine.bytes, S, -1); if (entry === 0x4512c0) put(machine.bytes, S + 4, size);
  try {
    steps += machine.run(1000000); assert.equal(machine.r.EAX >>> 0, result >>> 0, 'return'); assert.equal(machine.fs0, 0x12345678);
    for (const [start, end] of [[0, 0x800], [0x10000, memory.length]]) {
      const actual = machine.bytes.subarray(start, end), expected = memory.subarray(start, end);
      if (!actual.equals(expected)) {const p = actual.findIndex((value, i) => value !== expected[i]); assert.fail(`byte0x${(start + p).toString(16)} native${actual[p]} source${expected[p]}`);}
    }
    const logical = calls => calls.filter(([name]) => !['memset', 'memcpy', 'toupper'].includes(name)); assert.deepEqual(logical(native.calls), logical(source.calls), 'ordered CRT/Win32 calls');
  } catch (error) {console.error({fixture, entry: entry.toString(16), variant, archived, compressed, allocation, nullAllocation, nativeCalls: native.calls, sourceCalls: source.calls}); throw error;}
  totalCalls += source.calls.length; nullAllocations += source.calls.filter(([name]) => name === 'allocate' && nullAllocation).length; if (compressed) compressedReads++;
}
const sourcePath = 'src/track-resource-loading.mjs';
const report = {method: 'Actual447ba0 archive/disk selection and temporary game allocator hooks; actual479620 open/seek/read/cache release; actual4512c0 allocation adapter. Original game children, nearest-duplicate selection and GT20 execute. Exact Listing decodes corroborate4512c0 against original bytes;4512b0 is not reached in these allocation/read chains. All mapped bytes>=10000h plus low/null outputs, EAX, TLS and ordered original CRT/Win32 calls compare; memset/memcpy are compared by memory effects. Synthetic aliases include hook-table allocation, cached handles/cursors, service changes, retry/failed open, failed/short reads, null allocation, archive modes and compressed/uncompressed data. ReadFile output pointers use native child ESP. Private stack aliases, surrounding44c2b0 loader, complete archive allocator/free-hook lifecycle and original-process runtime remain open.', fixtures, instructionSteps: steps, reachedInstructions: reached.size, totalCalls, cachedReads, nullAllocations, compressedReads, visits, allocatorEvidence: allocator.evidence, source: {path: sourcePath, sha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex')}, targetSha256: program.sha256, matched: true};
const output = process.argv[3] ?? 'analysis/track-resource-loading-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify({...report, allocatorEvidence: undefined}));
