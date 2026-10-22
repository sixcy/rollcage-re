import {toModelYawQuery} from './model-transforms.mjs';
import {acceptsCollisionPlane} from './terrain-candidates.mjs';
import {queryPointSphereContact, queryEdgeSphereContact} from './static-sphere-primitives.mjs';
import {unpackCollisionNormal} from './collision-grid.mjs';

const get = (memory, address) => memory.readInt32LE(address), ptr = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const vector = (memory, address) => [0, 4, 8].map(offset => get(memory, address + offset));
const short = value => value << 16 >> 16;

//429600 in the actual respawn zero-travel/zero-time call domain. Invoke the
//real point/edge children even though native overwrites their flags with2.
function acceptsRawRespawnModelShape(shape, object, record, output, {memory, roundingMode}) {
  output.flags = 0;
  const model = ptr(memory, object + 0x10), vertices = ptr(memory, model + 0x40) - 8;
  const packed = ptr(memory, shape + 16), count = packed >>> 16 & 31, reference = model + memory.readUInt16LE(model + 0x38) + (packed & 255) * 9;
  const origin = [0x36, 0x3a, 0x3e].map(offset => memory.readInt16LE(object + offset));
  if (count === 1) {
    const point = origin.map((value, axis) => (value + memory.readInt16LE(shape + axis * 2)) << 8);
    queryPointSphereContact(memory.subarray(record, record + 72), point, output, 0, {roundingMode}); output.flags = 2; return true;
  }
  const vertex = id => origin.map((value, axis) => short(value + memory.readInt16LE(vertices + id * 8 + axis * 2)));
  if (count === 2) {
    const edge = model + memory.readUInt16LE(model + 0x3a) + memory[reference] * 8;
    queryEdgeSphereContact(memory.subarray(record, record + 72), vertex(memory[edge + 4]), vertex(memory[edge + 5]), unpackCollisionNormal(ptr(memory, edge)), output, 0, {roundingMode}); output.flags = 2; return true;
  }
  const query = {originQ8: vector(memory, record + 8), deltaQ8: vector(memory, record + 20), radiusQ8: get(memory, record + 64)};
  for (let index = 0; index < count - 1; index++) {
    const face = ptr(memory, object + 0x2c) + memory[reference + index * 9 + 8] * 8;
    if (!acceptsCollisionPlane(query, ptr(memory, face + 4), vertex(memory[face]), 0x80000000)) {output.flags = 0; return false;}
  }
  output.flags = 2; return true;
}

//429360 reached by47d040. The aggregate supplies geometry, not the possibly
//overwritten clone pose. Count local writes occur before/after each acceptance,
//where a later empty region can observe their retained private-stack bytes.
export function appendRawRespawnModelCandidates(body, record, {memory, views, scratchBase, roundingMode}) {
  if (vector(memory, record + 20).some(value => value !== 0)) throw Error('Respawn model append requires its parent zero-travel aggregate.');
  //429363 PUSH EBX preserves47d040's aggregate pointer below this native
  //entry. Later49b690 notification-address padding consumes these bytes.
  if (Number.isInteger(scratchBase)) put(memory, scratchBase - 108, record);
  const bucket = ptr(memory, body + 12) & 0xfffffffe, bounds = ptr(memory, bucket), count = bounds >>> 19 & 7;
  let list = ptr(memory, 0x9092bc) + (bounds >>> 22) * 4 + 4;
  const output = views.outputAt(scratchBase - 40), countAddress = scratchBase - 92;
  for (let index = 0; index < count; index++, list += 4) {
    const object = ptr(memory, list); if (memory[object + 0x19a] === 5) continue;
    let accepted = memory.readUInt16LE(body + 0x15e); put(memory, countAddress, accepted);
    let target = ptr(memory, body + 0x158) + accepted * 16;
    const model = ptr(memory, object + 0x10), shapeBase = model + memory.readUInt16LE(model + 0x34);
    const original = [8, 16, 20, 28].map(offset => get(memory, record + offset));
    const query = toModelYawQuery({originQ8: vector(memory, record + 8), deltaQ8: vector(memory, record + 20), radiusQ8: get(memory, record + 64)}, vector(memory, object + 0x34), memory[object + 0x199]);
    put(memory, record + 16, query.originQ8[2]); put(memory, record + 8, query.originQ8[0]); put(memory, record + 20, query.deltaQ8[0]); put(memory, record + 28, query.deltaQ8[2]);
    for (let slot = 0; slot < memory[model + 0x27]; slot++) {
      const shape = shapeBase + slot * 20;
      if ((memory[ptr(memory, object + 0x194) + slot * 4 + 3] & 15) === 5 || !(memory[shape + 18] & 31)) continue;
      if (!acceptsRawRespawnModelShape(shape, object, record, output, {memory, roundingMode})) continue;
      put(memory, countAddress, ++accepted);
      put(memory, target + 8, object); put(memory, target + 12, shape); memory[target + 1] = memory[object + 0x199];
      const flags = memory[target] & 0xf1; put(memory, target + 4, -4); memory[target] = flags | 1; target += 16;
    }
    [8, 16, 20, 28].forEach((offset, index) => put(memory, record + offset, original[index]));
    memory.writeUInt16LE(memory.readUInt32LE(countAddress) & 65535, body + 0x15e);
  }
}
