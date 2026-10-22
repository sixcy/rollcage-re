import test from 'node:test';
import assert from 'node:assert/strict';
import {autonomousCandidateAddress as row, resetAutonomousCandidates, linkedAutonomousCandidateScore} from '../src/autonomous-candidate-scores.mjs';
import {autonomousCandidateModeGain, evaluateAutonomousCandidateAlignment, applyAutonomousCandidateModeBias, applyAutonomousCandidateEventBias, initializeAutonomousCandidateModifierTables, hasAutonomousItemFour, isAutonomousCandidateInsideTurn} from '../src/autonomous-candidate-modifiers.mjs';

const BODY = 0x10000, PACK = 0x20000, GROUPS = 0x21000, POINTS = 0x30000, SESSION = 0x40000, SCENE = 0x41000, EVENTS = 0x42000;
function fixture() {
  const memory = Buffer.alloc(0xa00000), put = (address, value) => memory.writeInt32LE(value | 0, address), word = (address, value) => memory.writeUInt16LE(value & 65535, address);
  put(0x90b98c, PACK); put(PACK + 0x60, GROUPS); put(0x5ecb1c, SESSION); put(0x90b990, SCENE); put(SCENE + 0xf8, EVENTS);
  initializeAutonomousCandidateModifierTables(memory); memory.writeInt8(-1, BODY + 0x6da); memory[SESSION + 0x586] = 3;
  for (let group = 0; group < 4; group++) {word(GROUPS + group * 12, 3); put(GROUPS + group * 12 + 8, POINTS + group * 0x1000); for (let point = 0; point < 3; point++) word(POINTS + group * 0x1000 + point * 16, point * 100);}
  return {memory, put, word, context: {memory, scratchBase: 0x9000}};
}

test('candidate reset preserves untouched vector/metadata bytes in every row', () => {
  const {memory, context} = fixture(); memory.fill(0x7b, row(0), row(20)); resetAutonomousCandidates(context);
  for (let index = 0; index < 20; index++) {assert.equal(memory.readInt32LE(row(index)), 0); assert.equal(memory.readInt32LE(row(index) + 44), 0); assert.equal(memory.readUInt16LE(row(index) + 42), 0); assert.equal(memory[row(index) + 40], 0x7b); assert.equal(memory[row(index) + 4], 0x7b);}
});

test('linked extra score uses all rows, with found flags surviving later improvements', () => {
  const {memory, put, word, context} = fixture(); put(POINTS + 0x1000 + 12, 2 | (3 << 14));
  word(row(0), 2); put(row(0) + 48, -20); word(row(1), 3); put(row(1) + 48, -30);
  word(row(2), 2); put(row(2) + 48, -10); word(row(3), 3); put(row(3) + 48, 4);
  assert.equal(linkedAutonomousCandidateScore(1, 0, context), 4);
  put(POINTS + 0x1000 + 12, 0); assert.equal(linkedAutonomousCandidateScore(1, 0, context), 0);
});

test('mode gain uses asymmetric exact gap boundaries and absent-competitor default', () => {
  const {memory, put, context} = fixture(); memory[BODY + 0x6da] = 0;
  for (const [gap, expected] of [[-8193, 65536], [-8192, 32768], [8191, 32768], [8192, 16384], [16383, 16384], [16384, -16384], [32768, -65536]]) {put(BODY + 0x6dc, gap); assert.equal(autonomousCandidateModeGain(BODY, context), expected);}
  memory.writeInt8(-1, BODY + 0x6da); assert.equal(autonomousCandidateModeGain(BODY, context), 32768);
});

test('alignment low-speed override and wrapped shifted score match the straight route', () => {
  const {memory, put, word, context} = fixture(); word(row(19), 1); memory[row(19) + 2] = 1; put(0x50000, 0); put(0x50020, -65536);
  evaluateAutonomousCandidateAlignment(19, 0x50000, 0x50020, 9999, context);
  assert.equal(memory.readInt32LE(row(19) + 28), 65536); assert.equal(memory.readInt32LE(row(19) + 32), 65464); assert.equal(memory.readInt32LE(row(19) + 44), -1);
  evaluateAutonomousCandidateAlignment(19, 0x50000, 0x50020, 10000, context); assert.equal(memory.readInt32LE(row(19) + 28), -65500);
});

test('mode cost propagates over preceding same-group rows without requiring their flag', () => {
  const {memory, put, word, context} = fixture(); memory[BODY + 0x6ec] = 0x40;
  for (const index of [17, 18, 19]) word(row(index), 1);
  memory[row(19) + 2] = 1; put(POINTS + 0x1000 + 16 + 8, (1 << 30) | 4);
  applyAutonomousCandidateModeBias(BODY, 17, context);
  assert.equal(memory.readInt32LE(row(19) + 44), 5); assert.equal(memory.readInt32LE(row(18) + 44), 5); assert.equal(memory.readInt32LE(row(17) + 44), 0);
});

test('turn side tests reject zero and require the strict sign of both directions', () => {
  const {put, context} = fixture(); put(0x50000, 65536); put(0x50028, 65536); put(0x50038, 65536);
  assert.equal(isAutonomousCandidateInsideTurn(0x50000, 0x50010, 0x50020, 0x50030, 1, context), 1);
  assert.equal(isAutonomousCandidateInsideTurn(0x50000, 0x50010, 0x50020, 0x50030, -1, context), 0);
  put(0x50000, 0); assert.equal(isAutonomousCandidateInsideTurn(0x50000, 0x50010, 0x50020, 0x50030, 1, context), 0);
});

test('event type4 requires raw item4 then writes mode20, preserving the FF threshold rule', () => {
  const {memory, word, context} = fixture(); word(BODY + 0x6c0, 1); word(row(19), 2); memory[SCENE + 0xf6] = 1; word(EVENTS, 2); memory[EVENTS + 4] = 4; memory[EVENTS + 6] = 255;
  memory[BODY + 0x68c] = 0x24; assert.equal(hasAutonomousItemFour(BODY, context), 0);
  applyAutonomousCandidateEventBias(BODY, 18, context); assert.equal(memory[row(19) + 38], 1); assert.equal(memory.readUInt16LE(row(19) + 42), 0);
  memory[row(19) + 38] = 0; memory[BODY + 0x68c] = 4; applyAutonomousCandidateEventBias(BODY, 18, context);
  assert.equal(memory[row(19) + 38], 0); assert.equal(memory.readUInt16LE(row(19) + 42), 0x20); assert.equal(memory.readInt32LE(row(19) + 44), 0);
});
