import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNativeCaptureFixture} from '../tools/prepare-native-capture-fixture.mjs';

const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url));
const helper = fileURLToPath(new URL('../tools/native-physics-capture.ps1', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('queued breakpoint admission requires exact owned suspension, code state and post-INT3 context', {skip: process.platform !== 'win32'}, () => {
  const script = `Add-Type -Path '${source.replaceAll("'", "''")}'
function Rejected($action) { try { & $action | Out-Null; return $false } catch { return $true } }
$armed=[RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4096,4097,204,144)
$pendingSite=[RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$false,$true,4096,4097,144,144)
$checks=@(
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(7,7,$true,$true,$true,$false,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,0,$true,$true,$true,$false,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(0,7,$true,$true,$true,$false,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$false,$true,$true,$false,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$false,$true,$false,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$false,$false,4096,4097,144,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$true,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4096,4096,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4096,4098,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4294967295,0,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4096,4097,144,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$false,$true,4096,4097,204,144) }),
(Rejected { [RollcageCapture.NativeDebugger]::DeferredBreakpointRewindAddress(8,7,$true,$true,$true,$false,4096,4097,204,204) })
)
@{armed=$armed;pendingSite=$pendingSite;checks=$checks} | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {armed: 4096, pendingSite: 4096, checks: Array(13).fill(true)});
});

//A real owned PE32 child creates a second native thread. Both rendezvous each
//round before TWO adjacent instrumented INC [ESI] instructions, with one
//counter per thread. A peer can finish one pending step and start the next
//before the deferred thread is scheduled, causing a genuine re-deferral.
//Two modes exercise distinct addresses and shared temporarily unarmed sites.
//Scheduling controls whether Windows queues a race on a particular machine;
//the admission checks above are deterministic.
function buildThreadFixture(iterations, sharedSite) {
  const bytes = buildNativeCaptureFixture(); bytes.fill(0, 0x200, 0x400);
  const code = [], labels = new Map(), fixups = [];
  const hex = value => code.push(...Buffer.from(value, 'hex'));
  const u32 = value => {const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); code.push(...b);};
  const label = name => labels.set(name, code.length);
  const absolute = name => {fixups.push({at: code.length, name, width: 4, absolute: true}); u32(0);};
  const branch = (opcode, name, width = 1) => {hex(opcode); fixups.push({at: code.length, name, width}); if (width === 4) u32(0); else code.push(0);};
  const callImport = address => {hex('ff15'); u32(address);};
  hex('6a006a006a0268'); absolute('common'); hex('6a006a00'); callImport(0x4012c4);
  hex('a3'); u32(0x401390); hex('6a01'); branch('e8', 'common', 4);
  hex('6affff35'); u32(0x401390); callImport(0x4012c8);
  hex('ff35'); u32(0x401390); callImport(0x4012cc);
  label('final'); hex('906a00'); callImport(0x4012c0); hex('cc');
  label('common'); hex('5356578b7c24108d34bd'); u32(0x401380); hex('31db');
  label('round'); hex('43f0ff05'); u32(0x40138c); hex('8d041b');
  label('spin'); hex('3905'); u32(0x40138c); branch('72', 'spin');
  if (sharedSite) {label('shared-a'); hex('ff06'); label('shared-b'); hex('ff06');}
  else {
    hex('83ff01'); branch('75', 'worker');
    label('main-a'); hex('ff06'); label('main-b'); hex('ff06'); branch('eb', 'after');
    label('worker'); label('worker-a'); hex('ff06'); label('worker-b'); hex('ff06');
  }
  label('after'); hex('81fb'); u32(iterations); branch('72', 'round'); hex('5f5e5b31c0c20400');
  const assembled = Buffer.from(code);
  for (const item of fixups) {
    const value = item.absolute ? 0x401000 + labels.get(item.name) : labels.get(item.name) - item.at - item.width;
    if (item.width === 1) {assert.ok(value >= -128 && value <= 127); assembled.writeInt8(value, item.at);}
    else assembled.writeUInt32LE(value >>> 0, item.at);
  }
  assert.ok(assembled.length < 0x200); assembled.copy(bytes, 0x200);
  //Move the one KERNEL32 descriptor's ILT/IAT; all names are genuine Win32.
  bytes.writeUInt32LE(0x12a0, 0x400); bytes.writeUInt32LE(0x12c0, 0x410);
  bytes.writeUInt32LE(0x12c0, 0x98 + 192); bytes.writeUInt32LE(20, 0x98 + 196);
  for (const [i, [rva, name]] of [[0x12e0, 'ExitProcess'], [0x12f0, 'CreateThread'], [0x1300, 'WaitForSingleObject'], [0x1320, 'CloseHandle']].entries()) {
    bytes.writeUInt32LE(rva, 0x4a0 + i * 4); bytes.writeUInt32LE(rva, 0x4c0 + i * 4);
    bytes.writeUInt16LE(0, rva - 0xe00); bytes.write(`${name}\0`, rva - 0xe00 + 2, 'ascii');
  }
  return {bytes, sites: (sharedSite ? ['shared-a', 'shared-b'] : ['main-a', 'main-b', 'worker-a', 'worker-b']).map(id => ({id, rva: `0x${(0x1000 + labels.get(id)).toString(16)}`})), final: `0x${(0x1000 + labels.get('final')).toString(16)}`};
}

test('synthetic two-thread fixture retains genuine imports and rendezvous/increment sites', () => {
  for (const shared of [false, true]) {
    const fixture = buildThreadFixture(96, shared);
    for (const site of fixture.sites) assert.equal(fixture.bytes.subarray(Number(site.rva) - 0xe00, Number(site.rva) - 0xe00 + 2).toString('hex'), 'ff06');
    assert.equal(fixture.bytes[Number(fixture.final) - 0xe00], 0x90);
    assert.equal(fixture.bytes.toString('ascii', 0x502, 0x516), 'WaitForSingleObject\0');
    assert.equal(fixture.sites.length, shared ? 2 : 4);
  }
});

test('owned native threads execute each increment once and reobserve any queued breakpoint without duplicate writes', {skip: process.platform !== 'win32'}, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-deferred-'));
  try {
    const iterations = 96;
    for (const sharedSite of [false, true]) {
      const name = sharedSite ? 'shared' : 'distinct', fixture = buildThreadFixture(iterations, sharedSite);
      const executablePath = path.join(directory, `${name}.exe`), filename = path.join(directory, `${name}.json`), outputDirectory = path.join(directory, `${name}-capture`);
      await writeFile(executablePath, fixture.bytes);
      const configuration = {schemaVersion: 1, executablePath, workingDirectory: directory, arguments: [], expectedSha256: digest(fixture.bytes), outputDirectory,
        maxDurationMs: 30000, maxEvents: 10000, maxSnapshots: iterations * 4 + 1, showWindow: false,
        breakpoints: [...fixture.sites, {id: 'final', rva: fixture.final, stopAfterHits: 1}].map(row => ({...row, ranges: [{id: 'thread-counters', rva: '0x1380', length: 48}]})),
        phaseActions: fixture.sites.map((row, i) => ({breakpointId: row.id, hit: 1, writes: [{rva: `0x${(0x1394 + i * 4).toString(16)}`, expectedBytesHex: '00000000', bytesHex: '01000000'}]}))};
      await writeFile(filename, JSON.stringify(configuration));
      const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', filename, '-Quiet'], {windowsHide: true, encoding: 'utf8', timeout: 60000});
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const rows = (await readFile(path.join(outputDirectory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
      const snapshots = rows.filter(row => row.type === 'snapshot'), final = snapshots.at(-1);
      assert.equal(snapshots.length, iterations * 4 + 1); assert.equal(final.breakpointId, 'final');
      assert.equal(rows.find(row => row.type === 'complete').reason, 'snapshot-bound');
      assert.equal(rows.find(row => row.type === 'complete').deferredBreakpointsOutstanding, undefined);
      const counters = await readFile(path.join(outputDirectory, final.ranges[0].file));
      assert.deepEqual([counters.readUInt32LE(4), counters.readUInt32LE(8), counters.readUInt32LE(12)], [iterations * 2, iterations * 2, iterations * 2]);
      assert.equal(rows.filter(row => row.type === 'intervention').length, fixture.sites.length);
      for (let index = 0; index < 4; index++) assert.equal(counters.readUInt32LE(20 + index * 4), index < fixture.sites.length ? 1 : 0);
      for (const counterOffset of [4, 8]) {
        const observed = [];
        for (const snapshot of snapshots.slice(0, -1)) if (Number(snapshot.registers.esi) === 0x401380 + counterOffset) {
          const values = await readFile(path.join(outputDirectory, snapshot.ranges[0].file)); observed.push(values.readUInt32LE(counterOffset));
        }
        assert.deepEqual(observed, Array.from({length: iterations * 2}, (_, i) => i), 'Every original INC is observed exactly once before it executes.');
      }
      const deferred = rows.filter(row => row.type === 'owned-breakpoint-deferred');
      const replayed = rows.filter(row => row.type === 'owned-breakpoint-replayed');
      assert.equal(new Set(replayed.map(row => row.observedDebugEventOrdinal)).size, replayed.length, 'One actual re-trap must emit one closure record, even after several deferrals.');
      for (const replay of replayed) {
        const observations = snapshots.filter(snapshot => snapshot.observedDebugEventOrdinal === replay.observedDebugEventOrdinal);
        assert.equal(observations.length, 1);
        assert.equal(observations[0].tid, replay.tid); assert.equal(observations[0].breakpointId, replay.breakpointId);
        assert.equal(observations[0].hit, replay.captureHitBefore + 1, 'A completed chain advances the observation counter once.');
      }
      for (const item of deferred) {
        assert.notEqual(item.tid, item.pendingThread); assert.ok(item.ownedSuspendIncrementsRetained > 0);
        assert.equal(Number(item.registersBefore.eip), Number(item.address) + 1);
        assert.equal(Number(item.registersAfter.eip), Number(item.address));
        assert.equal(item.originalInstructionExecuted, false); assert.equal(item.counterMutation, false);
        assert.equal(item.pendingSite, !item.breakpointArmed);
        assert.equal(item.actualByteHex, item.breakpointArmed ? 'cc' : item.originalByteHex);
        const closures = replayed.filter(row => row.deferredDebugEventOrdinals.includes(item.observedDebugEventOrdinal));
        assert.equal(closures.length, 1, 'A queued event belongs to exactly one genuine normal breakpoint observation.');
        const replay = closures[0];
        assert.ok(replay, 'Every deferred observation must re-trap normally before both threads join.');
        assert.equal(replay.tid, item.tid); assert.equal(replay.breakpointId, item.breakpointId);
        assert.ok(replay.observedDebugEventOrdinal > item.observedDebugEventOrdinal);
        assert.equal(replay.deferredEventCount, replay.deferredDebugEventOrdinals.length);
        assert.equal(replay.deferredDebugEventOrdinal, replay.deferredDebugEventOrdinals[0]);
        assert.ok(replay.deferredDebugEventOrdinals.includes(item.deferralChainRootDebugEventOrdinal));
        if (item.previousDeferredDebugEventOrdinal !== null) {
          const previous = deferred.find(row => row.observedDebugEventOrdinal === item.previousDeferredDebugEventOrdinal);
          assert.ok(previous); assert.equal(previous.tid, item.tid); assert.equal(previous.breakpointId, item.breakpointId);
          assert.equal(previous.deferralChainRootDebugEventOrdinal, item.deferralChainRootDebugEventOrdinal);
          assert.ok(previous.observedDebugEventOrdinal < item.observedDebugEventOrdinal);
          assert.ok(replay.deferredDebugEventOrdinals.includes(previous.observedDebugEventOrdinal));
        }
      }
      const repeats = deferred.filter(row => row.previousDeferredDebugEventOrdinal !== null);
      assert.ok(replayed.length <= deferred.length);
      if (repeats.length) assert.ok(replayed.length < deferred.length, 'A re-deferral chain must not fabricate multiple normal observations.');
      t.diagnostic(`${name}: ${deferred.length} queued INT3 events, ${repeats.length} re-deferrals, ${replayed.length} actual replay observations; each thread executed ${iterations * 2} increments.`);
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.match(path.basename(resolved), /^rollcage-deferred-/);
    await rm(resolved, {recursive: true, force: true});
  }
});
