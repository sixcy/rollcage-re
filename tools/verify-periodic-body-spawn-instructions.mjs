import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {createPlacedModelEffectFixture, placedModelEffectAddresses as sound} from './verify-placed-model-effect-update-instructions.mjs';
import {initializePeriodicBody, spawnPeriodicBody, updatePeriodicBody, handlePeriodicBodyContact} from '../src/periodic-body-spawn.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const SERVICE = 0x750000, PLAYER = 0x680000, SHAPES = 0x6a0000, MAP = 0x6c0000, SESSION = 0x75000, STACK = 0x9000;
const methods = [4, 8, 12, 0x14, 0x20, 0x2c, 0x34, 0x50, 0x5c];

function makeFixture(program, fixture) {
  const f = createPlacedModelEffectFixture(program, fixture), {memory} = f;
  put(memory, 0x5ecb1c, SESSION); memory[SESSION + 0x554] = 1; memory[SESSION + 0x552] = fixture & 1;
  put(memory, 0x70dcf4, 0x680000 + (fixture % 4) * 384); put(memory, 0x6e6b44, [0, 511, 512, 513][fixture % 4]);
  put(memory, 0x91e79c, SHAPES); put(memory, 0x6e6bd4, 0);
  const rows = memory.readUInt32LE(0x909254);
  for (let row = 0; row < 256; row++) {word(memory, rows + row * 16, 0xff00); word(memory, rows + row * 16 + 2, 255); put(memory, rows + row * 16 + 12, MAP);}
  for (let i = 0; i < 256; i++) word(memory, MAP + i * 2, 0);
  for (const [index, player] of [PLAYER, PLAYER + 0x400].entries()) {
    put(memory, 0x909300 + index * 0x30c, player);
    put(memory, player + 0x34, index * 100 * 65536); put(memory, player + 0x38, -2 * 65536); put(memory, player + 0x3c, 0);
    word(memory, player + 0xc8, [-32768, 0, 128, 32767][fixture % 4]); word(memory, player + 0xd4, [32767, 128, 0, -32768][fixture % 4]);
  }
  put(memory, 0x6e6af8, fixture & 1); put(memory, 0x5ec954, [0, 1, -1, 0x7fffffff, 10000, 256][fixture % 6]);
  put(memory, 0x9153c4, f.extraAddresses.particles); put(memory, 0x9153d4, f.extraAddresses.particles + fixture % 129 * 256); put(memory, 0x91900c, f.extraAddresses.particles + 128 * 256);
  put(memory, 0x5eb500, [0, 32, 256, 512][fixture % 4]);
  put(memory, 0x6f2414, fixture % 4 ? sound.bank : 0); put(memory, 0x6f2418, fixture % 4 ? sound.bank + 64 * 4 : 0);
  put(memory, sound.vtable + 0x34, SERVICE + 0x34);
  return {...f, memory, scratchBase: STACK};
}

function audioServices(memory, log, fixture) {
  return {sourceCall(source, method, args) {
    log.push([source, method, args.map(value => Buffer.isBuffer(value) ? value.toString('hex') : value)]);
    //Library services may change the clock; retirement must stamp its live value.
    if (method === 0x34) put(memory, 0x90a548, memory.readInt32LE(0x90a548) + 1);
    if (method === 4 && fixture % 11 === 0) put(memory, 0x9153e0, 0x0c654321);
    return 0;
  }};
}

