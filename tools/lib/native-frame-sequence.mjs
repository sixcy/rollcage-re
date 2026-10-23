// Carried 4749e0 replay with observed *external* producers supplied explicitly.
// This is not a source-only game loop: native AI/input/post-physics changes and
// the next caller's register/stack ABI remain separately reported inputs.
import {createHash} from 'node:crypto';
import {createCapturedMemory} from './captured-memory.mjs';
import {replayNativeFrame} from './native-frame-replay.mjs';
import {inspectNativeFrameScenario} from './native-frame-scenario.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validSpan = row => row && Number.isSafeInteger(row.address) && row.address >= 0 && Number.isSafeInteger(row.length) && row.length > 0 && row.address + row.length <= 0x100000000;
const rowsOf = snapshot => snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
function imageOf(snapshot) {
  const input = rowsOf(snapshot);
  if (!Array.isArray(input) || !input.length) throw Error('Sequence requires complete captured range rows.');
  const named = input.map((row, index) => {
    const address = Number(row.address), length = row.bytes?.length;
    if (!validSpan({address, length}) || !Buffer.isBuffer(row.bytes) || (row.length !== undefined && row.length !== length)) throw Error('Invalid sequence capture region.');
    const root = {};
    for (const key of ['rangeMode', 'rootAddress', 'rootRva', 'moduleBaseAddress', 'baseRegister', 'dereferenceOffsets', 'offset', 'requestedResolvedRoot']) if (row[key] !== undefined) root[key] = Array.isArray(row[key]) ? Object.freeze([...row[key]]) : row[key];
    return Object.freeze({id: row.id ?? `region-${index}`, address, length, ...root});
  }).sort((a, b) => a.address - b.address || a.length - b.length || String(a.id).localeCompare(String(b.id)));
  if (new Set(named.map(row => row.id)).size !== named.length) throw Error('Sequence region identities must be unique.');
  // createCapturedMemory checks overlaps and clones all retained bytes. These
  // private evidence images are never given to the replay adapter for mutation.
  const captured = createCapturedMemory(input), union = [];
  for (const row of named) {
    const last = union.at(-1), end = row.address + row.length;
    if (last && row.address <= last.address + last.length) last.length = Math.max(last.address + last.length, end) - last.address;
    else union.push({address: row.address, length: row.length});
  }
  return {snapshot, ...captured, named: Object.freeze(named), union: Object.freeze(union.map(Object.freeze))};
}
function snapshotBase(snapshot) {
  const bases = new Set([snapshot.moduleBaseAddress, ...rowsOf(snapshot).map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(Number));
  if (bases.size !== 1 || !Number.isSafeInteger([...bases][0])) throw Error('Sequence requires one observed module base.');
  return [...bases][0];
}
function describe(bytes) {
  return {sha256: digest(bytes), ...(bytes.length <= 16 ? {bytesHex: bytes.toString('hex')} : {})};
}
function changedCount(a, b) {let count = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++; return count;}
function spanRows(regions, image, label) {
  if (!Array.isArray(regions) || regions.some(row => !validSpan(row))) throw Error(`Invalid ${label} regions.`);
  return regions.map((row, index) => {
    image.span(row.address, row.length);
    return {...row, id: row.id ?? `${label}-${index}`};
  });
}
function compareFrame(replay, before, after, regions) {
  const comparisons = regions.map(row => {
    const expected = after.span(row.address, row.length), actual = replay.span(row.address, row.length);
    let firstDivergence = null, mismatchBytes = 0;
    for (let offset = 0; offset < row.length; offset++) if (expected[offset] !== actual[offset]) {
      mismatchBytes++;
      firstDivergence ??= {address: row.address + offset, offset, nativeByte: expected[offset], sourceByte: actual[offset]};
    }
    const nativeReadOnlyChanges = row.comparison === 'read-only' ? changedCount(before.span(row.address, row.length), expected) : 0;
    return {id: row.id, address: row.address, length: row.length, comparison: row.comparison ?? 'semantic', matched: mismatchBytes === 0 && nativeReadOnlyChanges === 0, mismatchBytes, nativeReadOnlyChanges, firstDivergence};
  });
  const nativeReturn = Number(after.snapshot.registers?.eax), sourceReturn = replay.report?.nativeReturn;
  if (!Number.isInteger(nativeReturn) || !Number.isInteger(sourceReturn)) throw Error('Sequence requires native/source integer return values.');
  return {matched: (nativeReturn | 0) === sourceReturn && comparisons.every(row => row.matched), nativeReturn: nativeReturn | 0, sourceReturn, comparedBytes: comparisons.reduce((sum, row) => sum + row.length, 0), comparisons,
    firstDivergence: comparisons.find(row => !row.matched) ?? ((nativeReturn | 0) !== sourceReturn ? {kind: 'return', nativeReturn: nativeReturn | 0, sourceReturn} : null)};
}
// One containing-range hash protects many short runs. Run tuples contain only
// [offset,length]; all byte values still come from the retained capture files.
export function* expandNativeFramePatchRuns(ledger, {kind} = {}) {
  for (const [rangeIndex, range] of ledger.patchRanges.entries()) {
    const runs = [];
    for (const [name, value] of [['externalRuns', 'external-producer'], ['abiRuns', 'abi-input']]) {
      if (kind !== undefined && kind !== value) continue;
      for (const [offset, length] of range[name]) runs.push({address: range.address + offset, length, kind: value, rangeIndex});
    }
    yield* runs.sort((a, b) => a.address - b.address);
  }
}

// Reapply a retained ledger using retained native images. Validate every hash,
// tuple and counter before mutation; an incorrect ledger cannot reset state.
export function applyNativeFrameSequenceTransition(ledger, {nativeAfter, nextNativeBefore, source}) {
  if (ledger.patchEncoding !== 'relative-runs-v1' || !Array.isArray(ledger.patchRanges) || !Array.isArray(ledger.abiRefreshes)) throw Error('Unsupported sequence patch ledger.');
  const protectedRegions = ledger.sourceContinuation?.regions ?? [];
  if (!Array.isArray(protectedRegions)) throw Error('Invalid source continuation protection ledger.');
  let protectedMismatches = 0, protectedNativeChanges = 0;
  if (ledger.sourceContinuation && (!protectedRegions.length || typeof ledger.sourceContinuation.id !== 'string' || !ledger.sourceContinuation.id)) throw Error('Invalid source continuation protection ledger.');
  for (const [index, row] of protectedRegions.entries()) {
    if (!validSpan(row) || protectedRegions.slice(0, index).some(other => row.address < other.address + other.length && other.address < row.address + row.length)
      || digest(source.span(row.address, row.length)) !== row.sourceProducedSha256 || digest(nextNativeBefore.span(row.address, row.length)) !== row.nextNativeBeforeSha256) throw Error('Source continuation protected output hash/region differs.');
    const mismatch = changedCount(source.span(row.address, row.length), nextNativeBefore.span(row.address, row.length));
    if (row.mismatchBytes !== mismatch) throw Error('Source continuation protected mismatch counter differs.');
    protectedMismatches += mismatch;
    protectedNativeChanges += changedCount(nativeAfter.span(row.address, row.length), nextNativeBefore.span(row.address, row.length));
  }
  if (ledger.sourceContinuation && (ledger.sourceContinuation.comparedBytes !== protectedRegions.reduce((sum, row) => sum + row.length, 0)
    || ledger.sourceContinuation.mismatchBytes !== protectedMismatches || ledger.sourceContinuation.changedNativeBytes !== protectedNativeChanges
    || ledger.sourceContinuation.matched !== (protectedMismatches === 0))) throw Error('Source continuation protected comparison counters differ.');
  const assertUnprotected = (address, length) => {
    if (protectedRegions.some(row => address < row.address + row.length && row.address < address + length)) throw Error('External/ABI patch overlaps source continuation owned outputs.');
  };
  let observedChangedBytes = 0, externallyPatchedBytes = 0, overwrittenSourceDivergenceBytes = 0, externalSourceChangedBytes = 0, externalPatchRuns = 0, abiChangedRuns = 0;
  let previousEnd = -1;
  const writes = [];
  for (const range of ledger.patchRanges) {
    if (!validSpan(range) || range.address < previousEnd || range.length > 65536) throw Error('Invalid sequence patch containing range.');
    previousEnd = range.address + range.length;
    const old = nativeAfter.span(range.address, range.length), next = nextNativeBefore.span(range.address, range.length), current = source.span(range.address, range.length);
    if (digest(old) !== range.nativeAfterSha256 || digest(next) !== range.nextNativeBeforeSha256 || digest(current) !== range.sourceBeforeSha256) throw Error('Sequence patch containing-range hash differs.');
    const seen = new Uint8Array(range.length);
    let rangeObserved = 0, rangeExternal = 0, rangeDivergence = 0, rangeSourceChanged = 0;
    for (const [name, isExternal] of [['externalRuns', true], ['abiRuns', false]]) {
      if (!Array.isArray(range[name])) throw Error('Invalid sequence patch runs.');
      let end = 0;
      for (const tuple of range[name]) {
        if (!Array.isArray(tuple) || tuple.length !== 2) throw Error('Invalid sequence patch tuple.');
        const [offset, length] = tuple;
        if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < end || length < 1 || offset + length > range.length) throw Error('Invalid sequence patch tuple bounds.');
        end = offset + length;
        assertUnprotected(range.address + offset, length);
        for (let i = offset; i < end; i++) {
          const address = range.address + i, isAbi = ledger.abiRefreshes.some(row => address >= row.address && address < row.address + row.length);
          if (seen[i] || old[i] === next[i] || isAbi === isExternal) throw Error('Sequence patch tuple changed-byte/ABI classification differs.');
          seen[i] = 1;
          if (isExternal) {rangeDivergence += Number(current[i] !== old[i]); rangeSourceChanged += Number(current[i] !== next[i]);}
        }
        rangeObserved += length;
        if (isExternal) {rangeExternal += length; externalPatchRuns++; writes.push({address: range.address + offset, bytes: next.subarray(offset, end)});}
        else abiChangedRuns++;
      }
    }
    for (let i = 0; i < range.length; i++) if (Number(old[i] !== next[i]) !== seen[i]) throw Error('Sequence patch ledger omits a changed byte in its containing range.');
    if (range.observedChangedBytes !== rangeObserved || range.externallyPatchedBytes !== rangeExternal || range.overwrittenSourceDivergenceBytes !== rangeDivergence || range.sourceChangedBytes !== rangeSourceChanged) throw Error('Sequence patch range counters differ.');
    observedChangedBytes += rangeObserved; externallyPatchedBytes += rangeExternal; overwrittenSourceDivergenceBytes += rangeDivergence; externalSourceChangedBytes += rangeSourceChanged;
  }
  let abiRefreshedBytes = 0;
  const admittedAbi = [];
  for (const row of ledger.abiRefreshes) {
    if (!validSpan(row) || admittedAbi.some(other => row.address < other.address + other.length && other.address < row.address + row.length)) throw Error('Invalid sequence ABI refresh span.');
    admittedAbi.push(row);
    assertUnprotected(row.address, row.length);
    const current = source.span(row.address, row.length), input = nextNativeBefore.span(row.address, row.length);
    if (digest(current) !== row.sourceBefore.sha256 || digest(input) !== row.nextNativeBefore.sha256 || changedCount(current, input) !== row.sourceChangedBytes) throw Error('Sequence ABI refresh hash/counter differs.');
    abiRefreshedBytes += row.length; writes.push({address: row.address, bytes: input});
  }
  const counters = {observedChangedBytes, externallyPatchedBytes, overwrittenSourceDivergenceBytes, externalSourceChangedBytes, externalPatchRuns, abiChangedRuns, abiRefreshedBytes};
  for (const [key, value] of Object.entries(counters)) if (ledger[key] !== value) throw Error(`Sequence patch ledger ${key} differs.`);
  for (const row of writes) row.bytes.copy(source.span(row.address, row.bytes.length));
  return counters;
}

