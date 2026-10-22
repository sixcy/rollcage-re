import {defaultGameImageMasks, setGameImageMasks} from './game-image-format.mjs';
import {initializeGamePixelImage, allocateGamePixelImage, clearGamePixelImage, releaseGameImageMetadata} from './game-image-storage.mjs';
import {countGameImageAffinityCpus, readGameImageThreadQuota} from './game-image-workers.mjs';
import {constructGameImageTask, appendGameImageJob, waitGameImageJobs, releaseGameImageFutureRange, releaseGameImageFutureState, releaseGameImageJobs} from './game-image-jobs.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const crt = (runtime, name, args) => {if (typeof runtime.services?.libraryCall !== 'function') throw Error(`Image conversion requires CRT ${name}.`); return runtime.services.libraryCall(name, args, runtime);};

//4bcdb0. Complete uncompressed byte/palette/float conversion parent and its
//actual row partitioning / task ownership. Compressed-block4c6c60 is separately
//explicit; the weather texture path always constructs source type0.
export function convertGamePixelImage(image, filter, targetType, bitDepth, red, green, blue, alpha, runtime) {
  const {memory: m, scratchBase} = runtime, aligned = scratchBase - 4 & ~7, frame = aligned - 0x3e0;
  //The matching-format early exit still leaves this original SEH/prologue
  //storage. A later408680 cleanup consumes it when mipmaps are disabled.
  if (runtime.entryRegisters?.EBP !== undefined) put(m, scratchBase - 4, runtime.entryRegisters.EBP);
  put(m, aligned - 4, -1); put(m, aligned - 8, 0x56ad3b); if (runtime.sehWord !== undefined) put(m, aligned - 12, runtime.sehWord);
  for (const [register, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, frame + offset, runtime.entryRegisters[register]);
  [filter, targetType, bitDepth, red, green, blue, alpha].forEach((value, i) => put(m, scratchBase + 4 + i * 4, value)); put(m, frame + 0x38, image);
  if (bitDepth === -1 && (targetType === 0 || targetType === 1)) bitDepth = targetType === 0 ? 32 : 64; put(m, frame + 0x14, bitDepth);
  const heightForLimit = get(m, image + 12), affinity = countGameImageAffinityCpus({...runtime, scratchBase: frame - 4}), quota = readGameImageThreadQuota({...runtime, scratchBase: frame - 4}), count = Math.min(heightForLimit, affinity, quota); put(m, frame + 0x10, count);
  const sourceType = get(m, image + 16); targetType = get(m, scratchBase + 8);
  if (sourceType >= 3 && sourceType <= 7) {
    defaultGameImageMasks(scratchBase + 16, scratchBase + 20, scratchBase + 24, scratchBase + 28, bitDepth, targetType, runtime);
    if (typeof runtime.handlers?.convertCompressed4c6c60 !== 'function') throw Error('Unported compressed image conversion4c6c60 reached.'); return runtime.handlers.convertCompressed4c6c60(image, get(m, scratchBase + 4), targetType, bitDepth, ...[16, 20, 24, 28].map(offset => get(m, scratchBase + offset)), {...runtime, scratchBase: frame - 32});
  }
  if (targetType !== 0 && targetType !== 1 || targetType === 0 && ![0, 1, 2].includes(sourceType) || targetType === 1 && ![0, 1].includes(sourceType)) return 0;
  const preDefault = targetType === 0 && (sourceType === 0 || sourceType === 2) || targetType === 1 && sourceType === 1;
  if (preDefault) {
    defaultGameImageMasks(scratchBase + 16, scratchBase + 20, scratchBase + 24, scratchBase + 28, bitDepth, targetType, runtime);
    if (bitDepth === get(m, image + 0x44) && [0, 1, 2, 3].every(i => get(m, scratchBase + 16 + i * 4) === get(m, image + 0x14 + i * 4))) return 1;
  }
  const temporary = frame + (sourceType === 1 && targetType === 1 ? 0x218 : 0x60), masks = [16, 20, 24, 28].map(offset => get(m, scratchBase + offset));
  initializeGamePixelImage(temporary, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EDI: masks[3]}});
  //Actual SEH lifetime states; later callers can publish these private words
  //through image clear. Preserve the DWORD/byte widths at each original point.
  const state = targetType === 1 ? sourceType === 1 ? 13 : 5 : sourceType === 1 ? 9 : 0;
  put(m, frame + 0x3dc, state);
  const allocated = allocateGamePixelImage(temporary, targetType, bitDepth, get(m, image + 8), get(m, image + 12), ...masks, 0, {...runtime, scratchBase: frame - 40, entryRegisters: {...runtime.entryRegisters, ESI: preDefault ? bitDepth : targetType, EDI: masks[3]}});
  if (!allocated) {put(m, frame + 0x3dc, state === 13 ? -1 : state === 0 ? 1 : state + 3); clearGamePixelImage(temporary, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: preDefault ? bitDepth : targetType}}); releaseGameImageMetadata(temporary + 0xa0, {...runtime, scratchBase: frame - 4}); return 0;}
  const width = get(m, image + 8), height = get(m, image + 12), argumentsAddress = frame + 0x3c, vector = frame + 0x18, conversion11 = sourceType === 1 && targetType === 1;
  for (const [offset, value] of [[0, 0], [4, 0], [8, width], [12, height], [16, 0], [20, 0], [24, get(m, scratchBase + 4)], [28, targetType], [32, temporary]]) put(m, argumentsAddress + offset, value);
  put(m, vector, 0); put(m, vector + 4, 0); put(m, vector + 8, 0);
  const workerState = state === 0 ? 2 : state + 1; m[frame + 0x3dc] = workerState;
  const future = frame + (targetType === 1 ? 0x28 : 0x30), functionPointer = frame + (targetType === 1 ? 0x30 : 0x24), sourcePointer = frame + (targetType === 1 ? 0x24 : sourceType !== 1 ? 0x28 : 0x10);
  if (count > 0) {
    const regularRows = Math.trunc(height / count), remainder = height - Math.imul(count - 1, regularRows) | 0; put(m, functionPointer, 0x4bd770); put(m, sourcePointer, image);
    for (let index = 0; index < count; index++) {
      put(m, argumentsAddress + 16, Math.imul(regularRows, index) + get(m, argumentsAddress + 4)); put(m, argumentsAddress + 20, index === count - 1 ? remainder : regularRows);
      constructGameImageTask(future, functionPointer, sourcePointer, argumentsAddress, {...runtime, scratchBase: frame - 16}); m[frame + 0x3dc] = workerState + 1; appendGameImageJob(vector, future, {...runtime, scratchBase: frame - 8}); m[frame + 0x3dc] = workerState; releaseGameImageFutureState(ptr(m, future), {...runtime, scratchBase: frame - 8});
    }
  }
  waitGameImageJobs(vector, {...runtime, scratchBase: frame - 4});
  const oldPixels = ptr(m, image + 4); if (oldPixels) {crt(runtime, 'free', [oldPixels]); put(m, image + 4, 0);}
  if (targetType === 0 && sourceType !== 1) {const palette = ptr(m, image); if (palette) {crt(runtime, 'free', [palette]); put(m, image, 0);}}
  put(m, image + 16, targetType); put(m, image + 0x44, bitDepth); setGameImageMasks(image, ...[16, 20, 24, 28].map(offset => get(m, scratchBase + offset)), {...runtime, scratchBase: frame - 20, entryRegisters: {EBX: image, ESI: sourceType === 0 || sourceType === 2 ? ptr(m, 0x56e23c) : count, EDI: count}});
  put(m, image + 4, get(m, temporary + 4)); put(m, temporary + 4, 0);
  if (conversion11) releaseGameImageJobs(vector, {...runtime, scratchBase: frame - 4});
  else {const begin = ptr(m, vector); if (begin) {releaseGameImageFutureRange(begin, ptr(m, vector + 4), {...runtime, scratchBase: frame - 12}); crt(runtime, 'operatorDelete', [begin]);}}
  put(m, frame + 0x3dc, state === 0 ? 4 : state + 3);
  clearGamePixelImage(temporary, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: conversion11 ? count : ptr(m, vector)}}); releaseGameImageMetadata(temporary + 0xa0, {...runtime, scratchBase: frame - 4}); return 1;
}
