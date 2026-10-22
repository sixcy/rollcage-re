import {queryRawRespawnPlacement} from './raw-respawn-query.mjs';
import {publishAnimationMatrix} from './vehicle-auxiliary-animation.mjs';
import {transformWheelEffectOffset} from './wheel-effects.mjs';
import {abs32} from './fixed-integer.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const copyWords = (m, source, output, count) => {for (let i = 0; i < count; i++) put(m, output + i * 4, get(m, source + i * 4));};

//417610 reads x,z,y before overwriting shared reduction globals. Subsequent
//vector reads are live: input may itself overlap those globals.
export function reduceRawCameraDirection(vector, {memory: m}) {
  let sum = (abs32(get(m, vector)) + abs32(get(m, vector + 8)) + abs32(get(m, vector + 4))) | 0;
  if (sum < 0) sum = -sum | 0;
  put(m, 0x91d45c, sum); put(m, 0x91d460, 0);
  const leading = Math.clz32(sum); put(m, 0x91d460, leading);
  if (leading < 9) {const shift = 9 - leading; for (const offset of [0, 4, 8]) put(m, vector + offset, get(m, vector + offset) >> shift); return shift;}
  const y = get(m, vector + 4), x = get(m, vector), z = get(m, vector + 8), squared = (Math.imul(x >> 18, x >> 18) + Math.imul(y >> 18, y >> 18) + Math.imul(z >> 18, z >> 18)) | 0;
  if (abs32(squared) < 1) put(m, vector + 8, z - 0x20000);
  return 0;
}

//417d70. Two forward REP MOVSD blocks intentionally overlap the static body.
//The position pointer remains EDX after the second REP advances only ESI.
export function queryCameraBodyPose(body, pose, runtime) {
  const {memory: m, scratchBase} = runtime;
  put(m, scratchBase - 4, body);
  copyWords(m, body, 0x6f9a20, 0x60); copyWords(m, pose, 0x6f9a54, 0x36);
  return queryRawRespawnPlacement(0x6f9a20, pose, 0, 0x6f9a00, 2, scratchBase - 4, {...runtime, scratchBase: scratchBase - 32});
}

//417e80. Each MOVDQU snapshots sixteen bytes independently, preserving
//overlap across the two moves and all fourteen unused matrix-padding bytes.
export function publishCachedCameraMatrix(direction, other, output, cameraIndex, runtime) {
  const {memory: m, scratchBase} = runtime, cache = (Math.imul(cameraIndex, 0x184) + 0x9200a0) >>> 0;
  put(m, scratchBase + 4, output); put(m, scratchBase + 8, cameraIndex);
  const result = publishAnimationMatrix(direction, other, output, {...runtime, scratchBase: scratchBase - 16});
  const source = result ? output : cache, destination = result ? cache : output;
  Buffer.from(m.subarray(source, source + 16)).copy(m, destination); Buffer.from(m.subarray(source + 16, source + 32)).copy(m, destination + 16);
  return result;
}

//417b50. Native stack args3/4 are loaded late; the last FILD temporary also
//overwrites args5. The high halfword beside the authored short20 is stale.
export function buildCameraBodyPose(body, output, direction, positiveOffset, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 36;
  put(m, scratchBase + 12, output); put(m, scratchBase + 16, direction); put(m, scratchBase + 20, positiveOffset);
  word(m, frame + 20, 20); put(m, frame + 16, 0xfff60000);
  for (const [index, offset] of [0xc6, 0xcc, 0xd2].entries()) {let value = m.readInt16LE(body + offset); if (!positiveOffset) value = -value | 0; put(m, frame + 24 + index * 4, value);}
  if (positiveOffset) word(m, frame + 18, 10);
  for (const offset of [0, 4, 8, 12, 16]) put(m, 0x91d360 + offset, get(m, body + 0xc4 + offset));
  const scale = m.readFloatLE(0x5dc5f4);
  for (let index = 0; index < 9; index++) {const value = Math.fround(m.readInt16LE(0x91d360 + index * 2)); m.writeFloatLE(value, frame + 56); m.writeFloatLE(Math.fround(value * scale), 0x91cdc0 + Math.floor(index / 3) * 16 + index % 3 * 4);}
  put(m, 0x91d3e4, get(m, frame + 16)); put(m, 0x91d3e8, get(m, frame + 20)); transformWheelEffectOffset(runtime);
  const offset = [0, 4, 8].map(o => get(m, 0x91d448 + o)); output = ptr(m, frame + 48);
  copyWords(m, body + 0x34, output, 0x36); direction = ptr(m, frame + 52);
  for (let i = 0; i < 3; i++) put(m, output + i * 4, get(m, output + i * 4) + (offset[i] << 16));
  return publishAnimationMatrix(direction, frame + 24, output + 0x90, {...runtime, scratchBase: frame - 8});
}
