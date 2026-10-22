import constants from './camera-construction-constants.json' with {type: 'json'};
import {initializeRawBody, registerRawBodyShapes} from './raw-body-construction.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

export function initializeCameraConstructionConstants(memory) {
  for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
}

//416180. Allocate a physical type4 camera body and its76-byte controller.
//Each invocation also resets all four184h-byte camera rows, as in the native
//race constructor. Subsequent participant construction therefore resets them
//again; preserving previously selected modes here would change the game.
export function constructCameraController(index, trackedBody, control, runtime) {
  const {memory: m, scratchBase} = runtime;
  put(m, scratchBase + 4, control); put(m, scratchBase - 4, trackedBody);
  const old = ptr(m, 0x70dcf4), starts = ptr(m, 0x909288);
  m.fill(0, control, control + 48); put(m, 0x70dcf4, old + 384); m.fill(0, control + 48, control + 76);
  put(m, 0x5eaa40, m.readInt16LE(starts + index * 8) << 16);
  put(m, 0x5eaa44, (m.readInt16LE(starts + index * 8 + 2) - 63) << 16);
  put(m, 0x5eaa48, (m.readInt16LE(starts + index * 8 + 4) + 160) << 16);
  const body = (ptr(m, 0x902eec) + (old & 0xfffffffc)) >>> 0; put(m, control, body); m.fill(255, body, body + 384);
  put(m, body, 0x804); put(m, body + 4, 0); word(m, body + 8, 0); put(m, body + 12, 0);
  put(m, body + 0x118, 0); put(m, body + 0x11c, -1); put(m, body + 0x110, 0); m[body + 0x12f] = 255;
  put(m, body + 0x148, 0); m.fill(0, body + 0x16a, body + 0x172); word(m, body + 0x172, 0);
  initializeRawBody(ptr(m, control), 0x5eaa40, {...runtime, scratchBase: scratchBase - 24});
  put(m, ptr(m, control) + 0x108, 1); put(m, ptr(m, control) + 0xb4, 0);
  registerRawBodyShapes(ptr(m, control), 1, 0x5eac20, {...runtime, scratchBase: scratchBase - 32});
  m[control + 0x3b] &= 63;
  const session = ptr(m, 0x5ecb1c), preference = index === 0 ? 0 : 1;
  m[control + 0x39] ^= (m[session + 0xa90 + preference] ^ m[control + 0x39]) & 3;
  const flags = m[control + 0x39], setting = m.readInt8(session + 0xa92 + preference);
  word(m, control + 0x4a, setting); word(m, control + 0x48, 0); m[control + 0x3b] |= 63; put(m, control + 0x44, 0);
  const distance = m.readUInt16LE(0x5704cc + (flags & 3) * 2), height = m.readUInt16LE(0x570464 + (flags & 3) * 2);
  word(m, control + 0x3c, distance); word(m, control + 0x3e, height);
  word(m, control + 0x40, Math.trunc((distance << 16 >> 16) / 2)); m[control + 0x39] = flags & 0x3b;
  word(m, control + 0x42, Math.trunc((height << 16 >> 16) / 2));
  put(m, control + 4, get(m, scratchBase - 4)); m[control + 0x3a] = 0;
  put(m, control + 8, 0); put(m, control + 0x10, 0); put(m, control + 0xc, -65536); put(m, ptr(m, control) + 0x164, control);
  m.fill(0, 0x91ff80, 0x91ff80 + 0x610);
  const configuration = ptr(m, 0x5ecefc);
  for (let view = 0; view < 4; view++) {
    const row = 0x91ff80 + view * 0x184;
    word(m, row + 0x2c, 0); put(m, row + 0x32, 0x960000); put(m, row + 0x20, 0); word(m, row + 0x36, 0);
    put(m, row + 0x3c, 0); word(m, row + 0x3a, 65535); put(m, row, 14);
    const raceMode = m[session + 0x551];
    put(m, row + 0x178, view === 0 && raceMode >= 5 && raceMode <= 8 ? m[configuration + 0x84] : -1);
  }
  put(m, 0x91ce90, get(m, 0x91ce90) | 2);
}
