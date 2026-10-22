import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {associateRendererTexture, normalizeRendererTextureDimensions, countRendererTextureMipLevels, chooseRendererDepthFormat, allocateRendererTextureSurface, createRendererTextureResource, createRendererViewportTexture, releaseRendererTextureResource, unbindRendererTexture} from '../src/renderer-texture-creation.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

export async function verifyRendererTextureCreation({fixtures = 500, output = 'analysis/renderer-texture-creation-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set();
  const S = 0x9000, MANAGER = 0x100000, RESOURCE = 0x110000, CAPS = 0x120000, DEVICE = 0x130000, VTABLE = 0x140000, POINTERS = 0x150000, SLOT = 0x160000, OUT = 0x170000;
  const entries = [0x50f350, 0x5207a0, 0x51fee0, 0x511a30, 0x520660, 0x520380, 0x520dc0, 0x50eed0, 0x526a90];
  let calls = 0, steps = 0, failures = 0; machine.onInstruction = p => reached.add(p);
  for (let fixture = 0; fixture < fixtures; fixture++) for (let selector = 0; selector < entries.length; selector++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), sourceTrace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S};
    m.fill(0x69, 0x7000, 0x9500); m.fill(0xa7, RESOURCE, RESOURCE + 0x500); m.fill(0, RESOURCE + 0x420, RESOURCE + 0x460);
    put(m, MANAGER, 0x5db278); put(m, MANAGER + 0x488, CAPS); put(m, MANAGER + 0x48c, POINTERS); put(m, POINTERS, RESOURCE); put(m, MANAGER + 0x890, POINTERS + 64); put(m, POINTERS + 64, SLOT);
    put(m, RESOURCE, 0x5db528); put(m, RESOURCE + 8, 0); put(m, RESOURCE + 0x10, fixture % 3); put(m, 0x714ae8, MANAGER); put(m, MANAGER + 0x368, DEVICE); put(m, MANAGER + 0x36c, DEVICE); put(m, DEVICE, VTABLE);
    for (const o of [0x28, 0x30, 0x5c, 0x60, 0x64, 0x74, 8, 0xd0]) put(m, VTABLE + o, 0xf0000000 + o);
    for (let i = 0; i < 16; i++) {put(m, MANAGER + 0x43c + i * 4, OUT + 0x100 + i * 4); put(m, OUT + 0x100 + i * 4, [21, 22, 0x31545844, 0x33545844, 0x35545844, 113, 41][fixture % 7]);}
    put(m, RESOURCE + 0x454, fixture % 16); put(m, MANAGER + 0x500, [21, 113, 41][fixture % 3]); put(m, MANAGER + 0x504, 75);
    put(m, CAPS + 0x45c, [0, 1, 1023, 2048, 8192, 0xffffffff][fixture % 6]); put(m, CAPS + 0x460, [1, 256, 511, 4096, 65535][fixture % 5]);
    put(m, CAPS + 0x440, [0, 2, 0x100, 0x20, 0x1c122][fixture % 5]); put(m, CAPS + 0x410, fixture % 2 ? 0x20000000 : 0); put(m, CAPS + 0x534, 1); put(m, MANAGER + 0x430, 22);
    const services = (memory, trace) => {let serial = 0; return {direct3DCall(object, method, args) {
      trace.push([object >>> 0, method, args.map(value => value >>> 0)]); serial++;
      if (method === 0x28 || method === 0x30) return serial % (fixture % 4 + 2) === 0 ? 0 : -1;
      if ([0x5c, 0x60, 0x64, 0x74].includes(method)) {
        const result = fixture % 7 === 0 && method !== 0x74 ? -1 : 0;
        if (result === 0) {const target = args.at(-2), resource = 0x200000 + serial * 256; put(memory, target, resource); put(memory, resource, VTABLE);}
        return result;
      }
      return 0;
    }};};
    runtime.services = services(m, sourceTrace);
    let args, ecx, action, resultMask = 0xff;
    const width = [0, 1, 3, 4, 5, 511, 1024, 65535, 0x80000000, 0xffffffff][fixture % 10], height = [1, 2, 7, 128, 1023, 4096][fixture % 6];
    const mode = fixture % 6, kind = fixture % 4, flag = fixture % 3;
    if (selector === 0) {ecx = MANAGER; args = [fixture % 5 === 0 ? -1 : 0, fixture * 7919]; action = () => associateRendererTexture(ecx, ...args, runtime); resultMask = 0;}
    else if (selector === 1) {ecx = MANAGER; put(m, OUT, width); put(m, OUT + 4, height); args = [OUT, fixture % 11 === 0 ? OUT : OUT + 4, mode, kind, fixture % 2 ? 4 : 1, flag]; action = () => normalizeRendererTextureDimensions(ecx, ...args, runtime); resultMask = 0;}
    else if (selector === 2) {ecx = 0; put(m, RESOURCE + 0x444, fixture % 2 ? 21 : 0x31545844); args = [width, height, RESOURCE]; action = () => countRendererTextureMipLevels(...args, runtime); resultMask = -1;}
    else if (selector === 3) {ecx = MANAGER; args = [fixture % 2 ? 21 + fixture % 10 : 100]; action = () => chooseRendererDepthFormat(ecx, ...args, runtime); resultMask = -1;}
    else if (selector === 4) {ecx = RESOURCE; put(m, RESOURCE + 0x420, width); put(m, RESOURCE + 0x424, height); put(m, RESOURCE + 0x44c, 6); put(m, RESOURCE + 0x428, 1); put(m, RESOURCE + 0x444, 21); put(m, RESOURCE + 0x448, 75); put(m, RESOURCE + 0x458, fixture % 5); m[RESOURCE + 0x45d] = fixture % 2; m[RESOURCE + 0x45c] = flag; args = [fixture % 2, DEVICE, CAPS + 0x404]; action = () => allocateRendererTextureSurface(ecx, ...args, runtime);}
    else if (selector === 5) {ecx = MANAGER; args = [RESOURCE, width, height, kind === 1 ? 6 : 1, fixture % 4, fixture % 7, mode, 32, kind, flag]; action = () => createRendererTextureResource(ecx, ...args, runtime);}
    else if (selector === 6) {ecx = MANAGER; args = [0, mode, width, height, fixture % 7, fixture % 5, flag, OUT]; action = () => createRendererViewportTexture(ecx, ...args, runtime);}
    else {
      const owner = OUT + 0x1000, rows = owner + 0x100, item = owner + 0x200, bindings = owner + 0x400;
      put(m, MANAGER + 0x360, owner); put(m, owner, rows); put(m, owner + 4, rows + 4); put(m, rows, item); put(m, item, DEVICE); put(m, item + 0x6c, bindings); put(m, item + 0x70, bindings + 3 * 44);
      for (let i = 0; i < 3; i++) {put(m, bindings + i * 44 + 0x20, i); put(m, bindings + i * 44 + 0x24, DEVICE); put(m, bindings + i * 44 + 0x28, 73);}
      if (selector === 7) {put(m, RESOURCE + 0x438, DEVICE); put(m, RESOURCE + 0x43c, fixture % 2 ? DEVICE : DEVICE + 0x100); put(m, DEVICE + 0x100, VTABLE); put(m, RESOURCE + 0x440, DEVICE); ecx = MANAGER; args = [0]; action = () => releaseRendererTextureResource(RESOURCE, runtime); entries[7] = 0x50f280;}
      else {ecx = owner; args = [DEVICE]; action = () => unbindRendererTexture(ecx, ...args, runtime);}
      resultMask = 0;
    }
    machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const nativeServices = services(machine.bytes, nativeTrace);
    for (const [method, count] of [[0x28, 7], [0x30, 6], [0x5c, 9], [0x60, 10], [0x64, 8], [0x74, 9], [8, 1], [0xd0, 3]]) machine.externalCalls.set(0xf0000000 + method, x => {const values = Array.from({length: count}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)); x.r.EAX = nativeServices.direct3DCall(values[0], method, values); x.r.ESP += count * 4;});
    try {
      const result = action(); machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = ecx; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(1000000); calls++;
      if (resultMask) assert.equal(machine.r.EAX & resultMask, result & resultMask);
      assert.deepEqual(nativeTrace, sourceTrace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {failures++; console.error({fixture, selector, entry: entries[selector].toString(16), sourceTrace, nativeTrace}); throw error;}
  }
  const report = {method: 'Actual renderer texture association, caps/dimension/mip/depth-format policies, resource creation and surface allocation, virtual80, full primary/secondary/depth release and populated binding-cache eviction. All mapped memory>=10000h, return values and exact ordered Direct3D COM calls; no game mocks, original process or actual device execution.', targetSha256: program.sha256, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, failures, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererTextureCreation({fixtures: Number(process.argv[2] ?? 500)})));
