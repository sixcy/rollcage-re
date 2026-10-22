import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createSimulationVehicleFixture} from './lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from './lib/post-frame-runtime-fixtures.mjs';
import {initializeWormholeConstructionTables, createWormholeBody, activateWormhole} from '../src/wormhole-construction.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
import {initializeWormholeStateTables, updateWormholeState, retireWormhole, filterWormholeContact, transportWormholeTarget, writeWormholeTransportDestination, copyWormholeOwnerDynamics, updateWormholeWait} from '../src/wormhole-state.mjs';
import {removeBodySpatial} from '../src/body-retirement.mjs';
import {registerRawBodySpatial} from '../src/raw-body-construction.mjs';
import {createProtocolFixture, createProtocolServiceFixture, installProtocolInstructionServices} from './verify-game-network-protocol-instructions.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export async function createWormholeStateFixture(program, fixture = 0) {
  const f = createSimulationVehicleFixture(program, fixture, {vehicleCount: 2, models: fixture % 3 === 1, vehicleFilters: false, extraBodyStorage: [{address: 0x70f130, length: 0x3e78}, {address: 0x210000, length: 0x2a80}]}), {memory: m} = f, runtime = configurePostFrameFixture(f, fixture, 0x9000), owner = f.bodies[0].address, target = f.bodies[1].address;
  initializeWormholeConstructionTables(m); initializeWormholeVisualTables(m); initializeWormholeStateTables(m); put(m, 0x70dcf4, 0x200000); m.fill(0x93, 0x210000, 0x216000); put(m, 0x6e6b44, 0); put(m, 0x90b990, 0x94000); word(m, 0x9402e, fixture % 3);
  for (let i = 0; i < 180; i++) {put(m, 0x95000 + i * 16, 0xa1b20000 | i * 7919 & 65535); put(m, 0x95004 + i * 16, 0xc3d40000 | i * 713 & 65535); put(m, 0x95008 + i * 16, fixture * 173 + i * 7919);}
  put(m, 0x90b980, 0x96000); for (let i = 0; i < 1024; i++) put(m, 0x96000 + i * 4, 0xff808080);
  put(m, 0x6eafe0, 0); put(m, 0x810920, 0); m[runtime.memory.readUInt32LE(0x5ecb1c) + 0x551] = 3;
  for (const [i, body] of [[0, owner], [1, target]]) {
    removeBodySpatial(body, runtime); put(m, body + 0x34, 0); put(m, body + 0x38, -30 * 65536); put(m, body + 0x3c, i ? 10 * 65536 : 140 * 65536); [65536, 0, 0, 0].forEach((v, j) => put(m, body + 0x58 + j * 4, v)); for (let j = 0; j < 9; j++) word(m, body + 0xc4 + j * 2, j % 4 ? 0 : 4096); registerRawBodySpatial(body, runtime);
    word(m, body + 0x65e, i); m[body + 0x718] = 0; m[body + 0x68c] = 7; m[body + 0x68d] = 0xff; put(m, 0x909300 + i * 0x30c, body); put(m, 0x909354 + i * 0x30c, 0x9c00c); put(m, 0x909358 + i * 0x30c, 1); put(m, 0x909324 + i * 0x30c, i * 1000); m.write(i ? 'Target' : 'Owner', 0x6e7894 + i * 0x67c); m[0x6e7894 + i * 0x67c + (i ? 6 : 5)] = 0;
  }
  return {...f, runtime, owner, target};
}
export async function verifyWormholeState({fixtures = 560, networkMessages = true, localizedMessages = true, failedPeers = false, withRaceUpdate = false, frames = 1, output = 'analysis/wormhole-state-expanded-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), own = await readInstructionEvidence(['3101-object-stage-49ac30-assembly.json', '3103-object-stage-49ae80-assembly.json', '3111-object-stage-49b5b0-assembly.json', '3127-object-stage-49b690-assembly.json', '3139-object-stage-49ba20-assembly.json', '3141-object-stage-49baa0-assembly.json', '3161-wormhole-contact-filter-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const rows = localizedMessages ? JSON.parse(await readFile('analysis/finish-message-source-rows.json', 'utf8')) : null, languages = ['ENGLISH', 'FRENCH', 'GERMAN', 'ITALIAN', 'SPANISH'];
  const outer = withRaceUpdate ? await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'}) : null;
  const contracts = outer ? [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x49ac30) : [];
  for (const address of contracts) machine.entries.delete(address);
  let processed = '@'; if (rows) for (const [key, data] of Object.entries(rows.tables)) {processed += `STRING(${key})\n[\n`; for (const language of languages) {processed += `${language}\n[\n`; for (const row of data[language]) processed += Buffer.from(row.hex, 'hex').toString('latin1') + '\0~'; processed += ']\n';} processed += ']\n';}
  let steps = 0, cookies = 0, calls = 0; const reached = new Set(), visits = {}, phraseLanguages = {}, entries = [0x49ac30, 0x49ae80, 0x49ab40, 0x49b690, 0x49ba20, 0x49baa0, 0x49b5b0], watched = [...entries, 0x49a6f0, 0x49a820, 0x47d040, 0x47d440, 0x47d900, 0x435ba0, 0x474850, 0x4284d0, 0x49c930, 0x4a0620, 0x4579e0, 0x472700, 0x439850, 0x439780, 0x439610, 0x439580, 0x4a0420, 0x4a0210, 0x49fcd0, 0x46f860, 0x46fef0, 0x470ea0, 0x472560];
  if (withRaceUpdate) watched.push(0x450e50);
  machine.onInstruction = (p, state) => {steps++; reached.add(p); if (watched.includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; if (p === 0x472700) {const language = state.bytes.readUInt16LE(0x6e65f0); phraseLanguages[languages[language]] = (phraseLanguages[languages[language]] ?? 0) + 1;}}; machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)); cookies++;}); machine.externalCalls.set(0x5689b0, m => {m.r.ESP = m.r.ESP - m.r.EAX & ~15;}); machine.externalCalls.set(0x568980, m => {m.r.ESP -= m.r.EAX;});
  if (withRaceUpdate) {const priorHook = machine.onInstruction; machine.onInstruction = (p, state) => {if (p === 0x49ac30) assert.equal(state.r.ESP, 0x9000 - 20); priorHook(p, state);};}
  const run = (entry, ecx = 0, edx = 0, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = 0x9000; put(machine.bytes, 0x9000, -1); args.forEach((v, i) => put(machine.bytes, 0x9004 + i * 4, v)); machine.run(5_000_000); calls++;};
  const compare = (m, label) => {const actual = machine.bytes.subarray(0x10000), expected = m.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((v, i) => v !== expected[i]); assert.fail(`${label}: byte0x${(offset + 0x10000).toString(16)} native${actual[offset]} JS${expected[offset]}`);}};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = await createWormholeStateFixture(program, fixture), {memory: m, runtime, owner, target} = f; machine.reset(); m.copy(machine.bytes);
    try {
      const body = createWormholeBody(runtime); run(0x49a6f0); compare(m, `create${fixture}`); assert.equal(body, 0x210000);
      assert.equal(activateWormhole(0x909300, 1, 0, 0, 0, runtime), 1); run(0x49a820, 0x909300, 1, [0, 0, 0]); compare(m, `activate${fixture}`);
      const selector = withRaceUpdate ? 0 : fixture % entries.length, entry = withRaceUpdate ? 0x450e50 : entries[selector], jsService = createProtocolServiceFixture(fixture, m), nativeService = createProtocolServiceFixture(fixture, machine.bytes), sourceOuter = [], nativeOuter = [];
      if (withRaceUpdate) {
        const handler = (log, address, entryEsp) => {assert.equal(entryEsp, 0x9000 - 20); log.push(address); return 0;};
        runtime.handlers = Object.fromEntries(contracts.map(address => [`call${address.toString(16)}`, request => handler(sourceOuter, address, request.scratchBase)]));
        for (const address of contracts) machine.externalCalls.set(address, state => {state.r.EAX = handler(nativeOuter, address, state.r.ESP - 4);});
        runtime.handlers.audioManagerCall = (object, method, args) => sourceOuter.push([object, method, args]);
        machine.externalCalls.set(0xa20020, state => {nativeOuter.push([state.r.ECX >>> 0, 0x5c, [state.bytes.readInt32LE(state.r.ESP)]]); state.r.ESP += 4;});
        for (const memory of [m, machine.bytes]) {put(memory, 0x714b08, 0x270000); put(memory, 0x270000, 0x270100); put(memory, 0x27015c, 0xa20020); memory[memory.readUInt32LE(0x90b990) + 0xfc] = 0;}
      }
      if (failedPeers) for (const service of [jsService, nativeService]) {const ordinary = service.services.networkCall; service.services.networkCall = (object, method, args, r) => {if (method === 0x6c) {service.trace.push({name: 'network', object: object >>> 0, method, args: args.map(v => v >>> 0)}); return 3;} return ordinary(object, method, args, r);};}
      const sprintf = (memory, args) => {const read = p => memory.toString('latin1', p, memory.indexOf(0, p)), pattern = read(args[1]); let index = 2; const text = pattern.replace(/%([%s])/g, (_, type) => type === '%' ? '%' : read(args[index++])); memory.write(text, args[0], 'latin1'); memory[args[0] + text.length] = 0; return text.length;};
      if (networkMessages) {
        for (const memory of [m, machine.bytes]) {const privateStack = withRaceUpdate ? Buffer.from(memory.subarray(0x6000, 0xa000)) : null; createProtocolFixture(fixture, memory); privateStack?.copy(memory, 0x6000); put(memory, 0x6e9f70, 1); put(memory, 0x6eafe0, fixture % 3 ? failedPeers && fixture % 2 ? 0x87 : 0xc7 : 0); put(memory, 0x56e114, 0xa20010); put(memory, 0x56e0fc, 0xa20014); put(memory, 0x56e224, 0xa20018); memory[m.readUInt32LE(0x5ecb1c) + 0x721] = 128;}
        if (localizedMessages) for (const memory of [m, machine.bytes]) {
          const session = memory.readUInt32LE(0x5ecb1c), settings = memory.readUInt32LE(0x5ecefc), language = languages[Math.floor(fixture / 7) % 5]; memory[session + 0x721] = fixture % 2 ? 0 : 128; memory[session + 0x1c] = 0; memory[session + 0x1d] = 1; memory[settings + 5] = 0;
          memory.write(processed, 0x260000, 'latin1'); memory[0x260000 + processed.length] = 0; put(memory, 0x6e65f4, 0x260000); put(memory, 0x6e65e4, processed.length); word(memory, 0x6e65f0, Math.floor(fixture / 7) % 5);
          if (fixture % 4) {memory[0x6e7894] = 0; memory[0x6e7f10] = 0;}
          for (const phrase of [26, 27]) {const row = rows.tables.PC_NETWORK_MESSAGES[language][phrase + 8], template = Buffer.from(row.hex, 'hex'), address = settings + 0x104e + phrase * 64; template.copy(memory, address); memory[address + template.length] = 0;}
        }
        runtime.services = {...jsService.services, crtCall: (name, args) => {assert.equal(name, 'sprintf'); return sprintf(m, args);}}; installProtocolInstructionServices(machine, nativeService); machine.externalCalls.set(0xa20018, state => {const args = [state.bytes.readUInt32LE(state.r.ESP), state.bytes.readUInt32LE(state.r.ESP + 4)], pattern = state.bytes.toString('latin1', args[1], state.bytes.indexOf(0, args[1])), count = (pattern.match(/%(?:%|s)/g) ?? []).filter(v => v === '%s').length; for (let i = 0; i < count; i++) args.push(state.bytes.readUInt32LE(state.r.ESP + 8 + i * 4)); state.r.EAX = sprintf(state.bytes, args);});
      }
      for (const memory of [m, machine.bytes]) {
        put(memory, body + 0x198, target); put(memory, body + 0x180, [0, 39, 40, 59, 89, 299][Math.floor(fixture / 7) % 6]); put(memory, body + 0x188, [0, 1, 2, 4, 16, 64, 128, 7][Math.floor(fixture / 7) % 8]); put(memory, body + 0x1dc, -1); put(memory, body + 0x1d0, 0); put(memory, body + 0x1d4, 0); put(memory, body + 0x1d8, 65536); memory[body + 0x2a3c] = [0, 254, 255][fixture % 3];
        memory[owner + 0x718] = (withRaceUpdate ? fixture % 5 === 1 : Math.floor(fixture / 7) % 4 === 1) ? 8 : 0; memory[target + 0x718] = (withRaceUpdate ? fixture % 5 === 2 : Math.floor(fixture / 7) % 4 === 2) ? 8 : 0;
        if ((selector === 6 || selector === 0 && memory.readInt32LE(body + 0x188) === 128) && fixture % 2) {removeBodySpatial(body, {memory}); put(memory, body + 0x34, 0); put(memory, body + 0x38, -30 * 65536); put(memory, body + 0x3c, 11 * 65536); registerRawBodySpatial(body, {memory}); put(memory, body + 0x1dc, 1);}
      }
      for (let tick = 0; tick < frames; tick++) {
      let result;
      if (withRaceUpdate) result = runRaceUpdate(tick % 2, 2, runtime);
      else if (selector === 0) updateWormholeState(runtime);
      else if (selector === 1) retireWormhole(body, fixture & 1, runtime);
      else if (selector === 2) result = filterWormholeContact(body, runtime);
      else if (selector === 3) transportWormholeTarget(body, runtime);
      else if (selector === 4) writeWormholeTransportDestination(body, runtime);
      else if (selector === 5) copyWormholeOwnerDynamics(body, runtime);
      else updateWormholeWait(body, runtime);
      let audit = [], hook = machine.onInstruction;
      if (fixture === Number(process.env.WORMHOLE_STACK_AUDIT)) {
        const event = jsService.trace.filter(event => event.name === 'network' && event.method === 0x50).at(-1), addresses = event ? [event.args[0] - 88, event.args[0] - 84, event.args[0] - 164, event.args[0] - 160] : [], values = addresses.map(p => machine.bytes.readUInt32LE(p)); let previous;
        machine.onInstruction = (p, state) => {hook(p, state); addresses.forEach((address, i) => {const value = state.bytes.readUInt32LE(address); if (value !== values[i]) {audit.push([previous?.toString(16), address.toString(16), value.toString(16)]); values[i] = value;}}); previous = p;};
      }
      try {run(entry, withRaceUpdate ? 0 : body, withRaceUpdate ? tick % 2 : fixture & 1, withRaceUpdate ? [2] : selector === 2 ? [body] : []); if (result !== undefined) assert.equal(machine.r.EAX, result); compare(m, `state${fixture}/${entry.toString(16)}/${tick}`); if (networkMessages) assert.deepEqual(nativeService.trace, jsService.trace, `services${fixture}`); if (withRaceUpdate) assert.deepEqual(nativeOuter, sourceOuter);} catch (error) {if (audit.length) console.error({audit: audit.slice(-20)}); throw error;} finally {machine.onInstruction = hook;}
      }
    } catch (error) {console.error({fixture, visits}); throw error;}
  }
  const report = {method: 'Actual49a6f0→49a820 coherent scene/body/visual construction followed by49ac30 states,49ae80/49ab40 retirement,49b5b0 crossing/timeout,49b690 terrain-query/respawn/owner-dynamics/score transfer and49ba20/49baa0 helpers. All mapped data>=10000h compared after every stage, ordered external network/performance services when enabled. Constructed real floor/model/shape/spatial/session/route/particle/debris inputs, not installed scene-loader proof. Constructor→activation private stack remains connected; later state ABI has declared caller stack input when networking setup is enabled. Original installed localization row bytes are supplied as explicit processedresource8 input; actual game name/phrase/history/transport algorithms execute. No original execution.', ...(withRaceUpdate ? {withRaceUpdate, frames, otherOuterStageContracts: contracts.length, outerEvidence: outer.evidence.map(v => v.evidence_id)} : {}), networkMessages, localizedMessages, failedPeers, phraseLanguages, localizationResourceSHA256: rows?.resourceSHA256 ?? null, targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, calls, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, matched: true};
  if (withRaceUpdate) report.method = 'Actual49a6f0 construction and49a820 activation followed by persistent450e50→default49ac30 frames and every reached wormhole/query/respawn/visual/localized-message/protocol descendant. Actual native49ac30 entryESP=S−20 asserted. Other41 outer game stages are explicit caller contracts and final manager virtual call is a service; this is stage integration, not full race-frame equivalence. All mapped data>=10000h and ordered CRT/network/performance requests compared after each stage. Constructor, activation and all outer ticks preserve private stack without fresh resets or native-memory import. Real localization rows are supplied as processed-resource input. No original execution.';
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWormholeState()));
