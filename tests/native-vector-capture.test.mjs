import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNativeCaptureFixture} from '../tools/prepare-native-capture-fixture.mjs';

const helper = fileURLToPath(new URL('../tools/native-physics-capture.ps1', import.meta.url));
const source = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url));
const run = (file, validate = false) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ConfigPath', file, ...(validate ? ['-ValidateOnly'] : []), '-Quiet'], {windowsHide: true, encoding: 'utf8', timeout: 30000});
const digest = data => createHash('sha256').update(data).digest('hex');
const vector = (id, rva) => ({id, rva, vectorStorage: true, maxVectorBytes: 16});

async function fixture(directory, pending = false) {
  const prepared = await prepareNativeCaptureFixture(path.join(directory, 'fixture'));
  const config = JSON.parse(await readFile(path.join(prepared.directory, pending ? 'pending-frame-config.json' : 'capture-config.json'), 'utf8'));
  const bytes = await readFile(config.executablePath);
  //Three actual vector objects in the synthetic PE's writable data: used,
  //null/empty, and allocated capacity with zero used elements. The storage's
  //unused tail is deliberately nonzero so capacity cannot be treated as size.
  for (const [offset, words] of [[0x320, [0x401150, 0x401158, 0x401160]], [0x330, [0, 0, 0]], [0x340, [0x401150, 0x401150, 0x401160]]]) words.forEach((value, i) => bytes.writeUInt32LE(value, offset + i * 4));
  Buffer.from('00112233445566778899aabbccddeeff', 'hex').copy(bytes, 0x350);
  const executable = path.join(directory, `synthetic-vector-${pending ? 'pending' : 'direct'}.exe`);
  await writeFile(executable, bytes);
  config.executablePath = executable; config.expectedSha256 = digest(bytes);
  config.ranges = [{id: 'vector-headers', rva: '0x1120', length: 0x30}, vector('used-storage', '0x1120'), vector('null-storage', '0x1130'), vector('allocated-empty-storage', '0x1140')];
  if (!pending) {config.maxSnapshots = 1; config.breakpoints[0].stopAfterHits = 1;}
  return config;
}
async function save(directory, config, name) {
  const filename = path.join(directory, `${name}.json`);
  config.outputDirectory = path.join(directory, `${name}-capture`);
  await writeFile(filename, JSON.stringify(config));
  return filename;
}
async function trace(directory) {return (await readFile(path.join(directory, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);}
async function cleanup(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^rollcage-vector-/);
  await rm(resolved, {recursive: true, force: true});
}

test('vector storage decoding preserves capacity and rejects unordered, null-inconsistent, overflow and unbounded headers', {skip: process.platform !== 'win32'}, () => {
  const script = `Add-Type -Path '${source.replaceAll("'", "''")}'
function Header($a,$b,$c) { return ,([BitConverter]::GetBytes([uint32]$a)+[BitConverter]::GetBytes([uint32]$b)+[BitConverter]::GetBytes([uint32]$c)) }
function Rejected($action) { try { & $action | Out-Null; return $false } catch { return $true } }
$used=[RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4104 4112),16)
$empty=[RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 0 0 0),16)
$allocated=[RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4096 4112),16)
$noCapacity=[RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4096 4096),16)
$range=[RollcageCapture.MemoryRange]::new();$range.id='header-edge';$range.vectorStorage=$true;$range.maxVectorBytes=16
$read=[RollcageCapture.NativeDebugger].GetMethod('ReadVectorCaptureRange',[Reflection.BindingFlags]'NonPublic,Static')
function Header-Rejected($root) {
 try { $read.Invoke($null,@([IntPtr]::Zero,[uint32]$root,$range)) | Out-Null; return $false } catch {
  $failure=$_.Exception
  while($null -ne $failure -and $failure.GetType().Name -ne 'RangeCaptureException'){$failure=$failure.InnerException}
  return $null -ne $failure -and $failure.details.stage -eq 'read-vector-header' -and $failure.InnerException.Message -like '*nonnull*wholly inside*'
 }
}
$rootChecks=@((Header-Rejected 0),(Header-Rejected 4294967288))
$checks=@(
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 0 0 16),16) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4092 4112),16) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4116 4112),16) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4104 4116),16) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4294967280 4294967284 0),16) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4104 4112),0) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage((Header 4096 4104 4112),67108865) }),
(Rejected { [RollcageCapture.NativeDebugger]::DecodeVectorStorage([byte[]]::new(8),16) })
)
@{used=$used.length;empty=$empty.length;allocated=$allocated.length;noCapacity=$noCapacity.length;checks=$checks;rootChecks=$rootChecks} | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {used: 16, empty: 0, allocated: 16, noCapacity: 0, checks: Array(8).fill(true), rootChecks: [true, true]});
});

test('vector capture configuration rejects mixed or absent bounds without launching', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-vector-validation-'));
  try {
    const config = await fixture(directory), good = run(await save(directory, config, 'good'), true);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    for (const [name, edit, pattern] of [
      ['fixed', c => {c.ranges[1].length = 4;}, /Vector-storage mode/],
      ['region', c => {c.ranges[1].readableRegion = true; c.ranges[1].maxRegionBytes = 4096;}, /Vector-storage mode/],
      ['zero', c => {c.ranges[1].maxVectorBytes = 0;}, /Vector-storage mode/],
      ['large', c => {c.ranges[1].maxVectorBytes = 67108865;}, /Vector-storage mode/],
      ['orphan', c => {c.ranges[1].vectorStorage = false; c.ranges[1].length = 16;}, /Fixed-length range/],
      ['predicate', c => {c.breakpoints[0].captureWhen = {range: vector('vector-predicate', '0x1120'), equalsBytesHex: '00000000'};}, /captureWhen requires a fixed-length/],
    ]) {
      const value = structuredClone(config); edit(value);
      const result = run(await save(directory, value, name), true);
      assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, pattern, name);
      await assert.rejects(access(value.outputDirectory));
    }
  } finally {await cleanup(directory);}
});

async function assertVectorSnapshots(directory, snapshots) {
  for (const snapshot of snapshots) {
    const map = new Map(snapshot.ranges.map(row => [row.id, row]));
    for (const id of ['used-storage', 'null-storage', 'allocated-empty-storage']) {
      const row = map.get(id), empty = id === 'null-storage';
      assert.equal(row.rangeMode, 'vector-storage'); assert.equal(row.length, empty ? 0 : 16);
      assert.equal(Number(row.address), empty ? 0 : 0x401150);
      assert.equal(row.maxVectorBytes, 16);
      assert.equal(row.vectorHeaderHex.length, 24);
      assert.equal(Number(row.vectorHeaderAddress), id === 'used-storage' ? 0x401120 : empty ? 0x401130 : 0x401140);
      const data = await readFile(path.join(directory, row.file));
      assert.equal(data.toString('hex'), empty ? '' : '00112233445566778899aabbccddeeff');
      assert.equal(row.sha256, digest(data));
      assert.equal(Number(row.vectorBegin), empty ? 0 : 0x401150);
      assert.equal(Number(row.vectorEnd), id === 'used-storage' ? 0x401158 : empty ? 0 : 0x401150);
      assert.equal(Number(row.vectorCapacity), empty ? 0 : 0x401160);
    }
  }
}

test('owned native direct and pending captures retain full vector capacity and explicit empty evidence', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-vector-execution-'));
  try {
    for (const pending of [false, true]) {
      const sub = path.join(directory, pending ? 'pending' : 'direct');
      await mkdir(sub);
      const config = await fixture(sub, pending), result = run(await save(sub, config, 'capture'));
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const rows = await trace(config.outputDirectory), snapshots = rows.filter(row => row.type === 'snapshot');
      assert.equal(snapshots.length, pending ? 3 : 1);
      await assertVectorSnapshots(config.outputDirectory, snapshots);
      if (pending) {
        assert.deepEqual(snapshots.map(row => row.breakpointId), ['frame-before', 'dispatch', 'frame-after']);
        assert.equal(rows.find(row => row.type === 'pending-frame-started').bufferedBytes, 840, 'Header bytes and capacity bytes both count against the pending budget.');
        assert.equal(rows.filter(row => row.type === 'pending-frame-discarded').length, 1);
      }
    }
  } finally {await cleanup(directory);}
});

test('owned native malformed headers and vector-inclusive pending byte bounds fail closed', {skip: process.platform !== 'win32'}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rollcage-vector-runtime-bounds-'));
  try {
    const config = await fixture(directory, true);
    for (const [name, edit, pattern] of [
      ['capacity', c => {c.ranges[1].maxVectorBytes = 15;}, /read-vector-header/],
      ['null-header', c => {c.ranges[2].rva = '0x1124';}, /read-vector-header/],
      ['byte-bound', c => {c.pendingFrameObserver.maxPendingBytes = 2600;}, /host-buffer byte bound/],
    ]) {
      const value = structuredClone(config); edit(value);
      const result = run(await save(directory, value, name));
      assert.notEqual(result.status, 0, name); assert.match(result.stdout + result.stderr, pattern, name);
      const rows = await trace(value.outputDirectory);
      assert.equal(rows.filter(row => row.type === 'snapshot').length, 0);
      assert.ok(rows.some(row => row.type === 'capture-error'));
      assert.equal(rows.find(row => row.type === 'owned-process-cleanup').terminated, true);
    }
  } finally {await cleanup(directory);}
});
