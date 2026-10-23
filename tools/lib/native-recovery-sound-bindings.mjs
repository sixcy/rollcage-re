import {createCapturedMemory} from './captured-memory.mjs';

// Optional observations only. Every address is a retained pre-CALL or first
// post-CALL instruction; no native return value or initialized input is supplied.
export const nativeRecoverySoundBindingSites = Object.freeze([
  ['playback-allocation-call', 0x4058e1], ['playback-allocation-return', 0x4058e7], ['playback-logger-entry', 0x4a2290],
  ['find-first-call', 0x4a3b1e], ['find-first-return', 0x4a3b24], ['find-close-call', 0x4a3b2a], ['find-close-return', 0x4a3b30],
  ['file-open-call', 0x4a3c06], ['file-open-return', 0x4a3c0c], ['file-error-call', 0x4a3c16], ['file-error-return', 0x4a3c1c],
  ['file-sleep-call', 0x4a3c23], ['file-sleep-return', 0x4a3c29], ['file-retry-call', 0x4a3c3f], ['file-retry-return', 0x4a3c45],
  ['file-size-call', 0x4a7807], ['file-size-return', 0x4a780d],
  ['file-close-call', 0x4a2b2c], ['file-close-return', 0x4a2b32], ['outer-close-call', 0x4a789d], ['outer-close-return', 0x4a78a3],
  ['mixer-id-call', 0x4a7a26],
].map(([name, address]) => Object.freeze([`recovery-sound-${name}`, address])));

export const nativeRecoverySoundChannelSites = Object.freeze([
  ['channel-allocation-call', 0x40f07f], ['channel-allocation-return', 0x40f085],
  ['channel-memmove-call', 0x40f0a2], ['channel-memmove-return', 0x40f0a8],
].map(([name, address]) => Object.freeze([`recovery-sound-${name}`, address])));

export function nativeRecoverySoundChannelRanges(id) {
  if (!nativeRecoverySoundChannelSites.some(([name]) => name === id)) return [];
  return [{id: 'recovery-audio-channel-chain', baseRegister: 'esp', offset: -4, length: 84},
    {id: 'recovery-audio-channel-vector', baseRegister: 'edi', length: 12},
    ...(id === 'recovery-sound-channel-allocation-return' ? [{id: 'recovery-audio-channel-allocation', baseRegister: 'eax', length: 4}] : []),
    ...(id.includes('channel-memmove-') ? [{id: 'recovery-audio-channel-memmove-destination', baseRegister: 'esi', length: 4}] : [])];
}

