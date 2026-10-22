import {constructViewportApplication} from './application-bootstrap.mjs';
import {getGameGraphicsSettings} from './game-graphics-settings.mjs';
import {chooseRendererDepthFormat, initializeRendererTextureCreationConstants} from './renderer-texture-creation.mjs';
import constants from './renderer-presentation-constants.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const abs = value => {const sign = value >> 31; return ((value ^ sign) - sign) | 0;};
const device = (r, object, method, args) => {if (typeof r.services?.direct3DCall !== 'function') throw Error('Renderer presentation requires a Direct3D COM service.'); return r.services.direct3DCall(object, method, args, r) | 0;};
export function initializeRendererPresentationConstants(memory) {initializeRendererTextureCreationConstants(memory); for (const table of constants.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//402aa0 and its repeated inline WindowsApplication singleton/RTTI blocks.
//The target descriptor2054 differs from402d10's Application descriptor20a4.
function resolveWindow(frame, runtime) {
  const m = runtime.memory; let application = ptr(m, 0x6efb38);
  if (!application) {
    if (!(get(m, 0x715060) & 1)) {
      put(m, 0x715060, get(m, 0x715060) | 1); constructViewportApplication({...runtime, scratchBase: frame - 4});
      if (typeof runtime.handlers?.registerExit !== 'function') throw Error('Renderer window application requires CRT atexit.'); runtime.handlers.registerExit(0x56d660, {...runtime, scratchBase: frame - 8});
    }
    application = 0x715470; put(m, 0x6efb38, application);
  }
  if (typeof runtime.handlers?.dynamicCast !== 'function') throw Error('Renderer window application requires CRT RTTI.');
  for (const [i, value] of [application, 0, 0x6e213c, 0x6e2054, 0].entries()) put(m, frame - 20 + i * 4, value);
  return runtime.handlers.dynamicCast(application, 0, 0x6e213c, 0x6e2054, 0, {...runtime, scratchBase: frame - 24}) >>> 0;
}
export function getRendererWindowApplication(runtime) {return resolveWindow(runtime.scratchBase - 20, runtime);}

//4068d0. Each division is scalar SSE precision, including zero/infinite
//results. Signed integer dimensions convert to single precision separately.
export function configureRendererGraphicsMode(settings, width, height, bits, refresh, fullscreen, scale, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = Math.fround;
  [width, height, bits, refresh, fullscreen].forEach((v, i) => put(m, s + 4 + i * 4, v)); m.writeFloatLE(scale, s + 24);
  const one = m.readFloatLE(0x5dc774), ratio = f(one / scale);
  for (const [arg, offset] of [[4, 0x2c], [8, 0x30], [12, 0x34], [16, 0x38]]) put(m, settings + offset, get(m, s + arg));
  m[settings + 0x3c] = m[s + 20]; const w = f(get(m, settings + 0x2c)); m.writeFloatLE(ratio, settings + 0x44); const h = f(get(m, settings + 0x30));
  m.writeFloatLE(scale, settings + 0x40); const vertical = f(scale / f(w / h)), inverse = f(one / vertical); m.writeFloatLE(vertical, settings + 0x48); m.writeFloatLE(inverse, settings + 0x4c);
}

//5120e0. Original D3DPRESENT_PARAMETERS construction, multisample/refresh
//policy, target/depth format selection, and live additional-window handles.
export function configureRendererPresentation(manager, runtime) {
  const {memory: m, scratchBase: s} = runtime, f = s - 60;
  const settings = getGameGraphicsSettings({...runtime, scratchBase: f - 4}); put(m, f + 0x18, settings); m[f + 0x17] = m[settings + 0x60];
  const samples = m[settings + 0x63] ? 0 : get(m, settings + 0x54); put(m, f + 0x1c, samples);
  //50f1a0 is the original manager's virtual10 getter.
  if (get(m, manager + 0x438) >= 1) {const caps = ptr(m, manager + 0x488); if ((get(m, caps + 0x444) & 0x20000) && (get(m, caps + 0x448) & 0x20000)) {put(m, manager + 0x5b8, 2); put(m, manager + 0x5bc, 2); put(m, manager + 0x5c0, 1);}}
  if (get(m, manager + 0x438) >= 4 && m[settings + 0x62] === 1) {const caps = ptr(m, manager + 0x488); if ((get(m, caps + 0x428) & 0x20000) && (get(m, caps + 0x444) & 0x400)) {put(m, manager + 0x5b8, 3); put(m, manager + 0x5bc, 2); put(m, manager + 0x5c0, Math.min(ptr(m, caps + 0x470), 8));}}
  m.fill(0, manager + 0x378, manager + 0x420); put(m, manager + 0x39c, 1); put(m, manager + 0x398, m[settings + 0x3c] === 0 ? 1 : 0);
  const window = getRendererWindowApplication({...runtime, scratchBase: f - 4}); put(m, manager + 0x394, get(m, window + 8)); put(m, manager + 0x388, 0); put(m, manager + 0x390, 1);
  put(m, manager + 0x378, get(m, manager + 0x424)); put(m, manager + 0x37c, get(m, manager + 0x428)); put(m, manager + 0x380, get(m, manager + 0x430));
  const depth = chooseRendererDepthFormat(manager, get(m, manager + 0x430), {...runtime, scratchBase: f - 8}); put(m, manager + 0x3a0, depth); m[manager + 0x52e] = depth === 75 || depth === 79 ? 1 : 0;
  put(m, manager + 0x384, m[f + 0x17] === 1 && m[settings + 0x58] === 1 ? 2 : 1);
  if (m[settings + 0x3c] === 1) put(m, manager + 0x3a8, get(m, manager + 0x42c)); put(m, manager + 0x3ac, m[settings + 0x58] ? 1 : 0x80000000);
  let supportedRefresh = false;
  if (m[settings + 0x3c] === 1 && m[settings + 0x58] === 1) {
    const refresh = ptr(m, manager + 0x3a8), wanted = get(m, settings + 0x5c);
    if (abs(refresh - wanted | 0) <= 2 && (m[ptr(m, manager + 0x488) + 0x418] & 1)) supportedRefresh = true;
    else if (abs((refresh >>> 1) - wanted | 0) <= 2 && (m[ptr(m, manager + 0x488) + 0x418] & 2)) {put(m, manager + 0x3ac, 2); supportedRefresh = true;}
    else if (abs(Math.floor(refresh / 3) - wanted | 0) <= 2 && (m[ptr(m, manager + 0x488) + 0x418] & 4)) {put(m, manager + 0x3ac, 4); supportedRefresh = true;}
  }
  if (!supportedRefresh) put(m, settings + 0x5c, 0);
  if (samples > 0 && !m[getGameGraphicsSettings({...runtime, scratchBase: f - 4}) + 0xc9]) {
    put(m, f + 0x1c, get(m, f + 0x1c) - 1); let available = 0;
    for (let value = 2; value <= 16 && available < 4; value++) {
      const check = format => {const currentSettings = ptr(m, f + 0x18), caps = ptr(m, manager + 0x488), object = ptr(m, manager + 0x368); return device(runtime, object, 0x2c, [object, get(m, caps), get(m, caps + 0x534), get(m, manager + format), m[currentSettings + 0x3c] === 0 ? 1 : 0, value, 0]);};
      if (check(0x380) === 0 && check(0x3a0) === 0) {put(m, f + 0x20 + available * 4, value); available++;}
    }
    if (available > 0) {const index = get(m, f + 0x1c) < available ? get(m, f + 0x1c) : available - 1; put(m, manager + 0x390, 1); put(m, manager + 0x388, get(m, f + 0x20 + index * 4));}
  }
  put(m, f + 0x28, get(m, manager + 0x424)); put(m, f + 0x2c, get(m, manager + 0x428)); put(m, f + 0x20, 0); put(m, f + 0x24, 0);
  const rectangle = Buffer.from(m.subarray(f + 0x20, f + 0x30)); put(m, manager + 0x504, 0); rectangle.copy(m, manager + 0x4cc); put(m, manager + 0x500, 0); rectangle.copy(m, manager + 0x4dc);
  const testFormat = candidate => {const caps = ptr(m, manager + 0x488), object = ptr(m, manager + 0x368); return device(runtime, object, 0x28, [object, get(m, caps), get(m, caps + 0x534), get(m, manager + 0x430), 1, 3, candidate]);};
  if (testFormat(get(m, manager + 0x430)) === 0) {put(m, manager + 0x500, get(m, manager + 0x380)); put(m, manager + 0x504, get(m, manager + 0x3a0));}
  else for (let i = 0; i < 9; i++) if (testFormat(get(m, 0x5db250 + i * 4)) === 0) {put(m, manager + 0x500, get(m, 0x5db250 + i * 4)); put(m, manager + 0x504, chooseRendererDepthFormat(manager, get(m, manager + 0x430), {...runtime, scratchBase: f - 8})); break;}
  for (let i = 1, destination = manager + 0x3cc, offset = 12; (i >>> 0) < ptr(m, manager + 0x374); i++, destination += 56, offset += 4) {
    for (const [source, target, length] of [[manager + 0x378, destination - 28, 16], [manager + 0x388, destination - 12, 16], [manager + 0x398, destination + 4, 16], [manager + 0x3a8, destination + 20, 8]]) Buffer.from(m.subarray(source, source + length)).copy(m, target);
    const app = resolveWindow(f, runtime); put(m, destination, get(m, app + offset));
  }
}
