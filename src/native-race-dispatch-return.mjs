import {nativeCodeAddress} from './native-memory-spans.mjs';

const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const parity = value => {let bits = value & 255; bits ^= bits >>> 4; bits ^= bits >>> 2; bits ^= bits >>> 1; return !(bits & 1);};
function status(left, right) {
  const result = (left - right) >>> 0;
  return {carry: left < right, parity: parity(result), auxiliary: Boolean((left ^ right ^ result) & 16),
    zero: result === 0, sign: Boolean(result & 0x80000000), overflow: Boolean((left ^ right) & (left ^ result) & 0x80000000)};
}
function encodedFlags(flags, incoming) {
  const mask = flags.auxiliary === null ? 0x8c5 : 0x8d5;
  let value = (flags.carry ? 1 : 0) | (flags.parity ? 4 : 0) | (flags.auxiliary ? 16 : 0)
    | (flags.zero ? 64 : 0) | (flags.sign ? 128 : 0) | (flags.overflow ? 2048 : 0);
  if (incoming !== undefined) value = ((incoming & ~0x8d5) | value) >>> 0;
  return Object.freeze({value, knownMask: incoming === undefined ? mask : flags.auxiliary === null ? 0xffffffef : 0xffffffff});
}

//450e38..450e4d after a genuine450e50 RET. P is the current ESP=U+4,
//not a fresh function-entry stack. All popped values remain actual/raw.
//Retained001-frame-parent: ev_7b9bed3c32690505a0fc371b3be2907a87296a209fb2d9165e2ccc4962b64f87.
export function resumeNativeRaceDispatchReturn(runtime) {
  const {memory, moduleBaseAddress, scratchBase: P, entryRegisters, eflags} = runtime ?? {};
  if (!Buffer.isBuffer(memory) || !uint(moduleBaseAddress) || !moduleBaseAddress || !uint(P) || P < 4 || P % 4 || P + 28 > 0x100000000) {
    throw Error('Native race dispatch return requires actual memory/module and bounded aligned ESP.');
  }
  const entryAddress = nativeCodeAddress(0x450e38, runtime), registers = {};
  for (const name of ['EAX', 'EBX', 'ECX', 'EDX', 'EBP', 'ESI', 'EDI']) if (entryRegisters?.[name] !== undefined) {
    if (!uint(entryRegisters[name])) throw Error(`Native race dispatch return requires actual uint32 ${name}.`);
    registers[name.toLowerCase()] = entryRegisters[name];
  }
  for (const name of ['EAX', 'ESI', 'EDI']) if (!uint(entryRegisters?.[name])) throw Error(`Native race dispatch return requires known ${name}.`);
  if (entryRegisters.ESP !== undefined && entryRegisters.ESP !== P) throw Error('Native race dispatch return ESP differs from its live boundary.');
  if (entryRegisters.EIP !== undefined && entryRegisters.EIP !== entryAddress) throw Error('Native race dispatch return EIP is not450e38.');
  if (eflags !== undefined && !uint(eflags)) throw Error('Native race dispatch return requires uint32 incoming EFLAGS when supplied.');

  const childResult = registers.eax, iteration = registers.esi, totalIterations = registers.edi;
  registers.ebx = registers.eax; //MOV EBX,EAX.
  let esp = P + 4; //ADD ESP,4; following TEST overwrites its defined status bits.
  let arithmeticFlags = {carry: false, parity: parity(registers.ebx), auxiliary: null,
    zero: registers.ebx === 0, sign: Boolean(registers.ebx & 0x80000000), overflow: false};
  let nextIteration = null;
  if (registers.ebx !== 0) {
    registers.esi = (registers.esi + 1) >>> 0; //INC ESI, including uint32 wrap.
    nextIteration = registers.esi;
    arithmeticFlags = status(registers.esi, registers.edi); //CMP is unsigned for JC.
    if (arithmeticFlags.carry) {
      esp -= 4; memory.writeUInt32LE(registers.edi, esp); //450e30 PUSH EDI.
      registers.edx = registers.esi; //450e31 MOV EDX,ESI.
      esp -= 4; memory.writeUInt32LE(entryAddress, esp); //Actual CALL return word.
      registers.esp = esp; registers.eip = nativeCodeAddress(0x450e50, runtime);
      return Object.freeze({kind: 'sibling', parentEntryEsp: P - 4, dispatchEntryEsp: P + 24,
        childResult, iteration, totalIterations, nextIteration,
        registers: Object.freeze(registers), arithmeticFlags: Object.freeze(arithmeticFlags), flags: encodedFlags(arithmeticFlags, eflags),
        continuation: Object.freeze({entryAddress: registers.eip, entryEsp: esp, returnAddress: entryAddress, iteration: registers.edx, totalIterations}),
        childExecuted: false});
    }
  }
  const pop = () => {const value = memory.readUInt32LE(esp); esp += 4; return value;};
  registers.edi = pop(); registers.esi = pop(); registers.ebp = pop(); //450e46..48.
  registers.eax = registers.ebx; //450e49 before POP EBX.
  registers.ebx = pop(); registers.ecx = pop(); //ECX is450d60's saved local.
  registers.eip = pop(); registers.esp = esp >>> 0; //Actual RET, including32-bit wrap.
  return Object.freeze({kind: 'returned', parentEntryEsp: P - 4, dispatchEntryEsp: P + 24,
    childResult, iteration, totalIterations, nextIteration,
    registers: Object.freeze(registers), arithmeticFlags: Object.freeze(arithmeticFlags), flags: encodedFlags(arithmeticFlags, eflags),
    continuation: null, childExecuted: false});
}
