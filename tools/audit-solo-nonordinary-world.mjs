// Read-only installed placement/script inventory. No game process is started.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/audit-solo-nonordinary-world.mjs NEW_REPORT_JSON [INSTALLATION]');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tables = JSON.parse(await readFile('src/track-runtime-tables.json', 'utf8'));
const dispatch = Buffer.from(tables.find(table => Number(table.address) === 0x44d1f8).bytesHex, 'hex');
const placementTargets = Array.from({length: 25}, (_, type) => dispatch.readUInt32LE(dispatch[20 + type] * 4));
const objectTables = JSON.parse(await readFile('src/race-object-startup-tables.json', 'utf8'));
const objectDispatch = Buffer.from(objectTables.find(table => Number(table.address) === 0x429d30).bytesHex, 'hex');
const targetTypes = new Map([[0x429cb2, 25], [0x429cc6, 29], [0x429cd5, 31], [0x429ce9, 20], [0x429cfd, 32], [0x429d0c, 35], [0x429d20, 24]]);
function scriptAt(data, table, route) {
  const start = table + data.readUInt16LE(table + route * 2), commands = [];
  let offset = start;
  for (let step = 0; step < 1024; step++) {
    if (offset < 0 || offset + 2 > data.length) return {start, commands, stop: 'outside-resource'};
    const opcode = data.readInt16LE(offset), command = {offset, relativeOffset: offset - start, opcode};
    commands.push(command);
    if (opcode === 0) {command.velocityQ8 = [2, 4, 6].map(delta => data.readInt16LE(offset + delta)); offset += 8;}
    else if (opcode === 1) {command.ticks = data.readUInt16LE(offset + 2); command.velocityQ8 = [6, 8, 10].map(delta => data.readInt16LE(offset + delta)); offset += 12;}
    else if (opcode === 2) {command.positionQ16 = [4, 8, 12].map(delta => data.readInt32LE(offset + delta)); offset += 16;}
    else if (opcode === 3 || opcode === 7) {
      const count = data.readInt16LE(offset + 2), bytes = count * 16 + 52;
      command.segments = count;
      if (count < 0 || offset + bytes > data.length) return {start, commands, stop: 'invalid-curve-span'};
      command.speeds = Array.from({length: count}, (_, i) => data.readUInt16LE(offset + 4 + i * 16));
      command.actions = Array.from({length: count}, (_, i) => data.readUInt16LE(offset + 22 + i * 16));
      command.controlPointsQ16 = Array.from({length: count + 3}, (_, i) => [0, 4, 8].map(delta => data.readInt32LE(offset + 8 + i * 16 + delta)));
      offset += bytes;
    } else if (opcode === 6) {command.selector = data.readInt16LE(offset + 2); command.value = data.readUInt16LE(offset + 4); offset += 8;}
    else return {start, commands, stop: opcode === 4 ? 'restart' : opcode === 5 || opcode === 8 ? 'stopped' : 'unknown-opcode'};
  }
  return {start, commands, stop: 'workflow-bound'};
}
const archive = await RollcageArchive.open(installation), tracks = [];
try {
  for (const track of getGame('rollcage').tracks.filter(track => !/\/LEV(?:16|17)\.BLP$/.test(track.name))) {
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const rows = [], scriptTable = data.readUInt32LE(0xa4), spawnTable = data.readUInt32LE(0xa8);
    for (let index = 0; index < textures.readUInt32LE(20); index++) {
      const authored = textures.readUInt32LE(40) + index * 56, type = textures.readUInt16LE(authored) & 1023;
      if (!type) continue;
      const target = type <= 24 ? placementTargets[type] : 0x44d0b9;
      const row = {index, type, target: `0x${target.toString(16)}`, position: [8, 10, 12].map(delta => textures.readInt16LE(authored + delta))};
      if (target === 0x44cc53) {
        const subtype = textures[authored + 31], selected = subtype - 3 >>> 0, constructorTarget = selected <= 8 ? objectDispatch.readUInt32LE(selected * 4) : 0x429d20;
        const bodyType = targetTypes.get(constructorTarget), route = textures[authored + 38], spawn = textures[authored + 39];
        Object.assign(row, {subtype, bodyType, modelIndex: bodyType === 32 ? null : textures[authored + 3], route, spawn,
          startupPhysical: bodyType !== 32 && (bodyType !== 24 || route !== 0), startupScripted: bodyType !== 32 && (bodyType !== 24 || route !== 0),
          shapes: bodyType === 29 ? 4 : [25, 31, 35].includes(bodyType) ? 1 : 0,
          filter: ({25: '0x40fcb0', 20: '0x40fcb0', 31: '0x40fdb0', 35: '0x40fe30', 29: '0x46e4e0'})[bodyType] ?? null,
          attachments: Array.from({length: 5}, (_, i) => textures.readUInt16LE(authored + 46 + i * 2)),
          specialGroups: [textures[authored + 28], textures[authored + 29]].filter(Boolean)});
        if (row.startupScripted) {
          row.script = scriptAt(data, scriptTable, route);
          row.spawnPosition = [0, 2, 4].map(delta => data.readInt16LE(spawnTable + spawn * 8 + delta));
        }
      } else row.role = target === 0x44cfc2 ? 'type2-render-particle-and-position-registry' : target === 0x44d043 ? 'type13-colored-render-particle' : 'native-loader-no-op';
      rows.push(row);
    }
    tracks.push({track: track.name, geometryResource: track.index, textureResource: track.textureIndex, geometrySHA256: hash(data), texturesSHA256: hash(textures),
      nonordinaryRows: rows.length, authoredObjectCount: rows.filter(row => row.type === 24).length,
      physicalAuthoredCount: rows.filter(row => row.startupPhysical).length, scriptTable, spawnTable, rows});
  }
} finally {await archive.close();}
const counts = key => Object.fromEntries([...new Set(tracks.flatMap(track => track.rows.map(row => row[key])).filter(value => value !== undefined))].sort((a, b) => a - b).map(value => [value, tracks.flatMap(track => track.rows).filter(row => row[key] === value).length]));
const report = {method: 'Read-only installed BLP/BTP bytes, exact retained44c2b0/429c90 dispatch tables and reconstructed429d60 startup contracts. Physical/script classifications are static constructor/startup inferences, not original-process observations.',
  targetSHA256: 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5', excludedLevels: [16, 17],
  summary: {tracks: tracks.length, types: counts('type'), bodyTypes: counts('bodyType'), maximumAuthoredObjects: Math.max(...tracks.map(track => track.authoredObjectCount)), maximumPhysicalAuthoredObjects: Math.max(...tracks.map(track => track.physicalAuthoredCount))}, tracks};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
console.log(JSON.stringify({output, ...report.summary}));
