import {multiplyQ16, divideQ16, dotQ16} from './fixed-integer.mjs';
import {findNearestCameraParticipant, measureCameraVector} from './camera-mode-policy.mjs';
import {getRaceStageCount} from './race-stage-count.mjs';
import {resolveNativeMemoryAddress} from './native-memory-spans.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const vector = (m, p) => [0, 4, 8].map(offset => get(m, p + offset));

//41a960. Project point-origin onto direction-origin, accepting fractions in
//(0,2), then measure the perpendicular residual. The incoming direction
//argument slot is reused for the numerator; this is observable caller state.
export function measureCameraLineDistance(point, origin, direction, fractionOut, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48;
  put(m, scratchBase + 4, direction); put(m, scratchBase + 8, fractionOut);
  const ax = get(m, point), ay = get(m, point + 4), bx = get(m, origin), by = get(m, origin + 4), bz = get(m, origin + 8), az = get(m, point + 8);
  put(m, frame + 0x24, ax); put(m, frame + 0x28, ay); const dz = (az - bz) >> 9; put(m, frame + 0x2c, dz);
  let dx = get(m, direction), dy = get(m, direction + 4); dx = (dx - bx) | 0;
  const cz = get(m, direction + 8); dy = (dy - by) | 0; put(m, frame + 0x10, dx);
  const rawX = (get(m, frame + 0x24) - bx) | 0, z = (cz - bz) >> 9;
  put(m, frame + 0x34, rawX);
  const deltaY = (get(m, frame + 0x28) - by) >> 9; put(m, frame + 0x28, deltaY); put(m, frame + 0x14, deltaY);
  dx = get(m, frame + 0x10) >> 9; dy >>= 9;
  put(m, frame + 0x10, z); put(m, frame + 0x20, z);
  const deltaX = get(m, frame + 0x34) >> 9; put(m, frame + 0x24, deltaX); put(m, frame + 0x18, dx); put(m, frame + 0x1c, dy);
  const numerator = dotQ16(vector(m, frame + 0x18), vector(m, frame + 0x24)); put(m, frame + 0x34, numerator);
  const denominator = dotQ16(vector(m, frame + 0x18), vector(m, frame + 0x18));
  if (denominator < 65536) return -1;
  const fraction = divideQ16(get(m, frame + 0x34), denominator);
  if (fraction <= 0 || fraction >= 0x20000) return -1;
  put(m, frame + 0x18, dx << 9); put(m, ptr(m, frame + 0x38), fraction);
  put(m, frame + 0x20, get(m, frame + 0x10) << 9); put(m, frame + 0x1c, dy << 9);
  //492030 scales each lane in source order; aliases with fractionOut above
  //must be consumed before constructing the final perpendicular vector.
  for (const offset of [0x18, 0x1c, 0x20]) put(m, frame + offset, multiplyQ16(get(m, frame + offset), fraction));
  const y = (get(m, frame + 0x1c) - (get(m, frame + 0x14) << 9)) >> 9;
  const x = (get(m, frame + 0x18) - (deltaX << 9)) >> 9, residualZ = (get(m, frame + 0x20) - (dz << 9)) >> 9;
  put(m, frame + 0x1c, y); put(m, frame + 0x18, x); put(m, frame + 0x20, residualZ);
  const length = measureCameraVector(frame + 0x18, {...runtime, scratchBase: frame - 4});
  return length > 0x7f0000 ? -1 : length << 9;
}

//417ee0. Authored56-byte camera trigger rows, nearest eligible participant,
//actual velocity and line-distance tests. Outputs are committed on success.
export function selectCameraTrigger(index, participantOut, triggerOut, runtime) {
  const {memory: m, scratchBase} = runtime, early = scratchBase - 28, frame = scratchBase - 36;
  put(m, scratchBase + 4, index); put(m, early + 0x18, triggerOut); put(m, early + 0x10, participantOut); put(m, early + 8, -1);
  const camera = (0x91ff80 + Math.imul(index, 0x184)) >>> 0;
  if (m.readInt16LE(camera + 0x32) < 60 || ptr(m, 0x90a548) < ((ptr(m, camera + 0x11c) + 540) >>> 0) || get(m, camera) === 16 || get(m, camera) === 15 || m.readInt16LE(camera + 0x3a) > 0) return 0;
  const session = ptr(m, 0x5ecb1c), split = m[session + 0x552];
  if (split) {
    const count = getRaceStageCount(runtime);
    for (let other = 0; other < count; other++) if (get(m, 0x91ff80 + other * 0x184) === 16) return 0;
  }
  if (m[session + 0x58c] === 2) {
    if (split) put(m, frame + 0x10, index);
    else if (get(m, camera + 0x178) !== -1) put(m, frame + 0x10, get(m, camera + 0x178));
    else {
      const count = m[session + 0x54d]; let rank = 6;
      for (let participant = 0; participant < count; participant++) {
        const row = 0x909300 + participant * 0x30c;
        if (m[ptr(m, row) + 0x718] === 10 && m[row + 0x1d] <= rank) {rank = m[row + 0x1d]; put(m, frame + 0x10, participant);}
      }
    }
  }
  let count = get(m, 0x6e6550);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const row = resolveNativeMemoryAddress(m,0x91f6c0+ordinal*56,56); put(m, frame + 0x1c, row);
    if (get(m, row) !== 1) continue;
    findNearestCameraParticipant(row + 4, frame + 0x28, {...runtime, scratchBase: frame - 4});
    const participant = get(m, frame + 0x28), eligible = get(m, frame + 0x10);
    if (eligible !== -1 && eligible !== participant) continue;
    const body = ptr(m, 0x909300 + Math.imul(participant, 0x30c));
    if (measureCameraVector(body + 0x68, {...runtime, scratchBase: frame - 4}) >= 0x80000) {
      const distance = measureCameraLineDistance(body + 0x34, row + 4, row + 16, frame + 0x14, {...runtime, scratchBase: frame - 12});
      if (distance !== -1 && distance <= 0x3e80000 && get(m, frame + 0x14) <= 0x4000) {
        const participantAddress = ptr(m, frame + 0x18), triggerAddress = ptr(m, frame + 0x20);
        m.writeUInt16LE(participant & 65535, participantAddress); put(m, triggerAddress, get(m, frame + 0x1c));
        return 1;
      }
    }
    count = get(m, 0x6e6550);
  }
  return 0;
}
