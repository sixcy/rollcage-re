import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadRetainedNativeProgram, REDUX_SHA256} from './retained-native-program.mjs';
const programPromise = loadRetainedNativeProgram();
const put = (memory, address, value) => memory.writeUInt32LE(value >>> 0, address);

//Constructed PE/retained-instruction fixtures only; no original process runs.
//Only loader HIGHLOW fields and direct relative control-flow origins move.
export async function loadRelocatedAudioFixture(moduleBaseAddress, {executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'} = {}) {
  const file = await readFile(executable);
  assert.equal(createHash('sha256').update(file).digest('hex'), REDUX_SHA256);
  const pe = file.readUInt32LE(60), optional = pe + 24, preferredBase = file.readUInt32LE(optional + 28), delta = moduleBaseAddress - preferredBase;
  assert.equal(preferredBase, 0x400000); assert.equal(file.readUInt16LE(optional), 0x10b);
  const imageSize = file.readUInt32LE(optional + 56), headers = file.readUInt32LE(optional + 60), memory = Buffer.alloc(0x1800000);
  file.copy(memory, moduleBaseAddress, 0, headers);
  for (let index = 0; index < file.readUInt16LE(pe + 6); index++) {
    const row = optional + file.readUInt16LE(pe + 20) + index * 40, rva = file.readUInt32LE(row + 12), length = file.readUInt32LE(row + 16), start = file.readUInt32LE(row + 20);
    file.copy(memory, moduleBaseAddress + rva, start, start + length);
  }
  const relocRva = file.readUInt32LE(optional + 136), relocSize = file.readUInt32LE(optional + 140), relocations = new Map();
  for (let cursor = moduleBaseAddress + relocRva, end = cursor + relocSize; cursor < end;) {
    const page = memory.readUInt32LE(cursor), length = memory.readUInt32LE(cursor + 4);
    assert.ok(length >= 8 && length % 2 === 0 && cursor + length <= end);
    for (let offset = 8; offset < length; offset += 2) {
      const item = memory.readUInt16LE(cursor + offset), type = item >>> 12;
      if (!type) continue;
      assert.equal(type, 3);
      const rva = page + (item & 4095), oldValue = memory.readUInt32LE(moduleBaseAddress + rva);
      assert.ok(!relocations.has(preferredBase + rva));
      relocations.set(preferredBase + rva, oldValue);
      put(memory, moduleBaseAddress + rva, oldValue + delta);
    }
    cursor += length;
  }
  const program = await programPromise, next = new Map(program.instructions.slice(0, -1).map((row, index) => [row.address, program.instructions[index + 1].address]));
  let relocatedOperands = 0;
  const unresolvedRelocations = new Map();
  const instructions = program.instructions.map(row => {
    const args = [...row.args];
    let length = Math.min(15, (next.get(row.address) ?? row.address + 1) - row.address);
    const opcode = memory[moduleBaseAddress + row.address - preferredBase];
    if ([0xc3, 0xcb, 0xcc].includes(opcode)) length = 1;
    else if ([0xc2, 0xca].includes(opcode)) length = 3;
    else if (opcode === 0xe9) length = 5;
    else if (opcode === 0xeb) length = 2;
    for (let offset = 0; offset + 4 <= length; offset++) {
      if (!relocations.has(row.address + offset)) continue;
      const value = relocations.get(row.address + offset), positions = [];
      for (const [index, argument] of args.entries()) for (const match of argument.matchAll(/0x[0-9a-f]+/gi)) if (Number(match[0]) === value) positions.push({index, start: match.index, text: match[0]});
      //An isolated retained instruction can have a following listing gap. It
      //is not permitted to infer operands for relocations in that unseen gap.
      if (!positions.length) {unresolvedRelocations.set(row.address + delta, row.address + offset); continue;}
      assert.equal(positions.length, 1, `Ambiguous HIGHLOW operand at0x${row.address.toString(16)}`);
      const found = positions[0], argument = args[found.index];
      args[found.index] = argument.slice(0, found.start) + `0x${(value + delta).toString(16)}` + argument.slice(found.start + found.text.length);
      relocatedOperands++;
    }
    if ((row.op === 'CALL' || row.op.startsWith('J')) && args.length === 1 && /^0x[0-9a-f]+$/i.test(args[0])) {
      const target = Number(args[0]);
      if (target >= preferredBase && target < preferredBase + imageSize) args[0] = `0x${(target + delta).toString(16)}`;
    }
    return {...row, address: row.address + delta, args};
  });
  return {memory, instructions, imageSize, delta, actual: value => value + delta, relocatedOperands, unresolvedRelocations};
}

