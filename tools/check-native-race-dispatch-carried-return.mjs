import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkNativeParentTail} from './check-native-parent-tail.mjs';
import {resumeNativeRaceDispatchReturn} from '../src/native-race-dispatch-return.mjs';

//Retain the real completed source object only after the original parent has
//matched. The suffix receives that same live memory, never native-after bytes.
export async function checkNativeRaceDispatchCarriedReturn(input, output) {
  await mkdir(output);
  const parentOutput = path.join(output, 'parent-replay');
  const {report: parent, completedSources} = await checkNativeParentTail(input, parentOutput, {retainCompletedSources: true});
  assert.equal(parent.completeParentTickMatched, true); assert.equal(parent.sourceComplete, true);
  assert.equal(completedSources.length, 1, 'One verified completed source parent');
  const source = completedSources[0], registers = source.report.parentReturn.registers, P = registers.esp;
  const incoming = Object.fromEntries(Object.entries(registers).map(([name, value]) => [name.toUpperCase(), value]));
  const original = Buffer.from(source.span(P - 4, 32));
  const expectedPops = [4, 8, 12, 16, 20, 24].map(offset => source.memory.readUInt32LE(P + offset));
  const result = resumeNativeRaceDispatchReturn({memory: source.memory, moduleBaseAddress: source.manifest.moduleBaseAddress,
    scratchBase: P, entryRegisters: incoming});
  assert.equal(result.kind, 'returned'); assert.equal(result.childResult, 1); assert.equal(result.iteration, 0); assert.equal(result.totalIterations, 1);
  assert.deepEqual([result.registers.edi, result.registers.esi, result.registers.ebp, result.registers.ebx, result.registers.ecx, result.registers.eip], expectedPops);
  assert.equal(result.registers.esp, P + 28); assert.equal(result.registers.eip, source.manifest.moduleBaseAddress + 0x40cd5);
  assert.deepEqual(source.span(P - 4, 32), original, 'Observed total1 suffix reads but never refreshes/writes source stack.');
  const parentReportBytes = await readFile(path.join(parentOutput, 'report.json'));
  const files = ['src/native-race-dispatch-return.mjs', 'tools/check-native-parent-tail.mjs', 'tools/check-native-race-dispatch-carried-return.mjs'];
  const report = {schemaVersion: 1, matched: true, method: 'verified-source-carried-parent-output-through450d60-return',
    targetSha256: parent.targetSha256, parentReport: {path: path.resolve(parentOutput, 'report.json'), sha256: createHash('sha256').update(parentReportBytes).digest('hex'),
      completeParentTickMatched: true, uniqueBytesCompared: parent.frames[0].stages.at(-1).comparison.uniqueBytesCompared},
    moduleBaseAddress: source.manifest.moduleBaseAddress, parentReturnRegisters: registers, bridge: result,
    sourceStackBeforeAndAfterHex: original.toString('hex'), newNativeAfterInputBytes: 0, nativeOuterEndpointCaptured: false,
    authority: 'source continuation from an original-process-verified parent; suffix algorithm separately checked against retained instructions',
    filePins: await Promise.all(files.map(async file => ({path: file, sha256: createHash('sha256').update(await readFile(file)).digest('hex')}))),
    limits: ['The original capture stops at450e38. The predicted440cd5 outer return has no new original-process endpoint comparison.',
      'No sibling450e50 is executed for this observed total1. The next outer tick/input/render/timing interval remains open.',
      'The completed source object is opt-in process-local state and is never serialized into the parent report.']};
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  return {report, output: path.resolve(output)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, ...extra] = process.argv.slice(2); if (!input || !output || extra.length) throw Error('Usage: node tools/check-native-race-dispatch-carried-return.mjs CAPTURE NEW_REPORT_DIRECTORY');
  const {report} = await checkNativeRaceDispatchCarriedReturn(input, output);
  console.log(JSON.stringify({matched: report.matched, parentUniqueBytes: report.parentReport.uniqueBytesCompared,
    bridge: report.bridge, nativeOuterEndpointCaptured: false}));
}
