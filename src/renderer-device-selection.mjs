import {getApplicationDebugger, registerApplicationDebuggerName} from './application-bootstrap.mjs';
import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import {selectRendererDisplayMode} from './renderer-adapters.mjs';
import {configureRendererGraphicsMode, getRendererWindowApplication} from './renderer-presentation.mjs';
import {showRendererStartupError} from './renderer-startup-errors.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const device = (r, object, method, args) => {if (typeof r.services?.direct3DCall !== 'function') throw Error('Renderer device selection requires a Direct3D COM service.'); return r.services.direct3DCall(object, method, args, r) | 0;};

//50f130 and the equivalent inline registration in512740.
export function getRendererDebuggerCategory(runtime) {
  const m = runtime.memory;
  if (!(get(m, 0x714b50) & 1)) {put(m, 0x714b50, get(m, 0x714b50) | 1); const logger = getApplicationDebugger(runtime); put(m, 0x714b4c, registerApplicationDebuggerName(logger, 0x5daea0, false, runtime));}
  return get(m, 0x714b4c);
}
const nativeFormatBits = (format, m) => {
  const delta = format - 20 >>> 0; if (delta > 10) return 0;
  return new Map([[0x510f72, 24], [0x510f7c, 32], [0x510f86, 16], [0x510f90, 8], [0x510f95, 0]]).get(ptr(m, 0x510f9c + m[0x510fb0 + delta] * 4));
};
//512740. Both successful selection and all three native fallback attempts are
//actual, including the multilingual50fb20 error algorithm after failure.
export function selectRendererAdapter(manager, index, windowed, width, height, bits, refresh, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = ((s - 4) & ~7) - 64;
  [index, windowed, width, height, bits, refresh].forEach((v, i) => put(m, s + 4 + i * 4, v));
  put(m, manager + 0x488, ptr(m, manager + 0x47c) + Math.imul(index, 0x53c));
  const logger = getApplicationDebugger({...runtime, scratchBase: f - 4}); getRendererDebuggerCategory({...runtime, scratchBase: f - 4});
  //4a18d0 is an enabled-byte getter; the remaining printf-like arguments are
  //unused by that actual implementation, not an external logging service.
  void m[logger + 0x24];
  windowed = get(m, s + 8);
  const choose = (mode = windowed) => selectRendererDisplayMode(manager, s + 12, s + 16, s + 20, s + 24, mode, {...runtime, scratchBase: f - 24});
  if ((windowed & 255) === 1) {
    const object = ptr(m, manager + 0x368); device(runtime, object, 0x20, [object, 0, f + 0x10]);
    put(m, s + 12, get(m, f + 0x10)); put(m, s + 16, get(m, f + 0x14));
    const selectedBits = nativeFormatBits(get(m, f + 0x1c), m), selectedRefresh = get(m, f + 0x18); put(m, s + 20, selectedBits); put(m, s + 24, selectedRefresh); choose(1);
    put(m, ptr(m, manager + 0x488), 0);
    if (m[getGameGraphicsSettings({...runtime, scratchBase: f - 4}) + 0xc8] === 1) {
      put(m, manager + 0x424, get(m, getGameGraphicsSettings({...runtime, scratchBase: f - 4}) + 0x2c));
      put(m, manager + 0x428, get(m, getGameGraphicsSettings({...runtime, scratchBase: f - 4}) + 0x30));
    } else {
      const app = getRendererWindowApplication({...runtime, scratchBase: f - 4});
      if (typeof runtime.services?.platformCall !== 'function') throw Error('Renderer adapter selection requires GetClientRect.'); runtime.services.platformCall('GetClientRect', [get(m, app + 8), f + 0x20], runtime);
      put(m, manager + 0x424, get(m, f + 0x28)); put(m, manager + 0x428, get(m, f + 0x2c));
      const scale = m.readFloatLE(getGameGraphicsSettings({...runtime, scratchBase: f - 4}) + 0x40), args = [get(m, f + 0x28), get(m, f + 0x2c), selectedBits, selectedRefresh, 0, scale];
      configureRendererGraphicsMode(getGameGraphicsSettings({...runtime, scratchBase: f - 28}), ...args, {...runtime, scratchBase: f - 28});
    }
  } else if (get(m, s + 12) > 0) {
    if (!choose()) {put(m, s + 24, 0); if (!choose()) {put(m, s + 20, 16); if (!choose()) {
      if (typeof runtime.handlers?.call50fb20 === 'function') runtime.handlers.call50fb20({memory: m, ecx: manager, args: [0x5db1f4], scratchBase: f - 8}, runtime);
      else showRendererStartupError(manager, 0x5db1f4, {...runtime, scratchBase: f - 8}); return 0;
    }}}
    getApplicationDebugger({...runtime, scratchBase: f - 4}); getRendererDebuggerCategory({...runtime, scratchBase: f - 4});
  }
  const caps = ptr(m, manager + 0x488);
  if (get(m, caps + 0x420) & 0x10000) put(m, manager + 0x438, 1);
  for (const [offset, value, tier] of [[0x4c8, 0xfffe0100, 2], [0x4d0, 0xffff0100, 3], [0x4d0, 0xffff0200, 4], [0x4d0, 0xffff0300, 5], [0x4d0, 0xffff0400, 6], [0x4d0, 0xffff0500, 7]]) if (ptr(m, caps + offset) >= value) put(m, manager + 0x438, tier);
  return 1;
}
