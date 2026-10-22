// Synthetic hardware probe only: generates bytes and configs, never launches.
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNativeCaptureFixture} from './prepare-native-capture-fixture.mjs';

export function buildX87PrecisionFixture() {
  const bytes = Buffer.alloc(0xa00); buildNativeCaptureFixture().copy(bytes);
  bytes.fill(0, 0x200, 0x400);
  bytes.writeUInt32LE(0x800, 0x98 + 4);
  bytes.writeUInt32LE(0x800, 0x178 + 8); bytes.writeUInt32LE(0x800, 0x178 + 16);
  const code = [], base = 0x400000;
  const emit = (...values) => code.push(...values);
  const memory = (first, second, rva) => {emit(first, second); const address = Buffer.alloc(4); address.writeUInt32LE(base + rva); emit(...address);};
  for (let index = 0; index < 2; index++) {
    const output = 0x1400 + index * 64;
    emit(0xdb, 0xe3); // FNINIT: known empty x87 stack, masked exceptions.
    memory(0xd9, 0x2d, 0x1300 + index * 2); // FLDCW [PC24 or PC53, nearest].
    memory(0xdb, 0x05, 0x1304); memory(0xdd, 0x1d, output); // FILD m32; FSTP m64.
    memory(0xdb, 0x05, 0x1304); memory(0xd8, 0x05, 0x1308); memory(0xdd, 0x1d, output + 8);
    memory(0xdd, 0x05, 0x1310); memory(0xdc, 0x0d, 0x1310); memory(0xdd, 0x1d, output + 16);
    memory(0xdf, 0x2d, 0x1318); memory(0xdc, 0x35, 0x1320); memory(0xdd, 0x1d, output + 24);
    memory(0xdd, 0x05, 0x1328); emit(0xd9, 0xfa); memory(0xdd, 0x1d, output + 32); // FSQRT.
    memory(0xdb, 0x05, 0x1304); memory(0xd9, 0x1d, output + 40); // FSTP m32 ignores PC.
    memory(0xd9, 0x05, 0x1330); memory(0xdb, 0x1d, output + 48); // FLD m32; FISTP m32.
    memory(0xd9, 0x3d, output + 44); memory(0xdd, 0x3d, output + 46); // FNSTCW; FNSTSW.
  }
  const breakpointRva = 0x1000 + code.length;
  emit(0x90, 0x6a, 0x00, 0xff, 0x15, 0x50, 0x12, 0x40, 0x00, 0xcc);
  if (code.length > 0x200) throw Error('Synthetic precision code overlaps import table.');
  Buffer.from(code).copy(bytes, 0x200);
  bytes.writeUInt16LE(0x007f, 0x500); bytes.writeUInt16LE(0x027f, 0x502);
  bytes.writeInt32LE(16777217, 0x504); bytes.writeFloatLE(0, 0x508);
  bytes.writeDoubleLE(2 ** 100, 0x510);
  bytes.writeBigInt64LE((1n << 54n) + (1n << 30n) + 1n, 0x518);
  bytes.writeDoubleLE(2 ** 54, 0x520); bytes.writeDoubleLE(2, 0x528); bytes.writeFloatLE(2.5, 0x530);
  const expected = [24, 53].map((precisionBits, index) => ({
    precisionBits, offset: index * 64, controlWord: index ? 0x027f : 0x007f,
    exactIntegerLoad: 16777217, roundedIntegerAdd: index ? 16777217 : 16777216,
    extendedExponentProduct: 2 ** 200, midpointDivision: index ? 1 + 2 ** -24 : 1 + 2 ** -23,
    squareRoot: index ? Math.sqrt(2) : Math.fround(Math.sqrt(2)), storedBinary32: 16777216, storedInteger32: 2
  }));
  return {bytes, breakpointRva, expected};
}

export async function prepareX87PrecisionFixture(outputDirectory) {
  const directory = path.resolve(outputDirectory), {bytes, breakpointRva, expected} = buildX87PrecisionFixture();
  await mkdir(directory);
  const executablePath = path.join(directory, 'synthetic-x87-precision.exe');
  const configuration = {
    schemaVersion: 1, executablePath, workingDirectory: directory, arguments: [],
    expectedSha256: createHash('sha256').update(bytes).digest('hex'), outputDirectory: path.join(directory, 'capture'),
    maxDurationMs: 10000, maxEvents: 1000, maxSnapshots: 1, showWindow: false,
    breakpoints: [{id: 'x87-precision-results', rva: `0x${breakpointRva.toString(16)}`, stopAfterHits: 1,
      ranges: [{id: 'results', rva: '0x1400', length: 128}, {id: 'constants', rva: '0x1300', length: 64}]}]
  };
  await writeFile(executablePath, bytes, {flag: 'wx'});
  await writeFile(path.join(directory, 'capture-config.json'), `${JSON.stringify(configuration, null, 2)}\n`, {flag: 'wx'});
  await writeFile(path.join(directory, 'expected.json'), `${JSON.stringify({
    method: 'Synthetic x86 x87 opcode probe; no game code. Generated without execution. Only ExitProcess imported.',
    scope: 'Compares PC24/PC53 exact loads, arithmetic precision, extended exponent range, double-rounding boundary, FSQRT, binary32 stores and nearest-even FISTP. Does not establish Redux control-word transitions or exception equivalence.',
    breakpointRva, expected
  }, null, 2)}\n`, {flag: 'wx'});
  return {directory, configuration: path.join(directory, 'capture-config.json'), expected};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node tools/prepare-x87-precision-fixture.mjs NEW_DIRECTORY');
  console.log(JSON.stringify(await prepareX87PrecisionFixture(process.argv[2])));
}