function transition(previous, next, source, abi, maxPatchSpanBytes, footprint, sourceContinuation) {
  const patchRanges = [], samples = [];
  const isAbiAt = address => abi.some(row => address >= row.address && address < row.address + row.length);
  let observedChangedBytes = 0, externallyPatchedBytes = 0, overwrittenSourceDivergenceBytes = 0, externalSourceChangedBytes = 0, externalPatchRuns = 0, abiChangedRuns = 0;
  for (const region of footprint) for (let base = region.address; base < region.address + region.length; base += 65536) {
    const length = Math.min(65536, region.address + region.length - base), old = previous.span(base, length), input = next.span(base, length);
    if (old.equals(input)) continue;
    const current = source.span(base, length), range = {address: base, length, regionIds: previous.named.filter(row => base < row.address + row.length && row.address < base + length).map(row => row.id),
      nativeAfterSha256: digest(old), nextNativeBeforeSha256: digest(input), sourceBeforeSha256: digest(current), externalRuns: [], abiRuns: [], observedChangedBytes: 0, externallyPatchedBytes: 0, overwrittenSourceDivergenceBytes: 0, sourceChangedBytes: 0};
    for (let offset = 0; offset < length;) {
      if (old[offset] === input[offset]) {offset++; continue;}
      const start = offset, isAbi = isAbiAt(base + offset);
      while (offset < length && old[offset] !== input[offset] && offset - start < maxPatchSpanBytes && isAbiAt(base + offset) === isAbi) offset++;
      const count = offset - start;
      range[isAbi ? 'abiRuns' : 'externalRuns'].push([start, count]); range.observedChangedBytes += count;
      if (isAbi) abiChangedRuns++;
      else {
        externalPatchRuns++; range.externallyPatchedBytes += count;
        range.overwrittenSourceDivergenceBytes += changedCount(current.subarray(start, offset), old.subarray(start, offset));
        range.sourceChangedBytes += changedCount(current.subarray(start, offset), input.subarray(start, offset));
      }
      if (samples.length < 8) samples.push({address: base + start, length: count, kind: isAbi ? 'abi-input' : 'external-producer', nativeAfterHex: old.subarray(start, Math.min(offset, start + 16)).toString('hex'), nextNativeBeforeHex: input.subarray(start, Math.min(offset, start + 16)).toString('hex'), sourceBeforeHex: current.subarray(start, Math.min(offset, start + 16)).toString('hex')});
    }
    observedChangedBytes += range.observedChangedBytes; externallyPatchedBytes += range.externallyPatchedBytes;
    overwrittenSourceDivergenceBytes += range.overwrittenSourceDivergenceBytes; externalSourceChangedBytes += range.sourceChangedBytes;
    patchRanges.push(range);
  }
  const abiRefreshes = abi.map(row => ({...row, kind: 'next-native-caller-ABI-refresh', sourceBefore: describe(source.span(row.address, row.length)), nextNativeBefore: describe(next.span(row.address, row.length)), sourceChangedBytes: changedCount(source.span(row.address, row.length), next.span(row.address, row.length))}));
  const ledger = {patchEncoding: 'relative-runs-v1', observedChangedBytes, externallyPatchedBytes, overwrittenSourceDivergenceBytes, externalSourceChangedBytes, externalPatchRuns, abiChangedRuns, patchRanges, samples, abiRefreshes, abiRefreshedBytes: abi.reduce((sum, row) => sum + row.length, 0)};
  if (sourceContinuation) ledger.sourceContinuation = sourceContinuation;
  applyNativeFrameSequenceTransition(ledger, {nativeAfter: previous, nextNativeBefore: next, source});
  return ledger;
}

