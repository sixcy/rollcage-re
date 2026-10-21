import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';

const archive = await RollcageArchive.open(process.argv[2] ?? 'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources = [], failures = [], reverseBytes = {}, progressionBytes = {};
const hash = data => createHash('sha256').update(data).digest('hex');
const summary = {resources: 0, resourcesWithUsableGroups: 0, groups: 0, nonHeaderGroups: 0,
  pointReferences: 0, uniquePointOffsets: 0, aliasedPointReferences: 0, headerPointReferences: 0,
  emptyGroups: 0, singlePointGroups: 0, adjacentEqualPositions: 0, unalignedPointPointers: 0,
  minimumPointCount: null, maximumPointCount: 0,
  coordinateMin: [32767, 32767, 32767], coordinateMax: [-32768, -32768, -32768]};
try {
  for (const entry of archive.entries) {
    const {data} = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'GFXM') continue;
    const sourceSha256 = hash(data);
    try {
      const routes = parseRespawnRoutes(data), unique = new Map();
      let references = 0, aliased = 0, nonempty = 0;
      assert.equal(routes.countByte79, data[0x79]);
      assert.equal(routes.countByte46, data[0x79]);
      assert.equal(routes.groups.length, data[0x79]);
      assert.equal(routes.tableOffset, data.readUInt32LE(0x8c));
      assert.equal(routes.pointBaseOffset, data.readUInt32LE(0x98));
      const groups = routes.groups.map((group, groupIndex) => {
        const p = data.readUInt32LE(0x8c) + groupIndex * 12;
        assert.equal(group.offset, p); assert.deepEqual(group.bytes, data.subarray(p, p + 12));
        assert.equal(group.count, data.readUInt16LE(p)); assert.equal(group.reverseByte2, data[p + 2]); assert.equal(group.byte05, data[p + 5]);
        assert.equal(group.pointsOffset, data.readUInt32LE(0x98) + data.readUInt32LE(p + 8));
        assert.equal(group.points.length, group.count);
        summary.groups++; if (groupIndex) summary.nonHeaderGroups++;
        if (!group.count) summary.emptyGroups++;
        if (group.count === 1) summary.singlePointGroups++;
        if (group.count) {
          nonempty++;
          summary.minimumPointCount = Math.min(summary.minimumPointCount ?? 65535, group.count);
          summary.maximumPointCount = Math.max(summary.maximumPointCount, group.count);
          if (group.pointsOffset % 16) summary.unalignedPointPointers++;
        }
        reverseBytes[group.reverseByte2] = (reverseBytes[group.reverseByte2] ?? 0) + 1;
        progressionBytes[group.byte05] = (progressionBytes[group.byte05] ?? 0) + 1;
        group.points.forEach((point, index) => {
          const pointOffset = data.readUInt32LE(0x98) + data.readUInt32LE(p + 8) + index * 16;
          assert.equal(point.offset, pointOffset); assert.deepEqual(point.bytes, data.subarray(pointOffset, pointOffset + 16));
          assert.deepEqual(point.position, [0, 2, 4].map(delta => data.readInt16LE(pointOffset + delta)));
          assert.equal(group.pointAt(index), point); assert.equal(routes.pointAtOffset(pointOffset), point);
          if (unique.has(pointOffset)) {assert.equal(unique.get(pointOffset), point); aliased++;}
          else unique.set(pointOffset, point);
          references++; if (!groupIndex) summary.headerPointReferences++;
          point.position.forEach((value, axis) => {
            summary.coordinateMin[axis] = Math.min(summary.coordinateMin[axis], value);
            summary.coordinateMax[axis] = Math.max(summary.coordinateMax[axis], value);
          });
          if (index && point.position.every((value, axis) => value === group.points[index - 1].position[axis])) summary.adjacentEqualPositions++;
        });
        return {index: group.index, offset: group.offset, count: group.count, reverseByte2: group.reverseByte2,
          byte05: group.byte05, pointRelativeOffset: group.pointRelativeOffset, pointsOffset: group.pointsOffset,
          firstPosition: group.points[0]?.position ?? null, lastPosition: group.points.at(-1)?.position ?? null,
          serializedHeaderHex: group.bytes.toString('hex')};
      });
      assert.equal(hash(data), sourceSha256, 'Parser and validation leave decoded resource bytes intact.');
      summary.resources++; if (routes.groups.slice(1).some(group => group.count)) summary.resourcesWithUsableGroups++;
      summary.pointReferences += references; summary.uniquePointOffsets += unique.size; summary.aliasedPointReferences += aliased;
      resources.push({resource: entry.index, bytes: data.length, sha256: sourceSha256, tableOffset: routes.tableOffset,
        pointBaseOffset: routes.pointBaseOffset, countByte79: routes.countByte79,
        pointReferences: references, uniquePointOffsets: unique.size, aliasedPointReferences: aliased, nonemptyGroups: nonempty, groups});
    } catch (error) {failures.push({resource: entry.index, sha256: sourceSha256, error: error.message});}
  }
} finally {await archive.close();}
summary.reverseBytes = reverseBytes; summary.progressionBytes = progressionBytes; summary.failures = failures;
await writeFile('analysis/respawn-route-catalog.json', JSON.stringify({
  method: 'Installed authored GFXM route-table parsing and complete byte/coordinate/bounds/identity validation. Loader44c2b0 maps authored+8c/+79 to runtime+60/+46 and relocates group+8 relative to authored+98. Points retain file-offset identity; metadata remains opaque except fields consumed by recovered references. No original-process runtime or full race claim.',
  summary, resources,
}, null, 2));
console.log(JSON.stringify(summary));
if (failures.length) process.exitCode = 1;
