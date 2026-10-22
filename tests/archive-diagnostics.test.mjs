import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createArchiveDiagnosticServices} from '../tools/verify-archive-diagnostics-instructions.mjs';
import {formatGameDiagnostic} from '../src/archive-diagnostics.mjs';
const program = await loadRetainedNativeProgram();
test('archive logging lazily opens, emits its real header, then reloads the stream before flushing', () => {
  const memory = Buffer.alloc(0xa00000); program.initializeMemory(memory); memory.writeInt32LE(1, 0x5e8114); memory.writeInt32LE(1, 0x5e8118); memory.write('Value%s\0', 0x100000); memory.write('Text\0', 0x110000); memory.writeUInt32LE(0x110000, 0x9008);
  const services = createArchiveDiagnosticServices(memory, {mutateStream: true}); formatGameDiagnostic(0x100000, {memory, scratchBase: 0x9000, services});
  const writes = services.calls.filter(([name]) => name === 'fputs'); assert.equal(writes.length, 2); assert.ok(writes[0][1].includes('New Mono debugger session')); assert.equal(writes[1][1], 'ValueText\n');
  assert.deepEqual(services.calls.filter(([name]) => name === 'fflush').at(-1), ['fflush', 0x345678]);
});
