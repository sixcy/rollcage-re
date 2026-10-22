import {emitBodyEffectBurst, removeBodySpatial, unregisterPhysicalBody} from './body-retirement.mjs';
import {releaseBodyAttachments} from './body-attachment-release.mjs';
import {releaseRawScriptedBody} from './raw-scripted-motion.mjs';
import {sharesNativeMemorySpan,nativeCodeAddress} from './native-memory-spans.mjs';
import {createScriptedCollisionFilter} from './scripted-collision-filter.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);

//48abc0. The count/source row are captured. A missing body still replaces the
//one-past row and decrements the live count; retain this native behavior.
export function removeRaceObjectEffect(body, {memory}) {
  const count = ptr(memory, 0x82e900); let remaining = count, row = 0x82e880;
  while (remaining && ptr(memory, row) !== (body >>> 0)) {row += 8; remaining--;}
  put(memory, row, get(memory, 0x82e878 + Math.imul(count, 8)));
  put(memory, row + 4, get(memory, 0x82e87c + Math.imul(count, 8)));
  put(memory, 0x82e900, get(memory, 0x82e900) - 1);
}

//412520. Only the first matching authored row and its immediately adjacent
//same-body row are consumed. Other duplicates are deliberately not searched.
export function decrementAuthoredRaceObjectGroups(body, {memory}) {
  const pack = ptr(memory, 0x90b98c), count = ptr(memory, 0x6e6518);
  let index = 0;
  const decrement = selected => {
    const group = ptr(memory, 0x6f9694 + selected * 8), target = ptr(memory, pack + 0x60) + Math.imul(group, 12) + 3;
    if (memory[target]) memory[target]--;
  };
  while (index < count) {if (ptr(memory, 0x6f9690 + index * 8) === (body >>> 0)) {decrement(index); break;} index++;}
  index++;
  if (index < count && ptr(memory, 0x6f9690 + index * 8) === (body >>> 0)) decrement(index);
}

function effect(body, count, mask, returnAddress, runtime) {
  const {memory, scratchBase: S} = runtime, frame = S - 28, position = frame + 16, velocity = frame + 4;
  put(memory, position, get(memory, body + 0x34)); put(memory, position + 4, get(memory, body + 0x38) + 0x8c0000); put(memory, position + 8, get(memory, body + 0x3c));
  put(memory, velocity, 0); put(memory, velocity + 4, -0x400000); put(memory, velocity + 8, 0);
  put(memory, frame - 4, 11); put(memory, frame - 8, mask); put(memory, frame - 12, count); put(memory, frame - 16, nativeCodeAddress(returnAddress,runtime));
  emitBodyEffectBurst(position, velocity, count, mask, 11, {...runtime, scratchBase: frame - 16});
}

//40fcb0, the actual type20/25 collision callback. First contact leaves script
//control and the targeting list; later contact retires the physical object.
export function filterAnimatedRaceObject(body, runtime) {
  const {memory, scratchBase: S} = runtime, flags = get(memory, body), frame = S - 28;
  if (flags & 0x2000) {
    put(memory, body, (flags & 0xffffddff) | 0x1000); put(memory, frame - 4, nativeCodeAddress(0x40fcd4,runtime));
    removeRaceObjectEffect(body, runtime);
    const seed = Math.imul(get(memory, 0x5ec954), 0x41a7) & 0x7fffffff; put(memory, 0x5ec954, seed);
    const roll = Math.imul(seed >>> 15, 0x7fff) >>> 16;
    for (let axis = 0; axis < 3; axis++) put(memory, body + 0x80 + axis * 4, (((roll >>> (axis * 4)) & 15) - 8) << 18);
    return 0;
  }
  effect(body, 9, 0x13aaf, 0x40fd7b, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fd85,runtime)); removeBodySpatial(body, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fd8c,runtime)); unregisterPhysicalBody(body, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fd93,runtime)); releaseBodyAttachments(body, {...runtime, scratchBase: frame - 4});
  put(memory, frame - 4, nativeCodeAddress(0x40fd9a,runtime)); decrementAuthoredRaceObjectGroups(body, runtime);
  return 0;
}

//40fdb0. Type31 stops physical collisions but stays in the authored list for
//429fa0's age/shrink/removal lifecycle. Spatial removal happens there later.
export function filterShrinkingRaceObject(body, runtime) {
  const {memory, scratchBase: S} = runtime;
  put(memory, body + 0x148, 0); put(memory, body, (get(memory, body) & 0xffffddff) | 0x1000);
  put(memory, S - 8, nativeCodeAddress(0x40fdd4,runtime)); unregisterPhysicalBody(body, runtime);
  put(memory, body + 0x184, 2); memory.writeUInt16LE(0, body + 0x188);
  put(memory, S - 8, nativeCodeAddress(0x40fdee,runtime)); releaseBodyAttachments(body, {...runtime, scratchBase: S - 8});
  removeRaceObjectEffect(body, runtime);
  return 0;
}

//40fe30. Both attachment-release calls are native, even though the first
//usually clears all handles. Keep their order around the physical removals.
export function filterRetiredRaceObject(body, runtime) {
  const {memory, scratchBase: S} = runtime, frame = S - 28;
  effect(body, 7, 0x13a2f, 0x40fe81, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fe8b,runtime)); releaseBodyAttachments(body, {...runtime, scratchBase: frame - 4});
  put(memory, frame - 4, nativeCodeAddress(0x40fe92,runtime)); removeBodySpatial(body, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fe99,runtime)); unregisterPhysicalBody(body, runtime);
  put(memory, frame - 4, nativeCodeAddress(0x40fea0,runtime)); releaseBodyAttachments(body, {...runtime, scratchBase: frame - 4});
  put(memory, frame - 4, nativeCodeAddress(0x40fea7,runtime)); decrementAuthoredRaceObjectGroups(body, runtime);
  return 0;
}

//474b20 supplies cdecl body/other/event arguments. The real entry ESP must be
//provided by the surrounding physics frame (4749e0 entry minus52 bytes).
export function createRaceObjectCollisionFilters(runtime) {
  const {memory, scratchBase: S} = runtime;
  if (!Buffer.isBuffer(memory) || !Number.isInteger(S) || S < 256 || S + 16 > memory.length) throw Error('Race object filters require shared native memory and entry ESP.');
  const wrap = implementation => (body, other, event) => {
    const shared = (value, length) => Number.isInteger(value?.address) && sharesNativeMemorySpan(memory, value.bytes, value.address, length);
    if (!shared(body, 0x180) || other && !shared(other, 0x74) || !shared(event, 0x68)) throw Error('Race object collision requires coherent body/event views.');
    put(memory, S + 4, body.address); put(memory, S + 8, other?.address ?? 0); put(memory, S + 12, event.address);
    return implementation(body.address, runtime);
  };
  return new Map([[0x40fcb0, wrap(filterAnimatedRaceObject)], [0x40fdb0, wrap(filterShrinkingRaceObject)], [0x40fe30, wrap(filterRetiredRaceObject)],
    [0x46e4e0, wrap(releaseRawScriptedBody)], [0x46e470, createScriptedCollisionFilter(runtime)]]);
}
