import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createGameImageServices} from '../tools/lib/game-image-fixtures.mjs';
import {createArchiveDiagnosticServices} from '../tools/verify-archive-diagnostics-instructions.mjs';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {initializeLocalizedRaceMessages} from '../src/localized-startup.mjs';
const program = await loadRetainedNativeProgram();
const readString = (m, p) => {let e = p; while (m[e]) e++; return m.toString('latin1', p, e);};
function fixture(rows) {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); memory.writeUInt32LE(0x100000, 0x5ecb1c); memory.writeUInt32LE(0x12345678, 0x5e8890);
  const payload = Buffer.from('@STRING(PC_IN_GAME_MESSAGES)\r\n[\r\nENGLISH\r\n[\r\n' + rows.map(row => row + '~~\r\n').join('') + ']\r\n]\r\n', 'latin1'), file = Buffer.alloc(0x40 + payload.length); payload.copy(file, 0x40);
  memory.writeUInt32LE(0x110000, 0x717388); const metadata = 0x110080; memory.writeUInt32LE(0x40, metadata); memory.writeUInt32LE(payload.length, metadata + 4); memory.writeUInt32LE(payload.length, metadata + 8); memory.writeInt16LE(3, metadata + 12); memory.writeUInt32LE(0x1234, 0x6e4900);
  const base = createGameImageServices(memory, {file}), diagnostic = createArchiveDiagnosticServices(memory), services = {libraryCall(name, args, runtime) {return ['vsnprintf', 'fputs', 'fflush', 'fopen'].includes(name) ? diagnostic.libraryCall(name, args, runtime) : name === 'strncpy' ? (Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]), args[0]) : base.libraryCall(name, args, runtime);}};
  const runtime = {memory, scratchBase: 0x9000, services}; loadProcessedLocalization(runtime); return {memory, runtime, diagnostic};
}
test('the actual resource producer feeds localized messages and shared spare-slot fallbacks', () => {
  const {memory, runtime} = fixture(['Hello', 'World']); initializeLocalizedRaceMessages(runtime);
  assert.equal(readString(memory, memory.readUInt32LE(0x70ea00)), 'Hello'); assert.equal(readString(memory, memory.readUInt32LE(0x70ea04)), 'World');
  assert.equal(readString(memory, memory.readUInt32LE(0x70ea08)), ' ');
  const spare = memory.readUInt32LE(0x70eaac); for (let i = 43; i < 64; i++) assert.equal(memory.readUInt32LE(0x70ea00 + i * 4), spare);
});
test('exact arena-end equality rejects a row and retains the first message fallback', () => {
  const {memory, runtime} = fixture(Array(43).fill('E'.repeat(47))); initializeLocalizedRaceMessages(runtime);
  assert.equal(memory.readUInt32LE(0x70ea00 + 39 * 4), 0x100b20); assert.equal(readString(memory, 0x100b20), 'E'.repeat(47));
});
test('a TAB reaches the actual formatter and logfile graph while remaining in the message', () => {
  const {memory, runtime, diagnostic} = fixture(['Hello\tthere']); memory.writeInt32LE(1, 0x5e8114); initializeLocalizedRaceMessages(runtime);
  assert.equal(readString(memory, memory.readUInt32LE(0x70ea00)), 'Hello\tthere');
  const writes = diagnostic.calls.filter(([name]) => name === 'fputs'); assert.equal(writes.length, 43); assert.ok(writes[0][1].includes('PC_IN_GAME_MESSAGES')); assert.ok(writes[0][1].endsWith('\n'));
});