function excludeOwnedRegions(footprint, owned) {
  const result = [], sorted = [...owned].sort((a, b) => a.address - b.address);
  for (const row of footprint) {
    let cursor = row.address;
    const end = row.address + row.length;
    for (const protectedRow of sorted) {
      if (protectedRow.address + protectedRow.length <= cursor || protectedRow.address >= end) continue;
      if (protectedRow.address > cursor) result.push({address: cursor, length: protectedRow.address - cursor});
      cursor = Math.max(cursor, protectedRow.address + protectedRow.length);
    }
    if (cursor < end) result.push({address: cursor, length: end - cursor});
  }
  return result;
}

async function executeSourceContinuation(continuation, {source, pair, nativeAfter, next, frameIndex, first, abi}) {
  const regions = spanRows(continuation.regionsFor({source, pair, frameIndex}), next.before, 'source continuation');
  if (!regions.length) throw Error('Source continuation must declare all owned output regions before execution.');
  for (const [index, row] of regions.entries()) {
    first.span(row.address, row.length);
    if (regions.slice(0, index).some(other => row.address < other.address + other.length && other.address < row.address + row.length)
      || abi.some(other => row.address < other.address + other.length && other.address < row.address + row.length)) throw Error('Source continuation owned regions overlap each other or ABI inputs.');
  }
  const previous = regions.map(row => Buffer.from(source.span(row.address, row.length)));
  //The producer receives carried source only. Next native input is comparison
  //evidence, never an argument from which the producer can copy answers.
  const execution = await continuation.execute({source, pair, frameIndex});
  let mismatchBytes = 0, changedNativeBytes = 0, sourceChangedBytes = 0, firstDivergence = null;
  const comparisons = regions.map((row, index) => {
    const old = nativeAfter.span(row.address, row.length);
    const produced = source.span(row.address, row.length), expected = next.before.span(row.address, row.length);
    let differing = 0;
    for (let offset = 0; offset < row.length; offset++) if (produced[offset] !== expected[offset]) {
      differing++;
      firstDivergence ??= {regionId: row.id, address: row.address + offset, offset, nativeByte: expected[offset], sourceByte: produced[offset]};
    }
    mismatchBytes += differing; changedNativeBytes += changedCount(old, expected); sourceChangedBytes += changedCount(previous[index], produced);
    return {...row, sourceBeforeSha256: digest(previous[index]), sourceProducedSha256: digest(produced), nextNativeBeforeSha256: digest(expected), mismatchBytes: differing};
  });
  return {id: continuation.id, matched: mismatchBytes === 0, comparedBytes: regions.reduce((sum, row) => sum + row.length, 0), changedNativeBytes, sourceChangedBytes, mismatchBytes, firstDivergence, execution, regions: comparisons,
    policy: 'All declared outputs, including unchanged bytes, are source-produced and excluded from external and ABI patches.'};
}

