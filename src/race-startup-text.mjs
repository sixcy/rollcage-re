import {queryWeatherViewport} from './weather-viewport.mjs';

const ptr = (m, p) => m.readUInt32LE(p), get = (m, p) => m.readInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
function save(runtime, frame, offsets) {
  for (const [name, offset] of offsets) if (runtime.entryRegisters?.[name] !== undefined) put(runtime.memory, frame + offset, runtime.entryRegisters[name]);
}
function cookie(runtime, address, probe, returnSlot, returnAddress) {
  const {memory: m} = runtime, value = (ptr(m, address) ^ probe) >>> 0; put(m, returnSlot, returnAddress);
  if (runtime.services?.securityCookie) runtime.services.securityCookie(value, {...runtime, scratchBase: returnSlot});
  else if (value !== ptr(m, 0x5e8890)) throw Error('Native startup text security cookie mismatch.');
}
function viewport(runtime, frame, nameOffset, outputs, memsetReturn, queryReturn) {
  const {memory: m} = runtime, name = frame + nameOffset;
  Buffer.from(m.subarray(0x5d0254, 0x5d025c)).copy(m, name); m[name + 8] = m[0x5d025c];
  for (const [offset, value] of [[-4,251],[-8,0],[-12,name + 9],[-16,memsetReturn]]) put(m, frame + offset, value);
  if (runtime.services?.libraryCall) runtime.services.libraryCall('memset', [name + 9, 0, 251], {...runtime, scratchBase: frame - 16});
  else m.fill(0, name + 9, name + 260);
  const [x,y,w,h] = outputs.map(o => frame + o);
  for (const [offset, value] of [[-4,h],[-8,w],[-12,y],[-16,queryReturn]]) put(m, frame + offset, value);
  queryWeatherViewport(name, x, y, w, h, {...runtime, scratchBase: frame - 16});
}
// Both native consumers copy a maximum of64 bytes without copying the final
// terminator. They enter this loop even when the first source byte is zero.
function copyMeasuredText(slot, message, runtime, {frame, countOffset, deltaOffset, capturedScale} = {}) {
  const {memory: m} = runtime; let count = 0, width = 0, cursor = message, spaceScale = capturedScale;
  const delta = slot - message + 16 | 0; put(m, frame + deltaOffset, delta);
  if (countOffset !== undefined) put(m, frame + countOffset, 0);
  do {
    const ch = m[cursor]; m[(cursor + get(m, frame + deltaOffset)) >>> 0] = ch;
    if (ch === 32) {const font = ptr(m, 0x82dfa0); width = width + (Math.imul(get(m, font + 16), spaceScale ?? get(m, 0x91d338)) >> 8) | 0;}
    else {
      const font = ptr(m, 0x82dfa0), glyph = m[font + 0x101c + ch];
      if (glyph !== 255) {
        const advance = Math.imul(m.readUInt16LE(font + (glyph + 2) * 16), m.readInt16LE(slot + 14)) >> 8;
        //48b7d0 reloads the font pointer after its first multiply;477000 keeps it.
        const spacingFont = capturedScale === undefined ? ptr(m, 0x82dfa0) : font;
        width = width + ((Math.imul(advance, get(m, 0x91d338)) >> 8) + get(m, spacingFont + 20) | 0) | 0;
      }
      if (capturedScale !== undefined) spaceScale = get(m, 0x91d338);
    }
    cursor++; count = countOffset === undefined ? count + 1 : get(m, frame + countOffset) + 1;
    if (countOffset !== undefined) put(m, frame + countOffset, count);
  } while (m[cursor] !== 0 && count < 64);
  return {count, width};
}

