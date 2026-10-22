import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyRaceHudFonts} from './verify-race-hud-fonts-instructions.mjs';
import {constructTrackTextures} from '../src/track-texture-construction.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const fixtures = Number(process.argv[2] ?? 12), put = (m, p, value) => m.writeInt32LE(value | 0, p);
const reached = new Set(); let steps = 0, calls = 0, failures = 0, uploaded = 0;
const exitListing = JSON.parse(await readFile('analysis/native-simulation/results/3985-image-zero-size-exit-listing.json')).structuredContent;
const exitBytes = JSON.parse(await readFile('analysis/native-simulation/results/3986-image-zero-size-exit-bytes.json')).structuredContent;
assert.equal(exitListing.subject.digest.sha256, REDUX_SHA256); assert.equal(exitBytes.subject.digest.sha256, REDUX_SHA256);
assert.equal(exitListing.operation, 'inspect_native_instruction'); assert.equal(exitBytes.operation, 'read_bytes');
const decoded = exitListing.normalized_result;
assert.equal(decoded.address, '0x408c84'); assert.equal(decoded.status, 'decoded'); assert.equal(decoded.length, 5);
assert.equal(exitBytes.normalized_result.address, decoded.address); assert.equal(exitBytes.normalized_result.complete, true);
assert.equal(exitBytes.normalized_result.bytes_hex.toLowerCase(), decoded.bytes.toLowerCase());
const bootstrap = await verifyRaceHudFonts({fixtures, output: null, afterFixture({fixture, memory, machine, runtime, source, native, stackBase: S, entryRegisters}) {
  if (!machine.entries.has(0x408c84)) {
    machine.instructions = [...machine.instructions, {address: 0x408c84, op: decoded.mnemonic.toUpperCase(), args: decoded.operands.map(o => o.raw)}].sort((a, b) => a.address - b.address);
    machine.entries = new Map(machine.instructions.map((instruction, index) => [instruction.address, index]));
  }
  const TABLE = 0x1a0000, PALETTE = 0x1a1000, PIXELS = 0x1a3000;
  const count = [-1, 0, 1, 4][fixture % 4], first = [-1, 0, 2, 0x7fffffff, -2147483648, 1][fixture % 6], special = [0, 1, 2, -1, 0x7fffffff][Math.floor(fixture / 3) % 5];
  for (const m of [memory, machine.bytes]) {
    put(m, 0x5ecefc, 0x1a5000); put(m, 0x1a5048, 0x11223344);
    for (let i = 0; i < 4; i++) {
      m.writeUInt16LE([0, 1, 3, 8][(i + fixture) % 4], TABLE + i * 12);
      m.writeUInt16LE([1, 2, 4][(i + fixture) % 3], TABLE + i * 12 + 2);
      m.writeUInt16LE(i % 2, TABLE + i * 12 + 4); put(m, TABLE + i * 12 + 8, i * 64);
      m.fill(i + fixture & 255, PIXELS + i * 64, PIXELS + (i + 1) * 64);
    }
    for (let i = 0; i < 2048; i++) m[PALETTE + i] = i * 13 + fixture & 255;
  }
  const sourceRenderer = runtime.services.rendererCall, nativeRenderer = native.rendererCall, priorUploads = source.rendererCalls.filter(row => row[0] === 'upload').length;
  const wrap = (m, invoke) => {let uploads = 0; return (request, context) => {
    const result = invoke(request, context);
    if (request.offset === 0x88) {
      if (fixture % 4 === 3 && uploads++ === 1) {put(m, 0x5ecefc, 0x1a5100); return 0;}
      if (fixture % 5 === 2) put(m, TABLE + 12, 0);
    }
    return result;
  };};
  runtime.services.rendererCall = wrap(memory, sourceRenderer); native.rendererCall = wrap(machine.bytes, nativeRenderer);
  const before = machine.onInstruction; machine.onInstruction = p => {before(p); reached.add(p);};
  const result = constructTrackTextures(count, first, special, TABLE, PALETTE, PIXELS, runtime);
  machine.entry = 0x433550; machine.r.ESP = S; machine.r.ECX = count; machine.r.EDX = first; Object.assign(machine.r, entryRegisters);
  put(machine.bytes, S, -1); [special, TABLE, PALETTE, PIXELS].forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v));
  try {
    steps += machine.run(80_000_000); assert.equal(machine.r.EAX, result, '433550 return'); assert.equal(machine.fs0, 0);
    if (!memory.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {
      let p = 0x10000; while (memory[p] === machine.bytes[p]) p++;
      assert.fail(`fixture${fixture} byte0x${p.toString(16)} native${machine.bytes[p]} source${memory[p]}`);
    }
    for (const offset of [-8, -4, 4]) assert.equal(memory.readInt32LE(S + offset), machine.bytes.readInt32LE(S + offset), '433550 retained local/argument state');
    assert.deepEqual(source.rendererCalls, native.rendererCalls, 'all original renderer requests and complete pixel uploads');
  } finally {machine.onInstruction = before; runtime.services.rendererCall = sourceRenderer; native.rendererCall = nativeRenderer;}
  failures += result === 0; uploaded += source.rendererCalls.filter(row => row[0] === 'upload').length - priorUploads; calls++;
}});
const sourcePath = 'src/track-texture-construction.mjs';
const report = {matched: true, method: 'Actual433550 descriptor loop through actual408680 and existing image/storage/palette descendants; mipmaps are disabled in these fixtures. Persistent actual image-library/font bootstrap supplies native image ownership; all mapped bytes>=10000h, native parent locals, EAX, restored TLS, ordered CRT/platform/STL services and complete renderer upload buffers compare. Signed count/first/last wrapping, zero dimensions,16/32-bit devices, first/repeated texture handles, failure with live config-root replacement and changed later descriptors are synthetic fixtures. Renderer virtual78/88 remain explicitly declared game-adapter contracts; surrounding44c2b0 and real device execution are not established.', targetSha256: bootstrap.targetSHA256, fixtures, calls, failures, uploaded, instructionSteps: steps, reachedInstructions: reached.size, parentInstructionsReached: [...reached].filter(p => p >= 0x433550 && p < 0x4335e9).length, bootstrapInstructionSteps: bootstrap.instructionSteps, source: {path: sourcePath, sha256: createHash('sha256').update(await readFile(sourcePath)).digest('hex')}};
const output = process.argv[3] ?? 'analysis/track-texture-construction-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