function coverageObservation(first, image, policy) {
  if (policy === 'strict') {
    if (JSON.stringify(image.named) !== JSON.stringify(first.named) || JSON.stringify(image.union) !== JSON.stringify(first.union)) {
      const ids = new Set([...first.named, ...image.named].map(row => row.id));
      const changes = [...ids].map(id => ({id, first: first.named.find(row => row.id === id) ?? null, actual: image.named.find(row => row.id === id) ?? null})).filter(row => JSON.stringify(row.first) !== JSON.stringify(row.actual));
      throw Error(`Sequence captured region topology/identity changed at ordinal ${image.snapshot.ordinal ?? 'unknown'}: ${JSON.stringify(changes)}.`);
    }
  } else {
    for (const row of first.named) {
      const actual = image.named.find(candidate => candidate.id === row.id);
      if (!actual) throw Error(`Sequence initial observation identity lost: ${row.id}.`);
      const descriptor = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['address', 'length', 'requestedResolvedRoot'].includes(key)));
      if (JSON.stringify(descriptor(actual)) !== JSON.stringify(descriptor(row))) throw Error(`Sequence observation root descriptor identity changed: ${row.id}.`);
      // VirtualQueryEx boundaries can move inside overlapping observations.
      // Their descriptor identities stay fixed; admission is the FULL union
      // below, rather than each redundant readable-region row separately.
      if (row.rangeMode !== 'readable-region' && (actual.address !== row.address || actual.length !== row.length)) throw Error(`Sequence non-observation region identity changed: ${row.id}.`);
    }
  }
  // There is no intersection or new-byte admission: preserve the entire first
  // footprint, and report later VirtualQueryEx overcapture without mapping it.
  for (const row of first.union) {
    try {image.span(row.address, row.length);} catch (error) {throw Error(`Sequence initial observation coverage lost at 0x${row.address.toString(16)} (${row.length} bytes): ${error.message}`);}
  }
  const surplus = [];
  for (const row of image.union) {
    let cursor = row.address, end = row.address + row.length;
    for (const admitted of first.union) {
      if (admitted.address + admitted.length <= cursor || admitted.address >= end) continue;
      if (admitted.address > cursor) surplus.push({address: cursor, length: admitted.address - cursor});
      cursor = Math.max(cursor, admitted.address + admitted.length);
      if (cursor >= end) break;
    }
    if (cursor < end) surplus.push({address: cursor, length: end - cursor});
  }
  return {ordinal: image.snapshot.ordinal ?? null, surplusBytes: surplus.reduce((sum, row) => sum + row.length, 0), surplus: surplus.map(row => ({...row, ...describe(image.span(row.address, row.length))})),
    resolvedRoots: image.named.filter(row => row.requestedResolvedRoot !== undefined).map(row => ({id: row.id, requestedResolvedRoot: row.requestedResolvedRoot, changedFromInitial: row.requestedResolvedRoot !== first.named.find(initial => initial.id === row.id)?.requestedResolvedRoot}))};
}

