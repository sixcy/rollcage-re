import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, access, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNativeCaptureFixture, buildPendingFrameFixture, buildPendingFilteredFixture, buildThreadEnvironmentFixture, buildPendingThreadEnvironmentFixture, prepareNativeCaptureFixture} from '../tools/prepare-native-capture-fixture.mjs';

const helper = fileURLToPath(new URL('../tools/native-physics-capture.ps1', import.meta.url));

test('synthetic native debugger fixture contains the declared x86 counter loop and sole ExitProcess import', () => {
  const bytes = buildNativeCaptureFixture();
  assert.equal(bytes.readUInt32LE(0x80), 0x4550);
  assert.equal(bytes.readUInt16LE(0x84), 0x14c);
  assert.equal(bytes.readUInt16LE(0x98), 0x10b);
  assert.equal(bytes.readUInt32LE(0x98 + 16), 0x1000);
  assert.equal(bytes[0x215], 0x90);
  assert.equal(bytes[0x216], 0xe2);
  assert.equal(0x218 + bytes.readInt8(0x217), 0x20f);
  assert.equal(bytes.subarray(0x482, 0x48e).toString(), 'ExitProcess\0');
  assert.equal(bytes.readUInt32LE(0x454), 0);
  assert.deepEqual(bytes, buildNativeCaptureFixture());
});

test('pending-frame fixture calls a real event only in its second balanced frame', () => {
  const bytes = buildPendingFrameFixture();
  for (const at of [0x21e, 0x223]) assert.equal(0x400000 + 0x1000 + at - 0x200 + 5 + bytes.readInt32LE(at + 1), 0x401040);
  assert.equal(bytes[0x24d], 0x75); assert.equal(0x24f + bytes.readInt8(0x24e), 0x264);
  assert.equal(bytes.subarray(0x24f, 0x252).toString('hex'), '83ec18');
  assert.equal(0x40105c + 5 + bytes.readInt32LE(0x25d), 0x401080);
  assert.equal(bytes.subarray(0x261, 0x266).toString('hex'), '83c41890c3');
  assert.equal(bytes.readUInt32LE(0x98 + 104), 0x1200);
  assert.deepEqual(bytes.subarray(0x400), buildNativeCaptureFixture().subarray(0x400));
});

test('thread environment fixtures read real FS:[0] and selector before their observation boundaries', () => {
  const direct = buildThreadEnvironmentFixture();
  assert.equal(direct.subarray(0x200, 0x215).toString('hex'), '64a100000000a30011400031c0668ce0a304114000');
  assert.equal(direct[0x215], 0x90);
  const buffered = buildPendingThreadEnvironmentFixture();
  assert.equal(buffered.subarray(0x200, 0x20b).toString('hex'), '64a100000000a310114000');
  assert.deepEqual(buffered.subarray(0x240), buildPendingFrameFixture().subarray(0x240));
  for (const at of [0x21f, 0x224]) assert.equal(0x400000 + 0x1000 + at - 0x200 + 5 + buffered.readInt32LE(at + 1), 0x401040);
});

