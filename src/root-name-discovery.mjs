import {openDiagnosticFile} from './game-diagnostics.mjs';
import {readGameResource, closeGameResource} from './game-resource-files.mjs';

const platform = (runtime, name, args) => {
  if (typeof runtime.services?.platformCall !== 'function') throw Error(`Root-name discovery requires platform service ${name}.`);
  return runtime.services.platformCall(name, args, runtime);
};
const crt = (runtime, name, args) => {
  if (typeof runtime.services?.crtCall !== 'function') throw Error(`Root-name discovery requires CRT service ${name}.`);
  return runtime.services.crtCall(name, args, runtime);
};

//4797a0. Actual file search/open/read/close policy, using the existing game
//file/cache adapters. Win32 discovery and CRT locale/cookie checks are services.
//scratchBase is native entry ESP; FIND_DATA starts at ESP-332.
export function discoverGameRootName(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 348;
  m.writeInt32LE(m.readInt32LE(0x5e8890) ^ (scratchBase - 336), scratchBase - 8);
  const checkedReturn = address => {
    crt(runtime, '__security_check_cookie', [m.readInt32LE(scratchBase - 8) ^ (scratchBase - 336)]);
    return address;
  };
  let end = 0x6e6660;
  while (m.readUInt8(end++)) {}
  if (end !== 0x6e6661) return checkedReturn(0x6e6660);

  let handle = 0;
  for (const path of [0x5d3468, 0x5d3478, 0x5d3488]) {
    const found = platform(runtime, 'FindFirstFileA', [path, frame + 16]) >>> 0;
    platform(runtime, 'FindClose', [found]);
    if (found !== 0xffffffff) {
      handle = openDiagnosticFile(path, 0x80000000, 3, {...runtime, scratchBase: frame - 4});
      if (handle) break;
    }
  }
  if (handle) {
    readGameResource(handle, 0x6e6b50, 80, {...runtime, scratchBase: frame - 8});
    closeGameResource(handle, {...runtime, scratchBase: frame - 4});
    end = 0x6e6b50;
    while (crt(runtime, 'isprint', [m.readUInt8(end)])) end++;
    m[end] = 0;
  }
  return checkedReturn(0x6e6b50);
}
