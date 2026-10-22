import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyGameAudioSampleFactory} from './verify-game-audio-sample-factory-instructions.mjs';

const fixtures = Number(process.argv[2] ?? 240);
const owner = await verifyGameAudioSampleFactory({fixtures, withOwner: true, withOuter: true, loadedWave: true, output: null});
const race = await verifyGameAudioSampleFactory({fixtures, withSampleLoader: true, withRaceAudio: true, withOuter: true, loadedWave: true, output: null});
assert.equal(owner.actualGameCalls['40d7d0'], fixtures);
assert.equal(race.actualGameCalls['40dcd0'], fixtures);
assert.equal(race.actualGameCalls['485250'], Math.floor(fixtures / 2));
assert.equal(race.actualGameCalls['4a7710'], fixtures);
const sources = [];
for (const path of ['src/game-sound-owner.mjs', 'src/game-audio-samples.mjs', 'src/game-audio-strings.mjs', 'src/game-audio-sample-factory.mjs']) sources.push({path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')});
const report = {
  matched: true,
  targetSha256: 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5',
  method: 'Two connected retained-instruction comparisons: actual40d7d0 owner to known virtual4a7710, and alternating40dcd0/485250 sample/race-audio initialization through actual listeners, strings, retained-path FIFO, descriptor, owner, full WAV/AIFF factory cache-miss, parser/PCM/cache/channel and decoder retirement. No substituted game callee. Synthetic caller-owned manager/session/mixers and genuine CRT/libm/Win32/XAudio2 results define the fixture domain; initialized debugger/category, valid allocations, all mapped10MiB and complete24KiB private stack, native return/TLS and ordered services compare. No original-process playback, async4a6600 thread execution, real file/device I/O, complete OGG/MP3 or whole-race claim.',
  sources, owner, race
};
const output = process.argv[3] ?? 'analysis/race-audio-default-connected-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