export async function replayNativeFrameSequence(pairs, {replayFrame = replayNativeFrame, frameOptions = {}, semanticRegions, abiInputRegions, counterRegions, maxPatchSpanBytes = 256, coveragePolicy = 'strict', sourceContinuation} = {}) {
  if (!Array.isArray(pairs) || !pairs.length || typeof replayFrame !== 'function' || !['strict', 'initial-observation'].includes(coveragePolicy) || !Number.isInteger(maxPatchSpanBytes) || maxPatchSpanBytes < 1 || maxPatchSpanBytes > 65536) throw Error('Invalid native sequence replay options.');
  if (sourceContinuation !== undefined && (!sourceContinuation || typeof sourceContinuation.id !== 'string' || !sourceContinuation.id || typeof sourceContinuation.regionsFor !== 'function' || typeof sourceContinuation.execute !== 'function')) throw Error('Source continuation requires an explicit identified producer and owned-region declaration.');
  const captures = pairs.map(pair => ({pair, before: imageOf(pair.before), after: imageOf(pair.after)}));
  const first = captures[0].before, base = snapshotBase(first.snapshot), observations = [];
  for (const {before, after} of captures) for (const image of [before, after]) {
    if (snapshotBase(image.snapshot) !== base) throw Error('Sequence main-module identity changed.');
    observations.push(coverageObservation(first, image, coveragePolicy));
    if (first.snapshot.tid !== undefined && image.snapshot.tid !== first.snapshot.tid) throw Error('Sequence native thread identity changed.');
  }
  const counters = spanRows(counterRegions ?? [{id: 'selection-clock90a548', address: base + 0x90a548 - 0x400000, length: 4}], first, 'counter');
  if (counters.some(row => row.length !== 4)) throw Error('Sequence counters require explicit DWORD regions.');
  const readCounters = image => Object.fromEntries(counters.map(row => [row.id, image.span(row.address, 4).readUInt32LE(0)]));
  const cases = [], transitions = [];
  let source = first, finalReplay, expectedAliases;
  for (let index = 0; index < captures.length; index++) {
    const {pair, before, after} = captures[index];
    // Every byte comes from carried source output plus recorded external/ABI
    // patches. Merely supplying next native metadata never copies its memory.
    const ranges = first.union.map((row, i) => ({id: `carried-source-${i}`, address: row.address, bytes: Buffer.from(source.span(row.address, row.length))}));
    const input = {...before.snapshot, registers: {...before.snapshot.registers}, ranges}, sourceBeforeCounters = readCounters(source);
    const replay = await replayFrame(input, {...frameOptions, ...pair.options, moduleBaseAddress: base});
    if (typeof replay?.span !== 'function') throw Error('Sequence replay adapter requires bounded source span access.');
    const aliases = JSON.stringify(replay.manifest?.aliases ?? []);
    expectedAliases ??= aliases;
    if (aliases !== expectedAliases) throw Error('Sequence source module aliases changed.');
    const regions = spanRows(typeof semanticRegions === 'function' ? semanticRegions({frameIndex: index, pair, replay}) : semanticRegions ?? replay.manifest?.requiredRegions?.filter(row => row.comparison !== 'abi-input'), after, 'semantic');
    if (!regions.length) throw Error('Sequence requires nonempty semantic comparison regions.');
    for (const row of regions) first.span(row.address, row.length);
    const comparison = compareFrame(replay, before, after, regions);
    cases.push({frameIndex: index, beforeOrdinal: pair.before.ordinal ?? null, afterOrdinal: pair.after.ordinal ?? null, entryRegistersSource: 'observed-next-native-entry', sourceBeforeCounters, nativeBeforeCounters: readCounters(before), nativeAfterCounters: readCounters(after), sourceAfterCounters: readCounters(replay), ...comparison,
      nativeScenario: inspectNativeFrameScenario(pair,replay.manifest ?? {requiredRegions:[]},{before,after})});
    source = replay; finalReplay = replay;
    if (index + 1 < captures.length) {
      const next = captures[index + 1];
      const abi = spanRows(typeof abiInputRegions === 'function' ? abiInputRegions({frameIndex: index + 1, pair: next.pair, previousReplay: replay}) : abiInputRegions ?? replay.manifest?.requiredRegions?.filter(row => row.comparison === 'abi-input') ?? [], next.before, 'ABI');
      for (let i = 0; i < abi.length; i++) if (abi.slice(0, i).some(row => abi[i].address < row.address + row.length && row.address < abi[i].address + abi[i].length)) throw Error('Sequence ABI refresh regions overlap.');
      for (const row of abi) first.span(row.address, row.length);
      const produced = sourceContinuation ? await executeSourceContinuation(sourceContinuation, {source, pair, nativeAfter: after, next, frameIndex: index, first, abi}) : undefined;
      const patchFootprint = produced ? excludeOwnedRegions(first.union, produced.regions) : first.union;
      transitions.push({fromFrameIndex: index, toFrameIndex: index + 1, ...transition(after, next.before, source, abi, maxPatchSpanBytes, patchFootprint, produced), nativeAfterCounters: readCounters(after), nextNativeBeforeCounters: readCounters(next.before), carriedSourceNextCounters: readCounters(source)});
    }
  }
  const report = {schemaVersion: 2, method: 'carried-source-physics-with-observed-external-producers', patchEncoding: 'relative-runs-v1', patchTuple: '[relativeOffset,byteLength]; separate externalRuns/abiRuns; hashes cover the entire containing range; patch values require retained native snapshots', matched: cases.every(row => row.matched), frames: cases.length, moduleBaseAddress: base, coveragePolicy, coverage: first.named, observations, capturedUnionBytes: first.mappedBytes,
    comparedBytes: cases.reduce((sum, row) => sum + row.comparedBytes, 0), externallyPatchedBytes: transitions.reduce((sum, row) => sum + row.externallyPatchedBytes, 0), abiRefreshedBytes: transitions.reduce((sum, row) => sum + row.abiRefreshedBytes, 0), cases, transitions,
    firstDivergence: cases.find(row => !row.matched) ?? null,
    limits: ['Source physics output is carried; only observed native after-to-next-before byte changes and declared caller ABI refreshes are supplied.', 'External patches may include native post-physics, AI, input, rendering or service producers; their individual authorship is not established by byte differences.', 'Next entry registers are native caller inputs. Stack refresh regions are explicit and are reported separately from semantic equality.', 'Bindings and aliases are rebuilt from carried source bytes each frame; module/thread/root descriptors and the full initial observation footprint remain stable. Under strict policy region metadata and resolved roots also remain identical.', 'The initial-observation policy admits no surplus bytes. Its fixed footprint is an observation window, not a logical-allocation capacity or entire-process-heap claim; newly reached memory outside it fails.', 'Resolved pointer roots may be mutable free-list heads; every observed value is reported rather than treated as a fixed allocation base.', 'Exact declared semantic spans and native returns are compared each frame, before any external overwrite. This does not establish a closed reconstructed game or wall-clock cadence.']};
  if (sourceContinuation) {
    report.schemaVersion = 3;
    report.method = 'carried-source-physics-with-selected-source-continuation-and-observed-external-producers';
    report.sourceContinuation = {id: sourceContinuation.id, matched: transitions.every(row => row.sourceContinuation.matched), comparedBytes: transitions.reduce((sum, row) => sum + row.sourceContinuation.comparedBytes, 0), changedNativeBytes: transitions.reduce((sum, row) => sum + row.sourceContinuation.changedNativeBytes, 0)};
    report.matched &&= report.sourceContinuation.matched;
    report.firstDivergence ??= transitions.find(row => !row.sourceContinuation.matched)?.sourceContinuation ?? null;
    report.limits.unshift('The explicit selected source producer runs before any external patch. Every owned byte is checked against the next entry and protected from patching; other native producers remain supplied inputs.');
  }
  return {report, finalReplay};
}