//48b7d0. ECXmessage/EDXstate; five native stack arguments remain live.
export function enqueueRaceText(message, state, x, y, flags, timer, queue, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 0x138, probe = S - 0x128;
  put(m, S - 4, ptr(m, 0x5e8890) ^ probe); save(runtime,F,[['EBX',12],['EBP',8],['ESI',4],['EDI',0]]); put(m,F + 36,state);
  for (const [index,value] of [x,y,flags,timer,queue].entries()) put(m,S + 4 + index * 4,value);
  const base = queue === 1 ? 0x9028e4 : 0x82dfa4, limit = queue === 1 ? 8 : 28; let index = 0;
  while (index < limit && m[base + index * 80 + 8]) index++;
  let result = -1;
  if (index < limit) {
    const slot = base + index * 80;
    word(m,slot + 14,get(m,F + 0x144) & 0x200 ? 128 : m.readUInt16LE(ptr(m,0x82dfa0) + 4));
    const measured = copyMeasuredText(slot,message,runtime,{frame:F,deltaOffset:0x14});
    let currentFlags = get(m,F + 0x144); m[slot + 8] = measured.count;
    word(m,slot + 12,currentFlags & 0x100 ? get(m,F + 0x148) : -1);
    const originalX = get(m,F + 0x13c), originalY = get(m,F + 0x140);
    word(m,slot + 4,originalX); word(m,slot + 6,originalY);
    if (currentFlags & 4) {
      if (!get(m,F + 0x14c)) {
        viewport(runtime,F,0x28,[0x20,0x1c,0x14,0x18],0x48b948,0x48b967); word(m,slot + 4,m.readUInt16LE(slot + 4) + (get(m,F + 0x14) >> 1));
        viewport(runtime,F,0x28,[0x18,0x1c,0x20,0x14],0x48b99e,0x48b9bd); word(m,slot + 6,m.readUInt16LE(slot + 6) + (get(m,F + 0x14) >> 1)); currentFlags = get(m,F + 0x144);
      } else {word(m,slot + 4,(ptr(m,0x9020ac) >>> 1) + originalX); word(m,slot + 6,(ptr(m,0x9020b0) >>> 1) + originalY);}
    }
    if (currentFlags & 0x40) {
      viewport(runtime,F,0x28,[0x18,0x1c,0x14,0x20],0x48ba20,0x48ba3f); word(m,slot + 4,m.readUInt16LE(slot + 4) + (get(m,F + 0x14) >> 1));
      viewport(runtime,F,0x28,[0x18,0x1c,0x20,0x14],0x48ba76,0x48ba95); word(m,slot + 6,m.readUInt16LE(slot + 6) + get(m,F + 0x14)); currentFlags = get(m,F + 0x144);
    }
    if (currentFlags & 8) {viewport(runtime,F,0x28,[0x18,0x1c,0x14,0x20],0x48bad5,0x48baf4); word(m,slot + 4,((Math.imul(get(m,F + 0x14),3) >> 1) - (measured.width >> 1))); currentFlags = get(m,F + 0x144);}
    if (currentFlags & 2) word(m,slot + 4,m.readUInt16LE(slot + 4) - (measured.width >> 1));
    else if (currentFlags & 16) word(m,slot + 4,m.readUInt16LE(slot + 4) - measured.width);
    m[slot + 9] = currentFlags & 255; put(m,slot,get(m,F + 36)); word(m,slot + 10,measured.width);
    if (get(m,F + 0x14c) === 1) {word(m,0x902b68 + index * 2,get(m,F + 0x148)); put(m,0x902b64,get(m,0x902b64) + 1);}
    result = index;
  }
  cookie(runtime,S - 4,probe,probe - 4,0x48bb69); return result;
}

//477000. The mode1 inline queue path has its own captured scale policy.
export function initializeNetworkStartupText(mode, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 0x134, probe = S - 0x128;
  put(m,S - 8,ptr(m,0x5e8890) ^ probe); save(runtime,F,[['EBX',8],['ESI',4],['EDI',0]]);
  if (mode === 1) {
    const session = ptr(m,0x5ecb1c); for (let i = 0; i < m[session + 0x54d]; i++) m[session + i] = 8;
    word(m,session + 0x58e,1800); const scale = get(m,0x91d338); put(m,F + 16,Math.imul(scale,60) >> 8);
    let index = 0; while (index < 28 && m[0x82dfa4 + index * 80 + 8]) index++;
    if (index < 28) {
      const slot = 0x82dfa4 + index * 80; word(m,slot + 14,m.readUInt16LE(ptr(m,0x82dfa0) + 4));
      const measured = copyMeasuredText(slot,ptr(m,0x70ea9c),runtime,{frame:F,countOffset:0x14,deltaOffset:0x18,capturedScale:scale});
      word(m,slot + 12,-1); word(m,slot + 4,0); word(m,slot + 6,get(m,F + 16)); m[slot + 8] = measured.count;
      viewport(runtime,F,0x20,[0x1c,0x14,0x10,0x18],0x47719a,0x4771b9); word(m,slot + 4,m.readUInt16LE(slot + 4) + (get(m,F + 16) >> 1));
      viewport(runtime,F,0x20,[0x14,0x18,0x1c,0x10],0x4771f0,0x47720f); word(m,slot + 6,m.readUInt16LE(slot + 6) + (get(m,F + 16) >> 1));
      word(m,slot + 4,m.readUInt16LE(slot + 4) - (measured.width >> 1)); m[slot + 9] = 7; put(m,slot,0); word(m,slot + 10,measured.width);
      cookie(runtime,S - 8,probe,probe - 4,0x477243); return;
    }
    cookie(runtime,S - 8,probe,probe - 4,0x4770ad); return;
  }
  word(m,ptr(m,0x5ecb1c) + 0x58e,99);
  const call = (message,y,flags,returnAddress) => {
    for (const [i,v] of [0,y,flags,0,0].entries()) put(m,F - 20 + i * 4,v); put(m,F - 24,returnAddress);
    enqueueRaceText(message,0,0,y,flags,0,0,{...runtime,scratchBase:F - 24,entryRegisters:{EBX:get(m,F + 8),EBP:runtime.entryRegisters?.EBP ?? 0,ESI:get(m,F + 4),EDI:get(m,F)}});
  };
  call(ptr(m,0x70eaa4),Math.imul(get(m,0x91d338),60) >> 8,7,0x47729b);
  call(ptr(m,0x70eaa8),Math.imul(get(m,0x91d338),82) >> 8,0x26,0x4772be);
  cookie(runtime,S - 8,probe,probe - 4,0x4772d2);
}
