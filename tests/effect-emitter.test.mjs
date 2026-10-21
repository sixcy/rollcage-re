import test from 'node:test';
import assert from 'node:assert/strict';
import {emitNativeEffect} from '../src/effect-emitter.mjs';

function dispatch(code, args, result = 9) {
  let request;
  const returned = emitNativeEffect(code, -17, args, {dispatch40ea40(value) {request = value; return result;}});
  return {returned, ...request, values: [0, 4, 8, 12].map(offset => request.parameters.readInt32LE(offset))};
}
test('native emitter scales arguments and leaves its observed fifth stack argument unused', () => {
  const ignored = {doNotDereference: true};
  const result = dispatch(43, [0, -1, 9000, 6, ignored, 0, 0]);
  assert.deepEqual(result.values, [18000, -1, 6, 0]);
  assert.equal(result.code, 43); assert.equal(result.registerEdx, -17);
  assert.equal(result.first, 0); assert.equal(result.sixth, 0); assert.equal(result.modeIs9, 0);
  assert.equal(result.returned, 9);
});
test('special code modes override only the packed mode and preserve the original mode9 flag', () => {
  for (const code of [0, 1, 22]) {
    const result = dispatch(code, [1, 0, 0x3fff, 9, 999, 5, -7]);
    assert.deepEqual(result.values, [0x7fff, 0, 10, -7]); assert.equal(result.modeIs9, 1);
  }
  for (const code of [-1, 2, 21, 23, 43]) assert.equal(dispatch(code, [0, 0, 0, 9, 0, 0, 0]).values[2], 9);
});
test('second argument clamps only above 16383 and preserves wrapped signed products', () => {
  assert.equal(dispatch(3, [0, 100000, 0, 0, 0, 0, 0]).values[1], Math.trunc(Math.imul(0x3fff, 0x2b11) / 1024));
  assert.equal(dispatch(3, [0, -2, 0, 0, 0, 0, 0]).values[1], -21);
  assert.equal(dispatch(3, [0, -2147483648, 0, 0, 0, 0, 0]).values[1], -2097152);
});
test('third argument wraps its product before signed division and failure -1 maps to127', () => {
  const result = dispatch(3, [0, 0, 0x7fffffff, 0, 0, 0, 0], -1);
  assert.equal(result.values[0], Math.trunc(Math.imul(0x7fffffff, 0x7fff) / 0x3fff));
  assert.equal(result.returned, 127);
  assert.equal(dispatch(3, [0, 0, -1, 0, 0, 0, 0], -2).returned, -2);
});
