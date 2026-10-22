import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {registerRendererViewport, obtainRendererOverlayVector, findRendererOverlay, moveRendererOverlayVector, initializeRendererOverlayRegistry} from '../src/renderer-overlay-registration.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyRendererOverlayRegistration({scenarios = 240, output = 'analysis/renderer-overlay-startup-registration-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/renderer-overlay-bootstrap-listing.json', 'analysis/native-simulation/results/11234-renderer-map-init-bytes.json');
  const machine = new BoundedX86([...program.instructions, ...listing.instructions]), reached = new Set(), visits = {}, entries = [0x51a650, 0x51b080, 0x51b390, 0x51b3f0]; let steps = 0, calls = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([...entries, 0x51b7b0, 0x51b8d0, 0x51bb90, 0x51b990, 0x51bbd0, 0x51bd90, 0x51b5b0, 0x51b600].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let scenario = 0; scenario < scenarios; scenario++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), head = 0x100000, viewport = 0x110000, outputObject = 0x120000, trace = [], nativeTrace = [], r = {memory: m, scratchBase: 0x9000}; m.fill(0x69, 0x7000, 0x9100); put(m, 0x6f2d34, head); put(m, 0x6f2d38, 0); for (const offset of [0, 4, 8]) put(m, head + offset, head); m.writeUInt16LE(0x101, head + 12); put(m, 0x56e220, 0xa24000); put(m, 0x56e210, 0xa24004); put(m, 0x56e470, 0xa24004);
    const allocate = (memory, log) => {let cursor = 0x180000; return size => {const p = cursor; cursor += size + 15 & ~15; memory.fill(0x93, p, cursor); log.push(['allocate', size, p]); return p;};}; r.handlers = {allocate: allocate(m, trace), free: p => trace.push(['free', p])};
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const nativeAllocate = allocate(machine.bytes, nativeTrace); machine.externalCalls.set(0xa24000, state => {state.r.EAX = nativeAllocate(ptr(state.bytes, state.r.ESP));}); machine.externalCalls.set(0xa24004, state => nativeTrace.push(['free', ptr(state.bytes, state.r.ESP)])); machine.externalCalls.set(0x568a48, state => {const b = state.bytes, output = ptr(b, state.r.ESP), input = ptr(b, state.r.ESP + 4), n = ptr(b, state.r.ESP + 8); Buffer.from(b.subarray(input, input + n)).copy(b, output); state.r.EAX = output;});
    r.services = {libraryCall: (name, args) => {trace.push([name, ...args]); return scenario % 2 ? -1 : 0;}}; machine.externalCalls.set(0x56832a, state => {nativeTrace.push(['atexit', ptr(state.bytes, state.r.ESP)]); state.r.EAX = scenario % 2 ? -1 : 0;});
    const initialized = initializeRendererOverlayRegistry(r); machine.entry = 0x401a40; machine.r.ESP = r.scratchBase; put(machine.bytes, r.scratchBase, -1); machine.run(); calls++; assert.equal(machine.r.EAX, initialized);
    for (let tick = 0; tick < 30; tick++) {
      const keys = ['', 'A', 'B', 'Z', 'Player0', 'Player1', 'LongViewportName17', 'OtherLongViewportName', '\u00ff', '0 Player'], key = keys[(scenario % 3 === 0 ? tick : scenario % 3 === 1 ? 29 - tick : Math.imul(tick, 7)) % keys.length], selector = tick % 4, name = viewport + 20;
      for (const b of [m, machine.bytes]) {const address = key.length >= 16 ? name + 64 : name; if (address !== name) put(b, name, address); b.write(key, address, 'latin1'); b[address + key.length] = 0; put(b, name + 16, key.length); put(b, name + 20, key.length >= 16 ? 63 : 15);}
      let ecx = 0, args, result;
      try {
        if (!selector) {args = [viewport]; registerRendererViewport(viewport, r);}
        else if (selector === 1) {args = [name]; result = obtainRendererOverlayVector(name, r);}
        else if (selector === 2) {args = [outputObject, name]; put(m, outputObject, findRendererOverlay(name, r));}
        else {const source = outputObject + 32; for (const b of [m, machine.bytes]) {put(b, outputObject, scenario % 2 ? outputObject + 64 : 0); put(b, outputObject + 4, 0x145678); put(b, outputObject + 8, 0x146789); for (let i = 0; i < 3; i++) put(b, source + i * 4, 0x167000 + i * 4);} ecx = outputObject; args = [scenario % 3 ? source : outputObject]; result = moveRendererOverlayVector(outputObject, args[0], r);}
        machine.entry = entries[selector]; machine.r.ESP = r.scratchBase; machine.r.ECX = ecx; put(machine.bytes, r.scratchBase, -1); args.forEach((v, i) => put(machine.bytes, r.scratchBase + 4 + i * 4, v)); machine.run(1_000_000); calls++;
        if (result !== undefined) assert.equal(machine.r.EAX, result); assert.equal(machine.fs0, 0); assert.deepEqual(nativeTrace, trace);
        if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (m[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
        // Caller-owned overlay contents become the next persistent input;
        // later duplicate registration must retain all three vector words.
        if (!selector) {const record = findRendererOverlay(name, r), contents = 0x160000 + tick * 64; for (const b of [m, machine.bytes]) {put(b, record + 44, contents); put(b, record + 48, contents + 8); put(b, record + 52, contents + 16); for (let i = 0; i < 4; i++) put(b, contents + i * 4, 0x170000 + i * 64);}}
      } catch (error) {console.error({scenario, tick, key, trace, nativeTrace}); throw error;}
    }
  }
  const report = {method: 'Actual static initializer401a40 and sentinel51b8a0, then51a650 viewport registration through real51b390/51b080/51b7b0/51b8d0/51bb90/51b990/51bbd0 map specializations and actual rotations;51b3f0 move assignment. Producer Listing independently byte-checked. Persistent populated raw red-black map, caller-owned name/overlay-content producers, all mapped memory>=10000h,defined returns,ordered genuineCRT allocation/free/copy/atexit services and balanced explicit FS:[0]. No game mocks/original process execution.', targetSha256: program.sha256, scenarios, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyRendererOverlayRegistration()));
