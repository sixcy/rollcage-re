import {buildRenderRotationMatrix, transformRenderShortVector} from './wheel-render-state.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {releaseBodyAttachments} from './body-attachment-release.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {emitRawEffectParticles, emitRawBodyDebris, alterRawTerrainBrightness, appendRawBodyFlash} from './body-retirement-effects.mjs';
import {activateRawPersistentEmitter} from './attachment-effects.mjs';
import {activateWorldFragment} from './world-fragment-registry.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';

const get = (memory, address) => memory.readInt32LE(address), ptr = (memory, address) => memory.readUInt32LE(address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address), word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

//Original image DWORDs, retained3016/3020. Static restoration is separate from
//480760, which does not reset an in-flight preparation or the variant index.
export function initializePlacedObjectDestructionState(memory) {put(memory, 0x5ea4dc, 255); put(memory, 0x6e6558, 0); return memory;}

//492b50/492c00. Read the original mutable table from the shared native image.
export function lookupDestructionAngle(angle, sine, {memory}) {
  if (sine) angle = angle + 0x19220 | 0;
  let value = angle < 0 ? -angle | 0 : angle | 0;
  if (value > 0x6487f) value = value - 0x6487f | 0;
  let offset, negative = false;
  if (value <= 0x19220) offset = value >> 9;
  else if (value <= 0x3243f) {offset = 0x3243f - value >> 9; negative = true;}
  else if (value <= 0x4b65f) {offset = value - 0x3243f >> 9; negative = true;}
  else if (value <= 0x6487f) offset = 0x6487f - value >> 9;
  else return 0;
  const selected = get(memory, 0x575228 + offset * 4);
  return sine !== negative ? -selected | 0 : selected;
}

//421f60. One shared object is prepared in two separate parent ticks. Native
//pointers, copied geometry and queue phase remain live throughout each stage.
export function preparePlacedObjectDestruction({memory}) {
  const phase = get(memory, 0x5ea4dc);
  if (phase === 255) return 1;
  if (phase !== 0 && phase !== 1) return 0;
  if (phase === 0) {
    const row = ptr(memory, 0x91f1a4), object = ptr(memory, 0x91f1ac), model = ptr(memory, 0x91f1a8);
    let cursor = ptr(memory, row + 0x8c); put(memory, row + 0x90, cursor);
    const source = ptr(memory, object + 0x24); put(memory, row + 0x98, cursor);
    put(memory, row + 0x90, cursor + memory.readUInt16LE(model + 4) * 8);
    const difference = source - cursor | 0;
    for (let index = 0; index < memory.readUInt16LE(model + 4) * 2; index++, cursor += 4) {
      put(memory, cursor, get(memory, cursor + difference)); if (index & 1) word(memory, cursor + 2, 0);
    }
    put(memory, object + 0x24, get(memory, row + 0x98));
    for (let offset = 0; offset < 32; offset += 4) put(memory, row + 8 + offset, get(memory, object + 0xc4 + offset));
    put(memory, 0x5ea4dc, 1); return 0;
  }
  const row = ptr(memory, 0x91f1a4), model = ptr(memory, 0x91f1a8), object = ptr(memory, row + 4);
  const configuration = ptr(memory, 0x909294) + memory.readUInt16LE(object + 0x190) * 16;
  put(memory, row + 0x9c, model + memory.readUInt16LE(model + 0x34)); word(memory, row, memory.readUInt16LE(object + 0x192));
  word(memory, row + 0x30, memory[model + 0x27]); word(memory, row + 0x32, memory.readUInt16LE(model + 6));
  let workspace = get(memory, row + 0x90); put(memory, 0x91f1a0, configuration);
  put(memory, row + 0x94, get(memory, ptr(memory, 0x91f1ac) + 0x38)); word(memory, row + 0x5a, memory.readUInt16LE(configuration + 14));
  word(memory, row + 0x58, 0); put(memory, row + 0x28, 0);
  const faceCount = memory.readUInt16LE(model + 6); put(memory, row + 0xa0, workspace); workspace = workspace + (faceCount + 3 & ~3) | 0;
  put(memory, row + 0x90, workspace); const vertexCount = memory.readUInt16LE(model + 4); put(memory, row + 0xa4, workspace); put(memory, row + 0x34, 65536);
  put(memory, row + 0x90, workspace + (vertexCount * 6 + 3 & ~3)); put(memory, row + 0x50, 0); word(memory, row + 0x54, 0);
  for (const [source, target] of [[10, 0x40], [8, 0x44], [2, 0x3c], [0, 0x38]]) put(memory, row + target, memory.readUInt16LE(configuration + source));
  const angle = () => Math.imul(Math.trunc((get(memory, row + 0x3c) << 12) / 360), 0x6488) >> 8;
  const cosine = lookupDestructionAngle(angle(), false, {memory});
  word(memory, row + 0x4c, Math.imul(cosine, get(memory, row + 0x44)) >> 16);
  word(memory, row + 0x4a, Math.imul(get(memory, row + 0x38), get(memory, row + 0x44)) >> 16);
  word(memory, row + 0x48, Math.imul(lookupDestructionAngle(angle(), true, {memory}), get(memory, row + 0x44)) >> 16);
  if (memory.readUInt16LE(row + 0x30)) {
    const offset = get(memory, 0x6e6558) << 2;
    for (let index = 0; index < memory.readInt16LE(row + 0x30); index++) {
      const current = ptr(memory, row + 4); memory[row + 0x5c + index] = memory[ptr(memory, current + 0x194) + offset + 3] & 15;
      const fragment = ptr(memory, row + 4), selected = memory.readUInt16LE(fragment + 0x18e) + index;
      memory[row + 0x6c + index] = memory[ptr(memory, 0x909290) + selected * 8 + 3]; memory[row + 0x7c + index] = 0;
    }
  }
  for (let index = 0; index < memory[row + 0x32]; index++) memory[ptr(memory, row + 0xa0) + index] = 0;
  put(memory, 0x5ea4dc, 255); word(memory, row + 2, 3); return 0;
}