test('pending-filtered fixture changes only the branch to dispatch both frames and gates the actual second event', async () => {
  const original = buildPendingFrameFixture(), filtered = buildPendingFilteredFixture();
  assert.equal(original.subarray(0x24d, 0x24f).toString('hex'), '7515');
  assert.equal(filtered.subarray(0x24d, 0x24f).toString('hex'), '9090');
  assert.deepEqual(filtered.subarray(0, 0x24d), original.subarray(0, 0x24d));
  assert.deepEqual(filtered.subarray(0x24f), original.subarray(0x24f));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-pending-filtered-'));
  try {
    const fixture = await prepareNativeCaptureFixture(path.join(temporary, 'fixture'));
    const config = JSON.parse(await readFile(path.join(fixture.directory, 'pending-filtered-config.json'), 'utf8'));
    const base = JSON.parse(await readFile(path.join(fixture.directory, 'pending-frame-config.json'), 'utf8'));
    assert.deepEqual(await readFile(config.executablePath), filtered);
    assert.notEqual(config.executablePath, base.executablePath); assert.notEqual(config.expectedSha256, base.expectedSha256);
    assert.deepEqual(config.pendingFrameObserver, base.pendingFrameObserver);
    assert.deepEqual(config.breakpoints[2].captureWhen, {range: {id: 'event-counter-gate', rva: '0x1100', length: 4}, equalsBytesHex: '02000000'});
    const expected = JSON.parse(await readFile(path.join(fixture.directory, 'expected.json'), 'utf8'));
    assert.deepEqual(expected.pendingFiltered.snapshotRawHits, [2, 2, 2]);
    assert.deepEqual(expected.pendingFiltered.snapshotMatchingHits, [2, 1, 2]);
    assert.deepEqual(expected.pendingFiltered.discardedObservedEvents, [1]);
    await assert.rejects(access(config.outputDirectory));
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('pending-frame configuration rejects unsafe bounds/ABI/actions without launching', {skip: process.platform !== 'win32'}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-pending-validation-'));
  try {
    const fixture = await prepareNativeCaptureFixture(path.join(temporary, 'fixture'));
    const filename = path.join(fixture.directory, 'pending-frame-config.json'), config = JSON.parse(await readFile(filename, 'utf8'));
    const validate = file => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', file, '-ValidateOnly', '-Quiet'], {windowsHide: true, encoding: 'utf8'});
    const good = validate(filename); assert.equal(good.status, 0, good.stdout + good.stderr);
    const filtered = validate(path.join(fixture.directory, 'pending-filtered-config.json'));
    assert.equal(filtered.status, 0, filtered.stdout + filtered.stderr);
    for (const name of ['thread-environment-config.json', 'pending-thread-environment-config.json']) {
      const checked = validate(path.join(fixture.directory, name)); assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    }
    const cases = [
      ['unknown', value => {value.pendingFrameObserver.extra = true;}, /Unknown PendingFrameObserver field/],
      ['ids', value => {value.pendingFrameObserver.eventBreakpointId = 'frame-before';}, /three distinct declared/],
      ['bytes', value => {value.pendingFrameObserver.maxPendingBytes = 128 * 1024 * 1024 + 1;}, /byte\/candidate\/event\/snapshot bounds/],
      ['candidates', value => {value.pendingFrameObserver.maxCandidateFrames = 0;}, /byte\/candidate\/event\/snapshot bounds/],
      ['events', value => {value.pendingFrameObserver.maxEventSnapshots = 65;}, /byte\/candidate\/event\/snapshot bounds/],
      ['offset', value => {value.pendingFrameObserver.eventStackOffset = 1;}, /event ABI requires/],
      ['return', value => {delete value.pendingFrameObserver.eventReturnRva;}, /event ABI requires/],
      ['register', value => {value.pendingFrameObserver.eventPointerRegister = 'guess';}, /eventPointerRegister is unknown/],
      ['pool-mode', value => {value.pendingFrameObserver.eventPoolRoot.readableRegion = true;}, /fixed four-byte ranges/],
      ['pool-root', value => {value.pendingFrameObserver.eventPoolRoot.address = '0x401108';}, /Range requires exactly one/],
      ['stops', value => {value.breakpoints[2].stopAfterHits = 1;}, /cannot stop independently/],
      ['skip', value => {value.breakpoints[0].skipMatchingHits = 1;}, /skip windows must agree/],
      ['action', value => {value.phaseActions = [{breakpointId: 'dispatch', writes: []}];}, /phaseActions cannot reference a pending-frame/],
    ];
    for (const [name, edit, expected] of cases) {
      const invalid = structuredClone(config); edit(invalid);
      const file = path.join(temporary, `${name}.json`); await writeFile(file, JSON.stringify(invalid));
      const result = validate(file); assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, expected, name);
    }
    await assert.rejects(access(config.outputDirectory));
  } finally {await rm(temporary, {recursive: true, force: true});}
});

test('pending-frame state enforces native thread/stack/pool identity and host bounds', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'
$policy = New-Object RollcageCapture.PendingFrameObserver
$policy.maxPendingBytes=4096; $policy.maxCandidateFrames=2; $policy.maxEventSnapshots=1; $policy.eventStackOffset=-28; $policy.eventRecordBytes=104
function Fresh { $p=New-Object RollcageCapture.PendingFrameProgress; $p.Begin($policy,7,4096,4660,12); return $p }
function Rejected($action) { try { & $action; return $false } catch { return $true } }
$state=Fresh; $state.Reserve($policy,1024); $slot=$state.ObserveEvent($policy,7,4068,8192,8192,12392,12288,2,$true); $state.ValidateAfter(7,4096,4660,12,$true)
$checks=@(
(Rejected { (Fresh).Begin($policy,7,4096,4660,12) }),
(Rejected { (Fresh).Reserve($policy,4097) }),
(Rejected { (Fresh).ObserveEvent($policy,8,4068,8192,8192,12288,12288,1,$true) }),
(Rejected { (Fresh).ObserveEvent($policy,7,4064,8192,8192,12288,12288,1,$true) }),
(Rejected { (Fresh).ObserveEvent($policy,7,4068,8196,8192,12288,12288,1,$true) }),
(Rejected { (Fresh).ObserveEvent($policy,7,4068,8192,8192,12289,12288,1,$true) }),
(Rejected { (Fresh).ObserveEvent($policy,7,4068,8192,8192,12392,12288,1,$true) }),
(Rejected { (Fresh).ObserveEvent($policy,7,4068,8192,8192,[uint32]::MaxValue,4294967280,1,$true) }),
(Rejected { (Fresh).ValidateAfter(7,4096,4660,13,$true) }),
(Rejected { (Fresh).ValidateAfter(7,4096,4660,12,$false) }),
(Rejected { $state.ObserveEvent($policy,7,4068,8192,8192,12288,12288,1,$true) })
)
$progress=Fresh; $progress.active=$false; $progress.Begin($policy,7,4096,4660,13); $progress.active=$false
$checks+=Rejected { $progress.Begin($policy,7,4096,4660,14) }
@{slot=$slot;bytes=$state.bufferedBytes;candidate=$state.candidateIndex;qualifying=$state.qualifyingEventSnapshots;checks=$checks} | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {slot: 1, bytes: 1024, candidate: 1, qualifying: 1, checks: Array(12).fill(true)});
});

