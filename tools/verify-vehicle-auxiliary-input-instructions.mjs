import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateVehicleAuxiliaryInput, initializeVehicleAuxiliaryInputTables, checksumNotificationPacket, constructNotificationAddress} from '../src/vehicle-auxiliary-input.mjs';

export const auxiliaryAddresses = {body: 0x10000, other: 0x20000, settings: 0x30000, replacement: 0x40000, iface: 0x50000, otherInterface: 0x51000, vtable: 0x52000, stack: 0x9000, send: 0x700000};
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const text = (memory, address, value) => {memory.write(value, address, 'latin1'); memory[address + value.length] = 0;};

export function createAuxiliaryInputFixture(fixture) {
  const a = auxiliaryAddresses, memory = Buffer.alloc(0xa00000), selected = [-2, -1, 0, 2, 5, 6][fixture % 6];
  const record = 0x909300 + (fixture % 4 ? selected === -1 ? 0 : selected : (selected + 1)) * 0x30c;
  const masks = [0, ...Array.from({length: 10}, (_, id) => 0x100000 << id), 0x40000000, 0x80000000, 0xfff00000, 0xaaa00000, 0x55500000];
  initializeVehicleAuxiliaryInputTables(memory); memory.fill(0xa5, a.stack - 4096, a.stack + 64);
  put(memory, record, a.body); put(memory, a.body + 0x714, masks[Math.floor(fixture / 6) % masks.length]);
  put(memory, 0x6e9f70, selected); put(memory, 0x6eafe0, [0, 1, 3, 5, 7, 0x45][Math.floor(fixture / 17) % 6]);
  put(memory, 0x5ecefc, a.settings); put(memory, 0x91ce90, Math.imul(fixture, 0x437aa7) ^ 0xaa55aa55);
  for (const settings of [a.settings, a.replacement]) {
    memory[settings + 0x25] = fixture & 255;
    text(memory, settings + 0x120, 'N'.repeat([0, 1, 15, 48][fixture % 4]));
    for (let id = 0; id < 10; id++) text(memory, settings + 0xdce + id * 64, fixture % 5 === 0 && id % 3 === 0 ? '' : `${settings === a.settings ? 'A' : 'B'}${id}`.repeat([1, 4, 16, 31][(fixture + id) % 4]));
  }
  for (let index = 0; index < 4; index++) text(memory, 0x6eaedc + index * 65, `old${index}/${fixture}`);
  put(memory, 0x6e6d10, fixture % 7 ? a.iface : 0); put(memory, a.iface, a.vtable); put(memory, a.otherInterface, a.vtable); put(memory, a.vtable + 0x50, a.send);
  for (let index = 0; index < 6; index++) put(memory, 0x6e7880 + index * 0x67c, fixture % 9 ? 1 : 0);
  put(memory, 0x6e9f74, fixture * 17); put(memory, 0x6e9f78, 0xabc00000 | fixture); memory[0x6e65db] = fixture & 255;
  memory.fill(0xff, 0x5e8280, 0x5e828a); memory.fill(0, 0x6f2424, 0x6f2438);
  if (fixture % 3 === 0) for (let offset = 0; offset < 20; offset++) memory[0x6f2424 + offset] = (fixture + offset * 13) & 255;
  put(memory, 0x5e8890, 0x4a42be80);
  return {memory, fixture, record, scratchBase: a.stack};
}

export function createAuxiliarySendService(context, log) {
  const {memory, fixture} = context, a = auxiliaryAddresses;
  return request => {
    const [packet, length] = request.args;
    // Native address padding10..15 and36..39 contains prior stack residue.
    // Compare every initialized address field, with native addresses unchanged.
    log.push({ecx: request.ecx, functionAddress: request.functionAddress, args: request.args, packet: memory.subarray(packet, packet + length).toString('hex'), address: request.address, addressBytes: [memory.subarray(request.address, request.address + 10).toString('hex'), memory.subarray(request.address + 16, request.address + 36).toString('hex')], addressFlags: request.addressFlags});
    if (fixture % 11 === 0) {put(memory, 0x5ecefc, a.replacement); put(memory, 0x6e6d10, a.otherInterface); put(memory, context.record, a.other); put(memory, a.body + 0x714, 0);}
    if (fixture % 13 === 0) {memory[0x6eafe0] &= ~1; put(memory, 0x6e9f70, 5);}
    return fixture % 3 ? 1 : 0;
  };
}

