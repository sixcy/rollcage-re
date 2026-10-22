import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRendererDevice} from '../src/renderer-device-creation.mjs';
import {constructRendererStateCache} from '../src/renderer-state-cache.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), string = (m, p) => m.toString('latin1', p, m.indexOf(0, p));
export async function verifyRendererDeviceCreation({fixtures = 900, output = 'analysis/renderer-device-creation-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(); let calls = 0, steps = 0, formatted = 0;
  const S = 0x9000, MANAGER = 0x100000, ROWS = 0x110000, REASONS = 0x160000, MESSAGE = 0x170000;
  const visits = {}; machine.onInstruction = p => {reached.add(p); if ([0x512a30,0x402aa0,0x50fb20,0x523fd0,0x518cb0,0x519050].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)]??0)+1;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const m = program.initializeMemory(Buffer.alloc(0xa00000)), trace = [], nativeTrace = [], runtime = {memory: m, scratchBase: S}; m.fill(0x69, 0x6000, 0x9500);
    put(m, MANAGER + 0x47c, ROWS); put(m, MANAGER + 0x480, ROWS + (fixture % 5) * 0x53c);
    for (let i = 0; i < 4; i++) {m.write(`Adapter${i}\0`, ROWS + i * 0x53c + 0x204); m.write(`missing capability ${i}\0`, REASONS + i * 64); put(m, ROWS + i * 0x53c + 0x538, (fixture + i) % 3 ? REASONS + i * 64 : 0);}
    m.write(`${fixture % 2 ? 'Could not select a display mode.' : ''}\0`, MESSAGE); const message = fixture % 11 === 0 ? 0 : MESSAGE;
    const imports = [['operatorNew', 0x56e220, 0xf1000000], ['operatorDelete', 0x56e210, 0xf1000004], ['operatorNewArray', 0x56e474, 0xf1000008], ['operatorDeleteArray', 0x56e470, 0xf100000c], ['_vsnprintf', 0x56e228, 0xf1000010]];
    for (const [, p, v] of imports) put(m, p, v);
    const platformImports = [['GetUserDefaultLangID', 0x56e160, 0xf1000014, 0], ['ShowCursor', 0x56e520, 0xf1000018, 1], ['MessageBeep', 0x56e598, 0xf100001c, 1], ['MessageBoxW', 0x56e59c, 0xf1000020, 4], ['MultiByteToWideChar', 0x56e0c0, 0xf1000024, 6]]; for (const [, p, v] of platformImports) put(m, p, v);
    const APP=0x180000,CAPS=0x190000,OBJECT=0x1a0000,VTABLE=0x1b0000,DEVICE=0x1c0000,CACHE=0x1d0000;
    put(m,0x6efb38,APP); put(m,APP+8,0x12345678);put(m,APP+12,0x23456789);put(m,APP+16,0x34567890);put(m,APP+20,0x456789ab);
    for(let i=0;i<56;i++)m[MANAGER+0x378+i]=(i*17+fixture)&255;
    put(m,MANAGER+0x364,fixture%2?CACHE:0);put(m,0x714ae8,MANAGER);put(m,MANAGER+0x5b4,fixture%2);put(m,MANAGER+0x5b8,3);put(m,MANAGER+0x5bc,2);put(m,MANAGER+0x5c0,4);m[MANAGER+0x5c4]=fixture%2;put(m,CAPS+0x444,0x4000400);put(m,DEVICE,VTABLE);for(const method of [0xe4,0x104,0x10c,0x114])put(m,VTABLE+method,0xf2000000+method);put(m,MANAGER+0x368,OBJECT);put(m,MANAGER+0x36c,0);put(m,MANAGER+0x374,fixture%4);
    put(m,MANAGER+0x488,CAPS);put(m,CAPS,fixture%4);put(m,CAPS+0x420,fixture%2?0x100000:0);put(m,CAPS+0x534,1+fixture%2);
    put(m,OBJECT,VTABLE);put(m,OBJECT+16,VTABLE);put(m,VTABLE+0x40,0xf2000040);
    const services = (memory, log) => {let cursor = 0x200000, formats = 0, casts=0, attempts=0; return {
      dynamicCast(...args) {args.pop(); log.push(['RTTI',args.map(v=>v>>>0)]); casts++; if(casts===1 && fixture%7===0)put(memory,S+4,3); if(casts===2 && fixture%11===0)put(memory,MANAGER+0x368,OBJECT+16); return args[0];},
      direct3DCall(object,method,args) {if(method!==0x40){log.push(['Direct3D',object,method,args.map(v=>v>>>0)]);return -1;} log.push(['Direct3D',object,method,args.map(v=>v>>>0),memory.subarray(args[5],args[5]+56).toString('hex')]);attempts++; const result=fixture%3===0?-1:fixture%3===1&&attempts===1?-1:0; if(!result)put(memory,args[6],DEVICE); return result;},
      libraryCall(name, args) {
        log.push([name, args.map(v => v >>> 0)]);
        if (name.includes('New')) {const p = cursor; cursor += args[0] + 15 & ~15; memory.fill(0x93, p, cursor); return p;}
        if (name === '_vsnprintf') {let index = 0; const text = string(memory, args[2]).replace(/%s/g, () => string(memory, ptr(memory, args[3] + index++ * 4))); memory.write(`${text}\0`, args[0], 'latin1'); formats++; formatted++; if (formats === 1 && fixture % 7 === 0) put(memory, MANAGER + 0x480, ROWS + 0x53c); return text.length;}
      },
      platformCall(name, args) {
        log.push([name, args.map(v => v >>> 0)]);
        if (name === 'GetUserDefaultLangID') return [6, 7, 10, 12, 16, 19, 29, 9, 0x409, 0][fixture % 10];
        if (name === 'MultiByteToWideChar') {if (fixture % 17 === 0) return 0; for (let i = 0; i < Math.min(args[3], args[5]); i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];}
        if (name === 'MessageBoxW') {const wide = p => {let e = p; while (memory.readUInt16LE(e)) e += 2; return memory.toString('utf16le', p, e);}; log.push(['dialogText', wide(args[1]), wide(args[2])]);}
        return 1;
      }
    };};
    runtime.services = services(m, trace); runtime.handlers=runtime.services; machine.reset(); machine.fs0 = 0; m.copy(machine.bytes); const native = services(machine.bytes, nativeTrace);
    for (const [name, , target] of imports) machine.externalCalls.set(target, x => {const n = name === '_vsnprintf' ? 4 : 1, args = Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4)), result = native.libraryCall(name, args); if (result !== undefined) x.r.EAX = result;});
    for (const [name, , target, n] of platformImports) machine.externalCalls.set(target, x => {x.r.EAX = native.platformCall(name, Array.from({length: n}, (_, i) => ptr(x.bytes, x.r.ESP + i * 4))); x.r.ESP += n * 4;});
    machine.externalCalls.set(0x56932a,x=>{x.r.EAX=native.dynamicCast(...Array.from({length:5},(_,i)=>ptr(x.bytes,x.r.ESP+i*4)),{});});
    machine.externalCalls.set(0xf2000040,x=>{const a=Array.from({length:7},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(a[0],0x40,a);x.r.ESP+=28;});
    for(const[method,n]of[[0xe4,3],[0x104,3],[0x10c,4],[0x114,4]])machine.externalCalls.set(0xf2000000+method,x=>{const a=Array.from({length:n},(_,i)=>ptr(x.bytes,x.r.ESP+i*4));x.r.EAX=native.direct3DCall(a[0],method,a);x.r.ESP+=n*4;});
    machine.externalCalls.set(0x568980, x => {x.r.ESP -= x.r.EAX;});
    const move = x => {const target = ptr(x.bytes, x.r.ESP), input = ptr(x.bytes, x.r.ESP + 4), n = ptr(x.bytes, x.r.ESP + 8); Buffer.from(x.bytes.subarray(input, input + n)).copy(x.bytes, target); x.r.EAX = target;}; machine.externalCalls.set(0x568a48, move);
    try {if(fixture%2){constructRendererStateCache(CACHE,0,runtime);machine.entry=0x523fd0;machine.r.ESP=S-0x100;machine.r.ECX=CACHE;put(machine.bytes,S-0x100,-1);put(machine.bytes,S-0xfc,0);steps+=machine.run(10000);calls++;}
      const result=createRendererDevice(MANAGER,fixture%4,runtime); machine.entry = 0x512a30; machine.r.ESP = S; machine.r.ECX = MANAGER; put(machine.bytes, S, -1); put(machine.bytes, S + 4, fixture%4); steps += machine.run(2000000); calls++; assert.equal(machine.r.EAX&255,result);
      assert.deepEqual(nativeTrace, trace); assert.equal(machine.fs0, 0);
      if (!m.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {const p = m.subarray(0x10000).findIndex((v, i) => v !== machine.bytes[0x10000 + i]) + 0x10000; assert.fail(`difference${p.toString(16)} JS=${m.subarray(p, p + 20).toString('hex')} native=${machine.bytes.subarray(p, p + 20).toString('hex')}`);}
    } catch (error) {console.error({fixture, trace: trace.slice(-16), nativeTrace: nativeTrace.slice(-16)}); throw error;}
  }
  const report = {method: 'Actual512a30 device creation with actual402aa0 singleton RTTI and populated50fb20 multilingual failure/string graph. First/second success and double failure, hardware/software flags, additional-window parameter records, mutation of live count/device object during RTTI. All mapped bytes>=10000h, ordered CRT/Win32/COM requests and dialog payloads, FS restoration. Half the cases retain an actual523fd0-constructed cache wrapper and reach full518cb0/519050 default-state game algorithms after successful creation; no cached COM answers. No game mocks/original process/device execution', targetSha256: program.sha256, fixtures, calls, actualGameCalls:visits, formattedAdapterReasons: formatted / 2, reachedInstructions: reached.size, instructionSteps: steps, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(await verifyRendererDeviceCreation({fixtures: Number(process.argv[2] ?? 900)})));
