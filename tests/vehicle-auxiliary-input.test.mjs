import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVehicleAuxiliaryInput, sendAuxiliaryPresetMessage, checksumNotificationPacket, constructNotificationAddress, initializeVehicleAuxiliaryInputTables} from '../src/vehicle-auxiliary-input.mjs';
import {createAuxiliaryInputFixture, auxiliaryAddresses, verifyVehicleAuxiliaryInput} from '../tools/verify-vehicle-auxiliary-input-instructions.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const writeText = (memory, address, value) => {memory.write(value, address, 'ascii'); memory[address + value.length] = 0;};
const readText = (memory, address) => memory.toString('ascii', address, memory.indexOf(0, address));

test('auxiliary tables initialize the original separator without resetting live state', () => {
  const memory = Buffer.alloc(0xa00000, 0x7b);
  initializeVehicleAuxiliaryInputTables(memory);
  assert.equal(memory.subarray(0x5d049c, 0x5d049f).toString('hex'), '3a2000');
  assert.equal(memory[0x6f2424], 0x7b);
  assert.equal(memory[0x5e8280], 0x7b);
});

test('local selection sentinel maps to record zero and local toggles work with networking disabled', () => {
  const context = createAuxiliaryInputFixture(1), {memory} = context, a = auxiliaryAddresses;
  put(memory, 0x6eafe0, 0); put(memory, a.body + 0x714, 0xfff00000);
  const toggle = memory[a.settings + 0x25], global = memory.readInt32LE(0x91ce90);
  updateVehicleAuxiliaryInput(context.record, context);
  assert.equal(context.record, 0x909300);
  assert.equal(memory[a.settings + 0x25], toggle ^ 1);
  assert.equal(memory.readInt32LE(0x91ce90), global ^ 4);
});

test('a nonselected record cannot send or change either local toggle', () => {
  const context = createAuxiliaryInputFixture(0), {memory} = context, a = auxiliaryAddresses;
  put(memory, a.body + 0x714, 0xfff00000);
  const before = Buffer.from(memory);
  updateVehicleAuxiliaryInput(context.record, context);
  assert.deepEqual(memory, before);
});

test('preset dispatch captures input flags while later messages and toggles reload live settings', () => {
  const context = createAuxiliaryInputFixture(1), {memory} = context, a = auxiliaryAddresses, log = [];
  put(memory, 0x6eafe0, 5); put(memory, a.body + 0x714, 0xc0300000);
  writeText(memory, a.settings + 0x120, 'P'); writeText(memory, a.settings + 0xdce, 'First');
  writeText(memory, a.replacement + 0x120, 'Q'); writeText(memory, a.replacement + 0xdce + 64, 'Next');
  const oldToggle = memory[a.settings + 0x25], nextToggle = memory[a.replacement + 0x25], oldGlobal = memory.readInt32LE(0x91ce90);
  updateVehicleAuxiliaryInput(context.record, {...context, handlers: {sendInterface: request => {
    log.push(readText(memory, request.args[0] + 8));
    put(memory, a.body + 0x714, 0); put(memory, context.record, a.other); put(memory, 0x5ecefc, a.replacement);
    return 1;
  }}});
  assert.deepEqual(log, ['P: First', 'Q: Next']);
  assert.equal(readText(memory, 0x6eaedc), 'Q: Next');
  assert.equal(readText(memory, 0x6eaedc + 65), 'P: First');
  assert.equal(memory[a.settings + 0x25], oldToggle);
  assert.equal(memory[a.replacement + 0x25], nextToggle ^ 1);
  assert.equal(memory.readInt32LE(0x91ce90), oldGlobal ^ 4);
});

test('empty presets leave notification history untouched', () => {
  const context = createAuxiliaryInputFixture(1), {memory} = context;
  memory[auxiliaryAddresses.settings + 0xdce] = 0;
  const before = Buffer.from(memory.subarray(0x6eaedc, 0x6eafe0));
  sendAuxiliaryPresetMessage(0, context);
  assert.deepEqual(memory.subarray(0x6eaedc, 0x6eafe0), before);
});

test('a long authored preset is truncated to64bytes before checksum and history insertion', () => {
  const context = createAuxiliaryInputFixture(1), {memory} = context, a = auxiliaryAddresses;
  put(memory, 0x6eafe0, 5); writeText(memory, a.settings + 0x120, 'Name'); writeText(memory, a.settings + 0xdce, 'x'.repeat(63));
  let sent;
  sendAuxiliaryPresetMessage(0, {...context, handlers: {sendInterface: request => {sent = Buffer.from(memory.subarray(request.args[0], request.args[0] + request.args[1])); return 1;}}});
  assert.equal(sent.length, 73); assert.equal(sent[72], 0);
  assert.equal(readText(memory, 0x6eaedc).length, 64);
  const checksum = sent.readInt32LE(4); sent.writeInt32LE(0, 4);
  assert.equal(checksum, sent.reduce((sum, value) => sum + value, 0));
});

test('active chat can update history without a network interface or platform handler', () => {
  const context = createAuxiliaryInputFixture(1), {memory} = context, a = auxiliaryAddresses;
  put(memory, 0x6eafe0, 5); put(memory, 0x6e6d10, 0);
  writeText(memory, a.settings + 0x120, 'P'); writeText(memory, a.settings + 0xdce, 'Hi');
  sendAuxiliaryPresetMessage(0, context);
  assert.equal(readText(memory, 0x6eaedc), 'P: Hi');
});

test('checksum clears its own field even for nonpositive signed lengths', () => {
  const memory = Buffer.alloc(128, 0xff);
  assert.equal(checksumNotificationPacket(16, -1, {memory}), 0);
  assert.equal(memory.readInt32LE(20), 0);
  assert.equal(checksumNotificationPacket(16, 3, {memory}), 765);
});

test('address construction preserves padding and observes a source alias after default initialization', () => {
  const memory = Buffer.alloc(0xa00000, 0x5a), address = 0x20000;
  memory.fill(0xff, 0x5e8280, 0x5e828a); memory.fill(0, 0x6f2424, 0x6f2438);
  constructNotificationAddress(address, address, {memory});
  assert.equal(memory.subarray(address, address + 10).toString('hex'), 'ffffffffffffffffffff');
  assert.equal(memory.subarray(address + 16, address + 36).toString('hex'), '00'.repeat(20));
  assert.equal(memory.subarray(address + 10, address + 16).toString('hex'), '5a'.repeat(6));
  assert.equal(memory.subarray(address + 36, address + 40).toString('hex'), '5a'.repeat(4));
});

test('actual auxiliary/network game closure matches retained x86 with populated caller state', async () => {
  const report = await verifyVehicleAuxiliaryInput({fixtures: 400, helperFixtures: 40, output: null});
  assert.equal(report.instructions, 472);
  assert.equal(report.matched, true);
  assert.ok(report.sends > 0);
  for (const address of ['0x42be80', '0x42bdb0', '0x4a0620', '0x4a0420', '0x471820', '0x4a0180', '0x49ea00', '0x54d660', '0x54d700', '0x54d720']) assert.ok(report.actualGameCalls[address] > 0, address);
});
