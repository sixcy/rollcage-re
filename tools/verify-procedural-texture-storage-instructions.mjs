import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {initializeProceduralTextureStorage, initializeProceduralTexturePalette, updateProceduralTexture} from '../src/procedural-texture.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

export async function verifyProceduralTextureStorage({fixtures = 6, withRaceUpdate = false, output = 'analysis/procedural-texture-storage-instruction-check.json'} = {}) {
const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, STORAGE = 0x200000, SURFACE = 0x300000, SERVICE = 0x7e0000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), reached = new Set(), visits = {}; let steps = 0, libraryCalls = 0, publicCalls = 0;
machine.onInstruction = p => {reached.add(p); if ([0x499760, 0x499a90, 0x499de0, 0x499b90].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
const contracts = withRaceUpdate ? [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(p => p !== 0x499de0) : [];
for (const p of contracts) {machine.entries.delete(p); machine.externalCalls.set(p, m => {m.r.EAX = 0;});}
machine.externalCalls.set(SERVICE + 0x300, m => {m.r.ESP += 4; m.r.EAX = 0;});
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); machine.reset();
  put(memory, 0x56e258, SERVICE + 0x100); put(memory, 0x56e214, SERVICE + 0x200);
  put(memory, 0x714ae8, 0x50000); put(memory, 0x50000, 0x53000); put(memory, 0x50000 + 0x444, 0x52000); put(memory, 0x51000, 0x53000);
  put(memory, 0x53090, SERVICE + 0x90); put(memory, 0x53008, SERVICE + 8); put(memory, 0x5300c, SERVICE + 12); put(memory, 0x5142c, [8, 16, 32][fixture % 3]);
  Buffer.from([3,11,2,5,3,0,7,15]).copy(memory,0x52004); put(memory, 0x52018, fixture & 1); put(memory, 0x5ed02c, 2); put(memory, 0x6e1628, 77); put(memory, 0x5ecefc, 0x54000); memory[0x54028] = 1;
  if(withRaceUpdate){put(memory,0x80b5e0,0x55000);put(memory,0x55188,1);put(memory,0x714b08,0x56000);put(memory,0x56000,0x57000);put(memory,0x5705c,SERVICE+0x300);}
  memory.fill(0x53, STORAGE, STORAGE + 0x75840); memory.fill(0x69, 0x7139b0, 0x7143b0);
  const failAllocation = fixture === fixtures - 1, hashes = [createHash('sha256'), createHash('sha256')], counts = [0, 0], buffer = Buffer.alloc(24);
  const math = side => Object.fromEntries(['sin', 'cos', 'hypot'].map((name, kind) => [name, (...args) => {
    buffer.fill(0); buffer.writeInt32LE(kind); args.forEach((v,i)=>buffer.writeDoubleLE(v,8+i*8)); hashes[side].update(buffer); counts[side]++; return Math[name](...args);
  }]));
  const sourceMath = math(0), nativeMath = math(1), runtime = {memory, scratchBase: STACK, math: sourceMath, handlers: {allocate: size => {assert.equal(size, 0x75840); return failAllocation ? 0 : STORAGE;}}};
  if(withRaceUpdate){for(const p of contracts)runtime.handlers[`call${p.toString(16)}`]=()=>0;runtime.handlers.audioManagerCall=()=>0;}
  machine.externalCalls.set(SERVICE + 0x100, m => {assert.equal(m.bytes.readUInt32LE(m.r.ESP), 0x75840); m.r.EAX = failAllocation ? 0 : STORAGE;});
  machine.externalCalls.set(0x568a50, m => {const p=m.bytes.readUInt32LE(m.r.ESP),v=m.bytes.readUInt32LE(m.r.ESP+4),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(v&255,p,p+n);m.r.EAX=p;});
  for (const [address, name] of [[0x569336,'cos'],[0x569348,'sin']]) machine.externalCalls.set(address, m => {m.scalars.XMM0 = nativeMath[name](m.scalars.XMM0); m.doubleScalars.add('XMM0'); m.integerVectors.delete('XMM0'); m.qwords.delete('XMM0'); m.zeroVectors.delete('XMM0');});
  machine.externalCalls.set(SERVICE + 0x200, m => {m.x87.push(nativeMath.hypot(m.bytes.readDoubleLE(m.r.ESP),m.bytes.readDoubleLE(m.r.ESP+8)));});
  memory.copy(machine.bytes);
  const execute = entry => {machine.entry=entry;machine.r.ESP=STACK;machine.r.EDX=0;put(machine.bytes,STACK,-1);if(entry===0x450e50)put(machine.bytes,STACK+4,1);steps+=machine.run(30_000_000);publicCalls++;};
  const compare = label => {const native=machine.bytes.subarray(0x10000),source=memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${fixture}/${label} byte${(offset+0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}};
  initializeProceduralTextureStorage(runtime); execute(0x499760); compare('storage');
  assert.equal(counts[0],counts[1]);assert.equal(hashes[0].digest('hex'),hashes[1].digest('hex'),`ordered libm arguments${fixture}`);libraryCalls+=counts[0];
  if(failAllocation)continue;
  const logs=[[],[]],renderer=(m,side)=>(object,method,args)=>{logs[side].push([object,method,args]);if(method===0x90)return 0x51000;if(method===8){put(m,args[0],SURFACE);put(m,args[2],512);return 1;}return 0;};
  runtime.handlers.rendererCall=renderer(memory,0);const nativeRenderer=renderer(machine.bytes,1);
  for(const[method,n]of[[0x90,1],[8,3],[12,1]])machine.externalCalls.set(SERVICE+method,m=>{const args=Array.from({length:n},(_,i)=>m.bytes.readInt32LE(m.r.ESP+i*4));m.r.EAX=nativeRenderer(m.r.ECX>>>0,method,args);m.r.ESP+=n*4;});
  initializeProceduralTexturePalette(runtime);execute(0x499a90);compare('palette');
  for(let frame=0;frame<6;frame++){
    for(const m of[memory,machine.bytes])put(m,0x90a548,frame*3);
    if(withRaceUpdate){runRaceUpdate(0,1,runtime);execute(0x450e50);}else{updateProceduralTexture(runtime);execute(0x499de0);}compare(`frame${frame}`);assert.deepEqual(logs[0],logs[1]);
  }
}
const report={method:'Actual499760 field/phase storage constructor ->499a90 palette producer and real40a1e0/40a2f0 conversion ->persistent499de0 texture updates. All mapped bytes>=10000h and complete ordered libm argument hashes agree. Only CRT allocation/memset, declared sin/cos/hypot library results and renderer virtual methods are external within this graph. Optional450e50 binding contracts41 other game stages and its library audio-manager call. Float32 input rounding, double arithmetic and double-stored x87 product are interpreted; libm results use declared JavaScript Math services and do not establish original CRT bit identity or extended x87 exceptional behavior. Original constants read live, allocation failure retained. No original process execution.',targetSha256:program.sha256,fixtures,withRaceUpdate,otherOuterContracts:contracts.length,publicCalls,libraryCalls,executedInstructions:reached.size,instructionSteps:steps,visits,evidence:program.references.map(r=>r.evidence),matched:true};
if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyProceduralTextureStorage({fixtures:Number(process.argv[2]??6)});
