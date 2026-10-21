const signed = (value, label) => {
  if (!Number.isInteger(value) || value < -2147483648 || value > 4294967295) throw Error(`Effect emission requires explicit 32-bit ${label}.`);
  return value | 0;
};

// 484bb0's numeric argument adapter. The fifth stack argument is never read;
// callers may carry its observed leaked register value without assigning it
// meaning. Storage/dispatch40ea40 is a separately explicit native boundary.
export function emitNativeEffect(code, registerEdx, args, {dispatch40ea40} = {}) {
  if (!Array.isArray(args) || args.length !== 7) throw Error('Effect emission requires seven native stack arguments.');
  if (typeof dispatch40ea40 !== 'function') throw Error('Effect emission requires dispatch40ea40.');
  code = signed(code, 'code'); registerEdx = signed(registerEdx, 'registerEdx');
  const first = signed(args[0], 'first stack argument'), sixth = signed(args[5], 'sixth stack argument');
  const second = Math.min(signed(args[1], 'second stack argument'), 0x3fff);
  const third = signed(args[2], 'third stack argument'), fourth = signed(args[3], 'fourth stack argument');
  const parameters = Buffer.alloc(16);
  parameters.writeInt32LE(Math.trunc(Math.imul(third, 0x7fff) / 0x3fff), 0);
  parameters.writeInt32LE(second === -1 ? -1 : Math.trunc(Math.imul(second, 0x2b11) / 1024), 4);
  parameters.writeInt32LE(code >= 0 && (code <= 1 || code === 22) ? 10 : fourth, 8);
  parameters.writeInt32LE(signed(args[6], 'seventh stack argument'), 12);
  const result = signed(dispatch40ea40({code, registerEdx, first, modeIs9: fourth === 9 ? 1 : 0, sixth, parameters}), 'dispatch result');
  return result === -1 ? 127 : result;
}
