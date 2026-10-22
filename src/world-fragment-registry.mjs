import templates from './world-fragment-templates.json' with {type: 'json'};
import {createRawBody, initializeRawBody, registerRawBodyShapes, registerRawBodySpatial} from './raw-body-construction.mjs';
import {removeBodySpatial, unregisterPhysicalBody} from './body-retirement.mjs';
import {emitRawEffectParticles, emitRawBodyDebris} from './body-retirement-effects.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';

const pointer = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);

export function initializeWorldFragmentTemplates(memory) {
  Buffer.from(templates.bytesHex, 'hex').copy(memory, templates.address);
}

//4810b0, installed at body+148 by activation. Upper velocity words are
//signed16, differences/products wrap32, and only the final low16 is stored.
export function recordWorldFragmentImpact(body, other, {memory}) {
  if (other) {
    let squared = 0;
    for (const offset of [0x6a, 0x6e, 0x72]) {
      const difference = memory.readInt16LE(body + offset) - memory.readInt16LE(other + offset);
      squared = (squared + Math.imul(difference, difference)) | 0;
    }
    memory.writeUInt16LE(squared & 65535, body + 0x160);
  }
  return 1;
}

//480760. Heap allocation is the caller's ordinary malloc service. The body
//arena, spatial map and model pack must already be constructed by their owners.
export function initializeWorldFragments({memory, scratchBase, allocate}) {
  memory[0x9207e0] = 0; memory[0x9205d8] = 0; memory[0x9207e1] = 0;
  put(memory, 0x6e6bcc, 0); put(memory, 0x6e6bd0, 0);
  const registry = allocate(0x120) >>> 0;
  if (registry) memory.fill(0, registry, registry + 0x120);
  put(memory, 0x849a5c, registry);
  const auxiliary = allocate(0x2a0) >>> 0;
  if (auxiliary) memory.fill(0, auxiliary, auxiliary + 0x2a0);
  put(memory, 0x9205dc, auxiliary);
  const workspace = allocate(0x2000) >>> 0;
  if (workspace) memory.fill(0, workspace, workspace + 0x2000);
  for (let index = 0; index < 36; index++) {
    const pack = pointer(memory, 0x90b98c); memory[0x849940 + index] = 0;
    const indices = pointer(memory, pack + 0x58), models = pointer(memory, pack + 0x18);
    //The large-model row is read even when another size is selected.
    let model = pointer(memory, models + memory.readInt16LE(indices + 6) * 4);
    if (index >= 4) model = pointer(memory, models + memory.readInt16LE(indices + (index < 12 ? 4 : 2)) * 4);
    const body = createRawBody(model, 0x1c07, 0x180, 0, {memory, scratchBase: scratchBase - 24});
    put(memory, 0x849980 + index * 4, body);
    initializeRawBody(body, index < 4 ? 0x5ecc00 : index < 12 ? 0x5eccd8 : 0x5ecb28, {memory, scratchBase: scratchBase - 16});
    removeBodySpatial(pointer(memory, 0x849980 + index * 4), {memory});
  }
  const retainedAuxiliary = pointer(memory, 0x9205dc);
  memory.fill(0, pointer(memory, 0x849a5c), pointer(memory, 0x849a5c) + 0x120);
  memory.fill(0, retainedAuxiliary, retainedAuxiliary + 0x2a0);
  for (const [offset, delta] of [[0x8c, 0], [0x134, 0x800], [0x1dc, 0x1000], [0x284, 0x1800]]) put(memory, retainedAuxiliary + offset, workspace + delta);
}

