// Native mixer consumers 4a90f0/4a9380 and their original getter slots.
const f32 = Math.fround;
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
const pointer = (m, p) => m.readUInt32LE(p);

export function getAudioMixerLevel(object, {memory}) { return memory.readFloatLE(object + 0x28); }
export function getAudioMixerRamp(object, {memory}) { return memory.readFloatLE(object + 0x2c); }
export function getAudioMixerRate(object, {memory}) { return memory.readFloatLE(object + 0x34); }

function getter(object, slot, entry, returnAddress, runtime) {
  const m = runtime.memory;
  put(m, entry, returnAddress);
  const target = pointer(m, pointer(m, object) + slot);
  if (target === 0x4a9300) return getAudioMixerLevel(object, runtime);
  if (target === 0x4a9320) return getAudioMixerRamp(object, runtime);
  if (target === 0x4a9360) return getAudioMixerRate(object, runtime);
  throw Error('Unported audio mixer getter 0x' + target.toString(16));
}

// One native float argument remains in the caller-owned slot entryESP+4.
export function updateAudioMixerRamp(object, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  const product = f32(m.readFloatLE(object + 0x30) * m.readFloatLE(S + 4));
  const value = f32(product + m.readFloatLE(object + 0x2c));
  m.writeFloatLE(value, object + 0x2c);
  if (0 > value) m.writeFloatLE(0, object + 0x2c);
  else {
    const one = m.readFloatLE(0x5dc774);
    m.writeFloatLE(value > one ? one : value, object + 0x2c);
  }
}

// Explicit shared raw memory retains native parent-chain and scratch aliases.
export function updateAudioMixerHierarchy(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 16;
  if (Number.isInteger(runtime.entryRegisters?.ESI)) put(m, S - 12, runtime.entryRegisters.ESI);
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, S - 16, runtime.entryRegisters.EDI);
  let value = getter(object, 0x10, F - 4, 0x4a90fe, runtime);
  m.writeFloatLE(value, F + 8);
  value = getter(object, 0x8, F - 4, 0x4a910b, runtime);
  m.writeFloatLE(value * m.readFloatLE(F + 8), object + 0x38);
  value = getter(object, 0x20, F - 4, 0x4a911b, runtime);
  let parent = pointer(m, object + 4);
  let one = m.readFloatLE(0x5dc774);
  m.writeFloatLE(value, object + 0x3c);
  while (parent) {
    value = getter(parent, 0x10, F - 4, 0x4a9139, runtime);
    m.writeFloatLE(value, F + 8);
    value = getter(parent, 0x8, F - 4, 0x4a9146, runtime);
    const first = m.readFloatLE(F + 8);
    one = m.readFloatLE(0x5dc774);
    m.writeFloatLE(value, F + 12);
    const loss = f32(one - f32(first * m.readFloatLE(F + 12)));
    m.writeFloatLE(f32(m.readFloatLE(object + 0x38) - loss), object + 0x38);
    value = getter(parent, 0x20, F - 4, 0x4a9179, runtime);
    m.writeFloatLE(value * m.readFloatLE(object + 0x3c), object + 0x3c);
    parent = pointer(m, parent + 4);
    if (!parent) one = m.readFloatLE(0x5dc774);
  }
  value = m.readFloatLE(object + 0x38);
  m.writeFloatLE(0 > value ? 0 : value > one ? one : value, object + 0x38);
  value = m.readFloatLE(object + 0x3c);
  m.writeFloatLE(value > 0 ? value : 0, object + 0x3c);
}