test('Windows capture validates configuration without launching the fixture or creating capture output', {skip: process.platform !== 'win32'}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-capture-validation-'));
  try {
    const fixture = await prepareNativeCaptureFixture(path.join(temporary, 'fixture'));
    const config = JSON.parse(await readFile(fixture.configuration, 'utf8'));
    function validate(configFile) {
      return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', configFile, '-ValidateOnly', '-Quiet'], {windowsHide: true, encoding: 'utf8'});
    }
    let result = validate(fixture.configuration);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no process launched or output created/);
    await assert.rejects(access(config.outputDirectory));
    const filteredFilename = path.join(fixture.directory, 'filtered-config.json');
    result = validate(filteredFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const filtered = JSON.parse(await readFile(filteredFilename, 'utf8'));
    assert.equal(filtered.breakpoints[0].stopAfterHits, 1);
    assert.equal(filtered.breakpoints[0].captureWhen.equalsBytesHex, '02000000');
    await assert.rejects(access(filtered.outputDirectory));
    const matchingFilename = path.join(fixture.directory, 'matching-window-config.json');
    result = validate(matchingFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const matching = JSON.parse(await readFile(matchingFilename, 'utf8'));
    assert.equal(matching.breakpoints[0].skipMatchingHits, 2);
    await assert.rejects(access(matching.outputDirectory));
    const rvaConfig = structuredClone(config);
    rvaConfig.breakpoints[0].ranges = [{id: 'counter', rva: '0x1100', length: 4}];
    rvaConfig.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{rva: '0x1100', bytesHex: '01000000', expectedBytesHex: '00000000'}]}];
    const rvaFilename = path.join(temporary, 'rva.json'); await writeFile(rvaFilename, JSON.stringify(rvaConfig));
    result = validate(rvaFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await assert.rejects(access(config.outputDirectory));
    const anyConfig = structuredClone(rvaConfig);
    delete anyConfig.phaseActions[0].writes[0].expectedBytesHex;
    anyConfig.phaseActions[0].writes[0].expectedAnyBytesHex = ['00000000', '01000000'];
    const anyFilename = path.join(temporary, 'expected-any.json'); await writeFile(anyFilename, JSON.stringify(anyConfig));
    result = validate(anyFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await assert.rejects(access(config.outputDirectory));
    const diagnosticConfig = structuredClone(config);
    diagnosticConfig.captureThreadsOnStop = true; diagnosticConfig.stopThreadStackBytes = 0;
    const diagnosticFilename = path.join(temporary, 'diagnostic.json'); await writeFile(diagnosticFilename, JSON.stringify(diagnosticConfig));
    result = validate(diagnosticFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await assert.rejects(access(config.outputDirectory));
    const regionConfig = structuredClone(config);
    regionConfig.breakpoints[0].ranges = [{id: 'explicit-fixture-region', rva: '0x1100', readableRegion: true, maxRegionBytes: 0x10000}];
    const regionFilename = path.join(temporary, 'region.json'); await writeFile(regionFilename, JSON.stringify(regionConfig));
    result = validate(regionFilename);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    await assert.rejects(access(config.outputDirectory));
    for (const [name, edit, message] of [
      ['unknown', value => {value.breakpointz = [];}, /Unknown Options field/],
      ['bound', value => {value.maxSnapshots = 0;}, /capture bounds must be positive/],
      ['hash', value => {value.expectedSha256 = '0'.repeat(64);}, /SHA-256 differs/],
      ['write', value => {value.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{address: '0x401100', bytesHex: '01'}]}];}, /Write requires exactly one expectedBytesHex/],
      ['folder', value => {value.redirectedDocumentsPath = temporary;}, /Required SHGetFolderPathA import/],
      ['legacy-folder', value => {value.redirectedShellFolderPath = temporary;}, /Required SHGetPathFromIDListA import/],
      ['audio', value => {value.denyPlayerMailslot = true;}, /No CreateFileA\/W imports/],
      ['temp', value => {value.temporaryDirectory = path.join(temporary, 'missing');}, /temporaryDirectory must be an existing/],
      ['range-roots', value => {value.breakpoints[0].ranges[0].rva = '0x1100';}, /Range requires exactly one address, rva or baseRegister/],
      ['write-roots', value => {value.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{address: '0x401100', rva: '0x1100', bytesHex: '00', expectedBytesHex: '00'}]}];}, /Write requires exactly one address, rva or baseRegister/],
      ['write-policies', value => {value.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{rva: '0x1100', bytesHex: '00', expectedBytesHex: '00', expectedAnyBytesHex: ['01']}]}];}, /Write requires exactly one expectedBytesHex/],
      ['write-empty-policy', value => {value.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{rva: '0x1100', bytesHex: '00', expectedAnyBytesHex: []}]}];}, /Write requires exactly one expectedBytesHex/],
      ['write-policy-size', value => {value.phaseActions = [{breakpointId: 'counter-after-increment', writes: [{rva: '0x1100', bytesHex: '00', expectedAnyBytesHex: ['0000']}]}];}, /equally sized expected original bytes/],
      ['window-policy', value => {value.hideOwnedWindows = true;}, /No supported window imports/],
      ['foreground-size', value => {value.foregroundWindowSource = {id: 'application-hwnd', rva: '0x1100', length: 8};}, /foregroundWindowSource length must be exactly four bytes/],
      ['foreground-roots', value => {value.foregroundWindowSource = {id: 'application-hwnd', rva: '0x1100', address: '0x401100', length: 4};}, /Range requires exactly one address, rva or baseRegister/],
      ['foreground-import', value => {value.foregroundWindowSource = {id: 'application-hwnd', rva: '0x1100', length: 4};}, /Required GetForegroundWindow import was not found/],
      ['diagnostic-negative', value => {value.stopThreadStackBytes = -1;}, /stopThreadStackBytes must be between zero and 512/],
      ['diagnostic-large', value => {value.stopThreadStackBytes = 513;}, /stopThreadStackBytes must be between zero and 512/],
      ['fixed-region-bound', value => {value.breakpoints[0].ranges[0].maxRegionBytes = 4096;}, /Fixed-length range requires bounded positive length and no region bound/],
      ['region-fixed-length', value => {value.breakpoints[0].ranges[0].readableRegion = true; value.breakpoints[0].ranges[0].maxRegionBytes = 4096;}, /Readable-region mode requires omitted\/zero length/],
      ['region-missing-bound', value => {value.breakpoints[0].ranges = [{id: 'geometry', rva: '0x1100', readableRegion: true}];}, /Readable-region mode requires omitted\/zero length/],
      ['region-large-bound', value => {value.breakpoints[0].ranges = [{id: 'geometry', rva: '0x1100', readableRegion: true, maxRegionBytes: 0x4000001}];}, /at most 64 MiB/],
      ['foreground-region-mode', value => {value.foregroundWindowSource = {id: 'application-hwnd', rva: '0x1100', length: 4, readableRegion: true, maxRegionBytes: 4096};}, /foregroundWindowSource length must be exactly four bytes in fixed-length mode/],
      ['gate-empty', value => {value.breakpoints[0].captureWhen = {};}, /captureWhen requires a fixed-length range/],
      ['gate-unknown', value => {value.breakpoints[0].captureWhen = {ranges: []};}, /Unknown CaptureCondition field/],
      ['gate-empty-bytes', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', length: 4}, equalsBytesHex: ''};}, /Hex bytes must be nonempty and paired/],
      ['gate-length', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', length: 4}, equalsBytesHex: '00'};}, /Capture predicate requires equally sized/],
      ['gate-large', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', length: 65}, equalsBytesHex: '00'.repeat(65)};}, /captureWhen requires a fixed-length range/],
      ['gate-region', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', readableRegion: true, maxRegionBytes: 64}, equalsBytesHex: '00'};}, /captureWhen requires a fixed-length range/],
      ['gate-roots', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', address: '0x401100', length: 4}, equalsBytesHex: '02000000'};}, /Range requires exactly one address, rva or baseRegister/],
      ['gate-writes', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', length: 4}, equalsBytesHex: '02000000'}; value.phaseActions = [{breakpointId: 'counter-after-increment'}];}, /phaseActions cannot reference a filtered breakpoint/],
      ['skip-without-gate', value => {value.breakpoints[0].skipMatchingHits = 1;}, /skipMatchingHits requires captureWhen/],
      ['skip-zero-without-gate', value => {value.breakpoints[0].skipMatchingHits = 0;}, /skipMatchingHits requires captureWhen/],
      ['skip-negative', value => {value.breakpoints[0].captureWhen = {range: {id: 'gate', rva: '0x1100', length: 4}, equalsBytesHex: '02000000'}; value.breakpoints[0].skipMatchingHits = -1;}, /skipMatchingHits requires captureWhen/],
      ['skip-fractional', value => {value.breakpoints[0].skipMatchingHits = 1.5;}, /Integer fields require integral/],
      ['skip-null', value => {value.breakpoints[0].skipMatchingHits = null;}, /Null is not accepted/],
      ['skip-unknown', value => {value.breakpoints[0].skipMatchingHit = 1;}, /Unknown Breakpoint field/],
      ['thread-environment-type', value => {value.captureThreadEnvironment = 1;}, /Boolean fields require JSON true or false/],
      ['thread-environment-range-id', value => {value.captureThreadEnvironment = true; value.breakpoints[0].ranges[0].id = 'thread-seh-head';}, /thread-seh-head is reserved/]
    ]) {
      const invalid = structuredClone(config); edit(invalid);
      const filename = path.join(temporary, `${name}.json`); await writeFile(filename, JSON.stringify(invalid));
      result = validate(filename);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stdout + result.stderr, message, name);
      await assert.rejects(access(config.outputDirectory));
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});

test('thread environment selector decoder uses exact LDT base bytes and rejects unavailable descriptors', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'
function Decode($selector,$bytes) { try { return [RollcageCapture.NativeDebugger]::DecodeThreadEnvironmentDescriptor($selector,[byte[]]$bytes) } catch { return 'rejected' } }
@((Decode 83 @(255,255,171,52,205,243,207,137)),(Decode 0 @(255,255,171,52,205,243,207,137)),(Decode 65536 @(255,255,171,52,205,243,207,137)),(Decode 83 @(0,0,0,0,0,0,0,0)),(Decode 83 @(255,255,0,0,0,243,207,0)),(Decode 83 @(1,2,3)),(Decode 83 @(255,255,254,255,255,243,207,255))) | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [0x89cd34ab, 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('range failures retain descriptor and resolved-root details for query, fixed read and pointer-chain errors', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'
$range=[RollcageCapture.MemoryRange]::new();$range.id='active-sound24-channel-vector-region';$range.rva='0x2f2414';$range.dereferenceOffsets=@('0','0x60','4');$range.readableRegion=$true;$range.maxRegionBytes=4096
$region=[RollcageCapture.MemoryRegionInfo]::new();$region.baseAddress=4096;$region.allocationBaseAddress=4096;$region.regionSize=4096;$region.state=8192;$region.protection=1;$region.type=131072
$formatted=[RollcageCapture.NativeDebugger]::BuildRangeFailureDetails($range,'query-readable-region',[uint32]4128,$null,$null,$region,[IO.InvalidDataException]::new('unreadable'))
function Capture-Failure($name,$arguments) {
  $method=[RollcageCapture.NativeDebugger].GetMethod($name,[Reflection.BindingFlags]'NonPublic,Static')
  try { $method.Invoke($null,$arguments) | Out-Null; throw 'Unexpected reader success' } catch {
    $errorItem=$_.Exception
    while($null -ne $errorItem -and $errorItem.GetType().Name -ne 'RangeCaptureException'){$errorItem=$errorItem.InnerException}
    if($null -eq $errorItem){throw}
    return @{details=$errorItem.details;inner=$errorItem.InnerException.GetType().Name}
  }
}
$query=Capture-Failure 'QueryCaptureRange' @([IntPtr]::Zero,[uint32]4096,$range)
$read=Capture-Failure 'ReadCaptureRangeBytes' @([IntPtr]::Zero,$range,[uint32]4096,[uint32]4096,[int]4,$null)
$range.address='0x1000';$range.rva=$null;$range.dereferenceOffsets=@('0')
$resolve=Capture-Failure 'ResolveCaptureRange' @([IntPtr]::Zero,[uint32]4194304,$range,$null)
@{formatted=$formatted;query=$query;read=$read;resolve=$resolve} | ConvertTo-Json -Compress -Depth 8`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.formatted.id, 'active-sound24-channel-vector-region'); assert.equal(value.formatted.rootRva, '0x2f2414');
  assert.deepEqual(value.formatted.dereferenceOffsets, ['0', '0x60', '4']); assert.equal(value.formatted.requestedResolvedRoot, '0x00001020');
  assert.equal(value.formatted.region.state, '0x00002000'); assert.equal(value.formatted.region.protection, '0x00000001'); assert.equal(value.formatted.region.regionSize, 4096);
  assert.equal(value.query.details.stage, 'query-readable-region'); assert.equal(value.query.details.virtualQuery.informationBytesReturned, 0);
  assert.equal(value.query.details.virtualQuery.region, null); assert.equal(value.query.inner, 'Win32Exception');
  assert.equal(value.read.details.stage, 'read-bytes'); assert.equal(value.read.details.readAddress, '0x00001000'); assert.equal(value.read.details.readLength, 4); assert.equal(value.read.inner, 'Win32Exception');
  assert.equal(value.resolve.details.stage, 'resolve-root'); assert.equal(value.resolve.details.requestedResolvedRoot, null); assert.equal(value.resolve.details.rootAddress, '0x1000');
  for (const row of [value.query, value.read, value.resolve]) assert.equal(row.details.id, 'active-sound24-channel-vector-region');
});

test('capture predicate compares complete bounded raw bytes without numeric coercion', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'
function Check-Predicate($actual,$expected) { try { return [RollcageCapture.NativeDebugger]::CapturePredicateMatches([byte[]]$actual,$expected) } catch { return 'rejected' } }
@( (Check-Predicate @(4,0,0,0) '04000000'), (Check-Predicate @(0,0,0,4) '04000000'), (Check-Predicate @(171,205) 'ABcd'), (Check-Predicate @(0,0) '00'), (Check-Predicate @() ''), (Check-Predicate @(0) 'zz'), (Check-Predicate ([byte[]]::new(64)) ('00'*64)), (Check-Predicate ([byte[]]::new(65)) ('00'*65)) ) | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [true, false, true, 'rejected', 'rejected', 'rejected', true, 'rejected']);
});

test('matching-hit selection advances only predicate matches and leaves snapshot/raw counts independent', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'
$bp = New-Object RollcageCapture.Breakpoint
$bp.captureWhen = New-Object RollcageCapture.CaptureCondition
$bp.skipMatchingHits = 2
$decisions = @($false,$true,$true,$false,$true) | ForEach-Object { [RollcageCapture.NativeDebugger]::ObserveCaptureMatch($bp,$_) }
$flags = [Reflection.BindingFlags]'NonPublic,Instance'
@{decisions=@($decisions);matchingHits=$bp.GetType().GetField('matchingHits',$flags).GetValue($bp);captureHits=$bp.GetType().GetField('captureHits',$flags).GetValue($bp);rawHits=$bp.GetType().GetField('hits',$flags).GetValue($bp)} | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {decisions: [false, false, false, false, true], matchingHits: 3, captureHits: 0, rawHits: 0});
});

test('hidden-window argument policy preserves other flags without launching windows', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'; @([RollcageCapture.NativeDebugger]::HiddenWindowArgumentValue('CreateWindowExW',1,0x408),[RollcageCapture.NativeDebugger]::HiddenWindowArgumentValue('CreateWindowExA',4,0x10cf0000),[RollcageCapture.NativeDebugger]::HiddenWindowArgumentValue('ShowWindow',2,5),[RollcageCapture.NativeDebugger]::HiddenWindowArgumentValue('SetWindowPos',7,0x240)) | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [0x08000400, 0x00cf0000, 0, 0x290]);
});

test('foreground initialization fallback admits only narrow unavailable-memory errors', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `Add-Type -Path '${source}'; $predicate = [RollcageCapture.NativeDebugger].GetMethod('UninitializedSourceRead',[Reflection.BindingFlags]'Static,NonPublic'); @($predicate.Invoke($null,@([ComponentModel.Win32Exception]::new(299,'ReadProcessMemory 0x00000004'))),$predicate.Invoke($null,@([ComponentModel.Win32Exception]::new(487,'ReadProcessMemory 0x00000004'))),$predicate.Invoke($null,@([ComponentModel.Win32Exception]::new(998,'ReadProcessMemory 0x00000004'))),$predicate.Invoke($null,@([ComponentModel.Win32Exception]::new(5,'ReadProcessMemory 0x00000004'))),$predicate.Invoke($null,@([ComponentModel.Win32Exception]::new(299,'Set x86 context')))) | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [true, true, true, false, false]);
});

test('memory-region ABI decoding and readability bounds use exact x86/x64 layouts without querying a process', {skip: process.platform !== 'win32'}, () => {
  const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url)).replaceAll("'", "''");
  const script = `
Add-Type -Path '${source}'
$wide = [byte[]]::new(48)
[BitConverter]::GetBytes([uint64]536870912).CopyTo($wide,0)
[BitConverter]::GetBytes([uint64]536805376).CopyTo($wide,8)
[BitConverter]::GetBytes([uint32]4).CopyTo($wide,16)
[BitConverter]::GetBytes([uint32]12345).CopyTo($wide,20)
[BitConverter]::GetBytes([uint64]12288).CopyTo($wide,24)
[BitConverter]::GetBytes([uint32]4096).CopyTo($wide,32)
[BitConverter]::GetBytes([uint32]4).CopyTo($wide,36)
[BitConverter]::GetBytes([uint32]131072).CopyTo($wide,40)
$decoded64 = [RollcageCapture.NativeDebugger]::DecodeMemoryRegion($wide,8)
$narrow = [byte[]]::new(28)
[BitConverter]::GetBytes([uint32]4026531840).CopyTo($narrow,0)
[BitConverter]::GetBytes([uint32]4026531840).CopyTo($narrow,4)
[BitConverter]::GetBytes([uint32]2).CopyTo($narrow,8)
[BitConverter]::GetBytes([uint32]4096).CopyTo($narrow,12)
[BitConverter]::GetBytes([uint32]4096).CopyTo($narrow,16)
[BitConverter]::GetBytes([uint32]2).CopyTo($narrow,20)
[BitConverter]::GetBytes([uint32]262144).CopyTo($narrow,24)
$decoded32 = [RollcageCapture.NativeDebugger]::DecodeMemoryRegion($narrow,4)
function TestRegion([uint64]$base,[uint64]$size,[uint32]$state,[uint32]$protection,[int]$bound,[uint32]$root) {
  $region = [RollcageCapture.MemoryRegionInfo]::new()
  $region.baseAddress = $base; $region.regionSize = $size; $region.state = $state; $region.protection = $protection
  try { [RollcageCapture.NativeDebugger]::ValidateReadableRegion($root,$region,$bound); return $true } catch { return $false }
}
$checks = @(
  (TestRegion 536870912 4096 4096 4 4096 536870944),
  (TestRegion 536870912 4096 4096 260 4096 536870944),
  (TestRegion 536870912 4096 4096 1 4096 536870944),
  (TestRegion 536870912 4096 4096 16 4096 536870944),
  (TestRegion 536870912 4096 8192 4 4096 536870944),
  (TestRegion 536870912 8192 4096 4 4096 536870944),
  (TestRegion 4294967280 32 4096 4 4096 4294967280),
  (TestRegion 536870912 4096 4096 4 4096 536875008),
  (TestRegion 536870912 4096 4096 516 4096 536870944),
  (TestRegion 536870912 4096 4096 128 4096 536870944),
  (TestRegion 536870912 4096 4096 4 67108865 536870944),
  (TestRegion 4026531840 4096 4096 2 4096 4026531856)
)
@{decoded64=$decoded64;decoded32=$decoded32;checks=$checks} | ConvertTo-Json -Compress -Depth 4
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.deepEqual(actual.decoded64, {baseAddress: 0x20000000, allocationBaseAddress: 0x1fff0000, regionSize: 0x3000, allocationProtection: 4, state: 0x1000, protection: 4, type: 0x20000});
  assert.deepEqual(actual.decoded32, {baseAddress: 0xf0000000, allocationBaseAddress: 0xf0000000, regionSize: 0x1000, allocationProtection: 2, state: 0x1000, protection: 2, type: 0x40000});
  assert.deepEqual(actual.checks, [true, false, false, false, false, false, false, false, true, true, false, true]);
});
