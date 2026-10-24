import {nativeCodeAddress} from './native-memory-spans.mjs';

// Exact Redux 1.3.8.0 initialized image: VA5eb5e0/file1ea5e0 = 00000100.
// A captured live value takes precedence after configuration/cheat producers.
export const REDUX_INITIAL_GRAVITY_Q16 = 0x10000;
export const REDUX_LOGICAL_TICKS_PER_SECOND = 30;
export const REDUX_NOMINAL_STEP_SECONDS = 1 / REDUX_LOGICAL_TICKS_PER_SECOND;
// Original binary64 at5dc6e0. Preserve the final-bit difference from3e-5.
export const REDUX_CLOCK_STEPS_PER_MICROSECOND = 0.000029999999999999997;

//4412c0 ordinary-race branch. Its separate special-mode branch does not touch
//gravity; that branch's other startup work belongs to its actual caller.
export function initializeRaceGravity({memory}) {
  if (memory.readInt32LE(0x5eb518) !== 1) {
    const config = memory.readUInt32LE(0x5ecefc);
    const gravity = memory[config + 0x82] ? REDUX_INITIAL_GRAVITY_Q16
      : memory[config + 0x97] === 1 ? 45000 : memory[config + 0x97] === 2 ? 20000 : REDUX_INITIAL_GRAVITY_Q16;
    memory.writeInt32LE(gravity, 0x5eb5e0);
  }
  return memory.readInt32LE(0x5eb5e0);
}

// Integer tail441cd0..441d66. targetClock is the unsigned result of the native
//microsecond-to-double/scaling/conversion chain; platform time is caller-owned.
export function advanceRaceStepCount(targetClock, {memory, moduleBaseAddress}) {
  if (!Number.isInteger(targetClock) || targetClock < 0 || targetClock > 0xffffffff) throw Error('Expected the native unsigned target clock.');
  //These are fixed instruction operands. Native callers can use physical
  //module addresses without putting aliases over actual captured stack bytes.
  const fixed = p => moduleBaseAddress === undefined ? p : nativeCodeAddress(p, {moduleBaseAddress});
  const delivered = fixed(0x6e66f8), streak = fixed(0x6e66e4);
  const flags = memory.readUInt32LE(fixed(0x6eafe0)), current = memory.readUInt32LE(delivered);
  let count = 1;
  if ((flags & 1) && (flags & 0x80) && (flags & 6) && targetClock > current && targetClock - current > 1) {
    const backlog = targetClock - current;
    if (backlog > 3) memory.writeInt32LE(10, streak);
    else memory.writeInt32LE((memory.readInt32LE(streak) + 1) | 0, streak);
    if (memory.readUInt32LE(streak) >= 10) count = Math.min(backlog, 3);
  } else memory.writeInt32LE(0, streak);
  memory.writeUInt32LE((current + count) >>> 0, delivered);
  return count;
}

//443d90/449be0/44a560: the left shift wraps unsigned32 BEFORE division.
//The formatter4459f0 treats each2048 units as one tenth of a second.
export function raceClockToNativeTime(clock) {
  return Math.trunc(((clock << 11) >>> 0) / 3);
}

// Decode captured register values; do not substitute host/default registers.
// x87 and SSE rounding are independent, even if the CRT normally sets both.
export function decodePhysicsNumericalContext({x87ControlWord, mxcsr}) {
  if (!Number.isInteger(x87ControlWord) || x87ControlWord < 0 || x87ControlWord > 0xffff) throw Error('Expected a captured x87 control word.');
  if (!Number.isInteger(mxcsr) || mxcsr < 0 || mxcsr > 0xffff) throw Error('Expected a captured MXCSR value with supported low16 bits.');
  const rounding = ['nearest-even', 'down', 'up', 'toward-zero'];
  return {
    x87: {controlWord: x87ControlWord, roundingMode: rounding[(x87ControlWord >>> 10) & 3],
      precisionBits: [24, null, 53, 64][(x87ControlWord >>> 8) & 3], exceptionMask: x87ControlWord & 63},
    sse: {mxcsr, roundingMode: rounding[(mxcsr >>> 13) & 3],
      exceptionMask: (mxcsr >>> 7) & 63, flushToZero: !!(mxcsr & 0x8000), denormalsAreZero: !!(mxcsr & 0x40)}
  };
}
