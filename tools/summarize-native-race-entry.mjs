import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const [input, output, interaction = 'External launcher/menu actions were not recorded.'] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node tools/summarize-native-race-entry.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY [EXTERNAL_INTERACTION_DESCRIPTION]');
const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
const snapshots = capture.snapshots.map(row => {
  const settings = row.ranges.get('session-settings')?.bytes, config = row.ranges.get('config-selection')?.bytes;
  const body = row.ranges.get('body0')?.bytes, modes = row.ranges.get('participant-modes-and-types')?.bytes, fields = {};
  if (body) {
    for (const [name, offset, reader] of [['flags',0,'readUInt32LE'],['massQ16',0xa8,'readInt32LE'],['inverseMassQ16',0xac,'readInt32LE'],['state708',0x708,'readUInt8'],['input710',0x710,'readUInt32LE'],['executionMode718',0x718,'readUInt8'],['state720',0x720,'readUInt8'],['steering644',0x644,'readInt32LE'],['speed668',0x668,'readInt16LE']]) fields[name] = body[reader](offset);
    for (const [name, offset, count] of [['positionQ16',0x34,3],['momentumQ16',0x40,3],['quaternionQ16',0x58,4],['linearVelocityQ16',0x68,3]]) fields[name] = Array.from({length: count}, (_, index) => body.readInt32LE(offset + index * 4));
  }
  return {stage: row.breakpointId, hit: row.hit, registers: row.registers,
    numericalContext: decodePhysicsNumericalContext({x87ControlWord: Number(row.registers.fpuControlWord), mxcsr: Number(row.registers.mxcsr)}),
    configuration: config ? {mode14: config[4], selector15: config[5], trackArgument16: config[6], demoTrackSelector1f: config[15]} : null,
    session: settings ? {participants54d: settings[0], mode551: settings[4], attract58c: settings[0x3f], phase57c: settings.readUInt32LE(0x2f)} : null,
    participantModes: modes ? [...modes.subarray(0, 6)] : null,
    vehicleTypes: modes ? [...modes.subarray(0x1c, 0x22)] : null,
    trackFilename: row.ranges.get('track-filename')?.bytes.toString('ascii').split('\0')[0] ?? null,
    body0: body ? fields : null, ranges: [...row.ranges.values()].map(({bytes, ...range}) => range)};
});
const entry = snapshots.find(row => row.stage === 'frontend-race-launch');
const report = {schemaVersion: 1, authority: 'original-process-with-declared-instrumentation', targetSha256: REDUX_SHA256,
  method: 'Observed native launcher/session/race entries and first physics call; raw blob hashes verified before extracting declared fields.',
  externalInteraction: interaction,
  observedEntry: entry ? {ecx: entry.registers.ecx, edx: entry.registers.edx} : null,
  snapshots, interventions: capture.interventions, completion: capture.complete,
  limits: ['External UI/input history is not reconstructed from a final state.', 'Six participants alone do not establish six AI drivers or idle-demo entry; retain mode/selector/attract/execution bytes.', 'This is initialization/context evidence, not trajectory equivalence or uninterrupted wall-clock timing.', 'Raw body memory remains in the private local capture; this report retains selected fields and hashes.']};
await mkdir(output);
for (const file of ['trace.jsonl', 'configuration.json']) await copyFile(path.join(input, file), path.join(output, file), constants.COPYFILE_EXCL);
for (const row of capture.snapshots) await copyFile(path.join(input, row.contextFile), path.join(output, row.contextFile), constants.COPYFILE_EXCL);
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({snapshots: snapshots.length, observedEntry: report.observedEntry, physics: snapshots.filter(row => row.body0).map(row => ({stage: row.stage, mode: row.body0.executionMode718, x87Precision: row.numericalContext.x87.precisionBits})), output}));
