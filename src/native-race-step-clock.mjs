import {readGameMicroseconds} from './game-network-protocol.mjs';
import {advanceRaceStepCount,decodePhysicsNumericalContext} from './race-clock.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';
import {convertNativeUnsigned64ToDouble,convertNativeDoubleToSigned64} from './native-clock-conversion.mjs';
import {x87FromBinary64,x87Multiply,x87StoreBinary64} from './x87-finite.mjs';

const u64 = value => BigInt.asUintN(64, value);
const low = value => Number(u64(value) & 0xffffffffn), high = value => Number(u64(value) >> 32n);
const scaleHex = '681d554d1075ff3e';
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

function contextFromState(state) {
  const context = decodePhysicsNumericalContext(state);
  if (state.x87StatusWord !== undefined) {
    if (!Number.isInteger(state.x87StatusWord) || state.x87StatusWord < 0 || state.x87StatusWord > 0xffff) throw Error('Native race clock requires a raw x87 status word when supplied.');
    context.x87.statusWord = state.x87StatusWord;
  }
  return context;
}

function numericalContext(runtime) {
  const supplied = runtime.numericalContext;
  const context = contextFromState({x87ControlWord: supplied?.x87?.controlWord, mxcsr: supplied?.sse?.mxcsr, x87StatusWord: supplied?.x87?.statusWord});
  if (![24, 53, 64].includes(context.x87.precisionBits) || context.sse.roundingMode !== 'nearest-even'
    || context.sse.exceptionMask !== 63 || context.sse.flushToZero || context.sse.denormalsAreZero) {
    throw Error('Native race clock requires explicit legal x87 control and masked nearest-even SSE without DAZ/FTZ.');
  }
  return context;
}

//441cc3 MULSD. Its actual operands are a finite converted uint64 and the
//observed original factor. All nonzero products are normal binary64, so exact
//53-bit significand rounding equals SSE without subnormal double rounding.
function multiplyClockScale(value, runtime, context) {
  const m = runtime.memory, address = nativeCodeAddress(0x5dc6e0, runtime);
  if (m.subarray(address, address + 8).toString('hex') !== scaleHex) throw Error('Native race clock requires observed original5dc6e0 scale bytes.');
  if (!Number.isFinite(value) || value < 0 || value > 2 ** 64) throw Error('Native race clock unsigned64 conversion outside its finite domain.');
  const left = x87FromBinary64(value), right = x87FromBinary64(m.readDoubleLE(address));
  const rounded = x87Multiply(left, right, {precisionBits: 53, roundingMode: context.sse.roundingMode});
  const product = x87StoreBinary64(rounded, context.sse.roundingMode);
  const stored = x87FromBinary64(product);
  let significand = left.significand * right.significand, exponent = left.exponent + right.exponent;
  if (significand === 0n) exponent = 0;
  else while ((significand & 1n) === 0n) {significand >>= 1n; exponent++;}
  const inexact = significand !== stored.significand || exponent !== stored.exponent;
  const derived = contextFromState({x87ControlWord: context.x87.controlWord, mxcsr: context.sse.mxcsr | (inexact ? 0x20 : 0), x87StatusWord: context.x87.statusWord});
  return {value: product, inexact, context: derived};
}

//Complete441c70, including its actual489cd0 caller frames and both in-image
//conversion algorithms. Platform time writes are the only supplied outcomes.
//Retained010/027/028/029,1047 and20261024-clock-status-568bfd-assembly.
export function runNativeRaceStepClock(runtime) {
  const {memory: m, scratchBase: C} = runtime ?? {};
  if (!Buffer.isBuffer(m) || !uint(C) || C < 512 || (C & 3) || !uint(runtime.moduleBaseAddress) || !runtime.moduleBaseAddress) {
    throw Error('Native race clock requires actual memory, module base and aligned entry ESP.');
  }
  const incoming = {};
  for (const name of ['EBX', 'EBP', 'ESI', 'EDI']) {
    const value = runtime.entryRegisters?.[name];
    if (!uint(value)) throw Error(`Native race clock requires actual incoming ${name}.`);
    incoming[name] = value;
  }
  let context = numericalContext(runtime);
  const put = (p, value) => m.writeUInt32LE(value >>> 0, p);
  const fixed = p => nativeCodeAddress(p, runtime);
  const observe = event => runtime.observeNativeClock?.(Object.freeze(event));
  const call = returnAddress => {
    put(C - 16, nativeCodeAddress(returnAddress, runtime));
    return {...runtime, scratchBase: C - 16, numericalContext: context, entryRegisters: {...incoming},
      nativeRaceClockCall: Object.freeze({clockEntryEsp: C, entryEsp: C - 16, returnAddress})};
  };
  const finish = (count, targetClock, initialized) => {
    observe({stage: 'return', count, targetClock, initialized,
      registers: Object.freeze({eax: count, ebx: m.readUInt32LE(C - 12), ebp: incoming.EBP,
        esi: incoming.ESI, edi: incoming.EDI, esp: C + 4, eip: m.readUInt32LE(C)}),
      numericalState: Object.freeze({x87ControlWord: context.x87.controlWord, mxcsr: context.sse.mxcsr,
        ...(context.x87.statusWord !== undefined ? {x87StatusWord: context.x87.statusWord} : {})})});
    return count;
  };
  //SUB ESP,8 leaves both reserved DWORDs stale; only PUSH EBX owns C-12.
  const delivered = m.readUInt32LE(fixed(0x6e66f8));
  put(C - 12, incoming.EBX);
  if (!delivered) {
    const time = readGameMicroseconds(call(0x441c82));
    put(fixed(0x6e66b0), low(time)); put(fixed(0x6e66b4), high(time));
    put(fixed(0x6e66e4), 0); put(fixed(0x6e66f8), 1);
    return finish(1, null, true);
  }
  const time = readGameMicroseconds(call(0x441cb0));
  const elapsed = u64(time - m.readBigUInt64LE(fixed(0x6e66b0)));
  put(C - 16, nativeCodeAddress(0x441cc3, runtime));
  const converted = convertNativeUnsigned64ToDouble(low(elapsed), high(elapsed), {...runtime,
    scratchBase: C - 16, numericalContext: context});
  context = contextFromState(converted.numericalState);
  observe({stage: 'unsigned64-to-double', elapsed, value: converted.value});
  const scaled = multiplyClockScale(converted.value, runtime, context); context = scaled.context;
  observe({stage: 'scale', value: scaled.value, inexact: scaled.inexact});
  put(C - 16, nativeCodeAddress(0x441cd0, runtime));
  const integer = convertNativeDoubleToSigned64(scaled.value, {...runtime,
    scratchBase: C - 16, numericalContext: context});
  context = contextFromState(integer.numericalState);
  const count = advanceRaceStepCount(integer.low, {memory: m, moduleBaseAddress: runtime.moduleBaseAddress});
  return finish(count, integer.low, false);
}
