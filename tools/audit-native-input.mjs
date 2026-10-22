// Read-only PE/retained-evidence audit. Never launches or modifies game files.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const reduxHash = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const hex = value => `0x${value.toString(16)}`;
const digest = value => createHash('sha256').update(value).digest('hex');

export async function auditNativeInput(executablePath) {
  const bytes = await readFile(executablePath);
  if (digest(bytes) !== reduxHash) throw Error('Expected the verified Redux 1.3.8.0 executable.');
  const pe = bytes.readUInt32LE(60), optional = pe + 24, base = bytes.readUInt32LE(optional + 28), sections = [];
  for (let index = 0; index < bytes.readUInt16LE(pe + 6); index++) {
    const p = optional + bytes.readUInt16LE(pe + 20) + index * 40;
    sections.push({name: bytes.subarray(p, p + 8).toString().replaceAll('\0', ''),
      rva: bytes.readUInt32LE(p + 12), length: bytes.readUInt32LE(p + 16), raw: bytes.readUInt32LE(p + 20), flags: bytes.readUInt32LE(p + 36)});
  }
  const offset = rva => {
    const section = sections.find(s => rva >= s.rva && rva - s.rva < s.length);
    if (!section) throw Error(`Unmapped original PE RVA ${hex(rva)}.`);
    return section.raw + rva - section.rva;
  };
  const string = at => {const end = bytes.indexOf(0, at); if (end < at) throw Error('Unterminated PE name.'); return bytes.subarray(at, end).toString('ascii');};
  const imports = [];
  for (let descriptor = offset(bytes.readUInt32LE(optional + 104)); bytes.readUInt32LE(descriptor + 12); descriptor += 20) {
    const dll = string(offset(bytes.readUInt32LE(descriptor + 12))), first = bytes.readUInt32LE(descriptor + 16);
    const lookup = bytes.readUInt32LE(descriptor) || first;
    for (let index = 0; ; index++) {
      const thunk = bytes.readUInt32LE(offset(lookup + index * 4)); if (!thunk) break;
      imports.push({dll, name: thunk & 0x80000000 ? `ordinal:${thunk & 0xffff}` : string(offset(thunk) + 2), iat: base + first + index * 4});
    }
  }
  const relevant = imports.filter(row => /DINPUT/i.test(row.dll) || /^(?:Get(?:AsyncKeyState|KeyState|KeyboardState|CursorPos|RawInputData|RawInputBuffer|MessageA|MessageW)|RegisterRawInputDevices|RegisterHotKey|PeekMessage[AW]|DispatchMessage[AW]|TranslateMessage)$/.test(row.name));
  const sites = iat => {
    const needle = Buffer.alloc(6); needle[0] = 0xff; needle[1] = 0x15; needle.writeUInt32LE(iat, 2);
    const result = [];
    for (let at = 0; (at = bytes.indexOf(needle, at)) >= 0; at++) {
      const section = sections.find(s => (s.flags & 0x20000000) && at >= s.raw && at - s.raw < s.length);
      if (section) result.push({address: hex(base + section.rva + at - section.raw), precedingBytesHex: bytes.subarray(Math.max(section.raw, at - 8), at).toString('hex'), instructionBytesHex: needle.toString('hex')});
    }
    return result;
  };
  const block = (id, address, length) => {const data = bytes.subarray(offset(address - base), offset(address - base) + length); return {id, address: hex(address), length, bytesHex: data.toString('hex'), sha256: digest(data)};};
  const table = (id, address) => ({id, address: hex(address), entries: Array.from({length: 26}, (_, index) => ({offset: hex(index * 4), target: hex(bytes.readUInt32LE(offset(address - base) + index * 4))}))});
  const evidenceFiles = [
    '11431-renderer-state-cache-518570-procedure_assembly.json', '11437-renderer-state-cache-518890-procedure_assembly.json',
    '13415-renderer-runtime-closure-403570-procedure_assembly.json', '13425-renderer-window-key-procedure_assembly.json'
  ];
  const evidence = [];
  for (const name of evidenceFiles) {
    const filename = `analysis/native-simulation/results/${name}`, raw = await readFile(filename), entry = JSON.parse(raw).structuredContent;
    if (entry.subject.digest.sha256 !== reduxHash || entry.operation !== 'procedure_assembly') throw Error(`Unexpected retained input evidence ${filename}.`);
    evidence.push({file: filename, fileSha256: digest(raw), evidenceId: entry.evidence_id, procedure: entry.parameters.procedure, assembly: entry.normalized_result});
  }
  return {
    schemaVersion: 1, authority: 'shipped-artifact-static-audit', target: {path: path.resolve(executablePath), sha256: reduxHash},
    method: 'Exact PE32 import parsing, mapped byte/table reads and existing retained REA assembly. Raw FF15 byte matches are candidate callsites, not independent instruction-boundary proofs. No target execution or input hooks.',
    inputImports: relevant.map(row => ({...row, iat: hex(row.iat), directCallCandidates: sites(row.iat)})),
    absentDirectImports: ['GetAsyncKeyState', 'GetKeyboardState', 'GetCursorPos', 'GetRawInputData', 'RegisterRawInputDevices'].filter(name => !imports.some(row => row.name === name)),
    guidBytes: [block('GUID_SysKeyboard', 0x56f778, 16), block('GUID_SysMouse', 0x56f788, 16)],
    deviceTables: [table('keyboard-vtable-candidate-from-constructor-bytes', 0x5db684), table('mouse-vtable-from-retained-constructor', 0x5dc408)],
    mappedBytes: [block('keyboard-constructor', 0x518470, 0x60), block('keyboard-cooperative-level', 0x52ec00, 0x16),
      block('mouse-cooperative-level', 0x52eab0, 0x50), block('keyboard-poll', 0x52eb00, 0x80), block('mouse-poll', 0x52e8e0, 0x90)],
    manualDecoding: {
      authority: 'Manual interpretation of the retained mapped x86 bytes; not fresh Ghidra evidence or native execution.',
      keyboardCooperativeLevel: {address: '0x52ec00', flags: 6, meaning: 'DISCL_NONEXCLUSIVE|DISCL_FOREGROUND', instructions: ['PUSH ESI', 'MOV ESI,[ECX+28h]', 'CALL 402aa0', 'MOV ECX,[ESI]', 'PUSH 6', 'PUSH [EAX+4]', 'PUSH ESI', 'CALL [ECX+34h]', 'POP ESI', 'RET']},
      mouseCooperativeLevel: {address: '0x52eab0', fullscreenFlags: 5, windowedOrFallbackFlags: 6, meaning: 'Both branches request DISCL_FOREGROUND; fullscreen first tries EXCLUSIVE, otherwise NONEXCLUSIVE.'},
      getKeyStateCandidate: {address: '0x45b3d4', precedingPushImmediate: 20, meaning: 'PUSH 14h is VK_CAPITAL; caller function and its consequences require separate instruction-boundary/callgraph confirmation.'}
    },
    retainedEvidence: evidence,
    conclusions: [
      'DirectInput keyboard/mouse devices are explicitly created, acquired and polled by retained native input-manager routines; hidden/foreground-query adapters do not neutralize that interface.',
      'Mapped cooperative setters select FOREGROUND for both keyboard and mouse. Background GetDeviceState/Acquire success under the declared hidden policy has not been observed.',
      'Six mode8 AI participants use the autonomous dispatch/route path, but that does not establish that menu, demo-abort, hotkey, cheat or controller paths ignore physical input.'
    ],
    limitations: ['No original process was launched, no device state/HRESULT was captured, and no input isolation was implemented.',
      'Device polling/cooperative wrappers outside retained REA coverage are supported here by mapped bytes/manual decoding; fresh provider confirmation remains useful.',
      'Main-EXE import absence does not exclude dynamic calls or input handled inside dependencies.',
      'Joystick/game-controller cooperative and demo-abort behavior remains unresolved.',
      'Existing normal WM_KEYDOWN key-history/cheat path is distinct from DirectInput and is not filtered by the current hidden-window policy.'],
    platformSources: [
      'https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee416848(v=vs.85)',
      'https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getkeystate'
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'] = process.argv.slice(2);
  if (!output) throw Error('Usage: node tools/audit-native-input.mjs NEW_REPORT_DIRECTORY [REDUX_EXE]');
  const report = await auditNativeInput(executable);
  await mkdir(output);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({output, targetSha256: report.target.sha256, inputImports: report.inputImports.map(row => row.name), authority: report.authority}));
}
