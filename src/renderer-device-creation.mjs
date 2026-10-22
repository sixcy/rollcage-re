import {getRendererWindowApplication} from './renderer-presentation.mjs';
import {showRendererStartupError} from './renderer-startup-errors.mjs';
import {resetRendererStateCache} from './renderer-state-cache.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//512a30. Device creation is a platform COM service;518cb0 is a separate
//game-owned cache reset and remains mandatory when a live wrapper exists.
export function createRendererDevice(manager, count, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 32;
  put(m, s + 4, count);
  let flags = get(m, ptr(m, manager + 0x488) + 0x420) & 0x100000 ? 0x50 : 0x40;
  if (ptr(m, manager + 0x374) > 1) flags |= 0x200;
  put(m, f + 0x10, flags);
  const application = getRendererWindowApplication({...runtime, scratchBase: f - 4});
  put(m, manager + 0x394, get(m, application + 8));
  const capturedCount = get(m, s + 4);
  if (capturedCount > 1) {
    let destination = manager + 0x3cc, handle = 12, remaining = capturedCount - 1;
    do {
      //Four individual native vector transfers, including the overlapping
      //source/destination behavior of successive additional-window records.
      for (const [offset, length] of [[0, 16], [16, 16], [32, 16], [48, 8]]) Buffer.from(m.subarray(manager + 0x378 + offset, manager + 0x378 + offset + length)).copy(m, destination - 0x1c + offset);
      const app = getRendererWindowApplication({...runtime, scratchBase: f + 20});
      put(m, destination, get(m, app + handle)); handle += 4; destination += 56;
    } while (--remaining);
    flags = get(m, f + 0x10);
  }
  put(m, s + 4, manager + 0x36c); put(m, f + 0x10, manager + 0x378);
  let result, attempts = 0;
  do {
    const object = ptr(m, manager + 0x368);
    const app = getRendererWindowApplication({...runtime, scratchBase: f + 20}), caps = ptr(m, manager + 0x488);
    if (typeof runtime.services?.direct3DCall !== 'function') throw Error('Renderer device creation requires a Direct3D COM service.');
    result = runtime.services.direct3DCall(object, 0x40, [object, get(m, caps), get(m, caps + 0x534), get(m, app + 8), flags, ptr(m, f + 0x10), ptr(m, s + 4)], runtime) | 0;
    if (!result) break;
  } while (++attempts < 2);
  if (result) showRendererStartupError(manager, 0x5db224, {...runtime, scratchBase: f - 8});
  const wrapper = ptr(m, manager + 0x364);
  if (wrapper) {
    const device = ptr(m, manager + 0x36c); put(m, wrapper + 8, device);
    if (device) {
      if (typeof runtime.handlers?.call518cb0 === 'function') runtime.handlers.call518cb0({memory: m, ecx: wrapper, args: [1], scratchBase: f - 8}, runtime);
      else resetRendererStateCache(wrapper, 1, {...runtime, scratchBase: f - 8});
    }
  }
  return result === 0 ? 1 : 0;
}
