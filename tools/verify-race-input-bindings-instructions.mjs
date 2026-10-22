import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {selectRaceInputCalibration, readRaceInputButtonMask} from '../src/race-input-bindings.mjs';

const ledger = JSON.parse(await readFile('analysis/race-startup-callee-evidence.json', 'utf8'));
const file = ledger.find(e => e.address === '433d80' && e.operation === 'procedure_assembly').path.split('/').pop();
const own = await readInstructionEvidence([file], {directory: 'analysis/native-simulation/results'});
const listing = await loadRetainedListing('analysis/race-input-dispatch-listing.json', 'analysis/native-simulation/results/9059-startup-input-dispatch-0x45eac0.json');
const machine = new BoundedX86([...own.instructions, ...listing.instructions]), reached = new Set(); machine.onInstruction = address => reached.add(address);
const tables = [];
for (let id = 9060; id <= 9063; id++) {const name = `${id}-startup-input-dispatch-0x${(0x45ebb0 + (id - 9060) * 16).toString(16)}.json`; const e = JSON.parse(await readFile(`analysis/native-simulation/results/${name}`, 'utf8')).structuredContent; tables.push(e);}
const STACK = 0x9000, CONFIG = 0x20000, COUNT = 0x21000, ROWS = 0x22000, MANAGER = 0x23000, VTABLE = 0x24000, DEVICE = 0x25000, DV = 0x26000, GET = 0x5a0100, TYPE = 0x5a0200;
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
const fixtures = Number(process.argv[2] ?? 8000);
let steps = 0, lookups = 0, typeQueries = 0, rewrittenBindings = 0;
for (let fixture = 0; fixture < fixtures; fixture++) for (const calibration of [false, true]) {
  machine.reset(); const native = machine.bytes; native.fill(0x36); native.fill(0, STACK - 256, STACK + 32);
  put(native, 0x5ecefc, CONFIG); put(native, 0x714b54, MANAGER); put(native, MANAGER, VTABLE); put(native, VTABLE + 0x14, GET); put(native, DEVICE, DV); put(native, DV + 0x30, TYPE);
  for (let i = -2; i < 4; i++) {put(native, 0x57070c + i * 4, COUNT); put(native, 0x574734 + i * 4, ROWS);}
  const index = fixture % 8 - 2, deviceId = fixture % 7;
  put(native, COUNT, fixture % 7 - 1);
  for (let i = 0; i < 6; i++) {put(native, ROWS + i * 16 + 4, i % 2); put(native, ROWS + i * 16 + 8, (deviceId + i - 1) % 7);}
  if (fixture % 3 === 0) {put(native, ROWS + 4, 1); put(native, ROWS + 8, deviceId);}
  for (let i = 0; i < 4; i++) {
    native[CONFIG + i * 0x90 + 0x1a3] = fixture % 13 ? 1 : 0;
    const base = [0x908ea0, 0x908b20, 0x908ce0, 0x908960][i];
    for (const [j, offset] of [4, 20, 68, 36].entries()) put(native, base + offset, [0, 1, 2, -1][(Math.floor(fixture / (4 ** j)) + i) % 4]);
  }
  for (const e of tables) Buffer.from(e.normalized_result.bytes_hex, 'hex').copy(native, Number(e.normalized_result.address));
  const source = Buffer.from(native), nativeLog = [], sourceLog = [], state = new Map([[native, 0], [source, 0]]);
  const call = (m, log, owner, method, args, entry) => {
    log.push([owner, method, args, entry]);
    if (method === 0x14) {
      const serial = state.get(m); state.set(m, serial + 1);
      if (serial === 0 && fixture % 17 === 0) {put(m, ROWS + 8, deviceId + 16); rewrittenBindings++;}
      return (fixture + serial) % 5 ? DEVICE : 0;
    }
    return [-1, 0, 1, 2, 7][(fixture + state.get(m)) % 5];
  };
  const runtime = {memory: source, scratchBase: STACK, handlers: {inputManagerCall: (owner, method, args, context) => call(source, sourceLog, owner, method, args, context.scratchBase)}};
  const expected = calibration ? selectRaceInputCalibration(index, deviceId, runtime) : readRaceInputButtonMask(index, runtime);
  machine.externalCalls.set(GET, m => {const args = [native.readInt32LE(m.r.ESP), native.readInt32LE(m.r.ESP + 4)]; m.r.EAX = call(native, nativeLog, m.r.ECX, 0x14, args, m.r.ESP - 4); m.r.ESP += 8; lookups++;});
  machine.externalCalls.set(TYPE, m => {m.r.EAX = call(native, nativeLog, m.r.ECX, 0x30, [], m.r.ESP - 4); typeQueries++;});
  machine.entry = calibration ? 0x433d80 : 0x45eac0; machine.r.ESP = STACK; machine.r.ECX = index; machine.r.EDX = deviceId; put(native, STACK, -1);
  try {steps += machine.run(); assert.equal(machine.r.EAX, expected, 'EAX'); assert.deepEqual(nativeLog, sourceLog, 'ordered virtual calls/arguments/child ESP'); assert.deepEqual(native.subarray(0x10000), source.subarray(0x10000), 'all mapped state');}
  catch (error) {console.error({fixture, calibration, index, nativeLog, sourceLog}); throw error;}
}
const report = {method: 'Actual433d80 binding scan/calibration policy and full45eac0 four-table mask dispatch versus byte-checked original Listing+procedure assembly. Admitted calls compare EAX/all mapped bytes>=10000h and ordered input-manager/device virtual requests/native child ESP. The input virtuals are explicit mutable contracts, not a claim of recovered game adapter/platform classification. Covers four participant banks, signed out-of-range indices, pointer-based count slots, positive/zero/negative counts, missing/first matching bindings, changed binding between repeated lookups, absent devices and returned device kinds. Pure button masking covers combinations of0/1/2/-1 binding states and disabled configuration. No original-process execution.', evidence: [...own.evidence.map(e => e.evidence_id), ...listing.evidence], fixtures, calls: fixtures * 2, lookups, typeQueries, rewrittenBindings: rewrittenBindings / 2, instructions: own.instructions.length + listing.instructions.length, instructionsReached: reached.size, instructionSteps: steps, matched: true};
await writeFile('analysis/race-input-bindings-instruction-check.json', JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary));
