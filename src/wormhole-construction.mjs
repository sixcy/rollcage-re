import {multiplyQ16} from './fixed-integer.mjs';
import {initializeRawBody, registerRawBodySpatial, registerRawBodyShapes} from './raw-body-construction.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {updateRawLinearVelocity} from './raw-linear-velocity.mjs';
import {appendVehicleAnimationLight} from './vehicle-animation-lights.mjs';
import {initializeWormholeEffectPool, activateWormholeEffects, orientWormholeBody} from './wormhole-visuals.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {printGameDiagnostic, initializeGameDiagnosticTables} from './game-diagnostics.mjs';
import {sendWormholeLaunchPacket, initializeGameNetworkProtocolTables} from './game-network-protocol.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);

//Original 5ec408 configuration and 5ed2d0 shape bytes, retained3162/3154.
//This initializer does not initialize caller-owned pools or arena cursors.
export function initializeWormholeConstructionTables(memory) {
  Buffer.from('00000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005d260000e61e000078740000002000000000080000200000', 'hex').copy(memory, 0x5ec408);
  Buffer.from('0000000000000000000000000004000001000000', 'hex').copy(memory, 0x5ed2d0);
  initializeGameDiagnosticTables(memory);
  initializeGameNetworkProtocolTables(memory);
  return memory;
}

//49a6f0. One 2a80-byte object followed by its actual47 render particles.
//Only the first384 bytes receive the native FF fill. The returned pointer is
//a JavaScript convenience; the original entry is void and publishes80b5e0.
export function createWormholeBody(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 12, old = ptr(m, 0x70dcf4), body = (ptr(m, 0x902eec) + (old & 0xfffffffc)) >>> 0;
  put(m, 0x70dcf4, old + 0x2a80); m.fill(255, body, body + 384);
  put(m, body, 0x816); put(m, body + 4, 0); word(m, body + 8, 0); put(m, body + 12, 0);
  for (const offset of [0x118, 0x110, 0x148]) put(m, body + offset, 0);
  put(m, body + 0x11c, -1); m[body + 0x12f] = 255; m.fill(0, body + 0x16a, body + 0x172); word(m, body + 0x172, 0);
  const index = get(m, 0x6e6b44);
  if (index < 512) {put(m, 0x70e200 + index * 4, body); word(m, body + 0x10e, index); put(m, 0x6e6b44, index + 1);}
  put(m, body + 0x184, 7); put(m, body + 0x148, 0x49ab40);
  initializeRawBody(body, 0x5ec408, {...runtime, scratchBase: frame - 4}); removeBodySpatial(body, runtime);
  put(m, body + 0x108, get(m, body + 0x108) | 1);
  for (const offset of [0x198, 0x19c, 0x1a0, 0x1a4, 0x180, 0x188, 0x190]) put(m, body + offset, 0);
  m[body + 0x2a3c] = 0; put(m, 0x80b5e0, body);
  initializeWormholeEffectPool(body, {...runtime, scratchBase: frame - 4}); put(m, body + 0x2a38, 255);
  return body;
}