export async function verifyVehicleAuxiliaryInput({fixtures = 6000, helperFixtures = 2000, output = 'analysis/vehicle-auxiliary-input-instruction-check.json'} = {}) {
  const directory = 'analysis/native-simulation/results';
  const {instructions, evidence} = await readInstructionEvidence(['275-vehicle-state-42be80-assembly.json', '841-auxiliary-input-consumer-assembly.json', '170-notification-queue-assembly.json', '174-notification-send-assembly.json', '843-notification-send-probe-assembly.json', '845-notification-packet-checksum-assembly.json', '847-notification-address-constructor-assembly.json', '853-network-address-base-assembly.json', '855-network-address-string-assembly.json', '857-network-address-label-assembly.json'], {directory});
  const machine = new BoundedX86(instructions), a = auxiliaryAddresses, visits = new Map(), watched = new Set([0x42be80, 0x42bdb0, 0x4a0620, 0x4a0420, 0x471820, 0x4a0180, 0x49ea00, 0x54d660, 0x54d700, 0x54d720]);
  let steps = 0, sends = 0, cookies = 0;
  machine.onInstruction = address => {if (watched.has(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x5689b0, m => {m.r.ESP = (m.r.ESP - m.r.EAX) & ~15;});
  machine.externalCalls.set(0x568162, m => {assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)); cookies++;});
  const ranges = [[a.body, 0x1000], [a.other, 0x1000], [a.settings, 0x2000], [a.replacement, 0x2000], [0x5ecefc, 4], [0x6e65d8, 4], [0x6e6d10, 4], [0x6e7880, 0x2800], [0x6eaedc, 0x108], [0x909300 - 0x618, 9 * 0x30c], [0x91ce90, 4]];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const source = createAuxiliaryInputFixture(fixture), sourceLog = [], nativeLog = [];
    machine.reset(); source.memory.copy(machine.bytes);
    const nativeSend = createAuxiliarySendService({...source, memory: machine.bytes}, nativeLog);
    machine.externalCalls.set(a.send, m => {
      const args = [0, 4, 8, 12, 16].map(offset => m.bytes.readUInt32LE(m.r.ESP + offset));
      m.r.EAX = nativeSend({ecx: m.r.ECX >>> 0, functionAddress: a.send, args, address: m.r.ESP + 20, addressFlags: [60, 64].map(offset => m.bytes.readUInt32LE(m.r.ESP + offset))});
      m.r.ESP += 68;
    });
    updateVehicleAuxiliaryInput(source.record, {...source, handlers: {sendInterface: createAuxiliarySendService(source, sourceLog)}});
    machine.entry = 0x42be80; machine.r.ECX = source.record; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    try {
      steps += machine.run(1_000_000); assert.deepEqual(nativeLog, sourceLog, `sends ${fixture}`);
      for (const [address, length] of ranges) assert.deepEqual(machine.bytes.subarray(address, address + length), source.memory.subarray(address, address + length), `fixture ${fixture} / 0x${address.toString(16)}`);
    } catch (error) {console.error({fixture, record: source.record.toString(16), sourceLog, nativeLog}); throw error;}
    sends += sourceLog.length;
  }
  // Direct checksum and address fixtures also exercise signed lengths and live
  // source/destination overlaps outside the ordinary chat caller's valid range.
  for (let fixture = 0; fixture < helperFixtures; fixture++) {
    const memory = Buffer.alloc(0xa00000), packet = 0x10000, address = 0x20000, values = fixture % 3 ? 0x30000 : address;
    for (let offset = 0; offset < 128; offset++) memory[packet + offset] = (fixture + offset * 11) & 255;
    for (let offset = 0; offset < 40; offset++) {memory[address + offset] = (fixture + offset * 3) & 255; memory[values + offset] = (fixture + offset * 7) & 255;}
    memory.fill(0xff, 0x5e8280, 0x5e828a); memory.fill(fixture & 255, 0x6f2424, 0x6f2438);
    machine.reset(); memory.copy(machine.bytes);
    const length = [-2, -1, 0, 1, 2, 3, 4, 7, 64, 73][fixture % 10];
    const expected = checksumNotificationPacket(packet, length, {memory});
    machine.entry = 0x4a0180; machine.r.ECX = packet; machine.r.EDX = length; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1);
    steps += machine.run(); assert.equal(machine.r.EAX | 0, expected); assert.deepEqual(machine.bytes.subarray(packet, packet + 128), memory.subarray(packet, packet + 128));
    constructNotificationAddress(address, values, {memory}); machine.entry = 0x49ea00; machine.r.ECX = address; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, values);
    steps += machine.run(); assert.deepEqual(machine.bytes.subarray(address, address + 40), memory.subarray(address, address + 40));
  }
  const constants = await Promise.all(['851-auxiliary-message-separator-bytes.json', '858-notification-native-address-template.json', '859-notification-address-defaults.json'].map(async name => {const result = JSON.parse(await readFile(`${directory}/${name}`, 'utf8')); return result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);}));
  const report = {method: 'Complete 42be80 selected-player auxiliary dispatch and actual preset chat42bdb0, queue4a0620, mode2 flags0 transport4a0420, readiness471820, checksum4a0180 and address49ea00/54d660/54d700/54d720. Only platform network send virtual method, dynamic stack allocation and compiler security-cookie services are boundaries. Original separator/default-address/template bytes retained; caller explicitly owns body/records/settings/preset messages/peers/network interface. Exact sent packets and all30 initialized address bytes, service arguments/order and mutable body/settings/records/history/sequence/selection/global state compared; native address padding10..15/36..39 remains unspecified stack residue. Callback mutations replace settings/interface/body and disable networking; captured input flags still govern later preset calls/toggles. Direct numeric helpers add signed-length and overlapping-address checks. No actual network/original-process execution.', evidence: [...evidence, ...constants].map(item => item.evidence_id), instructions: instructions.length, fixtures, directHelperFixtures: helperFixtures, sends, cookieChecks: cookies, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleAuxiliaryInput()));
