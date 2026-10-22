import {getRaceStageCount} from '../../../src/race-stage-count.mjs';
import {constructViewportApplication} from '../../../src/application-bootstrap.mjs';
import literals from '../../../analysis/race-viewports-next-phase-literals-20261022.json' with {type: 'json'};

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeRaceViewportLiterals(memory) {
  for (const table of literals.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  return memory;
}
const service = (runtime, name) => {
  const fn = runtime.handlers?.[name]; if (typeof fn !== 'function') throw Error(`Isolated450a90 requires ${name}.`); return fn;
};

//450a90. Isolated parent reconstruction only: four game children remain
//explicit reached contracts. This is deliberately outside canonical src/.
export function initializeRaceViewports(runtime) {
  const {memory: m, scratchBase: entry} = runtime, frame = entry - 60;
  put(m, entry - 8, get(m, 0x5e8890) ^ (entry - 44));
  for (const [name, offset] of [['EBX', -48], ['EBP', -52], ['ESI', -56], ['EDI', -60]]) {
    if (Number.isInteger(runtime.entryRegisters?.[name])) put(m, entry + offset, runtime.entryRegisters[name]);
  }
  const game = (id, ecx, edx, args, stack, returned) => {
    put(m, stack, returned);
    const liveArgs = args.map((_, index) => get(m, stack + 4 + index * 4));
    return service(runtime, `call${id}`)({memory: m, ecx, edx, args: liveArgs, scratchBase: stack}, runtime);
  };
  game('471770', runtime.entryRegisters?.ECX, runtime.entryRegisters?.EDX, [], frame - 4, 0x450aa7);
  put(m, frame - 4, get(m, 0x5ec12c)); const second = get(m, 0x5ec124);
  put(m, frame - 8, get(m, 0x5ec128)); const first = get(m, 0x5ec120);
  game('42ef80', first, second, [get(m, frame - 8), get(m, frame - 4)], frame - 12, 0x450ac4);
  if (!get(m, 0x6e6758)) {
    put(m, 0x6e6758, 1);
    const ensureApplication = (constructReturn, exitReturn) => {
      let application = ptr(m, 0x6efb38), constructed = false;
      if (!application) {
        if (!(get(m, 0x715060) & 1)) {
          put(m, 0x715060, get(m, 0x715060) | 1); put(m, frame - 4, constructReturn);
          constructViewportApplication({...runtime, scratchBase: frame - 4});
          put(m, frame - 4, 0x56d660); put(m, frame - 8, exitReturn);
          service(runtime, 'registerExit')(0x56d660, {...runtime, scratchBase: frame - 8}); constructed = true;
        }
        application = 0x715470; put(m, 0x6efb38, application);
      }
      return {application, constructed};
    };
    const cast = (application, top, returned) => {
      for (const [offset, value] of [[-4, 0], [-8, 0x6e20a4], [-12, 0x6e213c], [-16, 0], [-20, application]]) put(m, top + offset, value);
      put(m, top - 24, returned);
      return service(runtime, 'dynamicCast')(application, 0, 0x6e213c, 0x6e20a4, 0, {...runtime, scratchBase: top - 24}) >>> 0;
    };
    const define = (application, name, x, y, width, height, castReturn, returned) => {
      for (const [offset, value] of [[-4, height], [-8, width], [-12, y], [-16, x], [-20, name]]) put(m, frame + offset, value);
      const actual = cast(application, frame - 20, castReturn);
      game('404020', actual, undefined, [name, x, y, width, height], frame - 24, returned);
    };
    put(m, frame - 4, 0x450ae5);
    for (let index = 0; index < getRaceStageCount(runtime);) {
      const record = (0x909308 + Math.imul(get(m, 0x5ec120 + index * 4), 0x30c)) >>> 0, name = frame + 0x14;
      put(m, frame - 4, 10); m[name] = 0; put(m, frame - 8, name); put(m, frame - 12, index);
      m.writeBigUInt64LE(0n, frame + 0x25); m.fill(0, frame + 0x15, frame + 0x25); put(m, frame + 0x2d, 0); m.writeUInt16LE(0, frame + 0x31); m[frame + 0x33] = 0;
      put(m, frame - 16, 0x450b37);
      if (typeof runtime.services?.crtCall !== 'function') throw Error('Isolated450a90 requires CRT _itoa service.');
      runtime.services.crtCall('_itoa', [index, name, 10], {...runtime, scratchBase: frame - 16});
      let end = name; while (m[end]) end++;
      const suffix = get(m, 0x5d2334), height = get(m, record + 12), width = get(m, record + 8); put(m, end, suffix); put(m, end + 4, get(m, 0x5d2338));
      let y = get(m, record + 4); const applicationBefore = ptr(m, 0x6efb38), x = get(m, record); put(m, frame + 0x10, y);
      const state = applicationBefore ? {application: applicationBefore, constructed: false} : ensureApplication(0x450b89, 0x450b93);
      if (state.constructed) y = get(m, frame + 0x10);
      define(state.application, name, x, y, width, height, 0x450bc1, 0x450bcb);
      const enabled = ensureApplication(0x450bea, 0x450bf4);
      put(m, frame - 4, 1); put(m, frame - 8, name);
      const actual = cast(enabled.application, frame - 8, 0x450c1c);
      game('406b80', actual, undefined, [name, 1], frame - 12, 0x450c26);
      index++; put(m, frame - 4, 0x450c2c);
    }
    let config = ptr(m, 0x5ecefc), width = m.readUInt16LE(config + 0x42c), height = m.readUInt16LE(config + 0x42e);
    const mirrorWidth = Math.trunc(width / 5) * 2, mirrorHeight = height >> 3 & ~1, mirrorY = height - mirrorHeight >> 5, mirrorX = width - mirrorWidth >> 1;
    let state = ensureApplication(0x450c8d, 0x450c97);
    define(state.application, 0x570244, mirrorX, mirrorY, mirrorWidth, mirrorHeight, 0x450cc1, 0x450ccb);
    config = ptr(m, 0x5ecefc); width = m.readUInt16LE(config + 0x42c); height = m.readUInt16LE(config + 0x42e);
    const size = width >>> 2, x = width - size - 10 | 0, y = height - size >> 1;
    state = ensureApplication(0x450d0b, 0x450d15);
    define(state.application, 0x570258, x, y, size, size, 0x450d3f, 0x450d49);
  }
  const cookie = get(m, entry - 8) ^ (entry - 44);
  if (cookie !== get(m, 0x5e8890)) throw Error('Isolated450a90 security-cookie check failed.');
}