//415230. Four168-byte controller rows share the64-entry destruction queue.
//scratchBase is the native entry ESP; locals that survive calls or retain
//uninitialized bytes live at their original addresses in the shared buffer.
export function updatePlacedObjectDestruction(runtime) {
  const {memory, scratchBase, soundRuntime} = runtime;
  if (!Number.isInteger(scratchBase)) throw Error('Placed destruction requires native entry ESP.');
  const frame = scratchBase - 0x134, options = {memory};
  const local = (offset, value) => put(memory, frame + offset, value), load = offset => get(memory, frame + offset);
  const loadMatrix = source => {
    for (let offset = 0; offset < 20; offset += 4) put(memory, 0x91d360 + offset, get(memory, source + offset));
    for (let index = 0; index < 9; index++) memory.writeFloatLE(Math.fround(Math.fround(memory.readInt16LE(0x91d360 + index * 2)) * scale), 0x91cdc0 + Math.floor(index / 3) * 16 + index % 3 * 4);
  };
  const transform = (source, target, object) => {
    put(memory, 0x91d3e4, get(memory, source)); put(memory, 0x91d3e8, get(memory, source + 4)); transformWheelEffectOffset(options);
    for (let axis = 0; axis < 3; axis++) local(target + axis * 4, (get(memory, 0x91d448 + axis * 4) << 16) + get(memory, object + 0x34 + axis * 4));
  };
  const effect = (code, position, fourth) => emitNativeEffect(code, position, [0, 0x400, 12000, fourth, 0, 0, 0], {dispatch40ea40: request => dispatchNativeSound(request, soundRuntime ?? {memory})});
  preparePlacedObjectDestruction(options);
  let cursor = memory[0x9205d8], base = ptr(memory, 0x9205dc), scale = memory.readFloatLE(0x5dc5f4);
  local(0x4c, 0); local(0x44, 0); local(0x20, 0x5c); memory[frame + 0x13] = cursor;
  for (let offset = 0, flagOffset = 0x5c; flagOffset < 0x300; offset += 0xa8, flagOffset += 0xa9) {
    let row = base + offset;
    if (memory.readUInt16LE(row + 2) === 0 && memory[0x9207e0]) {
      memory[0x9207e0]--; const queue = 0x9205e0 + cursor * 8;
      put(memory, row + 4, get(memory, queue)); word(memory, row + 0x2c, memory[frame + 0x13]); word(memory, row + 2, 1);
      word(memory, row + 0x2e, memory.readUInt16LE(queue + 4)); put(memory, queue + 4, 254);
      cursor = (memory[frame + 0x13] + 1) & 255; if (cursor >= 64) cursor = 0;
      memory[frame + 0x13] = cursor; memory[0x9205d8] = cursor;
    }
    local(0x48, get(memory, row + 0x9c));
    if (get(memory, 0x5ea4dc) === 255 && memory.readUInt16LE(row + 2) === 1) {
      const object = ptr(memory, row + 4); put(memory, 0x91f1a4, row); put(memory, 0x91f1ac, object); put(memory, 0x91f1a8, get(memory, object + 0x10));
      word(memory, row + 2, 2); memory[object + 0x19a] = 5; put(memory, 0x5ea4dc, 0);
      for (const field of [0x1a6, 0x1a7]) {
        const group = memory[object + field]; if (!group) continue;
        const address = ptr(memory, ptr(memory, 0x90b98c) + 0x60) + group * 12 + 3;
        if (memory[address]) memory[address]--;
      }
    }
    if (memory.readUInt16LE(row + 0x30) !== 0 && memory.readUInt16LE(row + 2) >= 3 && memory.readUInt16LE(row + 2) === 4) {
      const object = ptr(memory, row + 4); local(0x30, object); memory[frame + 0x13] = 0;
      if (!get(memory, row + 0x28)) {releaseBodyAttachments(object, runtime); base = ptr(memory, 0x9205dc); row = base + offset;}
      const timer = get(memory, row + 0x28) + 1 | 0; put(memory, row + 0x28, timer);
      if (!(timer & 7)) {effect(timer & 8 ? 15 : 16, ptr(memory, row + 4) + 0x34, 2); scale = memory.readFloatLE(0x5dc5f4); base = ptr(memory, 0x9205dc); row = base + offset;}
      if ((get(memory, row + 0x34) & 0xffff0000) < 0x200000) put(memory, row + 0x34, get(memory, row + 0x34) + get(memory, row + 0x40));
      for (let axis = 0; axis < 3; axis++) word(memory, row + 0x50 + axis * 2, memory.readUInt16LE(row + 0x50 + axis * 2) + memory.readUInt16LE(row + 0x48 + axis * 2));
      if (memory[base + flagOffset] !== 3) {
        buildRenderRotationMatrix(row + 0x50, frame + 0x110, options); loadMatrix(row + 8);
        for (let column = 0; column < 3; column++) {
          for (let axis = 0; axis < 3; axis++) word(memory, 0x91d408 + axis * 4, memory.readUInt16LE(frame + 0x110 + axis * 6 + column * 2));
          transformRenderShortVector(options);
          for (let axis = 0; axis < 3; axis++) word(memory, object + 0xc4 + axis * 6 + column * 2, memory.readUInt16LE(0x91d408 + axis * 4));
        }
      }
      removeBodySpatial(object, options); put(memory, object + 0x38, get(memory, object + 0x38) + get(memory, ptr(memory, 0x9205dc) + offset + 0x34)); registerRawBodySpatial(object, options);
      loadMatrix(object + 0xc4); transform(ptr(memory, frame + 0x48), 0x38, object);
      local(0x28, load(0x38)); local(0x18, load(0x3c)); local(0x2c, load(0x40)); local(0x24, 0);
      base = ptr(memory, 0x9205dc); row = base + offset;
      for (let index = 0; index < memory.readInt16LE(row + 0x30); index++) {
        if (memory[base + flagOffset] === 2) {
          const current = get(memory, 0x9153dc), next = current + 1 | 0, position = 0x919020 + current * 12;
          put(memory, position, load(0x28)); put(memory, 0x9153dc, (next >>> 0) < 24 ? next : 0); put(memory, position + 4, load(0x18)); put(memory, position + 8, load(0x2c)); effect(11, position, 6);
          for (const [color, kind] of [[0x9153d8, 4], [0x9153e0, 8], [0x919000, 1]]) emitRawEffectParticles(frame + 0x38, object + 0x68, 5, get(memory, color), kind, options);
          emitRawBodyDebris(frame + 0x38, object + 0x68, 5, options);
          put(memory, 0x9153f4, load(0x18)); put(memory, 0x9153d0, 1); put(memory, 0x9153f0, load(0x28)); put(memory, 0x9153f8, load(0x2c)); put(memory, 0x9153cc, 24);
          emitRawEffectParticles(frame + 0x38, object + 0x68, 5, get(memory, 0x9153c8), 0x4000, options);
          base = ptr(memory, 0x9205dc); row = base + offset; word(memory, object + 8, memory.readUInt16LE(object + 8) | (1 << (load(0x4c) & 31))); memory[base + flagOffset] = 5;
        }
        local(0x24, index + 1);
      }
      if (memory.readInt16LE(row + 0x30) > 0) scale = memory.readFloatLE(0x5dc5f4);
      const faces = ptr(memory, object + 0x28), vertices = ptr(memory, object + 0x24); local(0xb4, faces); local(0x28, vertices); local(0x14, 0);
      let descriptor = ptr(memory, frame + 0x48);
      for (let face = 0; face < memory.readUInt16LE(ptr(memory, object + 0x10) + 6); face++) {
        let packed = ptr(memory, faces + face * 8); local(0x34, packed); local(0x1c, 0);
        if (face > memory[descriptor + 9]) {
          memory[frame + 0x13]++; descriptor = ptr(memory, frame + 0x48) + memory[frame + 0x13] * 20;
          word(memory, frame + 0x5c, memory.readUInt16LE(descriptor)); word(memory, frame + 0x5e, memory.readUInt16LE(descriptor + 2)); word(memory, frame + 0x60, memory.readUInt16LE(descriptor + 4)); transform(frame + 0x5c, 0x38, object);
        }
        local(0x18, descriptor); local(0xb0, memory[frame + 0x13]); const groupFaces = (memory[descriptor + 9] - memory[descriptor + 8]) >>> 2; local(0x2c, groupFaces);
        if (!memory[ptr(memory, row + 0xa0) + face]) {
          local(0x24, 0);
          for (let corner = 0; corner < 4; corner++) {
            const id = packed & 255; packed >>>= 8; local(0x34, packed);
            if (id) {
              const vertex = vertices + (id - 1) * 8;
              if (memory.readUInt16LE(vertex + 6) === 1) local(0x1c, load(0x1c) + 1);
              else {
                transform(vertex, 0x100, object); const x = load(0x100), y = load(0x104), z = load(0x108);
                if (y >= get(memory, row + 0x94)) {
                  word(memory, vertex + 6, 1); local(0x1c, load(0x1c) + 1);
                  if ((face & 3) === 3) {
                    memory.writeBigUInt64LE(memory.readBigUInt64LE(frame + 0x100), frame + 0x50); local(0x54, y - 0x480000); local(0x58, z); local(0xe8, 0); local(0xec, -0x200000); local(0xf0, 0);
                    if (corner === 0) {local(0x54, y - 0x3e0000); activateRawPersistentEmitter(frame + 0x50, options); appendRawBodyFlash(frame + 0x50, 1, options);}
                    emitRawEffectParticles(frame + 0x50, frame + 0xe8, 1, get(memory, 0x9153e4), 16, options);
                    base = ptr(memory, 0x9205dc); row = base + offset; put(memory, 0x9153d0, 1); put(memory, 0x9153f0, x); put(memory, 0x9153f4, corner === 0 ? y - 0x3e0000 : y - 0x480000); put(memory, 0x9153f8, z); put(memory, 0x9153cc, 8);
                  }
                }
              }
            }
            local(0x24, corner + 1);
          }
          if (load(0x1c) > 2) {
            const group = load(0xb0); memory[row + 0x7c + group]++;
            if (memory[row + 0x6c + group]) {
              word(memory, frame + 0x64, 0); local(0x66, 0xfc00); loadMatrix(object + 0xc4);
              put(memory, 0x91d3e8, load(0x68)); put(memory, 0x91d3e4, load(0x64)); transformWheelEffectOffset(options);
              local(0xf8, get(memory, 0x91d44c)); local(0xf4, get(memory, 0x91d448) << 2); local(0xfc, get(memory, 0x91d450) << 2);
              let selector = memory[row + 0x6c + group];
              if (!(selector & 128) || memory[ptr(memory, 0x5ecefc) + 0x2e]) {selector &= 127; activateWorldFragment(frame + 0x38, frame + 0xf4, selector - 1 & 255, memory.readUInt16LE(row), options); scale = memory.readFloatLE(0x5dc5f4); base = ptr(memory, 0x9205dc); row = base + offset;}
              memory[row + 0x6c + group] = 0;
            }
            if (memory[row + 0x7c + group] === (groupFaces & 255)) {
              emitRawEffectParticles(frame + 0x38, object + 0x40, 0, get(memory, 0x919000), 1, options); alterRawTerrainBrightness(frame + 0x38, 0, {...runtime, scratchBase: frame - 4});
              put(memory, 0x91cd80, load(0x38)); put(memory, 0x91cd84, load(0x3c)); put(memory, 0x91cd90, 1); put(memory, 0x91cd88, load(0x40)); put(memory, 0x91cd8c, 16);
            }
            if (!(face & 3)) {emitRawEffectParticles(frame + 0x100, object + 0x40, 1, get(memory, 0x9153d8), 4, options); emitRawBodyDebris(frame + 0x100, object + 0x40, 1, options);}
            memory[ptr(memory, ptr(memory, 0x9205dc) + offset + 0xa0) + face] = 5; base = ptr(memory, 0x9205dc); row = base + offset; word(memory, row + 0x32, memory.readUInt16LE(row + 0x32) - 1);
          }
        }
        local(0x14, face + 1);
      }
      if (!memory.readUInt16LE(row + 0x32)) {
        removeBodySpatial(object, options); base = ptr(memory, 0x9205dc); row = base + offset; put(memory, 0x9205e4 + memory.readUInt16LE(row + 0x2c) * 8, 0); word(memory, row + 2, 0);
      }
      cursor = memory[0x9205d8]; memory[frame + 0x13] = cursor;
    }
    if (memory.readUInt16LE(row + 2) === 3) {
      const dependency = memory.readUInt16LE(row + 0x2e);
      if (dependency === 255 || get(memory, 0x9205e4 + dependency * 8) === 255) {word(memory, row + 2, 4); put(memory, 0x9205e4 + memory.readUInt16LE(row + 0x2c) * 8, 255);}
    }
    local(0x20, flagOffset + 0xa9); local(0x4c, load(0x4c) + 1); local(0x44, offset + 0xa8);
  }
}