//480bf0. The captured registry row intentionally does not follow the cursor
//while occupied. Native code retries that one row28 times and returns.
export function activateWorldFragment(position, momentum, selector, tag, {memory}) {
  let cursor = pointer(memory, 0x6e6bcc), iteration = 0;
  const row = pointer(memory, 0x849a5c) + cursor * 8;
  while (iteration < 28) {
    if (!memory[row + 4]) {
      selector &= 255;
      if (selector > 3) return;
      let slot = selector >= 2 ? 0 : selector === 1 ? 4 : 12;
      while (slot < 28 && memory[0x849940 + slot]) slot++;
      if (slot === 28) return;
      const kind = slot < 4 ? 3 : slot < 12 ? 2 : 1, body = pointer(memory, 0x849980 + slot * 4);
      memory[row + 4] = 64; memory[0x849940 + slot] = 1; memory.writeUInt16LE(0, body + 0x160);
      put(memory, body + 0x148, 0x4810b0); memory[row + 5] = slot;
      memory[row + 6] = kind; put(memory, row, body);
      for (const offset of [0, 4, 8]) put(memory, body + 0x34 + offset, memory.readInt32LE(position + offset));
      for (const offset of [0, 4, 8]) put(memory, body + 0x40 + offset, memory.readInt32LE(momentum + offset) << 8);
      put(memory, body + 0x164, row);
      const actualKind = memory[row + 6], radius = memory.readUInt16LE(pointer(memory, body + 0x10) + 0x32);
      const side = Math.floor(radius * (actualKind <= 2 ? 30 : 25) / 100) << 8;
      const vertical = Math.floor(radius * (actualKind === 1 ? 60 : actualKind === 2 ? 40 : 30) / 100) << 8;
      const values = [0, side, 0, vertical, 1, side, 0, -side, vertical, 1, -side, 0, -side, vertical, 1];
      values.forEach((value, index) => put(memory, 0x849a20 + index * 4, value));
      registerRawBodyShapes(body, 3, 0x849a20, {memory});
      memory[row + 7] = tag & 255;
      registerRawBodySpatial(body, {memory});
      cursor = pointer(memory, 0x6e6bcc); iteration = 28;
    }
    cursor = cursor + 1 < 28 ? cursor + 1 : 0;
    put(memory, 0x6e6bcc, cursor); iteration++;
  }
}

//480e90. The ascending scan can encounter fragments activated by an earlier
//retirement during the same call. Registry storage is reloaded for each row.
export function maintainWorldFragments({memory, scratchBase, soundRuntime}) {
  put(memory, 0x6e6bc8, 0);
  const local = scratchBase - 0x44;
  for (let index = 0; index < 36; index++) {
    const row = pointer(memory, 0x849a5c) + index * 8, age = memory[row + 4];
    if (!age) continue;
    const kind = memory[row + 6], limit = kind === 1 ? 700 : kind === 2 ? 1000 : 1200;
    let body = pointer(memory, row);
    put(memory, 0x6e6bc8, memory.readInt32LE(0x6e6bc8) + 1);
    put(memory, body, (pointer(memory, body) & (age < 62 ? 0xfffffe07 : 0xfffffe15)) | (age < 62 ? 7 : 21));
    if (memory[row + 4] && !(memory[0x90a548] & 63)) memory[row + 4]--;
    body = pointer(memory, row);
    if (memory.readUInt16LE(body + 0x160) < limit && memory[row + 4]) {memory.writeUInt16LE(0, body + 0x160); continue;}
    unregisterPhysicalBody(body, {memory});
    removeBodySpatial(pointer(memory, row), {memory});
    const slot = memory[row + 5];
    if (slot >= 36) throw Error('World fragment availability index triggers native range-check failure.');
    const effectPosition = pointer(memory, row) + 0x34;
    memory[0x849940 + slot] = 0; memory[row + 4] = 0;
    emitNativeEffect(17, effectPosition, [0, 900, 13000, 7, 0, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, soundRuntime ?? {memory})});
    const emitKind = memory[row + 6], count = emitKind === 1 ? 2 : emitKind * 2;
    body = pointer(memory, row);
    emitRawEffectParticles(body + 0x34, body + 0x68, count, memory.readInt32LE(0x9153d8), 4, {memory});
    emitRawBodyDebris(body + 0x34, body + 0x68, count, {memory});
    const splitKind = memory[row + 6];
    if (splitKind > 1) {
      body = pointer(memory, row);
      const x = memory.readInt32LE(body + 0x34), y = memory.readInt32LE(body + 0x38), z = memory.readInt32LE(body + 0x3c);
      for (const offset of [0, 4, 8]) put(memory, local + 0x14 + offset, memory.readInt32LE(body + 0x40 + offset) >> 10);
      for (const [offset, value] of [[0x20, x + 0x300000], [0x24, y], [0x28, z - 0x300000], [0x30, x - 0x300000], [0x34, y], [0x38, z + 0x300000]]) put(memory, local + offset, value);
      activateWorldFragment(local + 0x20, local + 0x14, (splitKind - 2) & 255, index, {memory});
      activateWorldFragment(local + 0x30, local + 0x14, (memory[row + 6] - 2) & 255, index, {memory});
    }
  }
}
