import {initializeGamePixelImage, allocateGamePixelImage, clearGamePixelImage, releaseGameImageMetadata} from './game-image-storage.mjs';
import {countGameImageAffinityCpus, readGameImageThreadQuota} from './game-image-workers.mjs';
import {constructGameImageResampleTask, appendGameImageJob, releaseGameImageFutureState, waitGameImageJobs, releaseGameImageJobs} from './game-image-jobs.mjs';
import {copyGameImageRegion} from './game-image-copy.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const crt = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Resampling requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//4c4c20. Uncompressed resampling policy and actual task ownership/partitioning.
//The incoming third stack word is unused by native4c6070. target is its fourth.
export function resampleGamePixelImage(image, width, height, unused, target, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x3dc;
  //4c4c20/22/2d: the inherited exception-chain word is caller-owned input,
  //not flat memory at address zero. Later4c1af0 copies these stale private
  //words into retired mip image descriptors, making their producers observable.
  if (Number.isInteger(scratchBase)) {
    put(m, scratchBase - 4, -1); put(m, scratchBase - 8, 0x56b522);
    if (runtime.sehWord !== undefined) put(m, scratchBase - 12, runtime.sehWord);
    for (const [register, offset] of [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]) if (runtime.entryRegisters?.[register] !== undefined) put(m, frame + offset, runtime.entryRegisters[register]);
  }
  [width, height, unused, target].forEach((v, i) => put(m, scratchBase + 4 + i * 4, v)); put(m, frame + 0x14, image);
  if (!width || !height) {const pixels = ptr(m, image + 4); put(m, image + 12, 0); put(m, image + 8, 0); if (pixels) {crt(runtime, 'free', [pixels]); put(m, image + 4, 0);} return 1;}
  if (width === get(m, image + 8) && height === get(m, image + 12)) {
    if (target !== image) {
      const entry = frame - 52; for (const [offset, value] of [[-4, 0], [-8, 0], [-12, 0], [-16, height], [-20, width]]) put(m, frame + offset, value);
      const args = Array.from({length: 12}, (_, i) => get(m, entry + 4 + i * 4)); args[0] = image;
      if (runtime.handlers?.copyImage4c7300) runtime.handlers.copyImage4c7300(target, image, {...runtime, scratchBase: entry}); else copyGameImageRegion(target, args, {...runtime, scratchBase: entry});
    } return 1;
  }
  const type = get(m, image + 16), targetType = get(m, target + 16);
  if (type >= 3 && type <= 7 || targetType >= 3 && targetType <= 7) return 0;
  const affinity = countGameImageAffinityCpus({...runtime, scratchBase: frame - 4}), quota = readGameImageThreadQuota({...runtime, scratchBase: frame - 4}), count = Math.min(height, affinity, quota);
  if (type !== 0 && type !== 1) return 0;
  const spare = frame + 0x214, temporary = frame + 0x5c;
  initializeGamePixelImage(spare, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EDI: image}});
  put(m, frame + 0x3d8, 0); //4c4d07 exception state after the first temporary.
  initializeGamePixelImage(temporary, {...runtime, scratchBase: frame - 4, entryRegisters: {...runtime.entryRegisters, EDI: image}});
  m[frame + 0x3d8] = 3; //4c4d24, byte store after PUSH0.
  const allocated = allocateGamePixelImage(temporary, type, get(m, image + 0x44), width, height, ...[0x14, 0x18, 0x1c, 0x20].map(o => get(m, image + o)), 0, {...runtime, scratchBase: frame - 40, entryRegisters: {...runtime.entryRegisters, ESI: width, EDI: image}});
  if (!allocated) {for (const [i, temp] of [temporary, spare].entries()) {if (i) put(m, frame + 0x3d8, -1); else m[frame + 0x3d8] = 0; clearGamePixelImage(temp, {...runtime, scratchBase: frame - 4}); releaseGameImageMetadata(temp + 0xa0, {...runtime, scratchBase: frame - 4});} return 0;}
  const descriptor = frame + 0x34, vector = frame + 0x18, future = frame + 0x28;
  for (const [o, value] of [[0, 0], [4, 0], [8, width], [12, height], [16, 0], [20, 0], [24, target], [28, temporary], [32, 3], [36, 0]]) put(m, descriptor + o, value);
  put(m, vector, 0); put(m, vector + 4, 0); put(m, vector + 8, 0);
  m[frame + 0x3d8] = 4; //4c4d84.
  if (count > 0) {
    const regular = Math.trunc(height / count), remainder = height - Math.imul(count - 1, regular) | 0; put(m, frame + 0x24, image); put(m, frame + 0x30, 0x4c4f40);
    for (let i = 0; i < count; i++) {put(m, frame + 0x44, Math.imul(regular, i) + get(m, frame + 0x38)); put(m, frame + 0x48, i === count - 1 ? remainder : regular);
      constructGameImageResampleTask(future, frame + 0x30, frame + 0x24, descriptor, {...runtime, scratchBase: frame - 16}); m[frame + 0x3d8] = 5; appendGameImageJob(vector, future, {...runtime, scratchBase: frame - 8}); m[frame + 0x3d8] = 4; releaseGameImageFutureState(ptr(m, future), {...runtime, scratchBase: frame - 8});
    }
  }
  waitGameImageJobs(vector, {...runtime, scratchBase: frame - 4}); const pixels = ptr(m, image + 4); if (pixels) {crt(runtime, 'free', [pixels]); put(m, image + 4, 0);}
  put(m, image + 4, get(m, temporary + 4)); put(m, temporary + 4, 0); put(m, image + 8, width); put(m, image + 12, height);
  releaseGameImageJobs(vector, {...runtime, scratchBase: frame - 4});
  for (const [i, temp] of [temporary, spare].entries()) {if (i) put(m, frame + 0x3d8, 7); else m[frame + 0x3d8] = 6; clearGamePixelImage(temp, {...runtime, scratchBase: frame - 4, entryRegisters: {ESI: count > 0 ? count : 0}}); releaseGameImageMetadata(temp + 0xa0, {...runtime, scratchBase: frame - 4});}
  return 1;
}
