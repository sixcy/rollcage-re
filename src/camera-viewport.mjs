import {assignViewportString, getOrCreateViewportRecord} from './weather-viewport.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const cLength = (m, p) => {let end = p; while (m[end]) end++; return end - p;};

//406c70. application is native ECX, name/mode are two stack arguments and
//value arrives inXMM2. Reuse actual std::string/map insertion and rotations.
//The float field is record+1c; mode1 assigns directly, others blend95%/5%.
export function updateCameraViewportScale(application, name, mode, value, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 100;
  put(m, scratchBase + 4, name); put(m, scratchBase + 8, mode);
  put(m, frame + 0x54, get(m, 0x5e8890) ^ (scratchBase - 80));
  m.writeFloatLE(value, frame + 0x14); put(m, frame + 0x18, 0);
  const smooth = get(m, frame + 0x6c) !== 1;
  if (smooth) {
    put(m, frame + 0x4c, 15); put(m, frame + 0x48, 0); m[frame + 0x38] = 0;
    const data = name || 0x56fe6b;
    assignViewportString(frame + 0x38, data, cLength(m, data), {...runtime, scratchBase: frame - 12});
    put(m, frame + 0x50, 0); put(m, frame + 0x60, 0); put(m, frame + 0x18, 1);
    const record = getOrCreateViewportRecord(application + 0x7c, frame + 0x38, {...runtime, scratchBase: frame - 8});
    const fresh = Math.fround(m.readFloatLE(frame + 0x14) * m.readFloatLE(0x5dc664));
    const old = Math.fround(m.readFloatLE(record + 0x1c) * m.readFloatLE(0x5dc75c));
    m.writeFloatLE(Math.fround(old + fresh), frame + 0x14);
  }
  put(m, frame + 0x30, 15); put(m, frame + 0x2c, 0); m[frame + 0x1c] = 0;
  const data = name || 0x56fe6b;
  assignViewportString(frame + 0x1c, data, cLength(m, data), {...runtime, scratchBase: frame - 12});
  put(m, frame + 0x34, 0); put(m, frame + 0x60, 1);
  const record = getOrCreateViewportRecord(application + 0x7c, frame + 0x1c, {...runtime, scratchBase: frame - 8});
  put(m, record + 0x1c, get(m, frame + 0x14));
  const release = address => {if (typeof runtime.handlers?.free !== 'function') throw Error('Camera viewport string requires CRT free.'); runtime.handlers.free(address, runtime);};
  if (ptr(m, frame + 0x34)) {release(ptr(m, frame + 0x34)); put(m, frame + 0x34, 0);}
  if (ptr(m, frame + 0x30) >= 16) release(ptr(m, frame + 0x1c));
  put(m, frame + 0x30, 15); put(m, frame + 0x2c, 0); m[frame + 0x1c] = 0;
  if (smooth) {
    if (ptr(m, frame + 0x50)) {release(ptr(m, frame + 0x50)); put(m, frame + 0x50, 0);}
    if (ptr(m, frame + 0x4c) >= 16) release(ptr(m, frame + 0x38));
  }
}
