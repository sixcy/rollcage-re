import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {decodeX87ControlWord, x87FromInt64, x87FromBinary64, x87Add, x87Multiply, x87Divide, x87SquareRoot, x87StoreBinary32, x87StoreBinary64, x87ToInt32} from '../src/x87-finite.mjs';

export async function checkX87PrecisionFixture(directory) {
  const expected = JSON.parse(await readFile(path.join(directory, 'expected.json'), 'utf8'));
  const configuration = JSON.parse(await readFile(path.join(directory, 'capture-config.json'), 'utf8'));
  const capture = await loadPhysicsCapture(configuration.outputDirectory, {expectedSha256: configuration.expectedSha256});
  assert.equal(capture.snapshots.length, 1); assert.equal(capture.complete.reason, 'snapshot-bound');
  const stage = capture.snapshots[0]; assert.equal(stage.breakpointId, 'x87-precision-results');
  const results = stage.ranges.get('results').bytes, comparisons = [];
  for (const row of expected.expected) {
    const o = row.offset, settings = decodeX87ControlWord(row.controlWord), mode = settings.roundingMode;
    const hardware = {
      exactIntegerLoad: results.readDoubleLE(o), roundedIntegerAdd: results.readDoubleLE(o + 8),
      extendedExponentProduct: results.readDoubleLE(o + 16), midpointDivision: results.readDoubleLE(o + 24),
      squareRoot: results.readDoubleLE(o + 32), storedBinary32: results.readFloatLE(o + 40),
      controlWord: results.readUInt16LE(o + 44), storedInteger32: results.readInt32LE(o + 48)
    };
    const store = value => x87StoreBinary64(value, mode), loaded = x87FromInt64(16777217n);
    const reconstructed = {
      exactIntegerLoad: store(loaded), roundedIntegerAdd: store(x87Add(loaded, x87FromInt64(0n), settings)),
      extendedExponentProduct: store(x87Multiply(x87FromBinary64(2 ** 100), x87FromBinary64(2 ** 100), settings)),
      midpointDivision: store(x87Divide(x87FromInt64((1n << 54n) + (1n << 30n) + 1n), x87FromBinary64(2 ** 54), settings)),
      squareRoot: store(x87SquareRoot(x87FromInt64(2n), settings)), storedBinary32: x87StoreBinary32(loaded, mode),
      controlWord: settings.controlWord, storedInteger32: x87ToInt32(x87FromBinary64(2.5), mode).value
    };
    for (const key of Object.keys(hardware)) {assert.equal(hardware[key], row[key], `PC${row.precisionBits} literal ${key}`); assert.equal(hardware[key], reconstructed[key], `PC${row.precisionBits} helper ${key}`);}
    comparisons.push({precisionBits: row.precisionBits, matched: true, hardware, reconstructed, statusWord: results.readUInt16LE(o + 46)});
  }
  return {matched: true, method: 'Synthetic x87 hardware capture compared exactly against declared values and bounded exact-rational helper.', comparisons,
    limitations: ['No game code was executed by this fixture.', 'Checks these PC24/PC53 cases only; extended subnormal arithmetic, overflow, exceptions and full status flags are outside the helper.', 'This does not prove Redux race-stage numerical context.']};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, reportDirectory] = process.argv.slice(2);
  if (!directory || !reportDirectory) throw Error('Usage: node tools/check-x87-precision-fixture.mjs FIXTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkX87PrecisionFixture(directory);
  await mkdir(reportDirectory);
  await writeFile(path.join(reportDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify(report));
}
