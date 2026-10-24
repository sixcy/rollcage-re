import {nativeCodeAddress} from './native-memory-spans.mjs';
import {getViewportApplication} from './weather-viewport.mjs';
import {setApplicationViewportEnabled} from './application-viewports.mjs';
import {runNativeRaceStepClock} from './native-race-step-clock.mjs';
import {decodePhysicsNumericalContext} from './race-clock.mjs';
import {updateRawAttachmentEffects} from './attachment-effects.mjs';
import {runRaceUpdate} from './race-update.mjs';
import {resumeNativeRaceDispatchReturn} from './native-race-dispatch-return.mjs';
import {runNativeViewportLookup, runNativeViewportEnable} from './native-viewport-dispatch.mjs';
import {runNativeRacePausePolicy} from './native-race-pause-policy.mjs';

const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const word = (v, label) => {
  if (!Number.isInteger(v) || v < -0x80000000 || v > 0xffffffff) throw Error(`Native race dispatcher requires uint32 ${label}.`);
  return v >>> 0;
};
const nonvolatile = ['ebx', 'ebp', 'esi', 'edi'];

//450d60. The viewport arguments survive402d10's plain RET and are consumed
//by406b80 RET8. Clock delivery, background sample advancement and successful
//450e50 ticks are separate producers. Fixed operands use the actual module;
//saved words, pointers and incoming registers remain raw actual values.
//
//Defaults execute the reconstructed children. runtime.calls is an explicit
//composition/test seam, never an authenticated source of native game answers.
//Native proof must additionally close each child's reached ABI/services;
//this parent alone does not establish continuous races or private callee ABI.
export function runNativeRaceDispatch(runtime) {
  const {memory: m, scratchBase: O, moduleBaseAddress: base} = runtime ?? {};
  if (!Buffer.isBuffer(m) || !uint(O) || O < 1024 || O > 0xfffffff8 || (O & 3) || !uint(base) || !base) {
    throw Error('Native race dispatcher requires actual memory, module base and aligned entry ESP.');
  }
  if (runtime.nativeViewportFrames !== undefined && typeof runtime.nativeViewportFrames !== 'boolean') {
    throw Error('Native race dispatcher viewport-frame option must be explicitly boolean.');
  }
  const incoming = {};
  for (const name of ['ECX', 'EBX', 'EBP', 'ESI', 'EDI']) {
    const value = runtime.entryRegisters?.[name];
    if (!uint(value)) throw Error(`Native race dispatcher requires incoming ${name}.`);
    incoming[name] = value;
  }
  const actual = p => nativeCodeAddress(p, runtime), D = O - 20;
  const put = (p, v) => m.writeUInt32LE(v >>> 0, p);
  const readFixed = p => m.readUInt32LE(actual(p));
  const observe = event => runtime.observeNativeDispatch?.(Object.freeze(event));
  const r = {ecx: incoming.ECX, ebx: incoming.EBX, ebp: incoming.EBP, esi: incoming.ESI, edi: incoming.EDI};
  let scheduledCount, iterations = 0, successfulIterations = 0, currentNumericalContext = runtime.numericalContext;

  //Original PUSH ECX,EBX,EBP,ESI; XOR EBX; MOV EBP,ECX; PUSH EDI.
  put(O - 4, incoming.ECX); put(O - 8, incoming.EBX);
  put(O - 12, incoming.EBP); put(O - 16, incoming.ESI);
  r.ebx = 0; r.ebp = incoming.ECX; put(D, incoming.EDI);

  function invoke(target, returnAddress, entryEsp, args, {required = true, published = false} = {}) {
    if (!published) put(entryEsp, actual(returnAddress));
    else if (m.readUInt32LE(entryEsp) !== actual(returnAddress)) throw Error('Race dispatch continuation lost its source-published CALL return.');
    const entryRegisters = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v]));
    const child = {...runtime, numericalContext: currentNumericalContext, scratchBase: entryEsp, entryRegisters};
    const request = Object.freeze({runtime: child, ecx: r.ecx, edx: r.edx, args: Object.freeze([...args]),
      entryRegisters: Object.freeze({...entryRegisters}), returnAddress: actual(returnAddress), targetAddress: actual(target)});
    observe({stage: 'call', targetAddress: request.targetAddress, returnAddress: request.returnAddress,
      entryEsp, args: request.args, entryRegisters: request.entryRegisters});
    const id = `call${target.toString(16)}`, override = runtime.calls?.[id];
    if (override !== undefined && typeof override !== 'function') throw Error(`Race dispatcher ${id} must be a function.`);
    let result;
    if (override) result = override(request);
    else if (target === 0x402d10) result = runtime.nativeViewportFrames ? runNativeViewportLookup(child) : getViewportApplication(child);
    else if (target === 0x406b80) result = runtime.nativeViewportFrames ? runNativeViewportEnable(child)
      : setApplicationViewportEnabled(r.ecx, m.readUInt32LE(entryEsp + 4), m.readUInt32LE(entryEsp + 8), child);
    else if (target === 0x441c70) {
      //Carry the clock's derived numerical state into later real children.
      //Observer return values never provide a clock result or game bytes.
      let clockReturn;
      const count = runNativeRaceStepClock({...child, observeNativeClock: event => {
        runtime.observeNativeClock?.(event);
        if (event.stage === 'return') {
          clockReturn = event;
          const state = event.numericalState;
          child.numericalContext = decodePhysicsNumericalContext(state);
          if (state.x87StatusWord !== undefined) child.numericalContext.x87.statusWord = state.x87StatusWord;
        }
      }});
      result = {eax: count, registers: clockReturn.registers};
      currentNumericalContext = child.numericalContext;
    } else if (target === 0x44f3a0) result = updateRawAttachmentEffects(child);
    else if (target === 0x477730) result = runNativeRacePausePolicy(child);
    else if (target === 0x450e50) result = runRaceUpdate(r.edx, m.readInt32LE(entryEsp + 4), child);
    else throw Error('Unclassified native race dispatcher child.');

    //Only explicit child-produced register metadata refines the volatile set.
    //Ordinary semantic child functions preserve the four nonvolatiles by ABI.
    delete r.eax; delete r.ecx; delete r.edx;
    if (result?.registers) for (const [name, value] of Object.entries(result.registers)) {
      const key = name.toLowerCase();
      if ([...nonvolatile, 'eax', 'ecx', 'edx'].includes(key)) r[key] = word(value, `${id} ${name}`);
    }
    const eax = typeof result === 'number' ? result : result?.eax ?? result?.registers?.eax ?? result?.registers?.EAX;
    if (eax !== undefined) r.eax = word(eax, `${id} EAX`);
    if (required && r.eax === undefined) throw Error(`Native race dispatcher requires genuine EAX from ${id}.`);
    if (m.readUInt32LE(entryEsp) !== actual(returnAddress)) throw Error('Native race dispatcher child changed its live return target.');
    observe({stage: 'child-return', targetAddress: actual(target), returnAddress: actual(returnAddress),
      entryEsp, ...(r.eax !== undefined ? {eax: r.eax} : {})});
    return r.eax;
  }

  const viewport = (name, enabled, appReturn, setReturn) => {
    put(D - 4, enabled); put(D - 8, actual(name));
    invoke(0x402d10, appReturn, D - 12, [actual(name), enabled]);
    r.ecx = r.eax;
    invoke(0x406b80, setReturn, D - 12, [m.readUInt32LE(D - 8), m.readUInt32LE(D - 4)], {required: false});
  };
  const eligibleSession = () => {
    const session = readFixed(0x5ecb1c);
    return m[session + 0x552] < 1 && m.readInt32LE(session + 0x57c) < 7;
  };
  const flags = readFixed(0x91ce90);
  const cinematic = !(flags & 2) && (flags & 4) && eligibleSession() ? (r.ebx + 1) >>> 0 : 0;
  viewport(0x570258, cinematic, 0x450d9f, 0x450da6);
  //The first viewport can change the flags/config/session. These are native
  //live rereads, and the config byte compares against the current BL.
  const rear = !(m[actual(0x91ce90)] & 2)
    && m[readFixed(0x5ecefc) + 0x25] !== (r.ebx & 255) && eligibleSession() ? 1 : 0;
  viewport(0x570244, rear, 0x450de4, 0x450deb);
  scheduledCount = invoke(0x441c70, 0x450df0, D - 4, []);
  r.esi = readFixed(0x6e6b4c); r.edi = r.eax;

  const finish = (registers, route) => {
    const result = Object.freeze({eax: registers.eax, registers: Object.freeze(registers), scheduledCount,
      iterations, successfulIterations, route, numericalContext: currentNumericalContext,
      nativeViewportFrames: runtime.nativeViewportFrames === true});
    observe({stage: 'return', ...result});
    return result;
  };
  const epilogue = (eax, route) => finish({eax: eax >>> 0,
    edi: m.readUInt32LE(D), esi: m.readUInt32LE(D + 4), ebp: m.readUInt32LE(D + 8),
    ebx: m.readUInt32LE(D + 12), ecx: m.readUInt32LE(D + 16),
    esp: O + 4, eip: m.readUInt32LE(O)}, route);
  const skipPhysics = () => {
    if (r.edi) put(actual(0x6e675c), (readFixed(0x6e675c) + r.edi) >>> 0);
    return epilogue(1, 'sample-only');
  };
  if (r.esi || r.ebp === 1) {
    invoke(0x44f3a0, 0x450e06, D - 4, [], {required: false});
    if (!r.esi) return skipPhysics();
    r.ecx = 0;
    if (invoke(0x477730, 0x450e26, D - 4, [])) return skipPhysics();
  }
  r.esi = 0;
  if (!r.edi) return epilogue(r.ebx, 'no-ticks');
  put(D - 4, r.edi); r.edx = r.esi;
  let published = false;
  for (;;) {
    //The actual CALL entry stays fixed for sibling substeps; each iteration
    //publishes its own PUSH/CALL via the retained return bridge below.
    invoke(0x450e50, 0x450e38, D - 8, [m.readUInt32LE(D - 4)], {published});
    iterations++; if (r.eax) successfulIterations++;
    const continuation = resumeNativeRaceDispatchReturn({memory: m, moduleBaseAddress: base, scratchBase: D - 4,
      entryRegisters: Object.fromEntries(Object.entries(r).map(([key, value]) => [key.toUpperCase(), value]))});
    if (continuation.kind === 'returned') return finish(continuation.registers, 'physics');
    for (const key of Object.keys(r)) delete r[key];
    Object.assign(r, continuation.registers); delete r.eip; delete r.esp;
    published = true;
  }
}