export async function verifyPeriodicBodySpawn({fixtures = 600, lifecycleFixtures = 12, withRaceUpdate = false, output = 'analysis/periodic-body-spawn-instruction-check.json'} = {}) {
  const retained = await loadRetainedNativeProgram();
  const listing = await loadRetainedListing('analysis/periodic-body-contact-listing.json', 'analysis/native-simulation/results/2418-spawn-contact-callback-bytes.json');
  const program = {...retained, instructions: [...retained.instructions, ...listing.instructions]}, machine = new BoundedX86(program.instructions);
  const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const boundaries = withRaceUpdate ? [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(p => p !== 0x469fd0) : [];
  for (const p of boundaries) machine.entries.delete(p);
  const reached = new Set(), visits = {}, watched = new Set([0x469ec0, 0x469fd0, 0x46a140, 0x46a2c0, 0x46a2d0, 0x479b30, 0x428270, 0x435f20, 0x484bb0, 0x40ea40, 0x40db20, 0x437aa0, 0x475a10]);
  let steps = 0, calls = 0, sourceCalls = 0, spawns = 0, retirements = 0;
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x46a265) spawns++; if (address === 0x46a2d0) retirements++;};
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
  function execute(entry, ecx = 0, args = []) {
    machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = STACK; put(machine.bytes, STACK, -1);
    args.forEach((value, i) => put(machine.bytes, STACK + 4 + i * 4, value));
    steps += machine.run(3_000_000); calls++; return machine.r.EAX;
  }
  function compare(memory, label) {
    assert.equal(machine.fs0, 0x12345678, `${label} explicit TLS chain restored`);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); assert.fail(`${label} byte0x${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
  }
  for (let fixture = 0; fixture < fixtures + lifecycleFixtures; fixture++) {
    const f = makeFixture(program, fixture), {memory} = f, sourceLog = [], nativeLog = [];
    const sourceAudio = audioServices(memory, sourceLog, fixture), nativeAudio = audioServices(machine.bytes, nativeLog, fixture);
    const runtime = {...f, soundRuntime: {memory, handlers: sourceAudio}, handlers: {stopAudioVirtual34: ({object}) => sourceAudio.sourceCall(object, 0x34, [])}};
    if (withRaceUpdate) {
      put(memory, 0x714b08, 0x6d0000); put(memory, 0x6d0000, 0x6d0100); put(memory, 0x6d015c, SERVICE + 0x200);
      for (const p of boundaries) {runtime.handlers[`call${p.toString(16)}`] = () => 0; machine.externalCalls.set(p, m => {m.r.EAX = 0;});}
      runtime.handlers.audioManagerCall = () => 0;
      machine.externalCalls.set(SERVICE + 0x200, m => {m.r.ESP += 4; m.r.EAX = 0;});
    }
    machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes);
    for (const method of methods) machine.externalCalls.set(SERVICE + method, m => {
      let args = [], cleanup = 0; const s = m.r.ESP;
      if ([4, 0x20, 0x2c].includes(method)) {args = [m.bytes.readInt32LE(s)]; cleanup = 4;}
      else if (method === 0x14) {args = [m.bytes.readFloatLE(s)]; cleanup = 4;}
      else if ([8, 12].includes(method)) {const p = m.bytes.readUInt32LE(s); args = [Buffer.from(m.bytes.subarray(p, p + 16))]; cleanup = 4;}
      else if (method === 0x5c) {args = [{vtable: m.bytes.readUInt32LE(s), channelAddress: m.bytes.readUInt32LE(s + 4)}]; cleanup = 24;}
      m.r.EAX = nativeAudio.sourceCall(m.r.ECX >>> 0, method, args); m.r.ESP += cleanup;
    });
    const check = label => {compare(memory, `${fixture}/${label}`); assert.deepEqual(nativeLog, sourceLog, `audio${fixture}/${label}`);};
    const update = () => {
      if (withRaceUpdate) {assert.equal(runRaceUpdate(0, 1, runtime), execute(0x450e50, 0, [1]));}
      else {updatePeriodicBody(runtime); execute(0x469fd0);}
    };
    initializePeriodicBody(runtime); execute(0x469ec0); check('constructor');
    const body = memory.readUInt32LE(0x903510), lifecycle = fixture >= fixtures;
    const set = (p, value) => {put(memory, p, value); put(machine.bytes, p, value);};
    const byte = (p, value) => {memory[p] = machine.bytes[p] = value;};
    //A rejected sector and the sparse-row fallback retain partial spawn writes.
    if (!lifecycle && fixture % 9 === 0) byte(sound.segment + 4, 8);
    if (!lifecycle && fixture % 9 === 1) {const rows = memory.readUInt32LE(0x909254); for (let row = 0; row < 256; row++) {word(memory, rows + row * 16, 0x807f); word(machine.bytes, rows + row * 16, 0x807f);}}
    if (!lifecycle && fixture % 9 === 2) set(0x903518, 256);
    spawnPeriodicBody(PLAYER + 0x34, runtime); execute(0x46a140, PLAYER + 0x34); check('spawn');
    const active = memory.readInt32LE(0x903514) !== 0;
    if (lifecycle) {
      assert(active);
      for (let frame = 0; frame < 204; frame++) {
        set(0x90a548, frame); update(); check(`lifetime${frame}`);
      }
      assert.equal(memory.readInt32LE(0x903514), 0);
      assert.equal(memory.readInt32LE(0x903518), 127);
      set(0x90a548, 1000); set(0x5ec954, 0); update(); check('random-respawn');
      assert.equal(memory.readInt32LE(0x903514), 1);
      assert.equal(handlePeriodicBodyContact(body, runtime), execute(0x46a2c0, 0, [body])); check('contact-retirement');
    } else {
      set(0x90a548, [599, 600, 601, 0x7fffffff, -1, 1000][fixture % 6]);
      set(0x903520, [0, -1, -600, 0x7fffffff][fixture % 4]);
      if (active) {
        set(0x903514, [-1, 1, 8, 9, 10, 199, 200][fixture % 7]);
        //An outside body is valid only before lifetime expiry, avoiding the
        //native invalid double-unregister path (documented separately).
        if (fixture % 7 === 2) set(body + 12, memory.readInt32LE(body + 12) | 1);
      }
      if (fixture % 17 === 0) byte(SESSION + 0x554, 0);
      update(); check('update');
    }
    sourceCalls += sourceLog.length;
  }
  const report = {method: 'Actual469ec0 constructor ->46a140 spawn ->469fd0 lifetime/random respawn and byte-checked46a2c0 collision retirement. Real body allocation/initialization, raw479b30, shape/spatial registration/removal, particle allocator/reuse, debris/terrain/effect and sound emitter/channel descendants. ALL mapped bytes>=10000h and exact libaudio service arguments/order compare after every call. Only compiler cookie and libaudio virtual services are admitted within that graph; scene/audio/pool inputs are constructed. Optional450e50 binding uses41 explicitly contracted other outer game stages and its library manager call; the native469fd0 entry and stack are actual. Expiry+outside simultaneous double-unregister is an invalid native registry domain and is not repaired or admitted. No original-process execution or whole-race proof.', targetSha256: program.sha256, fixtures, lifecycleFixtures, withRaceUpdate, otherOuterContracts: boundaries.length, calls, spawns, retirements, sourceCalls, executedInstructions: reached.size, instructionSteps: steps, visits, evidence: [...retained.references.map(r => r.evidence), ...listing.evidence], matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyPeriodicBodySpawn({fixtures: Number(process.argv[2] ?? 600), lifecycleFixtures: Number(process.argv[3] ?? 12)});
