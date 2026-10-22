import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {drawWeatherRain, drawWeatherSnow} from '../src/weather-draw.mjs';

export function prepareWeatherDrawFixture(memory, fixture = 0, {row = 0x120000, body = 0x130000, primitives = 0x200000, buckets = 0x100000} = {}) {
  const put = (p, v) => memory.writeInt32LE(v | 0, p), sf = (p, v) => memory.writeFloatLE(v, p);
  const index = fixture % 6;
  put(0x80dde0 + index * 4, row); put(row + 16, body); put(0x80dee0, primitives); put(0x80ded8, primitives); put(0x91d590, buckets);
  memory.fill(0x7b, primitives, primitives + 0x3c000); memory.fill(0, buckets, buckets + 0x900);
  for (const [p, v] of [[0x91ce00, 0], [0x91ce04, 640], [0x91ce08, 0], [0x91ce0c, 480], [0x91cdf0, 320], [0x91cdf4, 240], [0x91cda0, 256], [0x91cda4, 16], [0x91d33c, 3.125]]) sf(p, v);
  for (const p of [0x91cdc0, 0x91cdd4, 0x91cde8]) sf(p, 1);
  for (const p of [0x91cdc4, 0x91cdc8, 0x91cdd0, 0x91cdd8, 0x91cde0, 0x91cde4, 0x91cdb0, 0x91cdb4, 0x91cdb8]) sf(p, 0);
  if (fixture % 3 === 1) for (const [p, v] of [[0x91cdc0, 0.875], [0x91cdc4, 0.125], [0x91cdc8, 0.03125], [0x91cdd0, -0.25], [0x91cdd4, 1.125], [0x91cdd8, -0.015625], [0x91cde0, 0.001953125], [0x91cde8, 1.0000001192092896], [0x91cdb8, 0.125]]) sf(p, v);
  put(0x91ce94, fixture % 7 ? 256 : 64); put(0x91d594, 480 << 16 | 640);
  const full = fixture % 17 === 0, count = full ? 2048 : fixture % 19;
  for (let i = 0; i < 2048; i++) {
    const p = row + index * 8 + 20 + i * 8, depth = full ? 256 : [1, 15, 16, 31, 32, 8192, 12288, 16352, 30000, -100][(i + fixture) % 10];
    memory.writeInt16LE(full ? 0 : (i * 137 + fixture * 31) % 2048 - 1024, p);
    memory.writeInt16LE(full ? 0 : (i * 47 + fixture * 19) % 1024 - 512, p + 2);
    memory.writeInt16LE(depth, p + 4); memory.writeInt16LE(i < count ? 1 : 0, p + 6);
  }
  for (let axis = 0; axis < 3; axis++) {memory.writeInt16LE(fixture % 5 ? axis * 7 - 9 : 0, row + 0x4018 + axis * 2); memory.writeInt16LE(0, body + 0x6a + axis * 4);}
  return {index, row, body, primitives, buckets, count};
}

export async function verifyWeatherDraw({fixtures = 120, output = 'analysis/weather-draw-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000;
  let steps = 0, rainPrimitives = 0, snowPrimitives = 0; const reached = new Set();
  machine.onInstruction = address => {reached.add(address); if (address === 0x4972c3) rainPrimitives++; if (address === 0x497586) snowPrimitives++;};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36 + fixture % 17, 0x1000, S + 128);
    const {index} = prepareWeatherDrawFixture(memory, fixture), snow = fixture & 1, mode = ['nearest-even', 'toward-zero', 'down', 'up'][Math.floor(fixture / 2) % 4];
    machine.reset(); machine.fs0 = 0; machine.fpuRounding = mode; memory.copy(machine.bytes);
    const registers = {EBX: 0x300000 + fixture, EBP: 0x173456 + fixture, ESI: 0x310000 + fixture, EDI: 0x320000 + fixture};
    (snow ? drawWeatherSnow : drawWeatherRain)(index, {memory, scratchBase: S, entryRegisters: registers, roundingMode: mode});
    machine.entry = snow ? 0x497350 : 0x497110; machine.r.ESP = S; machine.r.ECX = index; Object.assign(machine.r, registers); machine.bytes.writeInt32LE(-1, S); steps += machine.run(10000000);
    assert.equal(machine.x87.length, 0, `fixture${fixture} balanced x87`);
    const expected = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000);
    if (!expected.equals(actual)) {const offset = expected.findIndex((v, i) => v !== actual[i]), address = offset + 0x10000; assert.fail(`fixture${fixture} ${snow ? 'snow' : 'rain'} diff0x${address.toString(16)} native${expected[offset]} source${actual[offset]} nearby=${machine.bytes.subarray(address - 8, address + 16).toString('hex')}/${memory.subarray(address - 8, address + 16).toString('hex')}`);}
  }
  const report = {fixtures, instructionSteps: steps, reachedInstructions: reached.size, rainPrimitives, snowPrimitives, matched: true, domain: 'Actual497110/497350 and all432320/432470/4323f0 children; all mapped bytes>=10000h, packed clipping/depth lists, four FISTP policies and full2048-particle cases. Synthetic coherent raw particle/projection roots. x87 arithmetic uses bounded binary64 intermediates; native exception/control-word state and arbitrary extended80 precision are not claimed.'};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyWeatherDraw()));
