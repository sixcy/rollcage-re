import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeGameDiagnosticTables, formatGameInteger, formatGameDiagnostic, printGameDiagnostic, findDiagnosticResource, openDiagnosticFile, writeGameDiagnostic} from '../src/game-diagnostics.mjs';
import {createDiagnosticServiceFixture, verifyGameDiagnostics} from '../tools/verify-game-diagnostics-instructions.mjs';
const make = () => {const memory = initializeGameDiagnosticTables(Buffer.alloc(0xa00000)); return {memory, scratchBase: 0x9000};};
const string = (m, p, text) => {m.write(text, p, 'latin1'); m[p + text.length] = 0;}, read = (m, p) => m.toString('latin1', p, m.indexOf(0, p));
test('integer formatter pads digits outside the sign and keeps unsigned decimal', () => {
  const runtime = make(), m = runtime.memory; formatGameInteger(0x100000, -12, 100, 5, runtime); assert.equal(read(m, 0x100000), '-00012');
  formatGameInteger(0x100000, -1, 117, 0, runtime); assert.equal(read(m, 0x100000), '4294967295');
  formatGameInteger(0x100000, 0xabcdef, 112, 8, runtime); assert.equal(read(m, 0x100000), '00ABCDEF');
});
test('game formatter retains prefixes and its full-width string space bug', () => {
  const runtime = make(), m = runtime.memory; string(m, 0x100000, '%5s|%x|%b|%o|%p'); string(m, 0x110000, 'ab');
  [0x110000, 31, 3, 8, 0xab].forEach((v, i) => m.writeInt32LE(v, 0x120000 + i * 4)); m.writeInt32LE(0x120000, 0x6f9bf8);
  formatGameDiagnostic(0x100000, runtime); assert.equal(read(m, 0x6fb5e0), 'ab     |0x1f|%11|010|0x000000AB');
});
test('diagnostic adapter strips repeated trailing newlines but retains the first character', () => {
  const runtime = make(), service = createDiagnosticServiceFixture(0, runtime.memory); runtime.services = service.services;
  string(runtime.memory, 0x100000, '\r\n'); printGameDiagnostic(0x100000, [], runtime); assert.equal(read(runtime.memory, 0x6fb5e0), '\r\r\n');
  assert.equal(service.trace.filter(v => v.name === 'CopyFileA').length, 1);
  string(runtime.memory, 0x100000, 'next\r\n\n'); printGameDiagnostic(0x100000, [], runtime); assert.equal(read(runtime.memory, 0x6fb5e0), 'next\r\n'); assert.equal(service.trace.filter(v => v.name === 'CopyFileA').length, 1);
});
test('file open retries only lock violations and resource initialization keeps second DWORDs', () => {
  const runtime = make(), service = createDiagnosticServiceFixture(1, runtime.memory); runtime.services = service.services; string(runtime.memory, 0x100000, 'test');
  assert.equal(openDiagnosticFile(0x100000, 0xc0000000, 2, runtime), 0x4567); assert.deepEqual(service.trace.map(v => v.name), ['CreateFileA', 'GetLastError', 'Sleep', 'CreateFileA']);
  runtime.memory.writeInt32LE(123, 0x90c0a4); assert.equal(findDiagnosticResource(0x4567, runtime), -1); assert.equal(runtime.memory.readInt32LE(0x90c0a4), 123);
});
test('diagnostic game adapters match retained instructions and declared platform services', async () => {assert.equal((await verifyGameDiagnostics({fixtures: 100, output: null})).matched, true);});
test('log append arguments retain their real timestamp and message length stack producers', () => {const runtime = make(), m = runtime.memory, service = createDiagnosticServiceFixture(0, m); runtime.services = service.services; string(m, 0x100000, 'abcdefghijklmnopqrstuvwxyz123456789'); writeGameDiagnostic(0x100000, runtime); const frame = runtime.scratchBase - 76; assert.equal(m.readInt32LE(frame - 8), 35); assert.equal(m.readInt32LE(frame - 4), read(m, frame + 0x24).length);});
test('formatter publishes explicitly supplied saved EBX and EBP caller words', () => {const runtime = make(), m = runtime.memory; runtime.entryRegisters = {EBX: 0, EBP: 0x120000}; string(m, 0x100000, 'message'); formatGameDiagnostic(0x100000, runtime); assert.equal(m.readInt32LE(runtime.scratchBase - 8), 0); assert.equal(m.readInt32LE(runtime.scratchBase - 12), 0x120000);});
