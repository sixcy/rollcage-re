import {assignViewportString} from './weather-viewport.mjs';
import {constructRendererString, destroyRendererString, appendRendererString, appendRendererStringSlice, formatRendererString, constructRendererWideString} from './renderer-startup-strings.mjs';
import constants from './renderer-startup-error-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const stringData = (m, p, wide = false) => ptr(m, p + 20) >= (wide ? 8 : 16) ? ptr(m, p) : p;
const cLength = (m, p) => {let n = 0; while (m[p + n]) n++; return n;};
const platform = (r, name, args) => {if (typeof r.services?.platformCall !== 'function') throw Error(`Renderer startup error requires platform ${name}.`); return r.services.platformCall(name, args, r);};
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Renderer startup error requires CRT ${name}.`); return r.services.libraryCall(name, args, r);};
const stringRuntime = r => ({...r, handlers: {...r.handlers, allocate: size => library(r, 'operatorNew', [size]), free: p => library(r, 'operatorDelete', [p])}});
export function initializeRendererStartupErrorConstants(memory) {for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//50fb20. Actual multilingual error assembly, live rejected-adapter reasons,
//narrow/wide string ownership and final Win32 warning policy.
export function showRendererStartupError(manager, message, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 0x138, main = f + 0x10, temporary = f + 0x30;
  put(m, s + 4, message); put(m, main + 20, 15); put(m, main + 16, 0); m[main] = 0; put(m, main + 24, 0); put(m, f + 0x134, 0);
  const language = platform(runtime, 'GetUserDefaultLangID', []) & 0x3ff;
  const translation = new Map([[10, [0x5daeac, 0xf4]], [16, [0x5daed0, 0x68]], [7, [0x5daef4, 0xbc]], [19, [0x5daf20, 0x84]], [12, [0x5daf58, 0xa0]], [6, [0x5daf7c, 0xd8]], [29, [0x5dafa4, 0x110]]]).get(language);
  const freeObject = (object, wide = false) => {const owner = ptr(m, object + 24); if (owner) {library(runtime, 'operatorDeleteArray', [owner]); put(m, object + 24, 0);} if (ptr(m, object + 20) >= (wide ? 8 : 16)) library(runtime, 'operatorDelete', [ptr(m, object)]);};
  if (translation) {
    const [literal, offset] = translation, translated = constructRendererString(f + offset, literal, {...runtime, scratchBase: f - 8});
    assignViewportString(main, stringData(m, translated), ptr(m, translated + 16), stringRuntime({...runtime, scratchBase: f - 16})); put(m, main + 24, 0); destroyRendererString(translated, runtime);
  } else {
    const translated = f + 0x4c; put(m, translated + 20, 15); put(m, translated + 16, 0); m[translated] = 0;
    assignViewportString(translated, 0x5dafc4, 33, stringRuntime({...runtime, scratchBase: f - 12})); put(m, translated + 24, 0);
    assignViewportString(main, stringData(m, translated), ptr(m, translated + 16), stringRuntime({...runtime, scratchBase: f - 16})); put(m, main + 24, 0); freeObject(translated);
  }
  message = ptr(m, s + 4);
  if (message) {
    appendRendererString(main, 0x5dafe8, 4, {...runtime, scratchBase: f - 12}); appendRendererString(main, message, cLength(m, message), {...runtime, scratchBase: f - 12}); appendRendererString(main, 0x5d674c, 1, {...runtime, scratchBase: f - 12});
  }
  put(m, f + 0x2c, 0); const count = () => Math.trunc((get(m, manager + 0x480) - get(m, manager + 0x47c) | 0) / 0x53c);
  for (let offset = 0; (ptr(m, f + 0x2c) >>> 0) < (count() >>> 0); offset += 0x53c) {
    const base = ptr(m, manager + 0x47c), reason = ptr(m, base + offset + 0x538);
    if (reason) {
      put(m, temporary + 20, 15); put(m, temporary + 16, 0); m[temporary] = 0; put(m, temporary + 24, 0);
      formatRendererString(temporary, 0x5daff0, [base + offset + 0x204, reason], {...runtime, scratchBase: f - 20});
      appendRendererString(main, 0x5dafe8, 4, {...runtime, scratchBase: f - 12}); appendRendererStringSlice(main, temporary, 0, -1, {...runtime, scratchBase: f - 16}); freeObject(temporary);
    }
    put(m, f + 0x2c, get(m, f + 0x2c) + 1);
  }
  platform(runtime, 'ShowCursor', [1]); constructRendererWideString(temporary, stringData(m, main), {...runtime, scratchBase: f - 8}); platform(runtime, 'MessageBeep', [0x40]);
  platform(runtime, 'MessageBoxW', [0, stringData(m, temporary, true), 0x5d377c, 0x11040]); freeObject(temporary, true); freeObject(main);
}