// Empty owner-vector branch only:40ebc0 ->40edc0 tail-JMP40f060.
// New storage is observed before append writes the wrapper pointer into it.
export function selectNativeRecoverySoundChannelSnapshots(candidates, {selectorFrame: A, ownerAddress, wrapperAddress, appendCall, appendReturn, actual}) {
  const reg = (row, key) => {
    const value = Number(row.registers[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Recovery channel requires actual x86 ${key}.`);
    return value;
  };
  const order = row => {
    if (!Number.isSafeInteger(row.observedDebugEventOrdinal) || row.observedDebugEventOrdinal < 1) throw Error('Recovery channel requires actual observation order.');
    return row.observedDebugEventOrdinal;
  };
  const unique = (id, esp) => {
    const rows = candidates.filter(row => row.breakpointId === `recovery-sound-${id}` && reg(row, 'esp') === esp);
    if (rows.length !== 1) throw Error(`Recovery channel requires one ${id} at its proved ESP.`);
    return rows[0];
  };
  const call = unique('channel-allocation-call', A - 40), returned = unique('channel-allocation-return', A - 40);
  const copyCall = unique('channel-memmove-call', A - 52), copyReturn = unique('channel-memmove-return', A - 52);
  const sequence = [appendCall, call, returned, copyCall, copyReturn, appendReturn];
  for (let index = 1; index < sequence.length; index++) if (order(sequence[index - 1]) >= order(sequence[index])) throw Error('Recovery channel allocation/append order differs.');
  if (reg(appendCall, 'esp') !== A - 4 || reg(appendReturn, 'esp') !== A || reg(appendCall, 'ecx') !== ownerAddress + 4 || reg(appendCall, 'edi') !== wrapperAddress) throw Error('Recovery channel append ABI differs.');
  const P = reg(returned, 'eax');
  if (!P || P + 4 > 0x100000000 || P < ownerAddress + 16 && P + 4 > ownerAddress + 4 || P < wrapperAddress + 12 && P + 4 > wrapperAddress) throw Error('Recovery channel requires its genuine distinct allocation pointer.');
  const span = (row, id, address, length) => {
    const part = row.ranges.get(id);
    if (!part || Number(part.address) !== address || part.bytes.length !== length) throw Error(`Recovery channel ${id} address/length differs.`);
    return part;
  };
  let allocation;
  for (const row of [call, returned, copyCall, copyReturn]) {
    span(row, 'recovery-audio-channel-chain', reg(row, 'esp') - 4, 84);
    const header = span(row, 'recovery-audio-channel-vector', ownerAddress + 4, 12);
    if (header.bytes.some(value => value !== 0) || reg(row, 'edi') !== ownerAddress + 4 || reg(row, 'ebx') !== 1 || reg(row, 'ebp') !== reg(appendCall, 'ebp') || reg(row, 'esi') !== (row === call || row === returned ? 0 : P)) throw Error('Recovery channel empty-vector reserve registers differ.');
    const m = createCapturedMemory([...row.ranges.values()]).memory;
    // These saved caller/argument words survive both external calls. EBP is
    // saved only after operatorNew returns, immediately before memmove.
    for (const [address, value] of [[A - 36, A + 24], [A - 32, ownerAddress + 4], [A - 28, ownerAddress], [A - 24, actual(0x40ec0b)], [A - 20, 1], [A - 16, wrapperAddress], [A - 8, actual(0x40dcba)], [A - 4, A + 24], [A + 24, wrapperAddress]]) {
      if (m.readUInt32LE(address) !== value) throw Error('Recovery channel append/growth private stack chain differs.');
    }
    if (row === call || row === returned) {
      if (m.readUInt32LE(A - 40) !== 4 || row === call && (reg(row, 'eax') !== 4 || reg(row, 'ecx') !== ownerAddress + 4) || row === returned && m.readUInt32LE(A - 44) !== actual(0x40f085)) throw Error('Recovery channel four-byte allocation request/return differs.');
    } else if (m.readUInt32LE(A - 52) !== P || m.readUInt32LE(A - 48) !== 0 || m.readUInt32LE(A - 44) !== 0 || m.readUInt32LE(A - 40) !== reg(row, 'ebp') || row === copyCall && (reg(row, 'eax') !== 0 || reg(row, 'ecx') !== 0) || row === copyReturn && m.readUInt32LE(A - 56) !== actual(0x40f0a8)) throw Error('Recovery channel zero-length memmove ABI differs.');
    if (row === returned) allocation = span(row, 'recovery-audio-channel-allocation', P, 4);
    if (row === copyCall || row === copyReturn) {
      const destination = span(row, 'recovery-audio-channel-memmove-destination', P, 4);
      if (!allocation || !destination.bytes.equals(allocation.bytes)) throw Error('Recovery channel zero-copy destination preimage differs.');
    }
  }
  return {verified: true, sourceReplayComplete: false, vectorAddress: ownerAddress + 4, appendEntryEsp: A - 8, reserveEntryEsp: A - 24,
    allocation: {callOrdinal: call.ordinal, returnOrdinal: returned.ordinal, callEsp: A - 40, requestedBytes: 4, address: P, inputHex: allocation.bytes.toString('hex')},
    memmove: {callOrdinal: copyCall.ordinal, returnOrdinal: copyReturn.ordinal, callEsp: A - 52, arguments: [P, 0, 0], actualReturnEax: reg(copyReturn, 'eax'), beforeHex: copyCall.ranges.get('recovery-audio-channel-memmove-destination').bytes.toString('hex'), afterHex: copyReturn.ranges.get('recovery-audio-channel-memmove-destination').bytes.toString('hex')},
    selectedOrdinals: sequence.map(row => row.ordinal)};
}

export const isNativeRecoveryPlaybackAllocationSite = id => /^recovery-sound-playback-allocation-(call|return)$/.test(id);
// 4ad9e0 frame F -> formatter entry F-10 -> buffer F-1010;
// 405310 entry F-101c -> 405860 entry F-1034 -> CALL ESP F-1064.
// Thus the actual formatted buffer starts at CALL/RET ESP+54h.
export const nativeRecoveryPlaybackAllocationCondition = () => ({range: {id: 'recovery-audio-playing-prefix', baseRegister: 'esp', offset: 0x54, length: 8}, equalsBytesHex: '506c6179696e6720'});

export function nativeRecoverySoundBindingRanges(id) {
  const name = id.replace(/^recovery-sound-/, '');
  const stack = length => ({id: 'recovery-audio-service-arguments', baseRegister: 'esp', length});
  const path = () => ({id: 'recovery-audio-service-path', baseRegister: 'esp', dereferenceOffsets: ['0'], length: 1024});
  if (name.startsWith('playback-allocation-')) return [
    {id: 'recovery-audio-playback-phase', rva: '0x1ecb1c', dereferenceOffsets: ['0'], offset: '0x57c', length: 4},
    {id: 'recovery-audio-playback-chain', baseRegister: 'esp', offset: -4, length: 4200},
    {id: 'recovery-audio-playback-string', baseRegister: 'esi', length: 28},
    ...(name.endsWith('return') ? [{id: 'recovery-audio-playback-allocation-region', baseRegister: 'eax', readableRegion: true, maxRegionBytes: 64 * 1024 * 1024}] : []),
  ];
  if (name === 'playback-logger-entry') return [{id: 'recovery-audio-playback-logger-stack', baseRegister: 'esp', offset: -4, length: 80}];
  const findFrames = () => [{id: 'recovery-audio-find-frame', baseRegister: 'ebp', length: 8}, {id: 'recovery-audio-find-resolver-frame', baseRegister: 'ebp', dereferenceOffsets: ['0'], length: 8}];
  const openFrame = () => ({id: 'recovery-audio-file-open-frame', baseRegister: 'ebp', length: 16});
  if (name === 'find-first-call') return [stack(8), path(), {id: 'recovery-audio-find-data', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 592}, ...findFrames()];
  if (name === 'find-first-return') return [{id: 'recovery-audio-find-data', baseRegister: 'esp', length: 592}, {id: 'recovery-audio-service-path', baseRegister: 'esp', offset: 0x650, length: 1024}, ...findFrames()];
  if (name === 'file-open-call' || name === 'file-retry-call') return [stack(28), path(), openFrame()];
  if (name === 'file-open-return') return [{id: 'recovery-audio-file-record', baseRegister: 'ebp', dereferenceOffsets: ['8'], length: 36}, openFrame()];
  if (name === 'file-retry-return') return [{id: 'recovery-audio-file-record', baseRegister: 'ebx', length: 36}, openFrame()];
  if (['file-error-call', 'file-error-return', 'file-sleep-return'].includes(name)) return [openFrame()];
  if (name === 'file-sleep-call') return [stack(4), openFrame()];
  if (name === 'file-size-call') return [stack(8), {id: 'recovery-audio-file-size', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 8}];
  if (name === 'file-size-return') return [{id: 'recovery-audio-file-size', baseRegister: 'esp', offset: 0x408, length: 8}];
  if (name === 'mixer-id-call') return [{id: 'recovery-audio-mixer-input', baseRegister: 'ecx', length: 0x50}, {id: 'recovery-audio-mixer-vtable', baseRegister: 'ecx', dereferenceOffsets: ['0'], length: 4}];
  if (name.startsWith('file-close-')) return [...(name.endsWith('call') ? [stack(4)] : []), {id: 'recovery-audio-file-record', baseRegister: 'esi', length: 36}];
  if (name === 'outer-close-return') return [{id: 'recovery-audio-file-record', baseRegister: 'esp', offset: 0x414, length: 36}];
  if (['find-close-call', 'outer-close-call'].includes(name)) return [stack(4)];
  return [];
}

export function nativeRecoverySoundPlaybackLayout(dispatchEntry) {
  const playbackEntry = dispatchEntry - 20;
  const frame = Math.floor((playbackEntry - 4) / 8) * 8 - 0x38;
  return {playbackEntry, frame, formatterEntry: frame - 16, formattedBuffer: frame - 0x1010,
    assignmentEntry: frame - 0x101c, growEntry: frame - 0x1034,
    allocationEsp: frame - 0x1064, loggerEntry: frame - 4, stringAddress: frame + 12};
}

export function nativeRecoverySoundFileQueryLayouts({managerEntry, factoryEntry}) {
  return [['outer', managerEntry - 0x444 - 0x408, 0x4a77bb], ['inner', factoryEntry - 0x830 - 0x408, 0x4a7559]].map(([name, resolverEntry, returnAddress]) => {
    const pathFrame = Math.floor((resolverEntry - 4) / 8) * 8 - 0xc08, findEbp = pathFrame - 8;
    const frame = Math.floor(findEbp / 8) * 8 - 0xa50;
    return {name, resolverEntry, findEbp, frame, callEsp: frame - 8, returnAddress};
  });
}

// Called only after the parent selector has proved TID, clock, EIP, hit counts
// and guarded activation. This proves playback's private chain and exact
// requested allocation slice; a containing VirtualQuery region is not a size.
export function selectNativeRecoverySoundBindingSnapshots(candidates, {dispatchEntry, managerEntry, factoryEntry, managerAddress, actual, sourceAddress}) {
  const layout = nativeRecoverySoundPlaybackLayout(dispatchEntry);
  const fileQueryLayouts = nativeRecoverySoundFileQueryLayouts({managerEntry, factoryEntry});
  const outerFrame = managerEntry - 0x444, openEbp = managerEntry - 0x458;
  const openFrame = Math.floor(openEbp / 8) * 8 - 0x820, fileRecord = managerEntry - 0x30;
  const reg = (row, key) => {
    const value = Number(row.registers[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Recovery binding requires actual x86 ${key}.`);
    return value;
  };
  const order = row => row.observedDebugEventOrdinal;
  const memory = row => createCapturedMemory([...row.ranges.values()]).memory;
  const unique = (name, esp) => {
    const hits = candidates.filter(row => row.breakpointId === `recovery-sound-${name}` && reg(row, 'esp') === esp);
    if (hits.length !== 1) throw Error(`Recovery binding requires one ${name} at its proved ESP.`);
    return hits[0];
  };
  const call = unique('playback-allocation-call', layout.allocationEsp), returned = unique('playback-allocation-return', layout.allocationEsp);
  const logger = unique('playback-logger-entry', layout.loggerEntry), before = memory(call), after = memory(returned), log = memory(logger);
  // ECX is a genuine volatile service outcome, not a value inferred from the
  // string pointer. Bind its trace metadata to the separately retained x86
  // CONTEXT DWORD at172 rather than guessing a particular native value.
  if (!Buffer.isBuffer(logger.context) || logger.context.length !== 716 || logger.context.readUInt32LE(172) !== reg(logger, 'ecx')) throw Error('Recovery logger ECX differs from its actual x86 context.');
  if (!(order(call) < order(returned) && order(returned) < order(logger))) throw Error('Recovery playback binding order differs.');
  const requestedBytes = before.readUInt32LE(layout.allocationEsp), allocated = reg(returned, 'eax');
  const stringLength = before.readUInt32LE(layout.growEntry + 4);
  if (!requestedBytes || reg(call, 'ecx') !== requestedBytes || reg(call, 'edi') + 1 !== requestedBytes || !allocated || allocated + requestedBytes > 0x100000000) throw Error('Recovery playback allocation request differs.');
  if (!stringLength || stringLength > 4095 || requestedBytes <= stringLength || before.readUInt32LE(layout.growEntry + 8) !== 0 || before.readUInt32LE(layout.stringAddress + 16) !== 0 || before.readUInt32LE(layout.stringAddress + 20) !== 15 || before.readUInt8(layout.formattedBuffer + stringLength) !== 0) throw Error('Recovery playback fresh string growth differs.');
  for (const row of [call, returned]) {
    const m = row === call ? before : after;
    if (reg(row, 'esi') !== layout.stringAddress || reg(row, 'ebp') !== layout.growEntry - 4 || m.readUInt32LE(layout.allocationEsp) !== requestedBytes || m.readUInt32LE(layout.growEntry) !== actual(0x40539a) || m.readUInt32LE(layout.assignmentEntry) !== actual(0x4a2b9b) || m.readUInt32LE(layout.formatterEntry) !== actual(0x4ada5a) || m.readUInt32LE(layout.formatterEntry + 4) !== layout.stringAddress || m.readUInt32LE(layout.formatterEntry + 8) !== actual(0x5d3f00) || m.readUInt32LE(layout.formatterEntry + 12) !== sourceAddress + 4) throw Error('Recovery playback private stack chain differs.');
  }
  if (after.readUInt32LE(layout.allocationEsp - 4) !== actual(0x4058e7) || log.readUInt32LE(layout.loggerEntry) !== actual(0x4ada62)) throw Error('Recovery playback service return address differs.');
  if (['ebx', 'esi', 'edi', 'ebp'].some(key => reg(call, key) !== reg(returned, key)) || log.readUInt32LE(layout.stringAddress) !== allocated || log.readUInt32LE(layout.stringAddress + 16) !== stringLength || log.readUInt32LE(layout.stringAddress + 20) !== requestedBytes - 1) throw Error('Recovery playback string publication differs.');
  const region = returned.ranges.get('recovery-audio-playback-allocation-region');
  if (!region || region.rangeMode !== 'readable-region' || Number(region.requestedResolvedRoot) !== allocated || Number(region.address) !== Number(region.regionBaseAddress) || Number(region.regionSize) !== region.bytes.length || region.bytes.length > 64 * 1024 * 1024 || allocated < Number(region.address) || allocated + requestedBytes > Number(region.address) + region.bytes.length) throw Error('Recovery playback allocation preimage coverage differs.');
  const bindingRows = candidates.filter(row => nativeRecoverySoundBindingSites.some(([id]) => id === row.breakpointId));
  const services = [];
  for (const [name, popped] of [['find-first', 8], ['find-close', 4], ['file-open', 28], ['file-error', 0], ['file-sleep', 4], ['file-retry', 28], ['file-size', 8], ['file-close', 4], ['outer-close', 4]]) {
    const calls = bindingRows.filter(row => row.breakpointId === `recovery-sound-${name}-call`);
    const returns = bindingRows.filter(row => row.breakpointId === `recovery-sound-${name}-return`);
    if (calls.length !== returns.length || name === 'find-first' && calls.length !== 2) throw Error(`Recovery ${name} service pair count differs.`);
    for (const [index, entry] of calls.entries()) {
      const exit = returns[index];
      if (order(entry) >= order(exit) || reg(exit, 'esp') !== reg(entry, 'esp') + popped || index && order(entry) <= order(returns[index - 1])) throw Error(`Recovery ${name} service pair ABI/order differs.`);
      if (name.startsWith('file-') && ['file-open', 'file-error', 'file-sleep', 'file-retry'].includes(name)) {
        for (const row of [entry, exit]) {
          const frame = row.ranges.get('recovery-audio-file-open-frame');
          if (!frame || Number(frame.address) !== openEbp || reg(row, 'ebp') !== openEbp || frame.bytes.length !== 16 || frame.bytes.readUInt32LE(4) !== actual(0x4a77f1) || frame.bytes.readUInt32LE(8) !== fileRecord || frame.bytes.readUInt32LE(12) !== 0) throw Error('Recovery file-open parent frame differs.');
        }
        if (reg(exit, 'esp') !== openFrame) throw Error('Recovery file-open service stack differs.');
      }
      const expectedReturnEsp = {'file-size': outerFrame, 'file-close': outerFrame - 8, 'outer-close': outerFrame}[name];
      if (expectedReturnEsp !== undefined && reg(exit, 'esp') !== expectedReturnEsp) throw Error(`Recovery ${name} outer service stack differs.`);
      if (['file-close', 'file-open', 'file-retry', 'outer-close'].includes(name)) {
        const record = exit.ranges.get('recovery-audio-file-record');
        if (!record || Number(record.address) !== fileRecord || record.bytes.length !== 36) throw Error(`Recovery ${name} file-record input differs.`);
      }
      if (name === 'find-close') {
        const find = bindingRows.filter(row => row.breakpointId === 'recovery-sound-find-first-return' && reg(row, 'esp') === reg(exit, 'esp'));
        if (find.length !== 1 || order(find[0]) >= order(entry) || memory(entry).readUInt32LE(reg(entry, 'esp')) !== reg(find[0], 'eax')) throw Error('Recovery find-close handle provenance differs.');
      }
      const outputId = name === 'find-first' ? 'recovery-audio-find-data' : name === 'file-size' ? 'recovery-audio-file-size' : null;
      if (outputId) {
        const input = entry.ranges.get(outputId), output = exit.ranges.get(outputId), length = name === 'find-first' ? 592 : 8;
        if (!input || !output || input.bytes.length !== length || output.bytes.length !== length || Number(input.address) !== Number(output.address) || memory(entry).readUInt32LE(reg(entry, 'esp') + 4) !== Number(input.address)) throw Error(`Recovery ${name} output preimage differs.`);
        if (Number(output.address) !== reg(exit, 'esp') + (name === 'find-first' ? 0 : 0x408)) throw Error(`Recovery ${name} output stack location differs.`);
      }
      const path = entry.ranges.get('recovery-audio-service-path');
      if (['find-first', 'file-open', 'file-retry'].includes(name)) {
        if (!path || path.bytes.length !== 1024 || Number(path.address) !== memory(entry).readUInt32LE(reg(entry, 'esp'))) throw Error(`Recovery ${name} path pointer differs.`);
        if (name === 'find-first') {
          const later = exit.ranges.get('recovery-audio-service-path');
          if (!later || Number(later.address) !== reg(exit, 'esp') + 0x650 || Number(later.address) !== Number(path.address) || !later.bytes.equals(path.bytes)) throw Error('Recovery find-first caller path differs.');
          const expected = fileQueryLayouts[index];
          if (reg(entry, 'esp') !== expected.callEsp || reg(exit, 'esp') !== expected.frame || order(exit) >= order(call)) throw Error('Recovery find-first outer/inner frame differs.');
          for (const row of [entry, exit]) {
            const frame = row.ranges.get('recovery-audio-find-frame'), resolver = row.ranges.get('recovery-audio-find-resolver-frame');
            if (reg(row, 'ebp') !== expected.findEbp || !frame || Number(frame.address) !== expected.findEbp || frame.bytes.length !== 8 || frame.bytes.readUInt32LE() !== expected.resolverEntry - 4 || frame.bytes.readUInt32LE(4) !== actual(0x4a7fd6) || !resolver || Number(resolver.address) !== expected.resolverEntry - 4 || resolver.bytes.length !== 8 || resolver.bytes.readUInt32LE(4) !== actual(expected.returnAddress)) throw Error('Recovery find-first resolver return chain differs.');
          }
        }
      }
      services.push({name, callOrdinal: entry.ordinal, returnOrdinal: exit.ordinal, callEsp: reg(entry, 'esp'), returnEsp: reg(exit, 'esp'), actualReturnEax: reg(exit, 'eax'),
        ...(entry.ranges.has('recovery-audio-service-arguments') ? {argumentsHex: entry.ranges.get('recovery-audio-service-arguments').bytes.toString('hex')} : {}),
        ...(path ? {pathAddress: Number(path.address), pathBytesHex: path.bytes.toString('hex')} : {}),
        ...(outputId ? {outputAddress: Number(entry.ranges.get(outputId).address), inputHex: entry.ranges.get(outputId).bytes.toString('hex'), outputHex: exit.ranges.get(outputId).bytes.toString('hex')} : {})});
    }
  }
  let requestedMixerId, mixerBegin;
  const mixerRows = bindingRows.filter(row => row.breakpointId === 'recovery-sound-mixer-id-call');
  const mixers = mixerRows.map((row, index) => {
    const input = row.ranges.get('recovery-audio-mixer-input'), table = row.ranges.get('recovery-audio-mixer-vtable');
    if (!input || input.bytes.length !== 80 || Number(input.address) !== reg(row, 'ecx') || !table || table.bytes.length !== 4 || Number(table.address) !== input.bytes.readUInt32LE() || reg(row, 'eax') !== Number(table.address) || table.bytes.readUInt32LE() !== actual(0x4a92e0)) throw Error('Recovery mixer input/vtable proof differs.');
    const m = memory(row), vector = m.readUInt32LE(managerAddress + 0x84c), begin = m.readUInt32LE(vector), end = m.readUInt32LE(vector + 4), slot = reg(row, 'esi'), requested = m.readUInt32LE(reg(row, 'esp') + 0x14), id = input.bytes.readUInt32LE(8);
    if (!index) {requestedMixerId = requested; mixerBegin = begin;}
    if (reg(row, 'esp') !== factoryEntry - 0x848 || reg(row, 'ebx') !== managerAddress || requested !== requestedMixerId || reg(row, 'ebp') !== requested || begin !== mixerBegin || slot !== begin + index * 4 || slot + 4 > end || m.readUInt32LE(slot) !== reg(row, 'ecx') || (index === mixerRows.length - 1 ? id !== requested : id === requested) || order(row) >= order(call)) throw Error('Recovery mixer lookup frame/iteration proof differs.');
    return {ordinal: row.ordinal, address: Number(input.address), slotAddress: slot, requestedId: requested, id, voiceAddress: input.bytes.readUInt32LE(0x48), inputHex: input.bytes.toString('hex'), methodAddress: table.bytes.readUInt32LE()};
  });
  if (!mixers.length) throw Error('Recovery binding requires actual mixer lookup input.');
  return {verified: true, sourceReplayComplete: false, layout, fileQueryLayouts, allocation: {callOrdinal: call.ordinal, returnOrdinal: returned.ordinal, address: allocated, requestedBytes, stringLength, formattedBytesHex: before.subarray(layout.formattedBuffer, layout.formattedBuffer + stringLength + 1).toString('hex'), inputHex: after.subarray(allocated, allocated + requestedBytes).toString('hex'), containingRegionBytes: region.bytes.length}, logger: {ordinal: logger.ordinal, incomingEcx: reg(logger, 'ecx'), esp: reg(logger, 'esp')}, services, mixers};
}
