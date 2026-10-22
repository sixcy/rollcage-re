import assert from 'node:assert/strict';
import {constructRendererResourcePool} from '../../src/renderer-resource-pools.mjs';
import {rendererTextureExternalReturnStores} from './renderer-texture-native.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
//Fixture-only Direct3D objects; every game pool/acquire/upload path remains actual.
export async function setupActualTextureRenderer({memory,machine,runtime,entryRegisters,addSteps=()=>{},addCall=()=>{},instructionObserver,actualRendererVisits={},platformBase=0xa00000}) {
    const manager = 0x100000, descriptor = 0x110000, caps = 0x116000, device = 0x117000, deviceVtable = 0x118000, textureVtable = 0x119000, surfaceVtable = 0x11a000;
    const baseInstruction = instructionObserver ?? machine.onInstruction; machine.onInstruction = p => {baseInstruction?.(p); const ret=rendererTextureExternalReturnStores.get(p);if(ret!==undefined)put(machine.bytes,machine.r.ESP-4,ret); if ([0x5208d0, 0x520ee0, 0x520940, 0x51ff30, 0x51fb10, 0x51f2a0].includes(p)) actualRendererVisits[p.toString(16)] = (actualRendererVisits[p.toString(16)] ?? 0) + 1;};
    for (const m of [memory, machine.bytes]) {put(m, manager, 0x5db278); put(m, manager + 0x488, caps); put(m, manager + 0x36c, device); put(m, device, deviceVtable); for (let i = 0; i < 16; i++) put(m, manager + 0x43c + i * 4, descriptor); put(m, descriptor, get(m, descriptor + 28) === 16 ? 23 : 21); put(m, caps + 0x45c, 4096); put(m, caps + 0x460, 4096); put(m, caps + 0x440, 0x4000); put(m, caps + 0x410, 0);}
    const sourceTrace = [], nativeTrace = [];
    const backend = (m, trace) => {
      let next = platformBase; const textures = new Map(), surfaces = new Map();
      const alloc = bytes => {const p = next; next += bytes + 31 & ~15; assert(next < m.length, 'Declared Direct3D fixture storage bound'); m.fill(0x6a, p, next); return p;};
      return (object, method, args) => {
        trace.push([object >>> 0, method, args.map(v => v >>> 0)]);
        if (object === device && method === 0x5c) {
          const texture = alloc(16), [width, height, levels, , format] = args.slice(1); put(m, texture, textureVtable); const rows = [];
          for (let level = 0; level < levels; level++) {const w = Math.max(1, width >> level), h = Math.max(1, height >> level), surface = alloc(16), pixels = alloc(w * h * (format === 23 ? 2 : 4)); put(m, surface, surfaceVtable); const row = {width:w,height:h,pixels,pitch:w * (format === 23 ? 2 : 4),surface}; surfaces.set(surface, row); rows.push(row);}
          textures.set(texture, rows); put(m, args.at(-2), texture); return 0;
        }
        if (textures.has(object)) {
          const rows = textures.get(object), row = rows[args[1]];
          if (method === 0x44) {assert(row); put(m, args[2] + 24, row.width); put(m, args[2] + 28, row.height);}
          else if (method === 0x48) {assert(row); put(m, args[2], row.surface);}
          else if (![0x54, 8].includes(method)) throw Error(`Unexpected texture COM method${method.toString(16)}`);
          return 0;
        }
        if (surfaces.has(object)) {const row = surfaces.get(object); if (method === 0x34) {put(m, args[1], row.pitch); put(m, args[1] + 4, row.pixels);} else if (![8, 0x38].includes(method)) throw Error(`Unexpected surface COM method${method.toString(16)}`); return 0;}
        if (object === device && method === 0x7c) {const from = textures.get(args[1]), to = textures.get(args[2]); assert(from && to); from.forEach((row, i) => Buffer.from(m.subarray(row.pixels,row.pixels + row.pitch * row.height)).copy(m,to[i].pixels)); return 0;}
        throw Error(`Unknown declared Direct3D object${object.toString(16)} method${method.toString(16)}`);
      };
    };
    const sourceDevice = backend(memory, sourceTrace), nativeDevice = backend(machine.bytes, nativeTrace); runtime.services.direct3DCall = sourceDevice;
    let serial = 0; for (const [table, methods] of [[deviceVtable, [[0x5c, 9], [0x7c, 3]]], [textureVtable, [[0x44, 3], [0x48, 3], [0x54, 2], [8, 1]]], [surfaceVtable, [[0x34, 4], [0x38, 1], [8, 1]]]]) for (const [method, count] of methods) {
      const address = 0x59a000 + serial++ * 16; put(memory, table + method, address); put(machine.bytes, table + method, address); machine.externalCalls.set(address, cpu => {cpu.r.EAX = nativeDevice(ptr(cpu.bytes,cpu.r.ESP),method,Array.from({length:count},(_,i)=>ptr(cpu.bytes,cpu.r.ESP+i*4))); cpu.r.ESP += count * 4;});
    }
    //Use the canonical408680 defaults. Count original entries independently
    //through native visits; no game service replaces either renderer adapter.
    delete runtime.services.rendererCall;
    //The real pool constructors own the128 native texture/ordinal records.
    for (const [entry, object, kind] of [[0x5131b0, manager + 0x48c, 'texture'], [0x513330, manager + 0x890, 'integer']]) {
      const S = 0x9800, r = {...runtime,scratchBase:S,entryRegisters:{EBX:0,EBP:0,ESI:0,EDI:0}}; constructRendererResourcePool(object,kind,r); machine.entry=entry; machine.r.ESP=S; machine.r.ECX=object; machine.r.EAX=machine.r.EDX=0; Object.assign(machine.r,r.entryRegisters); put(machine.bytes,S,-1); addSteps(machine.run(8_000_000)); addCall(); assert.equal(machine.fs0,0); assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000));
    }
    //The font driver's synthetic incoming registers remain explicit, as in its
    //standalone proof; native constructors above are separate prior calls.
    Object.assign(machine.r, entryRegisters);
 return {sourceTrace,nativeTrace,actualRendererVisits};
}