//49a820. ECX participant record; EDX local/network mode. Native stack arg0
//is unread, arg1 is a received96-byte packet, arg2 is forwarded to4710f0.
//Both the packet producer and diagnostics execute their actual game adapters.
//The network module documents its remaining generic receiver/session gaps.
export function activateWormhole(record, localMode, unused, receivedPacket, transportContext, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 152, owner = ptr(m, record), packet = localMode ? frame + 0x30 : receivedPacket;
  //49a843 PUSH EDI preserves the caller's selected slot when47be20 supplies
  //its real entry registers. A later coordinator light payload reuses it.
  if (Number.isInteger(runtime.entryRegisters?.EDI)) put(m, frame, runtime.entryRegisters.EDI);
  if (localMode) m[packet + 0x57] = 7;
  if (!packet || m[packet + 0x57] !== 7) {put(m, frame - 4, 0x5d36d4); printGameDiagnostic(0x5d36d4, [], {...runtime, scratchBase: frame - 8, entryRegisters: {...runtime.entryRegisters, EBP: owner}}); return 0;}
  const body = ptr(m, 0x80b5e0); if (get(m, body + 0x188)) return 0;
  put(m, body + 0x194, owner); put(m, body + 0x188, 1); put(m, body + 0x180, 0); put(m, body + 0x18c, 0x200000);
  emitNativeEffect(31, owner + 0x34, [0, 0x400, 16000, 6, 0, 0, m[owner + 0x6b4] === 1 ? 1 : 0], {dispatch40ea40: request => dispatchNativeSound(request, runtime.soundRuntime ?? runtime)});
  if (localMode) {
    //MOVQ/MOVDQU snapshot each individual source before that store.
    Buffer.from(m.subarray(owner + 0x34, owner + 0x3c)).copy(m, packet); put(m, packet + 8, get(m, owner + 0x3c));
    Buffer.from(m.subarray(owner + 0xc4, owner + 0xd4)).copy(m, packet + 0xc); Buffer.from(m.subarray(owner + 0xd4, owner + 0xe4)).copy(m, packet + 0x1c);
    put(m, packet + 0x2c, get(m, owner + 0xac)); Buffer.from(m.subarray(owner + 0x40, owner + 0x48)).copy(m, packet + 0x30); put(m, packet + 0x38, get(m, owner + 0x48)); m[packet + 0x44] = m[owner + 0x64f];
  }
  for (const offset of [0, 4, 8]) put(m, body + 0x34 + offset, get(m, packet + offset));
  const multiplier = multiplyQ16(get(m, body + 0xa8), get(m, packet + 0x2c));
  for (const offset of [0, 4, 8]) put(m, body + 0x40 + offset, multiplyQ16(get(m, packet + 0x30 + offset), multiplier));
  for (let lane = 0; lane < 3; lane++) put(m, body + 0x1ac + lane * 4, m.readInt16LE(packet + 0x10 + lane * 6) << 4);
  orientWormholeBody(body + 0x1ac, body + 0xc4, {...runtime, scratchBase: frame - 4}); updateRawLinearVelocity(body, {...runtime, scratchBase: frame - 4}); registerRawBodySpatial(body, runtime);
  //474600 restores ECX from its outside-output slot, then49aa01 PUSH ECX
  //and49aa02 PUSH5ed2d0 preserve the real shape-registration caller words.
  put(m, frame - 4, get(m, body + 12) & 1); put(m, frame - 8, 0x5ed2d0);
  registerRawBodyShapes(body, 1, 0x5ed2d0, runtime); activateWormholeEffects(body, {...runtime, scratchBase: frame - 12});
  put(m, frame + 0x24, body);
  //49aa22/23 PUSH payload,lifetime while the shape arguments remain live;
  //49aa34/36 PUSH kind,mode follow the intervening color store.
  put(m, frame - 12, frame + 0x24); put(m, frame - 16, 1);
  put(m, body + 0x2a3d, 0x7f3f3f); put(m, frame - 20, 7); put(m, frame - 24, 8);
  appendVehicleAnimationLight(body + 0x34, body + 0x2a3d, 8, 7, 1, frame + 0x24, runtime); m[0x903503]++;
  if (localMode) {
    //49aa58/49aa5a/49aa5d PUSH length,packet,tag. The real caller frame
    //remains a producer for subsequent coordinator light payload padding.
    put(m, frame - 4, 96); put(m, frame - 8, packet); put(m, frame - 12, 7);
    sendWormholeLaunchPacket(m.readUInt16LE(ptr(m, record) + 0x65e), transportContext, 7, packet, 96, {...runtime, scratchBase: frame - 16, entryRegisters: {...runtime.entryRegisters, EBP: owner}});
  }
  return 1;
}
