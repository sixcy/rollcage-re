import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRendererStartupErrorConstants, showRendererStartupError} from '../src/renderer-startup-errors.mjs';
function fixture(language = 9, conversionFails = false) {
  const memory = initializeRendererStartupErrorConstants(Buffer.alloc(0xa00000)), manager = 0x100000, message = 0x110000, trace = []; let cursor = 0x180000;
  const runtime = {memory, scratchBase: 0x9000, services: {
    libraryCall(name, args) {trace.push([name, args]); if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}},
    platformCall(name, args) {
      trace.push([name, args]); if (name === 'GetUserDefaultLangID') return language;
      if (name === 'MultiByteToWideChar') {if (conversionFails) return 0; for (let i = 0; i < args[3]; i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}
      if (name === 'MessageBoxW') {let end = args[1]; while (memory.readUInt16LE(end)) end += 2; trace.push(['text', memory.toString('utf16le', args[1], end)]);} return 1;
    }
  }};
  return {memory, manager, message, trace, runtime};
}
test('renderer failure keeps the localized header and optional detail in the real warning request', () => {
  const {memory, manager, message, trace, runtime} = fixture(); memory.write('Display mode unavailable\0', message); showRendererStartupError(manager, message, runtime);
  const text = trace.find(row => row[0] === 'text')[1]; assert.match(text, /^3D graphics hardware unsupported\./); assert.match(text, /Display mode unavailable/); assert.equal(trace.find(row => row[0] === 'MessageBoxW')[1][3], 0x11040);
});
test('primary language ID masks regional bits before choosing the original translation', () => {
  const {memory, manager, trace, runtime} = fixture(0x407); showRendererStartupError(manager, 0, runtime); const end = memory.indexOf(0, 0x5daef4);
  assert.equal(trace.find(row => row[0] === 'text')[1], memory.toString('latin1', 0x5daef4, end));
});
test('failed platform conversion leaves the native empty wide payload and still performs cleanup', () => {
  const {manager, trace, runtime} = fixture(9, true); showRendererStartupError(manager, 0, runtime); assert.equal(trace.find(row => row[0] === 'text')[1], ''); assert(trace.some(row => row[0] === 'operatorDeleteArray')); assert(trace.some(row => row[0] === 'operatorDelete'));
});
