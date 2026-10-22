import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeRace} from '../src/race-startup.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';

const own = await readInstructionEvidence(['2457-autonomous-initializer-dispatch-assembly.json'], {directory: 'analysis/native-simulation/results'});
const names = [...new Set(own.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0]).toString(16)))].filter(id => !['568a50', '5684da'].includes(id));
const knownEcx = new Set(['44c2b0', '477000', '482590', '431dc0', '42f820', '41dbb0', '416180', '410060', '433d80', '45eac0', '41e850']);
const connected = process.argv.includes('--connected');
const actual = new Set(connected ? ['42f2f0', '42a600', '428100', '495320', '43f130', '494060', '42a670', '47f8c0', '41e850', '40aeb0', '40ad40', '431dc0', '42f820', '416180', '412bb0', '43f870', '433d80', '45eac0', '497790', '483a00', '4797a0', '479420'] : []);
const program = connected ? await loadRetainedNativeProgram() : null;
const dispatch = connected ? await loadRetainedListing('analysis/race-input-dispatch-listing.json', 'analysis/native-simulation/results/9059-startup-input-dispatch-0x45eac0.json') : null;
const merged = new Map((program?.instructions ?? own.instructions).map(i => [i.address, i])); for (const i of dispatch?.instructions ?? []) merged.set(i.address, i);
const machine = new BoundedX86([...merged.values()].sort((a, b) => a.address - b.address)), reached = new Set(), visits = {};
machine.onInstruction = address => {reached.add(address); if ([0x47ea40, 0x42f2f0, 0x428100, 0x416180, 0x41e850, 0x41e910, 0x4797a0, 0x4795a0, 0x447d60, 0x447d20, 0x479420, 0x439780].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
const STACK = 0x9000, A = 0x10000, B = 0x110000, CFG = 0x210000, PACK = 0x212000, AUX = 0x213000, MATERIAL = 0x220000, MODELS = 0x214000, META = 0x215000;
const MANAGER = 0x216000, VTABLE = 0x217000, DEVICE = 0x218000, DV = 0x219000, ALLOC = 0x5a0100, GET = 0x5a0200, SET = 0x5a0300, RESET = 0x5a0400, TYPE = 0x5a0500;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const keys = JSON.parse(await readFile('analysis/native-simulation/results/9002-startup-model-keys.json', 'utf8')).structuredContent;
const scale = JSON.parse(await readFile('analysis/native-simulation/results/9003-startup-input-scale.json', 'utf8')).structuredContent;
const fixtures = Number(process.argv[2] ?? 800);
let steps = 0, calls = 0, successes = 0, expansions = 0, nullAllocations = 0;
for (let fixture = 0; fixture < fixtures; fixture++) {
  machine.reset(); const native = machine.bytes; native.fill(0x36); native.fill(0, STACK - 512, STACK + 32);
  machine.fs0 = 0;
  if (connected) {program.initializeMemory(native); initializeWheelRenderTables(native);}
  put(native, 0x5ecb1c, A); put(native, 0x5ecefc, CFG); put(native, 0x56e258, ALLOC);
  put(native, 0x6e6c04, fixture % 2); put(native, 0x90b98c, PACK); put(native, 0x90b990, AUX); put(native, 0x90b988, MATERIAL);
  put(native, PACK + 0x18, MODELS); put(native, PACK + 0x58, META); word(native, AUX + 0x2e, fixture % 11);
  for (let i = 0; i < 64; i++) {word(native, META + i * 2, i % 10); put(native, MODELS + i * 4, 0x280000 + i * 0x100);}
  if (connected) {
    native[0x6e6660] = 0; if (fixture % 4 === 0) native.write('LOW/LEV1\0', 0x6e6660);
    native.fill(65, 0x6e6b50, 0x6e6ba0); native[0x6e6ba0] = 0; native.write('LOW/LEV2\0', 0x6e6b50);
    const languages = ['ENGLISH', 'FRENCH', 'GERMAN', 'SPANISH', 'ITALIAN', 'JAPANESE'];
    const text = '@STRING(' + (fixture % 7 === 1 ? 'MISSING_KEY' : 'PC_IN_GAME_MESSAGES') + ')\n[\n' + languages.map((language, i) => `${language}\n[\n${String.fromCharCode(65 + i)} first\0~Second\0~]\n`).join('') + ']\n';
    native.write(text + '\0', 0x2f0000, 'latin1'); put(native, 0x6e65f4, fixture % 7 ? 0x2f0000 : 0); put(native, 0x6e65e4, Buffer.byteLength(text, 'latin1')); word(native, 0x6e65f0, fixture % 6);
    put(native, 0x6e6708, fixture & 1); native.fill(0, 0x90c0a0, 0x90cb60);
    for (const [slot, address] of [[0x56e104, 0x5a0600], [0x56e110, 0x5a0700], [0x56e0d0, 0x5a0800], [0x56e0e4, 0x5a0900], [0x56e0cc, 0x5a0a00], [0x56e100, 0x5a0b00], [0x56e0bc, 0x5a0c00], [0x56e25c, 0x5a0d00]]) put(native, slot, address);
    put(native, 0x6e6388, 0); put(native, 0x6efb3c, 0); native[CFG + 0x41a] = fixture % 2;
    word(native, CFG + 0x42c, [320, 640, 1920][fixture % 3]); word(native, CFG + 0x42e, [480, 1080][fixture % 2]);
    for (let i = 0; i < 10; i++) {const model = 0x280000 + i * 0x100; native.fill(0, model, model + 0x100); word(native, model + 4, 1);}
    put(native, 0x902eec, 0x600000); put(native, 0x70dcf4, 0); put(native, 0x909288, 0x260000);
    native.fill(0, 0x260000, 0x260040); put(native, 0x909254, 0x250000); put(native, 0x909278, 0x252000);
    put(native, 0x920b30, 0x261000); native.fill(0x45, 0x261000, 0x261100);
    for (let row = 0; row < 256; row++) {word(native, 0x250000 + row * 16, 0xff00); word(native, 0x250000 + row * 16 + 2, 255); put(native, 0x250000 + row * 16 + 12, 0x254000); word(native, 0x254000 + row * 2, 0);}
    native.fill(0, 0x252000, 0x252010);
  }
  for (let i = 0; i < 6; i++) {put(native, 0x909300 + i * 0x30c, 0x300000 + i * 0x4000); native[CFG + i * 0x90 + 0x1a1] = i + fixture % 4; native.writeFloatLE([0, 1023, 1024, 16383, -4, NaN][(fixture + i) % 6], CFG + i * 0x90 + 0x1a4);}
  if (connected) for (let i = 0; i < 4; i++) {
    put(native, 0x57070c + i * 4, 0x262000 + i * 4); put(native, 0x262000 + i * 4, 1); put(native, 0x574734 + i * 4, 0x263000 + i * 16);
    put(native, 0x263000 + i * 16 + 4, 1); put(native, 0x263000 + i * 16 + 8, i + fixture % 4); native[CFG + i * 0x90 + 0x1a3] = fixture % 13 ? 1 : 0;
    const base = [0x908ea0, 0x908b20, 0x908ce0, 0x908960][i]; for (const [j, offset] of [4, 20, 68, 36].entries()) put(native, base + offset, ((fixture + i) >> j) & 1);
  }
  for (const session of [A, B]) {native[session + 0x54d] = fixture % 7; native[session + 0x552] = fixture % 6; native[session + 0x551] = fixture % 9; native[session + 0x579] = fixture % 13; native[session + 0x58c] = Math.floor(fixture / 7) % 3; native[session + 0x58b] = fixture % 2; native[session + 0x555] = fixture % 2; native[session + 0x553] = fixture % 3; put(native, session + 0x618, fixture * 997);}
  if (connected) {put(native, AUX + 0x4c, 0x264000); put(native, 0x920b24, 0); put(native, 0x920b20, 0);}
  native[CFG + 0x2b] = fixture % 2; put(native, 0x5ed02c, fixture % 2 ? -1 : 9); put(native, 0x6e6ba8, 0);
  native[CFG + 0x2c] = fixture % 3;
  put(native, 0x714b54, MANAGER); put(native, MANAGER, VTABLE); put(native, VTABLE + 0x14, GET); put(native, DEVICE, DV); put(native, DV + 0x50, SET); put(native, DV + 0x24, RESET); put(native, DV + 0x30, TYPE);
  put(native, 0x91ce90, fixture % 4); put(native, 0x91ff80, fixture % 3 ? 14 : 0);
  native.writeFloatLE(1, 0x5dc774); native.writeFloatLE(4 / 3, 0x5dc7a0); native.writeFloatLE(104, 0x5dca1c);
  Buffer.from(keys.normalized_result.bytes_hex, 'hex').copy(native, 0x575060); Buffer.from(scale.normalized_result.bytes_hex, 'hex').copy(native, 0x5dc5e0);
  const source = Buffer.from(native), nativeLog = [], sourceLog = [], cursors = new Map([[native, 0x400000], [source, 0x400000]]);
  const allocation = (m, log, size) => {
    const pointer = (size === 64 && fixture % 29 === 0) || (size === 0x800 && fixture % 31 === 0) ? 0 : cursors.get(m);
    if (pointer) cursors.set(m, (pointer + size + 15) & ~15);
    log.push(['allocate', size, pointer]); return pointer;
  };
  const invoke = (m, log, id, ecx, edx, args, entry) => {
    log.push([id, knownEcx.has(id) ? ecx : null, ['41dbb0', '416180', '433d80'].includes(id) ? edx : null, args, entry]);
    if (id === '4797a0') return 0x226600;
    if (id === '44c2b0') return fixture % 5 ? 1 : 0;
    if (id === '40aeb0') return [480, 1080, 0, -1, 320][fixture % 5];
    if (id === '40ad40') return [640, 1920, 320, 1, 240][fixture % 5];
    if (id === '41dbb0') {
      put(m, ecx, 0x300000 + edx * 0x4000);
      //The first constructor can change the global session or live count.
      //The camera eligibility count remains the original captured value.
      if (edx === 0 && fixture % 11 === 0) {put(m, 0x5ecb1c, B); m[B + 0x54d] = 6;}
    }
    if (id === '47f8c0' && fixture % 3 === 0) put(m, 0x5ecb1c, B);
    if (id === '433d80') return 0x80 + ecx;
    if (id === '45eac0') return 0x1234 + ecx;
    return 0;
  };
  const input = (m, log, owner, method, args, entry) => {log.push(['input', owner, method, args, entry]); return method === 0x14 && fixture % 3 ? DEVICE : 0;};
  const handlers = Object.fromEntries(names.filter(id => !actual.has(id)).map(id => [`call${id}`, r => invoke(source, sourceLog, id, r.ecx, r.edx, r.args, r.scratchBase)]));
  handlers.inputManagerCall = (owner, method, args, context) => input(source, sourceLog, owner, method, args, context.scratchBase);
  const math = (op, value, log) => {const result = Math.fround(Math[op](value)); log.push(['math', op, value, result]); return result;};
  const integer = (value, log) => {const result = !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value)); log.push(['integer', value, result.toString()]); return result;};
  handlers.projectionMath = (op, value) => math(op, value, sourceLog); handlers.projectionInteger = value => integer(value, sourceLog);
  const rootServices = (m, log) => {
    let searches = 0, opens = 0;
    const invoke = (name, args) => {
      if (name === '__security_check_cookie') {assert.equal(args[0] | 0, m.readInt32LE(0x5e8890)); return 0;}
      log.push(['root-file', name, ...args.map(value => value >>> 0)]);
      if (name === 'FindFirstFileA') {m.fill(fixture & 255, args[1], args[1] + 320); return fixture % 4 === 1 || fixture % 4 === 2 && searches++ === 0 ? -1 : 0x1230;}
      if (name === 'CreateFileA') return fixture % 4 === 3 && opens++ === 0 ? -1 : 0x6f1234;
      if (name === 'GetLastError') return 33;
      if (name === 'Sleep') return 0;
      if (name === 'ReadFile') {m.write('LOW/LEV3\r', args[1]); put(m, args[3], 9); return fixture % 19 ? 1 : 0;}
      if (name === 'isprint') return args[0] >= 32 && args[0] <= 126 ? 1 : 0;
      if (name === 'FindClose' || name === 'CloseHandle') return 1;
      throw Error(`Unexpected connected root service ${name}`);
    };
    return {platformCall: invoke, crtCall: invoke, libraryCall(name, args) {
      if (name !== 'memcpy') throw Error(`Unexpected connected localization CRT service ${name}`);
      log.push(['local-copy', ...args]); Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); return args[0];
    }};
  };
  const expected = initializeRace({memory: source, scratchBase: STACK, handlers, services: connected ? rootServices(source, sourceLog) : undefined, allocate: size => allocation(source, sourceLog, size)});
  for (const id of names.filter(id => !actual.has(id))) machine.externalCalls.set(Number(`0x${id}`), state => {
    const args = id === '416180' ? [native.readUInt32LE(state.r.ESP)] : [];
    state.r.EAX = invoke(native, nativeLog, id, state.r.ECX, state.r.EDX, args, state.r.ESP - 4);
  });
  for (const id of names.filter(id => !actual.has(id))) machine.entries.delete(Number(`0x${id}`));
  machine.externalCalls.set(ALLOC, state => {state.r.EAX = allocation(native, nativeLog, native.readUInt32LE(state.r.ESP));});
  machine.externalCalls.set(0x568a50, state => {const p = native.readUInt32LE(state.r.ESP), value = native.readInt32LE(state.r.ESP + 4), length = native.readUInt32LE(state.r.ESP + 8); native.fill(value & 255, p, p + length); state.r.EAX = p;});
  if (connected) {
    const services = rootServices(native, nativeLog);
    for (const [address, name, count, stdcall] of [[0x5a0600, 'FindFirstFileA', 2, true], [0x5a0700, 'FindClose', 1, true], [0x5a0800, 'CreateFileA', 7, true], [0x5a0900, 'GetLastError', 0, true], [0x5a0a00, 'Sleep', 1, true], [0x5a0b00, 'ReadFile', 5, true], [0x5a0c00, 'CloseHandle', 1, true], [0x5a0d00, 'isprint', 1, false]]) machine.externalCalls.set(address, state => {
      state.r.EAX = services.platformCall(name, Array.from({length: count}, (_, i) => native.readUInt32LE(state.r.ESP + i * 4))) | 0;
      if (stdcall) state.r.ESP += count * 4;
    });
    for (const [address, op] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) {machine.entries.delete(address); machine.externalCalls.set(address, state => {const value = math(op, state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.scalarBits.delete('XMM0'); state.qwords.delete('XMM0'); state.scalars.XMM0 = value;});}
    machine.entries.delete(0x568a60); machine.externalCalls.set(0x568a60, state => {const value = integer(state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.r.EAX = Number(BigInt.asIntN(32, value)); state.r.EDX = Number(BigInt.asIntN(32, value >> 32n));});
    machine.externalCalls.set(0x568162, state => assert.equal(state.r.ECX, native.readInt32LE(0x5e8890)));
    machine.externalCalls.set(0x568980, state => {state.r.ESP -= state.r.EAX;});
    machine.externalCalls.set(0x568a48, state => {
      const p = native.readUInt32LE(state.r.ESP), from = native.readUInt32LE(state.r.ESP + 4), size = native.readUInt32LE(state.r.ESP + 8);
      if (state.r.ESP >= STACK - 0x1200 && state.r.ESP < STACK - 0x1100) state.r.EAX = services.libraryCall('memcpy', [p, from, size]);
      else {Buffer.from(native.subarray(from, from + size)).copy(native, p); state.r.EAX = p;}
    });
  }
  for (const [target, method, count] of [[GET, 0x14, 2], [SET, 0x50, 1], [RESET, 0x24, 0], [TYPE, 0x30, 0]]) machine.externalCalls.set(target, state => {
    const args = Array.from({length: count}, (_, i) => method === 0x50 ? native.readFloatLE(state.r.ESP + i * 4) : native.readInt32LE(state.r.ESP + i * 4));
    state.r.EAX = input(native, nativeLog, state.r.ECX, method, args, state.r.ESP - 4); state.r.ESP += count * 4;
  });
  machine.entry = 0x47ea40; machine.r.ESP = STACK; put(native, STACK, -1);
  try {
    steps += machine.run(80000000); assert.equal(machine.fs0, 0, 'restored TLS'); assert.equal(machine.r.EAX, expected, 'return'); assert.deepEqual(nativeLog, sourceLog, 'ordered game/allocation/input/library calls and arguments');
    const nativeState = native.subarray(0x10000), sourceState = source.subarray(0x10000);
    if (!nativeState.equals(sourceState)) {const i = nativeState.findIndex((v, index) => v !== sourceState[index]); assert.fail(`byte0x${(i + 0x10000).toString(16)} native${nativeState[i]} source${sourceState[i]}`);}
    assert.deepEqual(native.subarray(0, 0x800), source.subarray(0, 0x800), 'unconditional null history allocation writes');
  } catch (error) {console.error({fixture, nativeLog, sourceLog}); throw error;}
  calls += nativeLog.length; successes += expected; if (fixture % 11 === 0 && expected && fixture % 7) expansions++;
  nullAllocations += nativeLog.filter(row => row[0] === 'allocate' && !row[2]).length;
}
const report = {method: 'Original47ea40 retained assembly versus complete JavaScript caller policy. Explicit contracts cover the listed remaining game callees and input virtuals; actual connected defaults are enumerated separately. This does not establish full transitive closure or input-adapter classification. All mapped bytes>=10000h, null-history writes, return, restored TLS and ordered known register/stack arguments/native child entry ESP/library requests compare. Synthetic session/count replacement, captured eligibility versus live participant loop, null allocations, viewport dimensions, finite/NaN input calibration and network flags. Genuine CRT math uses declared host results. No original-process execution.', connectedDefaults: [...actual], explicitGameContracts: names.filter(id => !actual.has(id)), evidence: [...own.evidence.map(e => e.evidence_id), keys.evidence_id, scale.evidence_id, ...(program?.references.map(r => r.evidence) ?? [])], fixtures, calls, successes, expansions, nullAllocations, visits, ownInstructions: own.instructions.length, ownInstructionsReached: own.instructions.filter(i => reached.has(i.address)).length, totalInstructionsReached: reached.size, ownInstructionsUnreached: own.instructions.filter(i => !reached.has(i.address)).map(i => `0x${i.address.toString(16)}`), instructionSteps: steps, matched: true};
const outputFlag = process.argv.indexOf('--output'), output = outputFlag >= 0 ? process.argv[outputFlag + 1] : `analysis/race-startup${connected ? '-connected' : ''}-instruction-check.json`;
if (!output) throw Error('--output requires a filename.');
await writeFile(output, JSON.stringify(report, null, 2), outputFlag >= 0 ? {flag: 'wx'} : undefined); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
